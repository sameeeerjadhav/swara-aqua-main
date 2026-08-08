import { Response } from 'express';
import { errDetail } from '../utils/errors';
import * as UserModel from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import * as NotifService from '../services/notification.service';
import * as BillingModel from '../models/billing.model';
import * as SSE from '../services/sse.service';

const notify = (fn: () => Promise<void>) => {
  fn().catch(err => console.warn('FCM notification failed (non-fatal):', err?.message));
};

export const getStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total,
        SUM(status = 'pending') as pending,
        SUM(status = 'active') as active,
        SUM(role = 'customer') as customers,
        SUM(role = 'staff') as staff,
        SUM(advance_access = 'pending') as advance_requests
      FROM users`
    );
    res.json({ stats: rows[0] });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await UserModel.getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'pending', 'rejected'].includes(status)) {
      res.status(400).json({ message: 'Invalid status' });
      return;
    }

    if (status === 'rejected') {
      // Hard delete the user from DB as requested
      await pool.query('DELETE FROM users WHERE id = ?', [Number(id)]);

      notify(() =>
        NotifService.sendToUser({
          userId: Number(id),
          title: '❌ Account Rejected',
          body: 'Your account registration was not approved. Please contact support.',
          type: 'approval',
        })
      );
      res.json({ message: 'User account rejected and deleted from database' });
      return;
    }

    await UserModel.updateUserStatus(Number(id), status);

    // Notify user of status change
    if (status === 'active') {
      notify(() =>
        NotifService.sendToUser({
          userId: Number(id),
          title: '✅ Account Approved',
          body: 'Your account has been approved. You can now place orders.',
          type: 'approval',
        })
      );
    }

    res.json({ message: `User status updated to ${status}` });
  } catch (err) {
    console.error('updateStatus error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      res.status(400).json({ message: 'name, phone and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    // Check phone not already taken
    const existing = await UserModel.findByPhone(phone);
    if (existing) {
      res.status(409).json({ message: 'Phone number already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const [result] = await pool.query<any>(
      "INSERT INTO users (name, phone, password, role, status) VALUES (?, ?, ?, 'staff', 'active')",
      [name, phone, hashed]
    );

    res.status(201).json({ message: 'Staff account created', userId: result.insertId });
  } catch (err) {
    console.error('createStaff error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const updateJarRate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { jarRate } = req.body;

    if (jarRate == null || isNaN(Number(jarRate)) || Number(jarRate) <= 0) {
      res.status(400).json({ message: 'jarRate must be a positive number' });
      return;
    }

    await UserModel.updateJarRate(Number(id), Number(jarRate));
    res.json({ message: `Jar rate updated to ₹${jarRate}` });
  } catch (err) {
    console.error('updateJarRate error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getCustomerProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);

    // Basic info
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, phone, role, status, jar_rate, advance_balance, profile_photo, created_at
       FROM users WHERE id = ? AND role = 'customer'`,
      [id]
    );
    if (!userRows.length) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }
    const customer = userRows[0];

    // Get address: first try user_addresses (saved during signup), fallback to last order
    const [savedAddrs] = await pool.query<RowDataPacket[]>(
      `SELECT label, address, is_default FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 5`,
      [id]
    );

    // Get last known address from most recent order
    const [addrRows] = await pool.query<RowDataPacket[]>(
      `SELECT address, latitude, longitude FROM orders
       WHERE customer_id = ? AND address IS NOT NULL AND address != ''
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    // Stats — UNION regular deliveries + admin manual entries
    const [statsRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COALESCE(SUM(jars), 0)     AS total_jars_delivered,
        COUNT(DISTINCT order_id)   AS total_orders,
        COALESCE(SUM(collected), 0) AS total_collected
      FROM (
        SELECT d.delivered_quantity AS jars, o.id AS order_id, d.collected_amount AS collected
        FROM orders o
        LEFT JOIN deliveries d ON d.order_id = o.id AND d.status = 'delivered'
        WHERE o.customer_id = ?
        UNION ALL
        SELECT m.jars AS jars, NULL AS order_id, m.amount_collected AS collected
        FROM manual_delivery_entries m
        WHERE m.customer_id = ?
      ) combined
    `, [id, id]);

    // Pending bill amount + unbilled unpaid manual deliveries
    const [pendingRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(total_amount - paid_amount), 0) AS bill_pending,
         COUNT(*) AS pending_bills
       FROM bills WHERE customer_id = ? AND status IN ('unpaid', 'partial')`,
      [id]
    );

    // Unpaid manual delivery entries for months not yet billed
    const [manualPendingRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(m.jars * u.jar_rate), 0) AS manual_unpaid
       FROM manual_delivery_entries m
       JOIN users u ON u.id = m.customer_id
       WHERE m.customer_id = ?
         AND m.is_paid = 0
         AND DATE_FORMAT(m.delivery_date, '%Y-%m') NOT IN (
           SELECT month FROM bills WHERE customer_id = ?
         )`,
      [id, id]
    );

    const pendingAmount = Number(pendingRows[0].bill_pending) + Number(manualPendingRows[0].manual_unpaid);

    // Recent bills
    const [bills] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM bills WHERE customer_id = ? ORDER BY month DESC LIMIT 12`,
      [id]
    );

    // Recent orders
    const [orders] = await pool.query<RowDataPacket[]>(
      `SELECT o.*, s.name AS staff_name
       FROM orders o LEFT JOIN users s ON s.id = o.staff_id
       WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 15`,
      [id]
    );

    res.json({
      customer: {
        ...customer,
        address: addrRows.length ? addrRows[0].address : (savedAddrs.length ? (savedAddrs as any[])[0].address : null),
        latitude: addrRows.length ? addrRows[0].latitude : null,
        longitude: addrRows.length ? addrRows[0].longitude : null,
        savedAddresses: savedAddrs as any[],
      },
      stats: {
        ...statsRows[0],
        pending_amount: pendingAmount,
        pending_bills:  Number(pendingRows[0].pending_bills),
      },
      bills,
      orders,
    });
  } catch (err) {
    console.error('getCustomerProfile error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/admin/customer-balances — bulk pending balances for all customers
export const getCustomerBalances = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Total pending per customer
    const [totals] = await pool.query<RowDataPacket[]>(`
      SELECT b.customer_id,
             COALESCE(SUM(b.total_amount - b.paid_amount), 0) AS pending_amount
      FROM bills b
      WHERE b.status IN ('unpaid', 'partial')
      GROUP BY b.customer_id
    `);

    // Month-wise breakdown per customer (only unpaid/partial)
    const [monthly] = await pool.query<RowDataPacket[]>(`
      SELECT b.customer_id, b.month,
             b.total_amount, b.paid_amount,
             (b.total_amount - b.paid_amount) AS pending,
             b.status
      FROM bills b
      WHERE b.status IN ('unpaid', 'partial')
      ORDER BY b.month DESC
    `);

    // Index by customer_id
    const balances: Record<number, { total: number; months: any[] }> = {};
    for (const row of totals as any[]) {
      balances[row.customer_id] = { total: Number(row.pending_amount), months: [] };
    }
    for (const row of monthly as any[]) {
      if (balances[row.customer_id]) {
        balances[row.customer_id].months.push({
          month: row.month,
          total_amount: Number(row.total_amount),
          paid_amount: Number(row.paid_amount),
          pending: Number(row.pending),
          status: row.status,
        });
      }
    }

    res.json({ balances });
  } catch (err) {
    console.error('getCustomerBalances error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, password, jarRate, address } = req.body;

    if (!name || !phone || !password) {
      res.status(400).json({ message: 'name, phone and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await UserModel.findByPhone(phone);
    if (existing) {
      res.status(409).json({ message: 'Phone number already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const rate = jarRate && Number(jarRate) > 0 ? Number(jarRate) : 50;

    const [result] = await pool.query<any>(
      "INSERT INTO users (name, phone, password, role, status, jar_rate) VALUES (?, ?, ?, 'customer', 'active', ?)",
      [name, phone, hashed, rate]
    );

    const userId = result.insertId;

    // Save address if provided
    if (address && address.trim()) {
      await pool.query(
        "INSERT INTO user_addresses (user_id, label, address, is_default) VALUES (?, 'Home', ?, 1)",
        [userId, address.trim()]
      );
    }

    res.status(201).json({ message: 'Customer account created', userId });
  } catch (err) {
    console.error('createCustomer error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const createOrderForCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId, type, quantity, deliveryDate, notes, address } = req.body;

    if (!customerId || !type || !quantity) {
      res.status(400).json({ message: 'customerId, type and quantity are required' });
      return;
    }
    if (!['instant', 'preorder', 'monthly', 'bulk'].includes(type)) {
      res.status(400).json({ message: 'Invalid order type' });
      return;
    }
    if (type === 'preorder' && !deliveryDate) {
      res.status(400).json({ message: 'deliveryDate is required for preorder' });
      return;
    }

    // Verify customer exists
    const [custRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, jar_rate FROM users WHERE id = ? AND role = 'customer'",
      [customerId]
    );
    if (!custRows.length) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }

    const customer = custRows[0];
    const pricePerJar = Number(customer.jar_rate) || 50;
    const totalAmount = Number(quantity) * pricePerJar;

    // Create the order
    const [orderResult] = await pool.query<any>(
      `INSERT INTO orders
         (customer_id, type, quantity, price_per_jar, total_amount,
          delivery_date, notes, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId, type, Number(quantity), pricePerJar, totalAmount,
        deliveryDate || null,
        notes || null,
        address || null,
      ]
    );

    const orderId = orderResult.insertId;

    // Add timeline entry
    await pool.query(
      'INSERT INTO order_timeline (order_id, status, note, created_by) VALUES (?, ?, ?, ?)',
      [orderId, 'pending', `Order placed by admin on behalf of ${customer.name}`, req.user!.id]
    );

    // Auto-assign to staff with least active orders (same logic as order.controller)
    const [staffRows] = await pool.query<RowDataPacket[]>(`
      SELECT u.id, u.name,
             COUNT(o.id) AS active_order_count
      FROM users u
      LEFT JOIN orders o ON o.staff_id = u.id
                        AND o.status NOT IN ('completed','cancelled')
      WHERE u.role = 'staff' AND u.status = 'active'
      GROUP BY u.id, u.name
      ORDER BY active_order_count ASC, u.id ASC
    `);

    if (staffRows.length > 0) {
      const assignedStaff = staffRows[0] as any;
      await pool.query(
        `UPDATE orders SET staff_id = ?, status = 'assigned', updated_at = NOW() WHERE id = ?`,
        [assignedStaff.id, orderId]
      );
      await pool.query(
        'INSERT INTO order_timeline (order_id, status, note, created_by) VALUES (?, ?, ?, ?)',
        [orderId, 'assigned', `Auto-assigned to ${assignedStaff.name}`, req.user!.id]
      );

      notify(() =>
        NotifService.sendToUser({
          userId: assignedStaff.id,
          title:  'New Delivery Assigned! 📦',
          body:   `Order #${orderId} — ${quantity} jars from ${customer.name}`,
          type:   'delivery',
          data:   { orderId: String(orderId) },
        })
      );

      notify(() =>
        NotifService.sendToRole(
          'admin',
          'New Order 📦',
          `Order #${orderId} — ${quantity} jars for ${customer.name}`,
          'order',
          { orderId: String(orderId) }
        )
      );
    } else {
      notify(() =>
        NotifService.sendToRole(
          'admin',
          'New Order 📦',
          `Order #${orderId} for ${customer.name} — no staff available to assign`,
          'order',
          { orderId: String(orderId) }
        )
      );
    }

    notify(() =>
      NotifService.sendToUser({
        userId: Number(customerId),
        title:  'Order Placed ✅',
        body:   `Your order #${orderId} for ${quantity} jars has been placed.`,
        type:   'order',
        data:   { orderId: String(orderId) },
      })
    );

    res.status(201).json({ message: 'Order placed successfully', orderId, totalAmount });
  } catch (err) {
    console.error('createOrderForCustomer error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getStaffProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, phone, role, status, created_at
       FROM users WHERE id = ? AND role = 'staff'`,
      [id]
    );
    if (!userRows.length) { res.status(404).json({ message: 'Staff not found' }); return; }

    const [statsRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(DISTINCT d.order_id)              AS total_deliveries,
        COALESCE(SUM(d.delivered_quantity), 0)  AS total_jars_delivered,
        COALESCE(SUM(d.collected_amount), 0)    AS total_cash_collected
      FROM deliveries d
      WHERE d.staff_id = ? AND d.status = 'delivered'
    `, [id]);

    const [activeRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS active_orders FROM orders
       WHERE staff_id = ? AND status IN ('assigned','pending')`, [id]
    );

    const [invRows] = await pool.query<RowDataPacket[]>(
      `SELECT assigned_jars, empty_collected FROM staff_inventory WHERE staff_id = ?`, [id]
    );

    const [recentDeliveries] = await pool.query<RowDataPacket[]>(`
      SELECT d.id, d.delivered_quantity, d.collected_amount, d.payment_mode, d.delivered_at,
             o.quantity, o.type, o.address,
             c.name AS customer_name, c.phone AS customer_phone
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      JOIN users  c ON c.id = o.customer_id
      WHERE d.staff_id = ?
      ORDER BY d.delivered_at DESC
      LIMIT 15
    `, [id]);

    // Cash currently in hand (pending cash transactions not yet submitted/verified)
    const [cashInHandRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) AS cash_in_hand
       FROM transactions
       WHERE collected_by = ? AND mode = 'cash' AND status = 'pending' AND type = 'credit'`,
      [id]
    );

    res.json({
      staff: userRows[0],
      stats: {
        ...statsRows[0],
        active_orders:  Number((activeRows[0] as any).active_orders),
        cash_in_hand:   Number(cashInHandRows[0]?.cash_in_hand ?? 0),
      },
      inventory: invRows.length ? invRows[0] : { assigned_jars: 0, empty_collected: 0 },
      recentDeliveries,
    });
  } catch (err) {
    console.error('getStaffProfile error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── GET  /api/admin/settings ──────────────────────────────────────────────────
export const getSettings = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_key, setting_value FROM app_settings'
    );
    // Convert to a key→value map for convenience
    const settings: Record<string, string> = {};
    for (const row of rows as any[]) {
      settings[row.setting_key] = row.setting_value;
    }
    res.json({ settings });
  } catch (err) {
    console.error('getSettings error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/admin/settings/:key ──────────────────────────────────────────────
export const updateSetting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || value === null) {
      res.status(400).json({ message: 'value is required' }); return;
    }
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, String(value)]
    );
    res.json({ message: 'Setting updated', key, value });
  } catch (err) {
    console.error('updateSetting error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Customer list for Staff (staff need to see all customers for direct delivery) ──
export const getCustomersForStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.jar_rate,
        u.pending_balance,
        (SELECT a.address FROM user_addresses a WHERE a.user_id = u.id AND a.is_default = 1 LIMIT 1) AS address,
        (SELECT a.label   FROM user_addresses a WHERE a.user_id = u.id AND a.is_default = 1 LIMIT 1) AS address_label,
        u.profile_photo,
        u.group_id,
        g.name  AS group_name,
        g.color AS group_color,
        g.icon  AS group_icon,
        COALESCE((
          SELECT SUM(d.delivered_quantity)
          FROM deliveries d
          JOIN orders o ON o.id = d.order_id
          WHERE o.customer_id = u.id
            AND d.status = 'delivered'
            AND DATE(COALESCE(d.delivered_at, d.created_at)) = CURDATE()
        ), 0)
        +
        COALESCE((
          SELECT SUM(m.jars)
          FROM manual_delivery_entries m
          WHERE m.customer_id = u.id
            AND m.delivery_date = CURDATE()
        ), 0) AS today_jars
      FROM users u
      LEFT JOIN customer_groups g ON g.id = u.group_id
      WHERE u.role = 'customer' AND u.status = 'active' AND u.deleted_at IS NULL
      ORDER BY u.name ASC
    `);

    // Apply saved order: staff-personal first, then admin global, then alpha
    const callerId = req.user!.id;
    const callerRole = req.user!.role;

    let orderedIds: number[] | null = null;

    // Try staff's personal order
    if (callerRole === 'staff') {
      const [staffOrder] = await pool.query<RowDataPacket[]>(
        `SELECT ordered_ids FROM customer_list_order WHERE owner_id = ? AND owner_role = 'staff'`,
        [callerId]
      );
      if (staffOrder.length) orderedIds = JSON.parse(staffOrder[0].ordered_ids as string) as number[];
    }

    // Fallback to admin global order
    if (!orderedIds) {
      const [adminOrder] = await pool.query<RowDataPacket[]>(
        `SELECT ordered_ids FROM customer_list_order WHERE owner_id = 0 AND owner_role = 'admin'`
      );
      if (adminOrder.length) orderedIds = JSON.parse(adminOrder[0].ordered_ids as string) as number[];
    }

    if (orderedIds) {
      const indexMap = new Map(orderedIds.map((id, i) => [id, i]));
      const inOrder = rows
        .filter(r => indexMap.has(r.id))
        .sort((a, b) => (indexMap.get(a.id) ?? 999) - (indexMap.get(b.id) ?? 999));
      const notInOrder = rows.filter(r => !indexMap.has(r.id));
      res.json({ customers: [...inOrder, ...notInOrder] });
    } else {
      res.json({ customers: rows });
    }
  } catch (err) {
    console.error('getCustomersForStaff error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /admin/customer-deliveries/:id?month=YYYY-MM  (staff + admin)
export const getCustomerDeliveryCalendar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = Number(req.params.id);
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT day, SUM(jars) AS jars FROM (
        SELECT
          DAY(COALESCE(d.delivered_at, d.created_at)) AS day,
          SUM(d.delivered_quantity) AS jars
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        WHERE o.customer_id = ?
          AND DATE_FORMAT(COALESCE(d.delivered_at, d.created_at), '%Y-%m') = ?
          AND d.status = 'delivered'
        GROUP BY DAY(COALESCE(d.delivered_at, d.created_at))
        UNION ALL
        SELECT
          DAY(m.delivery_date) AS day,
          SUM(m.jars) AS jars
        FROM manual_delivery_entries m
        WHERE m.customer_id = ?
          AND DATE_FORMAT(m.delivery_date, '%Y-%m') = ?
        GROUP BY DAY(m.delivery_date)
      ) combined
      GROUP BY day
      ORDER BY day ASC
    `, [customerId, month, customerId, month]);

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dayMap = new Map(rows.map((r: RowDataPacket) => [Number(r.day), Number(r.jars)]));

    const calendar = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      jars: dayMap.get(i + 1) || 0,
    }));

    const totalJars = rows.reduce((s: number, r: RowDataPacket) => s + Number(r.jars), 0);
    res.json({ month, calendar, totalJars });
  } catch (err) {
    console.error('getCustomerDeliveryCalendar error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /admin/customer-deliveries/:id/day?date=YYYY-MM-DD  (staff + admin)
export const getCustomerDayDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = Number(req.params.id);
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        d.id,
        d.delivered_quantity                                AS jars,
        TIME_FORMAT(COALESCE(d.delivered_at, d.created_at), '%h:%i %p') AS time_str,
        HOUR(COALESCE(d.delivered_at, d.created_at))        AS hour,
        u.name                                              AS staff_name,
        d.collected_amount                                  AS amount_collected,
        d.payment_mode                                      AS payment_mode,
        CASE WHEN d.collected_amount > 0 THEN 1 ELSE 0 END AS is_paid,
        0                                                   AS is_manual,
        NULL                                                AS notes
      FROM deliveries d
      JOIN orders o     ON o.id  = d.order_id
      LEFT JOIN users u ON u.id  = d.staff_id
      WHERE o.customer_id = ?
        AND DATE(COALESCE(d.delivered_at, d.created_at)) = ?
        AND d.status = 'delivered'
      UNION ALL
      SELECT
        m.id,
        m.jars,
        TIME_FORMAT(ADDTIME(m.delivery_date, m.delivery_time), '%h:%i %p') AS time_str,
        HOUR(m.delivery_time)                               AS hour,
        u2.name                                             AS staff_name,
        m.amount_collected,
        m.payment_mode,
        m.is_paid,
        1                                                   AS is_manual,
        m.notes
      FROM manual_delivery_entries m
      LEFT JOIN users u2 ON u2.id = m.admin_id
      WHERE m.customer_id = ?
        AND m.delivery_date = ?
      ORDER BY hour ASC, time_str ASC
    `, [customerId, date, customerId, date]);

    const deliveries = rows.map((r: RowDataPacket) => {
      const h = Number(r.hour);
      const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
      return {
        id:               r.id,
        delivery_id:      r.is_manual ? null : r.id, // real deliveries.id for non-manual
        jars:             Number(r.jars),
        time:             r.time_str,
        period,
        staff_name:       r.staff_name || 'Admin',
        amount_collected: Number(r.amount_collected),
        payment_mode:     r.payment_mode || 'none',
        is_paid:          Boolean(r.is_paid),
        is_manual:        Boolean(r.is_manual),
        notes:            r.notes || null,
      };
    });

    const totalJars = deliveries.reduce((s, d) => s + d.jars, 0);
    res.json({ date, deliveries, totalJars });
  } catch (err) {
    console.error('getCustomerDayDeliveries error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Admin: Edit any user's profile ───────────────────────────────────────────
export const updateUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetId = Number(req.params.id);
    const { name, phone, jar_rate, newPassword } = req.body as {
      name?: string; phone?: string; jar_rate?: number; newPassword?: string;
    };

    // Fetch target user
    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [targetId]
    );
    if (!userRows.length) { res.status(404).json({ message: 'User not found' }); return; }

    const updates: string[] = [];
    const params: any[]     = [];

    if (name && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (phone && phone.trim()) {
      const cleanPhone = String(phone).replace(/[\s\-]/g, '');
      if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
        res.status(400).json({ message: 'Invalid phone number' }); return;
      }
      // Check for duplicate (excluding self)
      const [dup] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE phone = ? AND id != ? AND deleted_at IS NULL', [cleanPhone, targetId]
      );
      if (dup.length) { res.status(409).json({ message: 'Phone number already in use by another account' }); return; }
      updates.push('phone = ?');
      params.push(cleanPhone);
    }

    if (jar_rate != null && Number(jar_rate) >= 0) {
      updates.push('jar_rate = ?');
      params.push(Number(jar_rate));
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ message: 'Password must be at least 6 characters' }); return;
      }
      const hashed = await bcrypt.hash(newPassword, 12);
      updates.push('password = ?');
      params.push(hashed);
    }

    if (!updates.length) {
      res.status(400).json({ message: 'No fields to update' }); return;
    }

    params.push(targetId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('updateUserProfile error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Admin: Soft-delete a user ─────────────────────────────────────────────────
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetId = Number(req.params.id);

    // Safety: cannot delete an admin account
    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, role, deleted_at FROM users WHERE id = ?', [targetId]
    );
    if (!userRows.length) { res.status(404).json({ message: 'User not found' }); return; }
    const target = userRows[0];
    if (target.role === 'admin') {
      res.status(403).json({ message: 'Cannot delete an admin account' }); return;
    }
    if (target.deleted_at) {
      res.status(409).json({ message: 'User already deleted' }); return;
    }

    // Hard delete from database as requested
    await pool.query('DELETE FROM users WHERE id = ?', [targetId]);

    // Invalidate all refresh tokens by nullifying (optional: add a revoked_at field)
    // For now the user simply cannot login because they no longer exist in DB

    res.json({ message: 'User account and all related records deleted permanently.' });
  } catch (err) {
    console.error('deleteUser error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Customer List Order ────────────────────────────────────────────────────────

// GET /admin/customer-order  (admin)
export const getCustomerOrder = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ordered_ids FROM customer_list_order WHERE owner_id = 0 AND owner_role = 'admin'`
    );
    const ordered_ids: number[] = rows.length ? JSON.parse(rows[0].ordered_ids as string) : [];
    res.json({ ordered_ids });
  } catch (err) {
    console.error('getCustomerOrder error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /admin/customer-order  (admin)
export const saveCustomerOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ordered_ids } = req.body as { ordered_ids: number[] };
    if (!Array.isArray(ordered_ids)) { res.status(400).json({ message: 'ordered_ids must be an array' }); return; }
    await pool.query(
      `INSERT INTO customer_list_order (owner_id, owner_role, ordered_ids)
       VALUES (0, 'admin', ?)
       ON DUPLICATE KEY UPDATE ordered_ids = VALUES(ordered_ids)`,
      [JSON.stringify(ordered_ids)]
    );
    res.json({ message: 'Customer order saved' });
  } catch (err) {
    console.error('saveCustomerOrder error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /staff/customer-order  (staff)
export const getStaffCustomerOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = req.user!.id;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ordered_ids FROM customer_list_order WHERE owner_id = ? AND owner_role = 'staff'`,
      [staffId]
    );
    if (rows.length) {
      res.json({ ordered_ids: JSON.parse(rows[0].ordered_ids as string) as number[], source: 'staff' });
      return;
    }
    // Fallback: return admin's global order
    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT ordered_ids FROM customer_list_order WHERE owner_id = 0 AND owner_role = 'admin'`
    );
    const ordered_ids: number[] = adminRows.length ? JSON.parse(adminRows[0].ordered_ids as string) : [];
    res.json({ ordered_ids, source: 'admin' });
  } catch (err) {
    console.error('getStaffCustomerOrder error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /staff/customer-order  (staff)
export const saveStaffCustomerOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = req.user!.id;
    const { ordered_ids } = req.body as { ordered_ids: number[] };
    if (!Array.isArray(ordered_ids)) { res.status(400).json({ message: 'ordered_ids must be an array' }); return; }
    await pool.query(
      `INSERT INTO customer_list_order (owner_id, owner_role, ordered_ids)
       VALUES (?, 'staff', ?)
       ON DUPLICATE KEY UPDATE ordered_ids = VALUES(ordered_ids)`,
      [staffId, JSON.stringify(ordered_ids)]
    );
    res.json({ message: 'Staff customer order saved' });
  } catch (err) {
    console.error('saveStaffCustomerOrder error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /staff/customer-order  (staff — reset to admin order)
export const resetStaffCustomerOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = req.user!.id;
    await pool.query(
      `DELETE FROM customer_list_order WHERE owner_id = ? AND owner_role = 'staff'`,
      [staffId]
    );
    res.json({ message: 'Reset to admin order' });
  } catch (err) {
    console.error('resetStaffCustomerOrder error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /admin/users/:id/reset-password
// Admin resets any user's password to a fixed temp password: 123456
export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) { res.status(400).json({ message: 'Invalid user id' }); return; }
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    if (!(rows as any[]).length) { res.status(404).json({ message: 'User not found' }); return; }
    const user = (rows as any[])[0];
    const tempPassword = '123456';
    const hashed = await bcrypt.hash(tempPassword, 12);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    notify(() => NotifService.sendToUser({ userId, title: 'Password Reset', body: 'Your password was reset to 123456. Please log in and change it.', type: 'general', data: {} }));
    res.json({ message: 'Password reset for ' + user.name, tempPassword });
  } catch (err) {
    console.error('resetUserPassword error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /admin/password-reset-requests
export const getPasswordResetRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT pr.id, pr.user_id, pr.status, pr.created_at,
             u.name AS user_name, u.phone AS user_phone
      FROM password_reset_requests pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.status = 'pending'
      ORDER BY pr.created_at DESC
    `);
    res.json({ requests: rows });
  } catch (err) {
    console.error('getPasswordResetRequests error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /admin/password-reset-requests/:id/approve
export const approvePasswordReset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM password_reset_requests WHERE id = ? AND status = ?', [id, 'pending']
    );
    if (!(rows as any[]).length) { res.status(404).json({ message: 'Request not found or already processed' }); return; }
    const reqRow = (rows as any[])[0];

    // Set the new (already bcrypt-hashed) password
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [reqRow.new_password, reqRow.user_id]);
    await pool.query(
      'UPDATE password_reset_requests SET status = ?, reviewed_at = NOW() WHERE id = ?',
      ['approved', id]
    );

    // Notify the customer
    notify(() =>
      NotifService.sendToUser({
        userId: reqRow.user_id,
        title: 'Password Updated ✅',
        body: 'Your password reset request has been approved. You can now log in with your new password.',
        type: 'general',
        data: {},
      })
    );

    res.json({ message: 'Password reset approved and applied' });
  } catch (err) {
    console.error('approvePasswordReset error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// DELETE /admin/password-reset-requests/:id  (reject)
export const rejectPasswordReset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      'UPDATE password_reset_requests SET status = ?, reviewed_at = NOW() WHERE id = ? AND status = ?',
      ['rejected', id, 'pending']
    );
    res.json({ message: 'Password reset request rejected' });
  } catch (err) {
    console.error('rejectPasswordReset error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /admin/customers/:id/manual-delivery
export const addManualDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = Number(req.params.id);
    const adminId    = req.user!.id;
    const { jars, amount_collected, is_paid, payment_mode, delivery_date, delivery_time, notes } = req.body;

    if (!jars || jars < 1) { res.status(400).json({ message: 'jars must be >= 1' }); return; }
    if (!delivery_date) { res.status(400).json({ message: 'delivery_date is required (YYYY-MM-DD)' }); return; }

    // Reject future dates — deliveries can only be logged for today or past days
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStr = `${todayIST.getFullYear()}-${String(todayIST.getMonth() + 1).padStart(2, '0')}-${String(todayIST.getDate()).padStart(2, '0')}`;
    if (delivery_date > todayStr) {
      res.status(400).json({ message: 'Cannot log deliveries for future dates' });
      return;
    }

    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE id = ? AND role = ? AND deleted_at IS NULL',
      [customerId, 'customer']
    );
    if (!userRows.length) { res.status(404).json({ message: 'Customer not found' }); return; }

    const paidFlag  = is_paid ? 1 : 0;
    const pMode     = paidFlag ? (payment_mode || 'cash') : 'none';
    const amount    = paidFlag ? Math.max(0, Number(amount_collected) || 0) : 0;
    const dTime     = delivery_time || '09:00:00';

    const [result] = await pool.query<any>(
      `INSERT INTO manual_delivery_entries
        (customer_id, admin_id, jars, amount_collected, is_paid, payment_mode, delivery_date, delivery_time, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, adminId, jars, amount, paidFlag, pMode, delivery_date, dTime, notes || null]
    );

    res.status(201).json({ message: 'Manual delivery entry added', id: result.insertId });

    // ── Create or recalculate bill for this month (fire-and-forget) ──────────
    // generateBillForCustomer handles both cases: creates new bill if none exists,
    // or recalculates the existing one — so calendar additions always reflect in billing.
    const month = delivery_date.slice(0, 7); // YYYY-MM
    BillingModel.generateBillForCustomer(customerId, month)
      .then(updated => {
        if (updated) {
          SSE.sendToUser(customerId, 'bill_updated', { month });
          SSE.broadcastToRole('admin', 'bill_updated', { customerId, month });
        }
      })
      .catch(e => console.warn('[Billing] addManualDelivery recalc failed:', e?.message));

  } catch (err) {
    console.error('addManualDelivery error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// PUT /admin/manual-deliveries/:entryId
export const updateManualDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entryId = Number(req.params.entryId);
    const { jars, amount_collected, is_paid, payment_mode, delivery_date, delivery_time, notes } = req.body;

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, customer_id, delivery_date FROM manual_delivery_entries WHERE id = ?', [entryId]
    );
    if (!rows.length) { res.status(404).json({ message: 'Entry not found' }); return; }
    const existing = (rows as RowDataPacket[])[0];
    const customerId = Number(existing.customer_id);

    // Reject future dates
    if (delivery_date) {
      const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const todayStr = `${todayIST.getFullYear()}-${String(todayIST.getMonth() + 1).padStart(2, '0')}-${String(todayIST.getDate()).padStart(2, '0')}`;
      if (delivery_date > todayStr) {
        res.status(400).json({ message: 'Cannot log deliveries for future dates' });
        return;
      }
    }

    const paidFlag = is_paid ? 1 : 0;
    const pMode    = paidFlag ? (payment_mode || 'cash') : 'none';
    const amount   = paidFlag ? Math.max(0, Number(amount_collected) || 0) : 0;

    await pool.query(
      `UPDATE manual_delivery_entries
       SET jars=?, amount_collected=?, is_paid=?, payment_mode=?,
           delivery_date=?, delivery_time=?, notes=?
       WHERE id=?`,
      [jars, amount, paidFlag, pMode,
       delivery_date, delivery_time || '09:00:00', notes || null,
       entryId]
    );

    res.json({ message: 'Manual delivery entry updated' });

    // ── Create or recalculate bill for affected month(s) ──────────────────────
    const months = new Set<string>();
    months.add((delivery_date || existing.delivery_date).slice(0, 7));
    if (delivery_date && delivery_date.slice(0, 7) !== String(existing.delivery_date).slice(0, 7)) {
      months.add(String(existing.delivery_date).slice(0, 7)); // old month too if date moved
    }
    for (const month of months) {
      BillingModel.generateBillForCustomer(customerId, month)
        .then(updated => {
          if (updated) {
            SSE.sendToUser(customerId, 'bill_updated', { month });
            SSE.broadcastToRole('admin', 'bill_updated', { customerId, month });
          }
        })
        .catch(e => console.warn('[Billing] updateManualDelivery recalc failed:', e?.message));
    }

  } catch (err) {
    console.error('updateManualDelivery error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// DELETE /admin/manual-deliveries/:entryId
export const deleteManualDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entryId = Number(req.params.entryId);

    // Fetch before deleting so we know which customer + month to recalculate
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT customer_id, delivery_date FROM manual_delivery_entries WHERE id = ?', [entryId]
    );
    const entry = (rows as RowDataPacket[])[0] ?? null;

    await pool.query('DELETE FROM manual_delivery_entries WHERE id = ?', [entryId]);
    res.json({ message: 'Manual delivery entry deleted' });

    // ── Create or recalculate bill for the deleted entry's month ─────────────
    if (entry) {
      const customerId = Number(entry.customer_id);
      const month      = String(entry.delivery_date).slice(0, 7);
      BillingModel.generateBillForCustomer(customerId, month)
        .then(updated => {
          if (updated) {
            SSE.sendToUser(customerId, 'bill_updated', { month });
            SSE.broadcastToRole('admin', 'bill_updated', { customerId, month });
          }
        })
        .catch(e => console.warn('[Billing] deleteManualDelivery recalc failed:', e?.message));
    }

  } catch (err) {
    console.error('deleteManualDelivery error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── PATCH /admin/deliveries/:id/payment — Admin corrects staff payment mistake ──
export const updateDeliveryPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = Number(req.params.id);
    const { payment_mode, collected_amount } = req.body as {
      payment_mode: 'cash' | 'online' | 'advance' | 'pay_later';
      collected_amount: number;
    };

    if (!['cash', 'online', 'advance', 'pay_later'].includes(payment_mode)) {
      res.status(400).json({ message: 'Invalid payment_mode' });
      return;
    }

    // Fetch current delivery to get old values + customer_id + month
    const [dRows] = await pool.query<RowDataPacket[]>(`
      SELECT d.id, d.payment_mode AS old_mode, d.collected_amount AS old_amount,
             o.customer_id,
             DATE(COALESCE(d.delivered_at, d.created_at)) AS delivery_date
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.id = ? AND d.status = 'delivered'
    `, [deliveryId]);

    if (!dRows.length) {
      res.status(404).json({ message: 'Delivery not found or not yet delivered' });
      return;
    }

    const row          = dRows[0];
    const customerId   = Number(row.customer_id);
    const oldMode      = row.old_mode as string;
    const oldAmount    = Number(row.old_amount);
    const deliveryDate = String(row.delivery_date);
    const month        = deliveryDate.slice(0, 7);
    const newAmount    = Number(collected_amount);

    // ── Update the delivery row ───────────────────────────────────────────────
    await pool.query(
      `UPDATE deliveries
         SET payment_mode = ?, collected_amount = ?
       WHERE id = ?`,
      [payment_mode, newAmount, deliveryId]
    );

    // ── Adjust pending_balance when pay_later is involved ────────────────────
    // If old was pay_later and new is not → reduce pending balance (debt cleared)
    // If old was not pay_later and new is pay_later → increase pending balance (new debt)
    const wasPayLater = oldMode === 'pay_later';
    const isPayLater  = payment_mode === 'pay_later';

    if (wasPayLater && !isPayLater) {
      // Staff had incorrectly set pay_later; now corrected → remove that debt
      await pool.query(
        `UPDATE users SET pending_balance = GREATEST(0, pending_balance - ?) WHERE id = ?`,
        [oldAmount, customerId]
      );
    } else if (!wasPayLater && isPayLater) {
      // Changing to pay_later → customer owes this new amount
      await pool.query(
        `UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?`,
        [newAmount, customerId]
      );
    }

    res.json({ message: 'Delivery payment updated', deliveryId, payment_mode, collected_amount: newAmount });

    // ── Fire-and-forget bill recalculation ────────────────────────────────────
    BillingModel.generateBillForCustomer(customerId, month)
      .then(updated => {
        if (updated) {
          SSE.sendToUser(customerId, 'bill_updated', { month });
          SSE.broadcastToRole('admin', 'bill_updated', { customerId, month });
        }
      })
      .catch(e => console.warn('[Billing] updateDeliveryPayment recalc failed:', e?.message));

  } catch (err) {
    console.error('updateDeliveryPayment error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};
