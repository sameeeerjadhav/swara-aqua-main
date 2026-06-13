import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

/**
 * Platform fee charged to the customer for online payments.
 *
 * TWO MODES (admin-controlled via app_settings):
 *   'fixed'   (default) — slab-based fixed fee:
 *               ₹1  – ₹99  → ₹2
 *               ₹100 – ₹299 → ₹10
 *               ₹300 – ₹499 → ₹15
 *               ₹500+        → ₹20
 *
 *   'percent' — 2% of the transaction amount (rounded to 2 dp)
 */

/** Read the current fee mode from DB (fallback: 'fixed'). */
export const getFeeModeFromDB = async (): Promise<'fixed' | 'percent'> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'platform_fee_mode' LIMIT 1`
    );
    const val = (rows as any[])[0]?.setting_value;
    return val === 'percent' ? 'percent' : 'fixed';
  } catch {
    return 'fixed';
  }
};

/** Synchronous fixed-slab calculation (used when mode is already known). */
const fixedFee = (baseAmount: number): number => {
  if (baseAmount < 100)  return 2;
  if (baseAmount < 300)  return 10;
  if (baseAmount < 500)  return 15;
  return 20;
};

/** Synchronous percent calculation: 2% of base, rounded to 2 dp. */
const percentFee = (baseAmount: number): number =>
  parseFloat((baseAmount * 0.02).toFixed(2));

/**
 * Synchronous helper — kept for backward compat with callers that
 * already know the mode. Defaults to 'fixed'.
 */
export const getPlatformFee = (baseAmount: number, mode: 'fixed' | 'percent' = 'fixed'): number =>
  mode === 'percent' ? percentFee(baseAmount) : fixedFee(baseAmount);

/**
 * Async version — reads mode from DB then computes fee.
 * Use this in all payment controllers.
 */
export const withPlatformFee = async (
  baseAmount: number
): Promise<{ fee: number; total: number; mode: 'fixed' | 'percent' }> => {
  const mode = await getFeeModeFromDB();
  const fee  = getPlatformFee(baseAmount, mode);
  return { fee, total: parseFloat((baseAmount + fee).toFixed(2)), mode };
};
