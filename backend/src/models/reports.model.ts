import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';

// ── Revenue ───────────────────────────────────────────────────────────────────

export const getDailyRevenue = async (days = 30): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE(t.created_at)                                    AS date,
       COALESCE(SUM(t.amount), 0)                            AS total,
       COALESCE(SUM(CASE WHEN t.mode='cash'    THEN t.amount END), 0) AS cash,
       COALESCE(SUM(CASE WHEN t.mode='online'  THEN t.amount END), 0) AS online,
       COALESCE(SUM(CASE WHEN t.mode='advance' THEN t.amount END), 0) AS advance,
       COUNT(*)                                              AS count
     FROM transactions t
     WHERE t.type = 'credit'
       AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(t.created_at)
     ORDER BY date ASC`,
    [days]
  );
  return rows;
};

export const getMonthlyRevenue = async (months = 12): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(t.created_at, '%Y-%m')                   AS month,
       COALESCE(SUM(t.amount), 0)                            AS total,
       COALESCE(SUM(CASE WHEN t.mode='cash'    THEN t.amount END), 0) AS cash,
       COALESCE(SUM(CASE WHEN t.mode='online'  THEN t.amount END), 0) AS online,
       COALESCE(SUM(CASE WHEN t.mode='advance' THEN t.amount END), 0) AS advance,
       COUNT(*)                                              AS count
     FROM transactions t
     WHERE t.type = 'credit'
       AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY DATE_FORMAT(t.created_at, '%Y-%m')
     ORDER BY month ASC`,
    [months]
  );
  return rows;
};

// ── Pending payments ──────────────────────────────────────────────────────────

export const getPendingPayments = async (): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       u.id, u.name, u.phone,
       COALESCE(SUM(b.total_amount - b.paid_amount), 0) AS pending_amount,
       COUNT(b.id)                                       AS bill_count,
       MIN(b.due_date)                                   AS oldest_due
     FROM users u
     JOIN bills b ON b.customer_id = u.id
     WHERE b.status IN ('unpaid','partial')
     GROUP BY u.id, u.name, u.phone
     ORDER BY pending_amount DESC`
  );
  return rows;
};

// ── Staff performance ─────────────────────────────────────────────────────────

export const getStaffPerformance = async (month?: string): Promise<RowDataPacket[]> => {
  const condition = month
    ? `AND DATE_FORMAT(d.delivered_at, '%Y-%m') = '${month}'`
    : 'AND d.delivered_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       u.id, u.name,
       COUNT(d.id)                                AS deliveries,
       COALESCE(SUM(d.delivered_quantity), 0)     AS jars_delivered,
       COALESCE(SUM(CASE WHEN d.payment_mode='cash'   THEN d.collected_amount ELSE 0 END), 0) AS cash_collected,
       COALESCE(SUM(CASE WHEN d.payment_mode='online' THEN d.collected_amount ELSE 0 END), 0) AS online_collected
     FROM users u
     LEFT JOIN deliveries d ON d.staff_id = u.id ${condition}
     WHERE u.role = 'staff' AND u.status = 'active'
     GROUP BY u.id, u.name
     ORDER BY deliveries DESC`
  );
  return rows;
};

// ── Summary stats ─────────────────────────────────────────────────────────────

export const getRevenueSummary = async (): Promise<RowDataPacket> => {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT
      COALESCE(SUM(CASE WHEN DATE(t.created_at) = CURDATE() THEN t.amount END), 0)          AS today,
      COALESCE(SUM(CASE WHEN DATE_FORMAT(t.created_at,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m') THEN t.amount END), 0) AS this_month,
      COALESCE(SUM(t.amount), 0)                                                              AS all_time,
      COALESCE(SUM(CASE WHEN t.mode='cash'    THEN t.amount END), 0)                         AS cash_total,
      COALESCE(SUM(CASE WHEN t.mode='online'  THEN t.amount END), 0)                         AS online_total,
      COALESCE(SUM(CASE WHEN t.mode='advance' THEN t.amount END), 0)                         AS advance_total,
      COALESCE((SELECT SUM(total_amount - paid_amount) FROM bills WHERE status IN ('unpaid','partial')), 0) AS total_pending,
      (SELECT COUNT(*) FROM deliveries WHERE DATE(delivered_at) = CURDATE() AND status = 'delivered')            AS deliveries_today,
      (SELECT COALESCE(SUM(delivered_quantity),0) FROM deliveries WHERE DATE(delivered_at) = CURDATE() AND status = 'delivered') AS jars_today,
      (SELECT COUNT(*) FROM users WHERE role='customer' AND status='active')                  AS total_customers,
      (SELECT COUNT(*) FROM users WHERE role='customer' AND status='pending')                 AS pending_approvals
    FROM transactions t
    WHERE t.type = 'credit'
  `);
  return rows[0];
};

// ── Customer growth ───────────────────────────────────────────────────────────

export const getDailyCustomerGrowth = async (days = 30): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE(created_at) AS date,
       COUNT(*)         AS new_customers
     FROM users
     WHERE role = 'customer'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [days]
  );
  return rows;
};

export const getMonthlyCustomerGrowth = async (months = 12): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(created_at, '%Y-%m') AS month,
       COUNT(*)                          AS new_customers
     FROM users
     WHERE role = 'customer'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m')
     ORDER BY month ASC`,
    [months]
  );
  return rows;
};

// ── Jars Delivered Trend ──────────────────────────────────────────────────────

export const getDailyJarsTrend = async (days = 30): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE(delivered_at)                    AS date,
       COALESCE(SUM(delivered_quantity), 0)  AS jars,
       COUNT(*)                              AS deliveries
     FROM deliveries
     WHERE status = 'delivered'
       AND delivered_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(delivered_at)
     ORDER BY date ASC`,
    [days]
  );
  return rows;
};

export const getMonthlyJarsTrend = async (months = 12): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(delivered_at, '%Y-%m')    AS month,
       COALESCE(SUM(delivered_quantity), 0)  AS jars,
       COUNT(*)                              AS deliveries
     FROM deliveries
     WHERE status = 'delivered'
       AND delivered_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY DATE_FORMAT(delivered_at, '%Y-%m')
     ORDER BY month ASC`,
    [months]
  );
  return rows;
};

// ── Orders by Type ────────────────────────────────────────────────────────────

export const getOrdersByType = async (): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       type,
       COUNT(*)                       AS count,
       COALESCE(SUM(total_amount), 0) AS revenue
     FROM orders
     WHERE status NOT IN ('cancelled')
     GROUP BY type
     ORDER BY count DESC`
  );
  return rows;
};

// ── Top Customers by Revenue ──────────────────────────────────────────────────

export const getTopCustomers = async (limit = 8): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       u.id, u.name,
       COUNT(DISTINCT o.id)                   AS total_orders,
       COALESCE(SUM(t.amount), 0)             AS total_paid,
       COALESCE(SUM(d.delivered_quantity), 0) AS total_jars
     FROM users u
     LEFT JOIN orders o ON o.customer_id = u.id AND o.status NOT IN ('cancelled')
     LEFT JOIN transactions t ON t.customer_id = u.id AND t.type = 'credit'
     LEFT JOIN deliveries d ON d.order_id = o.id AND d.status = 'delivered'
     WHERE u.role = 'customer' AND u.status = 'active'
     GROUP BY u.id, u.name
     ORDER BY total_paid DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
};

// ── Order Volume ──────────────────────────────────────────────────────────────

export const getDailyOrderVolume = async (days = 30): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE(created_at)           AS date,
       COUNT(*)                   AS orders,
       COALESCE(SUM(quantity), 0) AS jars_ordered
     FROM orders
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [days]
  );
  return rows;
};

export const getMonthlyOrderVolume = async (months = 12): Promise<RowDataPacket[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(created_at, '%Y-%m') AS month,
       COUNT(*)                          AS orders,
       COALESCE(SUM(quantity), 0)        AS jars_ordered
     FROM orders
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m')
     ORDER BY month ASC`,
    [months]
  );
  return rows;
};
