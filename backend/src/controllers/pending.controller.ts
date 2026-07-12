import { Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AuthRequest } from '../middleware/auth.middleware';
import { withPlatformFee } from '../utils/platformFee';

import Razorpay from 'razorpay';
import crypto from 'crypto';
import * as NotifService from '../services/notification.service';

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const notify = (fn: () => Promise<unknown>) => fn().catch(() => {});

// ── GET /api/pending/my ───────────────────────────────────────────────────────
// Customer: own pending balance + itemized list
export const getMyPending = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.user!.id;

    const [[user]] = await pool.query<RowDataPacket[]>(
      'SELECT pending_balance FROM users WHERE id = ?',
      [customerId]
    );

    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT pp.*, o.quantity, o.total_amount, o.created_at AS order_date
       FROM pending_payments pp
       JOIN orders o ON o.id = pp.order_id
       WHERE pp.customer_id = ?
       ORDER BY pp.created_at DESC`,
      [customerId]
    );

    // Add unbilled unpaid manual delivery amounts (jars × jar_rate) for months not yet billed
    const [[manualRow]] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(m.jars * u.jar_rate), 0) AS manual_unpaid
       FROM manual_delivery_entries m
       JOIN users u ON u.id = m.customer_id
       WHERE m.customer_id = ?
         AND m.is_paid = 0
         AND DATE_FORMAT(m.delivery_date, '%Y-%m') NOT IN (
           SELECT month FROM bills WHERE customer_id = ?
         )`,
      [customerId, customerId]
    );

    const basePending  = Number(user?.pending_balance ?? 0);
    const manualUnpaid = Number(manualRow?.manual_unpaid ?? 0);

    res.json({
      pending_balance: basePending + manualUnpaid,
      items,
    });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/pending/pay-order ───────────────────────────────────────────────
// Customer: create Razorpay order to clear pending balance
export const createPendingPayOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.user!.id;

    const [[user]] = await pool.query<RowDataPacket[]>(
      'SELECT pending_balance FROM users WHERE id = ?',
      [customerId]
    );

    const pendingBalance = Number(user?.pending_balance ?? 0);
    if (pendingBalance <= 0) {
      res.status(400).json({ message: 'No pending balance to pay' });
      return;
    }

    const { fee, total } = await withPlatformFee(pendingBalance);
    const totalPaise = Math.round(total * 100);

    const order = await razorpay.orders.create({
      amount:   totalPaise,
      currency: 'INR',
      notes:    { customer_id: String(customerId), type: 'pending_balance_clearance' },
    });

    res.json({
      orderId:     order.id,
      amount:      totalPaise,
      keyId:       process.env.RAZORPAY_KEY_ID,
      platformFee: fee,
      baseAmount:  pendingBalance,
    });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/pending/verify ──────────────────────────────────────────────────
// Customer: verify payment and clear pending balance
export const verifyPendingPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const customerId = req.user!.id;

    // Signature verification
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      res.status(400).json({ message: 'Invalid payment signature' });
      return;
    }

    const [[user]] = await pool.query<RowDataPacket[]>(
      'SELECT pending_balance FROM users WHERE id = ?',
      [customerId]
    );
    const pendingBalance = Number(user?.pending_balance ?? 0);

    if (pendingBalance <= 0) {
      res.status(400).json({ message: 'No pending balance' });
      return;
    }

    // Mark all pending items as paid
    await pool.query(
      `UPDATE pending_payments
       SET status = 'paid', paid_at = NOW(), razorpay_payment_id = ?
       WHERE customer_id = ? AND status = 'pending'`,
      [razorpay_payment_id, customerId]
    );

    // Zero out the balance
    await pool.query(
      'UPDATE users SET pending_balance = 0 WHERE id = ?',
      [customerId]
    );

    // Record a transaction for audit
    await pool.query<ResultSetHeader>(
      `INSERT INTO transactions (customer_id, order_id, amount, mode, type, collected_by, status, note)
       VALUES (?, NULL, ?, 'online', 'credit', NULL, 'completed', ?)`,
      [customerId, pendingBalance, `Pending balance cleared via Razorpay: ${razorpay_payment_id}`]
    );

    notify(() =>
      NotifService.sendToUser({
        userId: customerId,
        title:  'Payment Received ✅',
        body:   `Your outstanding balance of ₹${pendingBalance} has been cleared. Thank you!`,
        type:   'payment',
        data:   {},
      })
    );

    res.json({ message: 'Pending balance cleared successfully', amount: pendingBalance });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/pending/admin ────────────────────────────────────────────────────
// Admin: all customers with their full outstanding balance
export const getAdminPendingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Comprehensive outstanding per customer:
    //   pending_balance  = pay-later delivery orders (stored on users table)
    //   bill_outstanding = unpaid/partial bills
    //   manual_unpaid    = unbilled unpaid manual delivery entries (jars × jar_rate)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         u.id, u.name, u.phone,
         u.pending_balance,
         COALESCE(b.bill_outstanding, 0)  AS bill_outstanding,
         COALESCE(m.manual_unpaid,  0)    AS manual_unpaid,
         (u.pending_balance
           + COALESCE(b.bill_outstanding, 0)
           + COALESCE(m.manual_unpaid,  0)) AS total_outstanding
       FROM users u
       LEFT JOIN (
         SELECT customer_id,
                SUM(total_amount - paid_amount) AS bill_outstanding
         FROM bills
         WHERE status IN ('unpaid', 'partial')
         GROUP BY customer_id
       ) b ON b.customer_id = u.id
       LEFT JOIN (
         SELECT m2.customer_id,
                SUM(m2.jars * u2.jar_rate) AS manual_unpaid
         FROM manual_delivery_entries m2
         JOIN users u2 ON u2.id = m2.customer_id
         WHERE m2.is_paid = 0
           AND DATE_FORMAT(m2.delivery_date, '%Y-%m') NOT IN (
             SELECT month FROM bills WHERE customer_id = m2.customer_id
           )
         GROUP BY m2.customer_id
       ) m ON m.customer_id = u.id
       WHERE u.role = 'customer'
         AND u.deleted_at IS NULL
         AND (
           u.pending_balance > 0
           OR COALESCE(b.bill_outstanding, 0) > 0
           OR COALESCE(m.manual_unpaid, 0) > 0
         )
       ORDER BY total_outstanding DESC`,
    );

    const [[{ total }]] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(
         SUM(u.pending_balance)
         + (SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM bills WHERE status IN ('unpaid','partial'))
         + (SELECT COALESCE(SUM(m.jars * u2.jar_rate), 0)
            FROM manual_delivery_entries m
            JOIN users u2 ON u2.id = m.customer_id
            WHERE m.is_paid = 0
              AND DATE_FORMAT(m.delivery_date, '%Y-%m') NOT IN (
                SELECT month FROM bills WHERE customer_id = m.customer_id
              ))
       , 0) AS total
       FROM users WHERE role = 'customer' AND deleted_at IS NULL`
    );

    // Map total_outstanding as pending_balance so frontend doesn't need changes
    const mappedRows = rows.map(r => ({
      ...r,
      pending_balance: Number(r.total_outstanding),
    }));

    res.json({ customers: mappedRows, total_pending: Number(total) });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};
