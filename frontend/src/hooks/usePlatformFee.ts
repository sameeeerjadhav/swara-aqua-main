import { useEffect, useState } from 'react';
import api from '../api/axios';

export type FeeMode = 'fixed' | 'percent';

export interface PlatformFeeInfo {
  mode: FeeMode;
  fee: number;
  base: number;
  total: number;
  /** Human-readable label of the fee charge, e.g. "₹12 fee" or "2% fee" */
  label: string;
  /** Full notice text, e.g. "₹12 platform fee applies · you pay ₹312 total" */
  notice: string;
  loading: boolean;
}

const EMPTY: PlatformFeeInfo = {
  mode: 'fixed', fee: 0, base: 0, total: 0,
  label: '', notice: '', loading: true,
};

/**
 * Fetches the live platform fee config from the backend and computes
 * the exact fee for a given base amount.
 *
 * @param base - the transaction amount in rupees (0 → returns zero fee)
 */
export const usePlatformFee = (base: number): PlatformFeeInfo => {
  const [info, setInfo] = useState<PlatformFeeInfo>({ ...EMPTY, base });

  useEffect(() => {
    if (base <= 0) {
      setInfo({ mode: 'fixed', fee: 0, base: 0, total: 0, label: '', notice: '', loading: false });
      return;
    }

    let cancelled = false;
    setInfo(prev => ({ ...prev, loading: true }));

    api.get<{ mode: FeeMode; fee: number; base: number; total: number }>(
      `/billing/fee-config?amount=${base}`
    ).then(({ data }) => {
      if (cancelled) return;
      const feeStr   = Number.isInteger(data.fee)
        ? `₹${data.fee}`
        : `₹${data.fee.toFixed(2)}`;
      const modeStr  = data.mode === 'percent' ? '2% fee' : `${feeStr} fee`;
      const notice   = `${feeStr} platform fee applies · you pay ₹${Math.round(data.total)} total`;
      setInfo({ ...data, label: modeStr, notice, loading: false });
    }).catch(() => {
      if (cancelled) return;
      // Fallback to fixed slab so the UI never breaks
      const fallbackFee = base < 100 ? 2 : base < 300 ? 10 : base < 500 ? 15 : 20;
      const total = base + fallbackFee;
      setInfo({
        mode: 'fixed', fee: fallbackFee, base, total,
        label: `₹${fallbackFee} fee`,
        notice: `₹${fallbackFee} platform fee applies · you pay ₹${total} total`,
        loading: false,
      });
    });

    return () => { cancelled = true; };
  }, [base]);

  return info;
};
