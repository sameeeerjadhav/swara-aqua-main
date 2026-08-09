import { Response } from 'express';
import { errDetail } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import * as BillingModel from '../models/billing.model';
import * as NotifService from '../services/notification.service';
import * as SSE from '../services/sse.service';
import { generateBillPDF, generateReportPDF, generateSummaryBillPDF, SummaryBillRow } from '../services/pdf.service';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { withPlatformFee, getFeeModeFromDB, getPlatformFee } from '../utils/platformFee';

// GET /api/billing/fee-config?amount=X  (authenticated — any role)
// Returns live fee mode + calculated fee so customer UIs always show the correct charge.
export const getFeeConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const base = Math.max(0, parseFloat(String(req.query.amount)) || 0);
    const mode = await getFeeModeFromDB();
    const fee  = base > 0 ? getPlatformFee(base, mode) : 0;
    res.json({ mode, fee, base, total: parseFloat((base + fee).toFixed(2)) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch fee config' });
  }
};

const notify = (fn: () => Promise<void>) =>
  fn().catch(err => console.warn('FCM (non-fatal):', err?.message));

// POST /api/billing/generate  (admin)
export const generateBills = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      month:      z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
      customerId: z.number().int().positive().optional(),   // omit for all customers
    });
    const { month, customerId } = schema.parse(req.body);

    const result = await BillingModel.generateMonthlyBills(month, customerId);

    if (result.generated > 0) {
      notify(async () => {
        if (customerId) {
          await NotifService.sendToUser({
            userId: customerId,
            title:  '📄 Monthly Bill Ready',
            body:   `Your bill for ${month} has been generated. Please check and pay before the due date.`,
            type:   'payment',
            data:   {},
          });
        } else {
          await NotifService.sendToRole('customer',
            '📄 Monthly Bill Ready',
            `Your bill for ${month} has been generated. Please check and pay before the due date.`,
            'payment'
          );
        }
      });
    }

    res.json({
      message: customerId
        ? `Bill generated for customer #${customerId} for ${month}`
        : `Bills generated for ${month}`,
      ...result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.issues[0].message }); return;
    }
    console.error('generateBills error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/billing  (role-aware)
export const getBills = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, status } = req.query as Record<string, string>;
    const filters: Parameters<typeof BillingModel.getBills>[0] = { month, status };

    if (req.user!.role === 'customer') filters.customerId = req.user!.id;

    if (filters.customerId) {
      await BillingModel.syncStaleBills(filters.customerId);
    }

    const bills = await BillingModel.getBills(filters);
    res.json({ bills });
  } catch (err) {
    console.error('getBills error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/billing/:id  (role-aware)
export const getBillById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bill = await BillingModel.getBillById(Number(req.params.id));
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (req.user!.role === 'customer' && bill.customer_id !== req.user!.id) {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    res.json({ bill });
  } catch (err) {
    console.error('getBillById error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/billing/:id/pdf
export const downloadBillPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bill = await BillingModel.getBillById(Number(req.params.id));
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (req.user!.role === 'customer' && bill.customer_id !== req.user!.id) {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    await generateBillPDF(bill, res);
  } catch (err) {
    console.error('downloadBillPDF error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
  }
};

// PATCH /api/billing/:id/pay  (admin)
export const recordPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      mode:   z.enum(['cash', 'online']).default('cash'),
    });
    const { amount, mode } = schema.parse(req.body);

    const bill = await BillingModel.getBillById(Number(req.params.id));
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (bill.status === 'paid') { res.status(400).json({ message: 'Bill already paid' }); return; }

    await BillingModel.recordBillPayment(bill.id, amount, mode);

    // Audit transaction
    await pool.query(
      `INSERT INTO transactions
         (customer_id, order_id, amount, mode, type, collected_by, status, note)
       VALUES (?, NULL, ?, ?, 'credit', ?, 'completed', ?)`,
      [bill.customer_id, amount, mode, req.user!.id,
       `Bill payment for ${bill.month} recorded by admin (${mode})`]
    );

    notify(() =>
      NotifService.sendToUser({
        userId: bill.customer_id,
        title:  '✅ Payment Recorded',
        body:   `₹${amount} ${mode === 'cash' ? 'cash' : 'online'} payment recorded for your ${bill.month} bill.`,
        type:   'payment',
      })
    );

    res.json({ message: 'Payment recorded' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.issues[0].message }); return;
    }
    console.error('recordPayment error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// PATCH /api/billing/:id/pay-advance  (customer — pay own bill via advance balance)
export const payBillWithAdvance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bill = await BillingModel.getBillById(Number(req.params.id));
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }

    // Customers can only pay their own bills
    if (req.user!.role === 'customer' && bill.customer_id !== req.user!.id) {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    if (bill.status === 'paid') {
      res.status(400).json({ message: 'Bill already paid' }); return;
    }

    const due = parseFloat((Number(bill.total_amount) - Number(bill.paid_amount)).toFixed(2));
    if (due <= 0) { res.status(400).json({ message: 'No amount due' }); return; }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check advance balance
      const [userRows] = await conn.query<RowDataPacket[]>(
        'SELECT prepaid_balance FROM users WHERE id = ? FOR UPDATE',
        [bill.customer_id]
      );
      const advanceBalance = Number(userRows[0]?.prepaid_balance ?? 0);
      if (advanceBalance < due) {
        await conn.rollback();
        res.status(400).json({ message: `Insufficient advance balance. Need ₹${due}, have ₹${advanceBalance}` });
        return;
      }

      // Debit advance balance
      await conn.query('UPDATE users SET prepaid_balance = prepaid_balance - ? WHERE id = ?', [due, bill.customer_id]);

      // Record advance transaction
      await conn.query(
        `INSERT INTO advance_transactions (user_id, type, amount, mode, status, reference_id, note)
         VALUES (?, 'debit', ?, 'advance', 'completed', ?, ?)`,
        [bill.customer_id, due, `bill-${bill.id}`, `Bill payment for ${bill.month}`]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Record payment on bill
    await BillingModel.recordBillPayment(bill.id, due, 'advance');

    notify(() =>
      NotifService.sendToUser({
        userId: bill.customer_id,
        title:  '✅ Bill Paid',
        body:   `Your ${bill.month} bill of ₹${due} has been paid via advance balance.`,
        type:   'payment',
      })
    );

    res.json({ message: 'Bill paid via advance balance' });

    // Recalculate bill for this month so the bill status reflects the advance payment
    const payMonth = bill.month; // use the bill's actual month, not current month
    BillingModel.generateBillForCustomer(bill.customer_id, payMonth)
      .then(updated => {
        if (updated) {
          SSE.sendToUser(bill.customer_id, 'bill_updated', { month: payMonth });
          SSE.broadcastToRole('admin', 'bill_updated', { customerId: bill.customer_id, month: payMonth });
        }
      })
      .catch((e: Error) => console.warn('[Billing] payBillWithAdvance recalc failed:', e?.message));
  } catch (err) {
    console.error('payBillWithAdvance error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── POST /api/billing/clear-dues/advance  (customer) ─────────────────────────
// Pay all unpaid/partial bills via advance balance, oldest first.
export const clearDuesAdvance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Load all unpaid / partial bills for this customer, oldest month first
    const allBills = await BillingModel.getBills({ customerId: userId });
    const dueBills = allBills
      .filter(b => b.status !== 'paid')
      .sort((a, b) => a.month.localeCompare(b.month)); // oldest first

    if (dueBills.length < 2) {
      res.status(400).json({ message: 'Not enough unpaid bills to use Clear All Dues' }); return;
    }

    const totalDue = dueBills.reduce((s, b) =>
      s + parseFloat((Number(b.total_amount) - Number(b.paid_amount)).toFixed(2)), 0
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check advance balance
      const [userRows] = await conn.query<RowDataPacket[]>(
        'SELECT prepaid_balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      const advanceBalance = Number(userRows[0]?.prepaid_balance ?? 0);
      if (advanceBalance < totalDue) {
        await conn.rollback();
        res.status(400).json({
          message: `Insufficient advance balance. Need ₹${totalDue.toFixed(2)}, have ₹${advanceBalance.toFixed(2)}`,
        }); return;
      }

      // Debit advance balance once
      await conn.query('UPDATE users SET prepaid_balance = prepaid_balance - ? WHERE id = ?', [totalDue, userId]);
      await conn.query(
        `INSERT INTO advance_transactions (user_id, type, amount, mode, status, reference_id, note)
         VALUES (?, 'debit', ?, 'advance', 'completed', ?, ?)`,
        [userId, totalDue, `clear-dues-${Date.now()}`, `Cleared ${dueBills.length} bills via advance balance`]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Record payment on each bill oldest → newest
    for (const bill of dueBills) {
      const due = parseFloat((Number(bill.total_amount) - Number(bill.paid_amount)).toFixed(2));
      if (due > 0) await BillingModel.recordBillPayment(bill.id, due, 'advance');
    }

    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '✅ All Dues Cleared',
        body:  `₹${totalDue.toFixed(2)} paid via advance balance — ${dueBills.length} bills cleared.`,
        type:  'payment',
      })
    );

    res.json({ message: 'All dues cleared via advance balance', totalPaid: totalDue, billsCleared: dueBills.length });
  } catch (err) {
    console.error('clearDuesAdvance error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── POST /api/billing/clear-dues/order  (customer) ───────────────────────────
// Create a Razorpay order for total dues + one platform fee.
export const clearDuesOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const Razorpay = (await import('razorpay')).default;
    const { withPlatformFee } = await import('../utils/platformFee');

    const userId = req.user!.id;
    const allBills = await BillingModel.getBills({ customerId: userId });
    const dueBills = allBills
      .filter(b => b.status !== 'paid')
      .sort((a, b) => a.month.localeCompare(b.month));

    if (dueBills.length < 2) {
      res.status(400).json({ message: 'Not enough unpaid bills' }); return;
    }

    const totalDue = parseFloat(
      dueBills.reduce((s, b) =>
        s + parseFloat((Number(b.total_amount) - Number(b.paid_amount)).toFixed(2)), 0
      ).toFixed(2)
    );

    const { fee: platformFee, total: chargeAmount } = await withPlatformFee(totalDue);

    const key_id     = process.env.RAZORPAY_KEY_ID     || '';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!key_id || !key_secret) { res.status(500).json({ message: 'Razorpay not configured' }); return; }

    const rzp = new Razorpay({ key_id, key_secret });
    const rzpOrder = await rzp.orders.create({
      amount:   Math.round(chargeAmount * 100),
      currency: 'INR',
      receipt:  `cleardues_${userId}_${Date.now()}`,
      notes:    {
        userId:      String(userId),
        purpose:     'clear_dues',
        billIds:     dueBills.map(b => b.id).join(','),
        platformFee: String(platformFee),
      },
    });

    res.json({
      rzpOrderId:  rzpOrder.id,
      amount:      rzpOrder.amount,
      currency:    rzpOrder.currency,
      keyId:       key_id,
      totalDue,
      platformFee,
      billCount:   dueBills.length,
      bills:       dueBills.map(b => ({
        id:     b.id,
        month:  b.month,
        due:    parseFloat((Number(b.total_amount) - Number(b.paid_amount)).toFixed(2)),
        status: b.status,
      })),
    });
  } catch (err) {
    console.error('clearDuesOrder error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── POST /api/billing/clear-dues/verify  (customer) ──────────────────────────
// Verify Razorpay payment and credit all bills oldest first.
export const clearDuesVerify = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crypto = await import('crypto');
    const { withPlatformFee } = await import('../utils/platformFee');

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ message: 'Missing payment verification fields' }); return;
    }

    const expectedSig = crypto.default
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      res.status(400).json({ message: 'Payment verification failed — invalid signature' }); return;
    }

    const userId = req.user!.id;
    const allBills = await BillingModel.getBills({ customerId: userId });
    const dueBills = allBills
      .filter(b => b.status !== 'paid')
      .sort((a, b) => a.month.localeCompare(b.month));

    const totalDue = parseFloat(
      dueBills.reduce((s, b) =>
        s + parseFloat((Number(b.total_amount) - Number(b.paid_amount)).toFixed(2)), 0
      ).toFixed(2)
    );

    // Record payment on each bill oldest → newest; only the base amount (not the fee)
    for (const bill of dueBills) {
      const due = parseFloat((Number(bill.total_amount) - Number(bill.paid_amount)).toFixed(2));
      if (due > 0) {
        await BillingModel.recordBillPayment(bill.id, due, 'online');
        // Record transaction
        await pool.query(
          `INSERT INTO transactions
             (customer_id, order_id, amount, mode, type, collected_by, status, note)
           VALUES (?, NULL, ?, 'online', 'credit', NULL, 'completed', ?)`,
          [userId, due, `Bill payment for ${bill.month} via Razorpay (${razorpay_payment_id}) — Clear All Dues`]
        );
      }
    }

    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '✅ All Dues Cleared',
        body:  `₹${totalDue.toFixed(2)} paid online — ${dueBills.length} bills cleared.`,
        type:  'payment',
      })
    );

    res.json({ message: 'All dues cleared', totalPaid: totalDue, billsCleared: dueBills.length });
  } catch (err) {
    console.error('clearDuesVerify error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── GET /api/billing/summary  (admin) ────────────────────────────────────────
export const getBillingSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month } = req.query as Record<string, string>;

    // ── Aggregate from bills table ──────────────────────────────────────────
    const billConditions = month ? `WHERE b.month = '${month}'` : '';
    const [billAgg] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*)                                                         AS total_bills,
        COALESCE(SUM(b.total_amount), 0)                                 AS total_billed,
        COALESCE(SUM(b.paid_amount), 0)                                  AS total_paid,
        COALESCE(SUM(b.total_amount - b.paid_amount), 0)                 AS total_pending,
        COALESCE(SUM(CASE WHEN b.status = 'paid'    THEN 1 ELSE 0 END), 0) AS paid_count,
        COALESCE(SUM(CASE WHEN b.status = 'partial' THEN 1 ELSE 0 END), 0) AS partial_count,
        COALESCE(SUM(CASE WHEN b.status = 'unpaid'  THEN 1 ELSE 0 END), 0) AS unpaid_count
      FROM bills b
      ${billConditions}
    `);

    // ── Aggregate cash vs online from transactions ──────────────────────────
    // Only credit transactions that are completed
    const txConditions = month
      ? `AND DATE_FORMAT(t.created_at, '%Y-%m') = '${month}'`
      : '';
    const [txAgg] = await pool.query<RowDataPacket[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN t.mode = 'online' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS online_paid,
        COALESCE(SUM(CASE WHEN t.mode = 'cash'   AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS cash_paid,
        COALESCE(SUM(CASE WHEN t.mode = 'cash'   AND t.status = 'pending'   THEN t.amount ELSE 0 END), 0) AS cash_pending_verification,
        COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS tx_total_paid
      FROM transactions t
      WHERE t.type = 'credit'
      ${txConditions}
    `);

    // ── Per-customer breakdown ──────────────────────────────────────────────
    const [custBreakdown] = await pool.query<RowDataPacket[]>(`
      SELECT
        u.id                                                             AS customer_id,
        u.name                                                           AS customer_name,
        u.phone                                                          AS customer_phone,
        COALESCE(SUM(b.total_amount), 0)                                 AS total_billed,
        COALESCE(SUM(b.paid_amount), 0)                                  AS total_paid,
        COALESCE(SUM(b.total_amount - b.paid_amount), 0)                 AS total_pending,
        COUNT(b.id)                                                      AS bill_count,
        COALESCE(SUM(CASE WHEN b.status = 'unpaid' OR b.status = 'partial' THEN 1 ELSE 0 END), 0) AS due_bills,
        MAX(b.due_date)                                                  AS latest_due_date
      FROM users u
      LEFT JOIN bills b ON b.customer_id = u.id ${month ? `AND b.month = '${month}'` : ''}
      WHERE u.role = 'customer'
      GROUP BY u.id, u.name, u.phone
      ORDER BY total_pending DESC, u.name ASC
    `);

    res.json({
      summary: {
        ...billAgg[0],
        ...txAgg[0],
      },
      customers: custBreakdown,
    });
  } catch (err) {
    console.error('getBillingSummary error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Delivery Report — flexible date range ────────────────────────────────────

const getReportData = async (customerId: number, startDate: string, endDate: string) => {
  // Customer info
  const [custRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, phone, COALESCE(jar_rate, 50) AS jar_rate FROM users WHERE id = ?`,
    [customerId]
  );
  if (!custRows.length) return null;
  const customer = custRows[0];

  // Daily breakdown — regular deliveries + admin manual entries
  const [dailyRows] = await pool.query<RowDataPacket[]>(
    `SELECT delivery_date, SUM(jars) AS jars FROM (
       SELECT DATE_FORMAT(COALESCE(d.delivered_at, d.created_at), '%Y-%m-%d') AS delivery_date,
              SUM(d.delivered_quantity) AS jars
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE o.customer_id = ?
         AND DATE(COALESCE(d.delivered_at, d.created_at)) BETWEEN ? AND ?
         AND d.status = 'delivered'
       GROUP BY DATE(COALESCE(d.delivered_at, d.created_at))
       UNION ALL
       SELECT DATE_FORMAT(m.delivery_date, '%Y-%m-%d') AS delivery_date,
              SUM(m.jars) AS jars
       FROM manual_delivery_entries m
       WHERE m.customer_id = ?
         AND m.delivery_date BETWEEN ? AND ?
       GROUP BY m.delivery_date
     ) combined
     GROUP BY delivery_date
     ORDER BY delivery_date ASC`,
    [customerId, startDate, endDate, customerId, startDate, endDate]
  );

  const days = dailyRows.map((r: RowDataPacket) => ({
    date: String(r.delivery_date),
    jars: Number(r.jars),
  }));

  const totalJars   = days.reduce((s, d) => s + d.jars, 0);
  const jarRate     = Number(customer.jar_rate);
  const totalAmount = totalJars * jarRate;

  // Payment breakdown for the date range
  // Cash collected at door during deliveries
  const [cashRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(d.collected_amount), 0) AS cash_paid
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE o.customer_id = ?
       AND DATE(COALESCE(d.delivered_at, d.created_at)) BETWEEN ? AND ?
       AND d.payment_mode = 'cash'
       AND d.status = 'delivered'`,
    [customerId, startDate, endDate]
  );

  // Online payments via transactions in the date range
  const [onlineRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(t.amount), 0) AS online_paid
     FROM transactions t
     WHERE t.customer_id = ?
       AND DATE(t.created_at) BETWEEN ? AND ?
       AND t.type = 'credit'
       AND t.mode = 'online'
       AND t.status = 'completed'`,
    [customerId, startDate, endDate]
  );

  // Advance payments applied in the date range
  const [advRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(t.amount), 0) AS advance_paid
     FROM transactions t
     WHERE t.customer_id = ?
       AND DATE(t.created_at) BETWEEN ? AND ?
       AND t.type = 'credit'
       AND t.mode = 'advance'
       AND t.status = 'completed'`,
    [customerId, startDate, endDate]
  );

  const cashPaid    = Number(cashRows[0]?.cash_paid)    || 0;
  const onlinePaid  = Number(onlineRows[0]?.online_paid)  || 0;
  const advancePaid = Number(advRows[0]?.advance_paid)  || 0;

  // Also add manual delivery payments within the date range
  const [manualPayRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN payment_mode = 'cash'   AND is_paid = 1 THEN amount_collected ELSE 0 END), 0) AS cash_paid,
       COALESCE(SUM(CASE WHEN payment_mode = 'online' AND is_paid = 1 THEN amount_collected ELSE 0 END), 0) AS online_paid
     FROM manual_delivery_entries
     WHERE customer_id = ? AND delivery_date BETWEEN ? AND ?`,
    [customerId, startDate, endDate]
  );
  const manualCash   = Number(manualPayRows[0]?.cash_paid)   || 0;
  const manualOnline = Number(manualPayRows[0]?.online_paid) || 0;

  const totalPaid   = cashPaid + manualCash + onlinePaid + manualOnline + advancePaid;
  const amountDue   = Math.max(0, totalAmount - totalPaid);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      jar_rate: jarRate,
    },
    startDate,
    endDate,
    totalJars,
    jarRate,
    totalAmount,
    days,
    cashPaid,
    onlinePaid,
    advancePaid,
    totalPaid,
    amountDue,
  };
};

// GET /api/billing/delivery-report?customerId=X&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
export const getDeliveryReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let { customerId, startDate, endDate } = req.query as Record<string, string>;

    // Customer can only see their own
    if (req.user!.role === 'customer') customerId = String(req.user!.id);

    if (!customerId) { res.status(400).json({ message: 'customerId is required' }); return; }
    if (!startDate || !endDate) { res.status(400).json({ message: 'startDate and endDate are required (YYYY-MM-DD)' }); return; }

    const data = await getReportData(Number(customerId), startDate, endDate);
    if (!data) { res.status(404).json({ message: 'Customer not found' }); return; }

    res.json({ report: data });
  } catch (err) {
    console.error('getDeliveryReport error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/billing/delivery-report/pdf?customerId=X&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
export const getDeliveryReportPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let { customerId, startDate, endDate, token } = req.query as Record<string, string>;

    if (req.user!.role === 'customer') customerId = String(req.user!.id);

    if (!customerId || !startDate || !endDate) {
      res.status(400).json({ message: 'customerId, startDate, and endDate are required' }); return;
    }

    const data = await getReportData(Number(customerId), startDate, endDate);
    if (!data) { res.status(404).json({ message: 'Customer not found' }); return; }

    await generateReportPDF(data, res);
  } catch (err) {
    console.error('getDeliveryReportPDF error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
  }
};

// GET /api/billing/summary-bill/pdf?month=YYYY-MM  (admin)
export const getSummaryBillPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, token } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ message: 'month is required (YYYY-MM)' }); return;
    }

    const bills = await BillingModel.getBills({ month });

    // Aggregate per customer
    const map = new Map<number, SummaryBillRow>();
    for (const b of bills) {
      const due = Math.max(0, Number(b.total_amount) - Number(b.paid_amount));
      const existing = map.get(b.customer_id);
      if (existing) {
        existing.jars     += Number(b.total_jars);
        existing.total    += Number(b.total_amount);
        existing.cash     += Number(b.cash_paid);
        existing.online   += Number(b.online_paid);
        existing.advance  += Number(b.advance_paid);
        existing.payLater += Number(b.pay_later_amount);
        existing.paid     += Number(b.paid_amount);
        existing.pending  += due;
      } else {
        map.set(b.customer_id, {
          name:     b.customer_name  || '',
          phone:    b.customer_phone || '',
          jars:     Number(b.total_jars),
          total:    Number(b.total_amount),
          cash:     Number(b.cash_paid),
          online:   Number(b.online_paid),
          advance:  Number(b.advance_paid),
          payLater: Number(b.pay_later_amount),
          paid:     Number(b.paid_amount),
          pending:  due,
        });
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (rows.length === 0) {
      res.status(404).json({ message: 'No bills found for this month' }); return;
    }

    await generateSummaryBillPDF(month, rows, res);
  } catch (err) {
    console.error('getSummaryBillPDF error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
  }
};

// ── POST /api/billing/:id/pay/order  (customer) ────────────────────────────────
// Create a Razorpay order for paying a specific bill's remaining due amount.
export const payBillOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const billId = Number(req.params.id);
    const userId = req.user!.id;

    const bill = await BillingModel.getBillById(billId);
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (bill.customer_id !== userId) { res.status(403).json({ message: 'Access denied' }); return; }

    const due = parseFloat((Number(bill.total_amount) - Number(bill.paid_amount)).toFixed(2));
    if (due <= 0) { res.status(400).json({ message: 'This bill is already fully paid' }); return; }

    const Razorpay = (await import('razorpay')).default;
    const { withPlatformFee: wpf } = await import('../utils/platformFee');

    const { fee: platformFee, total: chargeAmount } = await wpf(due);
    const key_id     = process.env.RAZORPAY_KEY_ID     || '';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!key_id || !key_secret) { res.status(500).json({ message: 'Razorpay not configured' }); return; }

    const rzp = new Razorpay({ key_id, key_secret });
    const rzpOrder = await rzp.orders.create({
      amount:   Math.round(chargeAmount * 100),
      currency: 'INR',
      receipt:  `bill_${billId}_${userId}_${Date.now()}`,
      notes:    {
        userId:      String(userId),
        billId:      String(billId),
        month:       bill.month,
        purpose:     'bill_payment',
        platformFee: String(platformFee),
        baseAmount:  String(due),
      },
    });

    res.json({
      rzpOrderId:  rzpOrder.id,
      amount:      rzpOrder.amount,
      currency:    rzpOrder.currency,
      keyId:       key_id,
      due,
      platformFee,
      month:       bill.month,
    });
  } catch (err) {
    console.error('payBillOrder error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── POST /api/billing/:id/pay/verify  (customer) ──────────────────────────────
// Verify Razorpay payment for a single bill and update its paid_amount / status.
export const payBillVerify = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crypto = await import('crypto');

    const billId = Number(req.params.id);
    const userId = req.user!.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
      res.status(400).json({ message: 'Missing payment verification fields' }); return;
    }

    // Signature verification
    const expectedSig = crypto.default
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expectedSig !== razorpay_signature) {
      res.status(400).json({ message: 'Payment verification failed — invalid signature' }); return;
    }

    const bill = await BillingModel.getBillById(billId);
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (bill.customer_id !== userId) { res.status(403).json({ message: 'Access denied' }); return; }

    // The base amount paid (without platform fee)
    const baseAmount = parseFloat(String(amount));
    const due = parseFloat((Number(bill.total_amount) - Number(bill.paid_amount)).toFixed(2));
    const paying = Math.min(baseAmount, due); // never over-pay

    // Record payment on the bill (updates paid_amount, status, online_paid column)
    await BillingModel.recordBillPayment(billId, paying, 'online');

    // Record transaction for audit trail
    await pool.query(
      `INSERT INTO transactions
         (customer_id, order_id, amount, mode, type, collected_by, status, note)
       VALUES (?, NULL, ?, 'online', 'credit', NULL, 'completed', ?)`,
      [userId, paying, `Bill payment for ${bill.month} via Razorpay (${razorpay_payment_id})`]
    );

    const newPaid = parseFloat((Number(bill.paid_amount) + paying).toFixed(2));
    const newDue  = Math.max(0, parseFloat((Number(bill.total_amount) - newPaid).toFixed(2)));

    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '✅ Bill Payment Received',
        body:  `₹${paying.toFixed(0)} paid for ${bill.month} bill. ${newDue > 0 ? `₹${newDue.toFixed(0)} remaining.` : 'Bill fully cleared! 🎉'}`,
        type:  'payment',
        data:  {},
      })
    );

    res.json({
      message:    newDue <= 0 ? 'Bill fully paid!' : 'Partial payment recorded',
      paid:       paying,
      remaining:  newDue,
      billStatus: newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid',
    });
  } catch (err) {
    console.error('payBillVerify error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── PATCH /api/billing/:id/pay-advance-single  (customer) ─────────────────────
// Pay a specific bill using the customer's advance (prepaid) balance.
// All DB operations run in a single atomic transaction to prevent partial failures.
export const payBillAdvanceSingle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const billId = Number(req.params.id);
    const userId = req.user!.id;

    const bill = await BillingModel.getBillById(billId);
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (bill.customer_id !== userId) { res.status(403).json({ message: 'Access denied' }); return; }

    const due = parseFloat((Number(bill.total_amount) - Number(bill.paid_amount)).toFixed(2));
    if (due <= 0) { res.status(400).json({ message: 'This bill is already fully paid' }); return; }

    // ── Single atomic transaction: balance deduction + bill update + audit ───
    const conn = await pool.getConnection();
    let paying = 0;
    let newAdv  = 0;
    let newDue  = 0;
    try {
      await conn.beginTransaction();

      // Lock user row to get current balance
      const [[user]] = await conn.query<RowDataPacket[]>(
        'SELECT prepaid_balance FROM users WHERE id = ? FOR UPDATE', [userId]
      );
      const advance = parseFloat((Number(user?.prepaid_balance) || 0).toFixed(2));
      if (advance <= 0) {
        await conn.rollback();
        res.status(400).json({ message: 'No advance balance available' });
        return;
      }

      paying = Math.min(advance, due);
      newAdv  = parseFloat((advance - paying).toFixed(2));
      newDue  = Math.max(0, parseFloat((due - paying).toFixed(2)));

      // 1. Deduct from advance balance
      await conn.query('UPDATE users SET prepaid_balance = ? WHERE id = ?', [newAdv, userId]);

      // 2. Update bill (paid_amount, advance_paid column, status)
      const newPaid   = parseFloat((Number(bill.paid_amount) + paying).toFixed(2));
      const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
      await conn.query(
        `UPDATE bills SET paid_amount = ?, status = ?, advance_paid = advance_paid + ? WHERE id = ?`,
        [newPaid, newStatus, paying, billId]
      );

      // 3. Audit transaction record
      await conn.query(
        `INSERT INTO transactions
           (customer_id, order_id, amount, mode, type, collected_by, status, note)
         VALUES (?, NULL, ?, 'advance', 'credit', NULL, 'completed', ?)`,
        [userId, paying, `Bill payment for ${bill.month} via Advance Balance`]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '✅ Bill Payment via Advance',
        body:  `₹${paying.toFixed(0)} deducted from advance for ${bill.month} bill. ${newDue > 0 ? `₹${newDue.toFixed(0)} remaining.` : 'Bill fully cleared! 🎉'}`,
        type:  'payment',
        data:  {},
      })
    );

    res.json({
      message:          newDue <= 0 ? 'Bill fully paid via advance!' : 'Partial advance payment recorded',
      paid:             paying,
      remaining:        newDue,
      advanceRemaining: newAdv,
      billStatus:       newDue <= 0 ? 'paid' : paying > 0 ? 'partial' : 'unpaid',
    });
  } catch (err) {
    console.error('payBillAdvanceSingle error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};
