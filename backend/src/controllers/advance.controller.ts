import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import * as NotifService from '../services/notification.service';
import * as SSE from '../services/sse.service';
import { withPlatformFee } from '../utils/platformFee';

// Lazy init — only created when first request comes in so missing keys don't crash startup
let _razorpay: Razorpay | null = null;
const getRazorpay = () => {
  if (!_razorpay) {
    const key_id     = process.env.RAZORPAY_KEY_ID     || '';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!key_id || !key_secret) throw new Error('Razorpay keys not configured in environment');
    _razorpay = new Razorpay({ key_id, key_secret });
  }
  return _razorpay;
};

const notify = (fn: () => Promise<void>) =>
  fn().catch(err => console.warn('FCM (non-fatal):', err?.message));

// ── Advance access guard ───────────────────────────────────────────────────────

const checkAdvanceApproved = async (userId: number): Promise<boolean> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT advance_access FROM users WHERE id = ?', [userId]
  );
  return rows[0]?.advance_access === 'approved';
};

// GET /api/advance  — balance + recent transactions + access status
export const getAdvance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT prepaid_balance, advance_access FROM users WHERE id = ?', [userId]
    );
    const balance        = Number(userRows[0]?.prepaid_balance ?? 0);
    const advanceAccess  = userRows[0]?.advance_access ?? 'none';

    const [txRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM advance_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );

    res.json({ balance, advanceAccess, transactions: txRows });
  } catch (err) {
    console.error('getAdvance error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/advance/request-access  — customer requests advance access
export const requestAdvanceAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT advance_access FROM users WHERE id = ?', [userId]
    );
    const current = rows[0]?.advance_access;
    if (current === 'approved') {
      res.json({ message: 'Advance access already approved', advanceAccess: 'approved' }); return;
    }
    if (current === 'pending') {
      res.json({ message: 'Request already pending', advanceAccess: 'pending' }); return;
    }
    await pool.query('UPDATE users SET advance_access = ? WHERE id = ?', ['pending', userId]);

    // Notify admin
    notify(() => NotifService.sendToRole('admin',
      '💳 Advance Payment Access Requested',
      `A customer has requested advance payment access.`,
      'approval'
    ));

    res.json({ message: 'Advance access requested. Awaiting admin approval.', advanceAccess: 'pending' });
  } catch (err) {
    console.error('requestAdvanceAccess error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/advance/access-requests  — admin: list pending advance requests
export const getAdvanceAccessRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status = 'pending' } = req.query as Record<string, string>;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, phone, advance_access, prepaid_balance, created_at
       FROM users WHERE role = 'customer' AND advance_access = ?
       ORDER BY created_at DESC`,
      [status]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('getAdvanceAccessRequests error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// PATCH /api/advance/access-requests/:userId/approve  — admin approves
export const approveAdvanceAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    await pool.query('UPDATE users SET advance_access = ? WHERE id = ?', ['approved', userId]);

    notify(() => NotifService.sendToUser({
      userId: Number(userId),
      title: '✅ Advance Payment Access Approved!',
      body: 'Your advance payment account has been activated. You can now add credit and pay using advance balance.',
      type: 'payment',
    }));

    res.json({ message: 'Advance access approved' });
  } catch (err) {
    console.error('approveAdvanceAccess error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// PATCH /api/advance/access-requests/:userId/reject  — admin rejects
export const rejectAdvanceAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { reason = 'Your advance payment access request was not approved.' } = req.body;
    await pool.query('UPDATE users SET advance_access = ? WHERE id = ?', ['rejected', userId]);

    notify(() => NotifService.sendToUser({
      userId: Number(userId),
      title: '❌ Advance Payment Access Rejected',
      body: reason,
      type: 'payment',
    }));

    res.json({ message: 'Advance access rejected' });
  } catch (err) {
    console.error('rejectAdvanceAccess error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/advance/topup/order  — create Razorpay order for advance top-up
export const createTopupOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await checkAdvanceApproved(req.user!.id))) {
      res.status(403).json({ message: 'Advance payment access not approved. Please request access first.' }); return;
    }
    const baseAmount = Number(req.body.amount);
    if (!baseAmount || baseAmount < 1) {
      res.status(400).json({ message: 'amount must be >= 1' }); return;
    }

    const { fee: platformFee, total: chargeAmount } = withPlatformFee(baseAmount);

    const order = await getRazorpay().orders.create({
      amount:   Math.round(chargeAmount * 100), // paise — base + platform fee
      currency: 'INR',
      receipt:  `advance_${req.user!.id}_${Date.now()}`,
      notes:    { userId: String(req.user!.id), purpose: 'advance_topup', baseAmount: String(baseAmount), platformFee: String(platformFee) },
    });

    res.json({
      orderId:      order.id,
      amount:       order.amount,    // total in paise (base + fee)
      currency:     order.currency,
      keyId:        process.env.RAZORPAY_KEY_ID,
      baseAmount,                    // what will be credited to advance balance
      platformFee,                   // fee in rupees (non-refundable)
    });
  } catch (err) {
    console.error('createTopupOrder error:', err);
    res.status(500).json({ message: 'Failed to create payment order' });
  }
};

// POST /api/advance/topup/verify  — verify Razorpay payment & credit advance balance
export const verifyTopup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await checkAdvanceApproved(req.user!.id))) {
      res.status(403).json({ message: 'Advance payment access not approved.' }); return;
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
      res.status(400).json({ message: 'Missing payment verification fields' }); return;
    }

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      res.status(400).json({ message: 'Payment verification failed' }); return;
    }

    const totalPaisePaid  = Number(amount);
    const totalRupeesPaid = totalPaisePaid / 100;

    // Reverse-derive base credit from total paid (subtract platform fee slab)
    let creditAmount: number;
    if (totalRupeesPaid <= 104)       creditAmount = totalRupeesPaid - 5;
    else if (totalRupeesPaid <= 309)  creditAmount = totalRupeesPaid - 10;
    else if (totalRupeesPaid <= 519)  creditAmount = totalRupeesPaid - 15;
    else                              creditAmount = totalRupeesPaid - 20;
    creditAmount = parseFloat(creditAmount.toFixed(2));
    const userId = req.user!.id;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Credit advance balance
      await conn.query(
        'UPDATE users SET prepaid_balance = prepaid_balance + ? WHERE id = ?',
        [creditAmount, userId]
      );

      // Record transaction
      await conn.query(
        `INSERT INTO advance_transactions
           (user_id, type, amount, mode, status, reference_id, note)
         VALUES (?, 'credit', ?, 'razorpay', 'completed', ?, 'Advance credit via Razorpay')`,
        [userId, creditAmount, razorpay_payment_id]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT prepaid_balance FROM users WHERE id = ?', [userId]
    );
    const newBalance = Number(rows[0]?.prepaid_balance ?? 0);

    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '💰 Advance Credit Added!',
        body:  `₹${creditAmount} added to your advance balance. Total: ₹${newBalance}`,
        type:  'payment',
      })
    );

    SSE.sendToUser(userId, 'advance_updated', { balance: newBalance });

    res.json({ message: 'Advance credit added successfully', balance: newBalance });
  } catch (err) {
    console.error('verifyTopup error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/advance/pay-order  — pay for an order using advance balance
export const payOrderWithAdvance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;
    if (!orderId) { res.status(400).json({ message: 'orderId is required' }); return; }

    const userId = req.user!.id;

    if (!(await checkAdvanceApproved(userId))) {
      res.status(403).json({ message: 'Advance payment access not approved.' }); return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock user row
      const [userRows] = await conn.query<RowDataPacket[]>(
        'SELECT prepaid_balance FROM users WHERE id = ? FOR UPDATE', [userId]
      );
      const balance = Number(userRows[0]?.prepaid_balance ?? 0);

      // Get order
      const [orderRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM orders WHERE id = ? AND customer_id = ?', [orderId, userId]
      );
      if (!orderRows.length) {
        await conn.rollback();
        res.status(404).json({ message: 'Order not found' }); return;
      }
      const order = orderRows[0];
      const due   = Number(order.total_amount);

      if (balance < due) {
        await conn.rollback();
        res.status(400).json({ message: `Insufficient advance balance. Need ₹${due}, have ₹${balance}` }); return;
      }

      // Debit advance balance
      await conn.query(
        'UPDATE users SET prepaid_balance = prepaid_balance - ? WHERE id = ?',
        [due, userId]
      );

      // Record advance transaction
      await conn.query(
        `INSERT INTO advance_transactions
           (user_id, type, amount, mode, status, reference_id, note)
         VALUES (?, 'debit', ?, 'advance', 'completed', ?, ?)`,
        [userId, due, String(orderId), `Payment for Order #${orderId}`]
      );

      // Record in transactions table (for billing/reports) — mode = 'advance'
      await conn.query(
        `INSERT INTO transactions
           (customer_id, order_id, amount, mode, type, status, note)
         VALUES (?, ?, ?, 'advance', 'credit', 'completed', 'Paid via advance balance')`,
        [userId, orderId, due]
      );

      // Mark order as paid
      await conn.query(
        `UPDATE orders SET status = 'paid' WHERE id = ? AND status NOT IN ('completed','delivered','cancelled')`,
        [orderId]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT prepaid_balance FROM users WHERE id = ?', [userId]
    );
    const newBalance = Number(rows[0]?.prepaid_balance ?? 0);

    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '✅ Payment Successful',
        body:  `Order #${orderId} paid via advance balance. Remaining: ₹${newBalance}`,
        type:  'payment',
      })
    );

    SSE.sendToUser(userId, 'advance_updated', { balance: newBalance });

    res.json({ message: 'Order paid via advance balance', balance: newBalance });
  } catch (err) {
    console.error('payOrderWithAdvance error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Helper: refund advance balance when an advance-paid order is cancelled
export const refundAdvanceOnCancel = async (
  conn: any,
  orderId: number,
  customerId: number
): Promise<void> => {
  // Check if order was paid via advance
  const [txRows] = await conn.query<RowDataPacket[]>(
    `SELECT amount FROM transactions
     WHERE order_id = ? AND mode = 'advance' AND type = 'credit' AND status = 'completed'
     LIMIT 1`,
    [orderId]
  );
  if (!txRows.length) return;

  const refundAmt = Number(txRows[0].amount);

  await conn.query(
    'UPDATE users SET prepaid_balance = prepaid_balance + ? WHERE id = ?',
    [refundAmt, customerId]
  );
  await conn.query(
    `INSERT INTO advance_transactions (user_id, type, amount, mode, status, reference_id, note)
     VALUES (?, 'credit', ?, 'refund', 'completed', ?, ?)`,
    [customerId, refundAmt, `cancel-${orderId}`, `Refund for cancelled Order #${orderId}`]
  );
};
