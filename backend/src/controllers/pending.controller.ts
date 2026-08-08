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
// Admin: customers with outstanding pay-later balance at the door
// pending_balance = amount customer owes from deliveries where they paid later
// This is separate from bill_outstanding which is shown in the Bill Pending column
export const getAdminPendingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // 1. pending_balance from users table (pay-later order debt not yet cleared)
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, phone, pending_balance FROM users
       WHERE role = 'customer' AND deleted_at IS NULL`
    );

    // 2. Unbilled unpaid manual delivery entries (months where no bill exists yet)
    //    These are not yet in any bill so they're genuinely untracked
    const [manualRows] = await pool.query<RowDataPacket[]>(
      `SELECT m.customer_id,
              SUM(m.jars * u.jar_rate) AS manual_unpaid
       FROM manual_delivery_entries m
       JOIN  users u ON u.id = m.customer_id
       LEFT JOIN bills b
         ON b.customer_id = m.customer_id
        AND b.month = DATE_FORMAT(m.delivery_date, '%Y-%m')
       WHERE m.is_paid = 0
         AND b.id IS NULL
       GROUP BY m.customer_id`
    );
    const manualMap: Record<number, number> = {};
    for (const r of manualRows) manualMap[r.customer_id] = Number(r.manual_unpaid);

    // Only include customers who have actual un-cleared pay-later balance
    // Note: bill_outstanding is intentionally excluded here — it's shown in the
    // separate "Bill Pending" column already. Including it here would double-count.
    let totalPending = 0;
    const result: RowDataPacket[] = [];
    for (const u of userRows) {
      const pendingBal = Number(u.pending_balance) || 0;
      const manualOut  = manualMap[u.id]           || 0;
      const total      = pendingBal + manualOut;
      totalPending += total;
      if (total > 0) {
        result.push({
          id:              u.id,
          name:            u.name,
          phone:           u.phone,
          pending_balance: total,
        } as RowDataPacket);
      }
    }

    result.sort((a, b) => b.pending_balance - a.pending_balance);
    res.json({ customers: result, total_pending: totalPending });
  } catch (err) {
    console.error('getAdminPendingSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
