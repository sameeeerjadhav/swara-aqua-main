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

    res.json({
      pending_balance: Number(user?.pending_balance ?? 0),
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
// Admin: all customers with their pending balance
export const getAdminPendingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         u.id, u.name, u.phone, u.pending_balance,
         COUNT(pp.id)      AS pending_count,
         MIN(pp.created_at) AS oldest_pending
       FROM users u
       LEFT JOIN pending_payments pp
         ON pp.customer_id = u.id AND pp.status = 'pending'
       WHERE u.role = 'customer' AND u.pending_balance > 0
       GROUP BY u.id
       ORDER BY u.pending_balance DESC`,
    );

    const [[{ total }]] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(pending_balance), 0) AS total
       FROM users WHERE role = 'customer'`
    );

    res.json({ customers: rows, total_pending: Number(total) });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};
