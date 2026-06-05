import { Response } from 'express';
import { errDetail } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import * as BillingModel from '../models/billing.model';
import * as NotifService from '../services/notification.service';
import { generateBillPDF, generateReportPDF } from '../services/pdf.service';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

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
    const schema = z.object({ amount: z.number().positive() });
    const { amount } = schema.parse(req.body);

    const bill = await BillingModel.getBillById(Number(req.params.id));
    if (!bill) { res.status(404).json({ message: 'Bill not found' }); return; }
    if (bill.status === 'paid') { res.status(400).json({ message: 'Bill already paid' }); return; }

    await BillingModel.recordBillPayment(bill.id, amount, 'cash');

    notify(() =>
      NotifService.sendToUser({
        userId: bill.customer_id,
        title:  '✅ Payment Recorded',
        body:   `₹${amount} payment recorded for your ${bill.month} bill.`,
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

    const { fee: platformFee, total: chargeAmount } = withPlatformFee(totalDue);

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

  // Daily breakdown
  const [dailyRows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(COALESCE(d.delivered_at, d.created_at), '%Y-%m-%d') AS delivery_date,
            SUM(d.delivered_quantity) AS jars
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE o.customer_id = ?
       AND DATE(COALESCE(d.delivered_at, d.created_at)) BETWEEN ? AND ?
       AND d.status = 'delivered'
     GROUP BY DATE(COALESCE(d.delivered_at, d.created_at))
     ORDER BY delivery_date ASC`,
    [customerId, startDate, endDate]
  );

  const days = dailyRows.map((r: RowDataPacket) => ({
    date: String(r.delivery_date),
    jars: Number(r.jars),
  }));

  const totalJars = days.reduce((s, d) => s + d.jars, 0);
  const jarRate = Number(customer.jar_rate);
  const totalAmount = totalJars * jarRate;

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
