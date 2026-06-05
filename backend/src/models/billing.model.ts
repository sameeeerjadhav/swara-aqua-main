import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Bill {
  id:               number;
  customer_id:      number;
  month:            string;
  total_jars:       number;
  jar_rate:         number;
  subtotal:         number;
  previous_pending: number;
  advance_used:     number;
  total_amount:     number;
  paid_amount:      number;
  cash_paid:        number;
  online_paid:      number;
  advance_paid:     number;
  pay_later_amount: number;
  status:           'paid' | 'partial' | 'unpaid';
  due_date:         string;
  created_at:       string;
  customer_name?:   string;
  customer_phone?:  string;
}

type Conn = Awaited<ReturnType<typeof pool.getConnection>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const billStatusFromAmounts = (totalAmount: number, paidAmount: number): Bill['status'] => {
  const remaining = parseFloat((totalAmount - paidAmount).toFixed(2));
  if (remaining <= 0) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
};

/** Total jars delivered in a month (date from delivered_at, fallback created_at) */
const countJars = async (conn: Conn, customerId: number, month: string): Promise<number> => {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(d.delivered_quantity), 0) AS total_jars
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE o.customer_id = ?
       AND DATE_FORMAT(COALESCE(d.delivered_at, d.created_at), '%Y-%m') = ?
       AND d.status = 'delivered'`,
    [customerId, month]
  );
  return Number(rows[0].total_jars);
};

/** Sum of previous unpaid/partial bills (carry-forward) */
const previousPending = async (conn: Conn, customerId: number, month: string): Promise<number> => {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS pending
     FROM bills
     WHERE customer_id = ? AND status IN ('unpaid','partial') AND month < ?`,
    [customerId, month]
  );
  return Number(rows[0].pending);
};

/**
 * Compute payment breakdown from deliveries + transactions for a given month.
 * Returns: { cash_paid, online_paid, pay_later_amount }
 * advance_paid is handled separately by bill generation logic.
 */
const computePaymentBreakdown = async (
  conn: Conn,
  customerId: number,
  month: string
): Promise<{ cash_paid: number; online_paid: number; pay_later_amount: number }> => {
  // Cash and online collected at delivery door
  const [deliveryRows] = await conn.query<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN d.payment_mode = 'cash'      THEN d.collected_amount ELSE 0 END), 0) AS cash_paid,
       COALESCE(SUM(CASE WHEN d.payment_mode = 'online'    THEN d.collected_amount ELSE 0 END), 0) AS online_door,
       COALESCE(SUM(CASE WHEN d.payment_mode = 'pay_later' THEN d.collected_amount ELSE 0 END), 0) AS pay_later_amount
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE o.customer_id = ?
       AND DATE_FORMAT(COALESCE(d.delivered_at, d.created_at), '%Y-%m') = ?
       AND d.status = 'delivered'`,
    [customerId, month]
  );

  // Online bill payments (Clear All Dues / individual bill pay via Razorpay) recorded in transactions
  const [txRows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(t.amount), 0) AS online_bill_pay
     FROM transactions t
     WHERE t.customer_id = ?
       AND DATE_FORMAT(t.created_at, '%Y-%m') = ?
       AND t.mode = 'online'
       AND t.type = 'credit'
       AND t.status = 'completed'`,
    [customerId, month]
  );

  // Pay-later: deliveries where customer owes at door (not yet collected)
  // Use pending_payments table for accurate amount
  const [plRows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(pp.amount), 0) AS pay_later_total
     FROM pending_payments pp
     JOIN orders o ON o.id = pp.order_id
     WHERE o.customer_id = ?
       AND DATE_FORMAT(pp.created_at, '%Y-%m') = ?`,
    [customerId, month]
  );

  return {
    cash_paid:        Number(deliveryRows[0].cash_paid),
    online_paid:      Number(deliveryRows[0].online_door) + Number(txRows[0].online_bill_pay),
    pay_later_amount: Number(plRows[0].pay_later_total),
  };
};

// ── Generate bill for one customer ────────────────────────────────────────────

export const generateBillForCustomer = async (
  customerId: number,
  month: string
): Promise<Bill | null> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Check existing bill
    const [existing] = await conn.query<RowDataPacket[]>(
      'SELECT id, total_jars, paid_amount FROM bills WHERE customer_id = ? AND month = ? FOR UPDATE',
      [customerId, month]
    );
    if ((existing as RowDataPacket[]).length) {
      const row = (existing as RowDataPacket[])[0];
      await conn.commit();
      // Recalculate stale bills (0 jars or 0 paid)
      if (Number(row.total_jars) === 0 || Number(row.paid_amount) === 0) {
        return recalculateBillForCustomer(customerId, month, row.id);
      }
      return null; // Already up to date
    }

    // Customer info
    const [custRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, COALESCE(jar_rate, 50) AS jar_rate, COALESCE(prepaid_balance, 0) AS prepaid_balance
       FROM users WHERE id = ? AND role = 'customer'`,
      [customerId]
    );
    if (!(custRows as RowDataPacket[]).length) { await conn.rollback(); return null; }
    const cust = (custRows as RowDataPacket[])[0];

    // Core metrics
    const totalJars      = await countJars(conn, customerId, month);
    const prevPending    = await previousPending(conn, customerId, month);
    const breakdown      = await computePaymentBreakdown(conn, customerId, month);

    const jarRate: number  = Number(cust.jar_rate);
    const subtotal: number = parseFloat((totalJars * jarRate).toFixed(2));

    // Auto-apply advance balance
    let totalAmount: number    = parseFloat((subtotal + prevPending).toFixed(2));
    let advanceUsed            = 0;
    let advancePaid            = 0;
    let prepaidBalance: number = Number(cust.prepaid_balance);

    if (prepaidBalance > 0 && totalAmount > 0) {
      advanceUsed    = Math.min(prepaidBalance, totalAmount);
      advancePaid    = advanceUsed;
      totalAmount    = parseFloat((totalAmount - advanceUsed).toFixed(2));
      prepaidBalance = parseFloat((prepaidBalance - advanceUsed).toFixed(2));
      await conn.query('UPDATE users SET prepaid_balance = ? WHERE id = ?', [prepaidBalance, customerId]);
    }

    const paid_amount = parseFloat(
      (breakdown.cash_paid + breakdown.online_paid + advancePaid).toFixed(2)
    );
    const status = billStatusFromAmounts(totalAmount, paid_amount);

    const [y, m]   = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const dueDate   = `${nextMonth}-10`;

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO bills
         (customer_id, month, total_jars, jar_rate, subtotal,
          previous_pending, advance_used,
          total_amount, paid_amount, status, due_date,
          cash_paid, online_paid, advance_paid, pay_later_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId, month, totalJars, jarRate, subtotal,
        prevPending, advanceUsed,
        totalAmount, paid_amount, status, dueDate,
        breakdown.cash_paid, breakdown.online_paid, advancePaid, breakdown.pay_later_amount,
      ]
    );

    await conn.commit();
    return getBillById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Recalculate existing bill from fresh delivery data ────────────────────────

export const recalculateBillForCustomer = async (
  customerId: number,
  month: string,
  billId: number
): Promise<Bill | null> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [billRows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM bills WHERE id = ? AND customer_id = ? AND month = ? FOR UPDATE',
      [billId, customerId, month]
    );
    if (!(billRows as RowDataPacket[]).length) { await conn.rollback(); return null; }
    const existing = (billRows as RowDataPacket[])[0];

    const totalJars   = await countJars(conn, customerId, month);
    const prevPending = await previousPending(conn, customerId, month);
    const breakdown   = await computePaymentBreakdown(conn, customerId, month);

    const jarRate       = Number(existing.jar_rate);
    const subtotal      = parseFloat((totalJars * jarRate).toFixed(2));
    const advancePaid   = Number(existing.advance_paid) || Number(existing.advance_used);
    const totalAmount   = Math.max(0, parseFloat((subtotal + prevPending - advancePaid).toFixed(2)));
    const paid_amount   = parseFloat(
      (breakdown.cash_paid + breakdown.online_paid + advancePaid).toFixed(2)
    );
    const status        = billStatusFromAmounts(totalAmount, paid_amount);

    await conn.query(
      `UPDATE bills SET
         total_jars       = ?,
         subtotal         = ?,
         previous_pending = ?,
         total_amount     = ?,
         paid_amount      = ?,
         status           = ?,
         cash_paid        = ?,
         online_paid      = ?,
         advance_paid     = ?,
         pay_later_amount = ?
       WHERE id = ?`,
      [
        totalJars, subtotal, prevPending,
        totalAmount, paid_amount, status,
        breakdown.cash_paid, breakdown.online_paid, advancePaid, breakdown.pay_later_amount,
        billId,
      ]
    );

    await conn.commit();
    return getBillById(billId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/** Sync stale bills (0 jars) for a customer. Called on GET bills. */
export const syncStaleBills = async (customerId: number): Promise<void> => {
  const bills = await getBills({ customerId });
  const stale = bills.filter(b => Number(b.total_jars) === 0);
  for (const b of stale) {
    await recalculateBillForCustomer(customerId, b.month, b.id);
  }
};

// ── Generate bills for ALL customers or one ───────────────────────────────────

export const generateMonthlyBills = async (
  month: string,
  customerId?: number   // if provided, generate only for that customer
): Promise<{ generated: number; recalculated: number; skipped: number; errors: number }> => {
  const [customers] = await pool.query<RowDataPacket[]>(
    customerId
      ? `SELECT id FROM users WHERE id = ? AND role = 'customer' AND status = 'active'`
      : `SELECT id FROM users WHERE role = 'customer' AND status = 'active'`,
    customerId ? [customerId] : []
  );

  if (!(customers as RowDataPacket[]).length) {
    return { generated: 0, recalculated: 0, skipped: 0, errors: 0 };
  }

  let generated = 0, recalculated = 0, skipped = 0, errors = 0;

  for (const c of customers as RowDataPacket[]) {
    try {
      const [existing] = await pool.query<RowDataPacket[]>(
        'SELECT id, total_jars, paid_amount FROM bills WHERE customer_id = ? AND month = ?',
        [c.id, month]
      );
      const hadBill = (existing as RowDataPacket[]).length > 0;

      const bill = await generateBillForCustomer(c.id, month);
      if (bill) {
        hadBill ? recalculated++ : generated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`[Billing] Failed for customer ${c.id}:`, (err as Error).message);
    }
  }

  return { generated, recalculated, skipped, errors };
};

// ── Queries ───────────────────────────────────────────────────────────────────

export const getBills = async (filters: {
  customerId?: number;
  month?: string;
  status?: string;
} = {}): Promise<Bill[]> => {
  const conditions = ['1=1'];
  const params: unknown[] = [];

  if (filters.customerId) { conditions.push('b.customer_id = ?'); params.push(filters.customerId); }
  if (filters.month)      { conditions.push('b.month = ?');       params.push(filters.month); }
  if (filters.status)     { conditions.push('b.status = ?');      params.push(filters.status); }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone
     FROM bills b JOIN users u ON u.id = b.customer_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.month DESC, b.created_at DESC`,
    params
  );
  return rows as Bill[];
};

export const getBillById = async (id: number): Promise<Bill | null> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone
     FROM bills b JOIN users u ON u.id = b.customer_id WHERE b.id = ?`,
    [id]
  );
  return (rows as RowDataPacket[]).length ? (rows as RowDataPacket[])[0] as Bill : null;
};

// ── Record payment against a bill (mode-aware) ────────────────────────────────

export const recordBillPayment = async (
  billId: number,
  amount: number,
  mode: 'cash' | 'online' | 'advance' = 'cash'
): Promise<void> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM bills WHERE id = ? FOR UPDATE',
      [billId]
    );
    const bill = (rows as RowDataPacket[])[0];
    if (!bill) throw new Error('Bill not found');

    const newPaid      = parseFloat((Number(bill.paid_amount) + amount).toFixed(2));
    const remaining    = parseFloat((Number(bill.total_amount) - newPaid).toFixed(2));
    const status: Bill['status'] = remaining <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

    // Increment the specific mode column
    const modeCol =
      mode === 'online'  ? 'online_paid'  :
      mode === 'advance' ? 'advance_paid' :
      'cash_paid';

    await conn.query(
      `UPDATE bills SET paid_amount = ?, status = ?, ${modeCol} = ${modeCol} + ? WHERE id = ?`,
      [newPaid, status, amount, billId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Sync bill payment columns when a delivery is completed.
 * Called from order.controller after completeDelivery.
 * Only updates if a bill already exists for this month.
 */
export const syncDeliveryToBill = async (
  customerId: number,
  month: string,
  paymentMode: 'cash' | 'online' | 'advance' | 'pay_later',
  amount: number
): Promise<void> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM bills WHERE customer_id = ? AND month = ?',
    [customerId, month]
  );
  if (!(rows as RowDataPacket[]).length) return; // No bill yet — will be picked up at generation time

  const billId = (rows as RowDataPacket[])[0].id;

  if (paymentMode === 'pay_later') {
    // Don't add to paid_amount — update pay_later_amount and recalculate
    await pool.query(
      'UPDATE bills SET pay_later_amount = pay_later_amount + ? WHERE id = ?',
      [amount, billId]
    );
    return;
  }

  await recordBillPayment(billId, amount, paymentMode === 'online' ? 'online' : 'cash');
};
