import { Response } from 'express';
import { errDetail } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import * as OrderModel from '../models/order.model';
import * as NotifService from '../services/notification.service';
import * as Inv from '../models/inventory.model';
import * as SSE from '../services/sse.service';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { withPlatformFee } from '../utils/platformFee';
import * as BillingModel from '../models/billing.model';
import { refundAdvanceOnCancel } from './advance.controller';

const DEFAULT_PRICE = 50;

// Fire-and-forget FCM — never let notification errors crash the request
const notify = (fn: () => Promise<void>) => {
  fn().catch(err => console.warn('FCM notification failed (non-fatal):', err?.message));
};

// ── Customer ──────────────────────────────────────────────────────────────────

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let { type, quantity, pricePerJar, deliveryDate, notes, address, latitude, longitude } = req.body;

    if (!type || !quantity) {
      res.status(400).json({ message: 'type and quantity are required' });
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

    // ── Time slot enforcement ─────────────────────────────────────────────────
    let scheduledForTomorrow = false;
    if (type === 'instant') {
      const SubModel = await import('../models/subscription.model');
      const startStr = await SubModel.getSetting('booking_start_time') || '08:00';
      const endStr = await SubModel.getSetting('booking_end_time') || '18:00';
      const now = new Date();
      const [sH, sM] = startStr.split(':').map(Number);
      const [eH, eM] = endStr.split(':').map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = sH * 60 + sM;
      const endMinutes = eH * 60 + eM;

      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
        // Convert to preorder for tomorrow at booking start time
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        deliveryDate = `${tomorrowStr}T${startStr}:00`;
        type = 'preorder';
        scheduledForTomorrow = true;
      }
    }

    // Use customer's personalized jar rate from DB
    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT jar_rate, name FROM users WHERE id = ?',
      [req.user!.id]
    );
    const customerName = userRows.length ? String(userRows[0].name) : 'Customer';
    const customerRate = userRows.length ? Number(userRows[0].jar_rate) : DEFAULT_PRICE;
    const price = Number(pricePerJar) || customerRate;

    const orderId = await OrderModel.createOrder(req.user!.id, {
      type,
      quantity:     Number(quantity),
      pricePerJar:  price,
      deliveryDate: deliveryDate  || undefined,
      notes:        notes         || undefined,
      address:      address       || undefined,
      latitude:     latitude      ? Number(latitude)  : undefined,
      longitude:    longitude     ? Number(longitude) : undefined,
    });

    // ── Auto-assign to all active staff (broadcast model) ─────────────────────
    // Pick staff via round-robin: staff with fewest recent active order assignments
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
      // Assign to the staff member with the least current active orders (round-robin)
      const assignedStaff = staffRows[0] as any;
      await pool.query(
        `UPDATE orders SET staff_id = ?, status = 'assigned', updated_at = NOW() WHERE id = ?`,
        [assignedStaff.id, orderId]
      );
      await OrderModel.addTimeline(
        orderId, 'assigned',
        `Auto-assigned to ${assignedStaff.name}`,
        req.user!.id
      );

      // Assigned staff only
      notify(() =>
        NotifService.sendToUser({
          userId: assignedStaff.id,
          title:  'New Delivery Assigned! 📦',
          body:   `Order #${orderId} — ${quantity} jars from ${customerName}`,
          type:   'delivery',
          data:   { orderId: String(orderId) },
        })
      );

      notify(() =>
        NotifService.sendToRole(
          'admin',
          'New Order 📦',
          `Order #${orderId} — ${quantity} jars from ${customerName}`,
          'order',
          { orderId: String(orderId) }
        )
      );
    } else {
      // No active staff — keep pending, notify admin
      notify(() =>
        NotifService.sendToRole(
          'admin',
          'New Order 📦',
          `Order #${orderId} — ${quantity} jars from ${customerName} (no staff to assign)`,
          'order',
          { orderId: String(orderId) }
        )
      );
    }

    // SSE: notify admin + all staff of new order
    SSE.broadcastToRoles(['admin', 'staff'], 'order_created', { orderId, quantity, customerId: req.user!.id });
    SSE.sendToUser(req.user!.id, 'order_created', { orderId, quantity, status: 'assigned' });

    // Customer confirmation — await so push reaches device before HTTP response ends
    try {
      await NotifService.sendToUser({
        userId: req.user!.id,
        title:  scheduledForTomorrow ? 'Order Scheduled 📅' : 'Order Placed ✅',
        body:   scheduledForTomorrow
          ? `Your ${quantity} jar order is scheduled for tomorrow.`
          : `Your order #${orderId} for ${quantity} jars has been placed successfully.`,
        type:   'order',
        data:   { orderId: String(orderId) },
      });
    } catch (err) {
      console.warn('Customer order notification failed (non-fatal):', (err as Error).message);
    }

    const msg = scheduledForTomorrow
      ? 'Order scheduled for tomorrow (outside booking hours)'
      : 'Order placed successfully';
    res.status(201).json({ message: msg, orderId, scheduledForTomorrow });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};


export const getOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, date, month, search } = req.query as Record<string, string>;
    let orders;

    if (req.user!.role === 'customer') {
      orders = await OrderModel.getOrdersByCustomer(req.user!.id);
    } else if (req.user!.role === 'staff') {
      orders = await OrderModel.getOrdersByStaff(req.user!.id);
    } else {
      orders = await OrderModel.getAllOrders({ status, date, month, search });
    }

    res.json({ orders });
  } catch (err) {
    console.error('getOrders error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid order id' }); return; }

    const order = await OrderModel.getOrderById(id);
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }

    if (req.user!.role === 'customer' && order.customer_id !== req.user!.id) {
      res.status(403).json({ message: 'Access denied' }); return;
    }

    const [timeline, delivery] = await Promise.all([
      OrderModel.getOrderTimeline(order.id),
      OrderModel.getDeliveryByOrder(order.id),
    ]);

    res.json({ order, timeline, delivery });
  } catch (err) {
    console.error('getOrderById error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const cancelOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await OrderModel.getOrderById(Number(req.params.id));
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    if (order.customer_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    if (['completed', 'cancelled'].includes(order.status)) {
      res.status(400).json({ message: `Cannot cancel a ${order.status} order` }); return;
    }

    // Admin can always cancel directly
    if (req.user!.role === 'admin') {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await OrderModel.cancelOrder(order.id, req.user!.id);
        await refundAdvanceOnCancel(conn, order.id, order.customer_id);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; }
      finally { conn.release(); }
      res.json({ message: 'Order cancelled' });
      return;
    }

    // Customer: check 1-hour window
    const orderAge = Date.now() - new Date(order.created_at).getTime();
    const ONE_HOUR = 60 * 60 * 1000;

    if (orderAge < ONE_HOUR) {
      // Within 1 hour — cancel directly + refund advance if applicable
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await OrderModel.cancelOrder(order.id, req.user!.id);
        await refundAdvanceOnCancel(conn, order.id, order.customer_id);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; }
      finally { conn.release(); }
      res.json({ message: 'Order cancelled' });
    } else {
      // After 1 hour — need reason, create cancel request
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        res.status(400).json({
          message: 'Order is older than 1 hour. Please provide a reason for cancellation.',
          requiresReason: true,
        });
        return;
      }
      const SubModel = await import('../models/subscription.model');
      const requestId = await SubModel.createCancelRequest(order.id, req.user!.id, reason.trim());
      res.json({
        message: 'Cancellation request submitted. Admin will review it.',
        cancelRequestId: requestId,
        requiresApproval: true,
      });
    }
  } catch (err: any) {
    if (err.message?.includes('already pending')) {
      res.status(409).json({ message: err.message });
    } else {
      console.error('cancelOrder error:', err);
      res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
    }
  }
};

// ── Admin: Order Cancel Requests ───────────────────────────────────────────────

export const getOrderCancelRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status = 'pending' } = req.query as Record<string, string>;
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        cr.id             AS request_id,
        cr.order_id,
        cr.customer_id,
        cr.reason,
        cr.status         AS request_status,
        cr.reviewed_by,
        cr.reviewed_at,
        cr.created_at     AS requested_at,
        o.quantity,
        o.type            AS order_type,
        o.total_amount,
        o.status          AS order_status,
        o.created_at      AS order_created_at,
        u.name            AS customer_name,
        u.phone           AS customer_phone
      FROM cancel_requests cr
      JOIN orders o ON o.id = cr.order_id
      JOIN users  u ON u.id = cr.customer_id
      WHERE cr.status = ?
      ORDER BY cr.created_at DESC
    `, [status]);
    res.json({ requests: rows });
  } catch (err) {
    console.error('getOrderCancelRequests error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const reviewOrderCancelRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { action } = req.body as { action: 'approved' | 'rejected' };

    if (!['approved', 'rejected'].includes(action)) {
      res.status(400).json({ message: 'action must be approved or rejected' });
      return;
    }

    // Fetch the request
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT cr.*, o.customer_id FROM cancel_requests cr JOIN orders o ON o.id = cr.order_id WHERE cr.id = ?`,
      [Number(id)]
    );
    if (!rows.length) { res.status(404).json({ message: 'Cancel request not found' }); return; }
    const cr = rows[0];

    if (cr.status !== 'pending') {
      res.status(400).json({ message: `Request already ${cr.status}` });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Update the cancel request
      await conn.query(
        `UPDATE cancel_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
        [action, req.user!.id, Number(id)]
      );
      if (action === 'approved') {
        // Actually cancel the order
        await OrderModel.cancelOrder(cr.order_id, req.user!.id);
        // Refund advance if applicable
        await refundAdvanceOnCancel(conn, cr.order_id, cr.customer_id);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }

    res.json({ message: action === 'approved' ? 'Order cancelled and advance refunded if applicable' : 'Cancellation request rejected' });
  } catch (err) {
    console.error('reviewOrderCancelRequest error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const assignOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { staffId } = req.body;
    if (!staffId) { res.status(400).json({ message: 'staffId is required' }); return; }

    const order = await OrderModel.getOrderById(Number(req.params.id));
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    if (['completed', 'cancelled'].includes(order.status)) {
      res.status(400).json({ message: `Cannot assign a ${order.status} order` }); return;
    }

    const [staffRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name FROM users WHERE id = ? AND role = 'staff'",
      [staffId]
    );
    if (!staffRows.length) { res.status(404).json({ message: 'Staff not found' }); return; }

    await OrderModel.assignOrder(order.id, Number(staffId));
    await OrderModel.addTimeline(
      order.id, 'assigned',
      `Assigned to ${staffRows[0].name}`,
      req.user!.id
    );

    notify(() =>
      NotifService.sendToUser({
        userId: Number(staffId),
        title:  'New Delivery Assigned 📦',
        body:   `Order #${order.id} — ${order.quantity} jars for ${order.customer_name}`,
        type:   'delivery',
        data:   { orderId: String(order.id) },
      })
    );

    notify(() =>
      NotifService.sendToRole(
        'admin',
        'Order Assigned',
        `Order #${order.id} assigned to ${staffRows[0].name}`,
        'order',
        { orderId: String(order.id) }
      )
    );

    // SSE: notify assigned staff + admin
    SSE.sendToUser(staffId, 'order_assigned', { orderId: order.id, quantity: order.quantity });
    SSE.broadcastToRole('admin', 'order_updated', { orderId: order.id, status: 'assigned' });

    res.json({ message: 'Order assigned successfully' });
  } catch (err) {
    console.error('assignOrder error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const valid = ['pending','assigned','delivered','completed','cancelled'];
    if (!valid.includes(status)) {
      res.status(400).json({ message: 'Invalid status' }); return;
    }

    const order = await OrderModel.getOrderById(Number(req.params.id));
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }

    if (req.user!.role === 'staff') {
      // Staff can only mark an order as delivered
      if (status !== 'delivered') {
        res.status(403).json({ message: 'Staff can only mark orders as delivered' }); return;
      }
    }

    await OrderModel.updateOrderStatus(order.id, status, req.user!.id);

    // SSE: notify customer + admin of status change
    SSE.sendToUser(order.customer_id, 'order_status_changed', { orderId: order.id, status });
    SSE.broadcastToRole('admin', 'order_updated', { orderId: order.id, status });
    SSE.broadcastToRole('staff', 'order_updated', { orderId: order.id, status });

    res.json({ message: `Order status updated to ${status}` });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getOrderStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await OrderModel.getOrderStats();
    res.json({ stats });
  } catch (err) {
    console.error('getOrderStats error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getStaffList = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, phone FROM users WHERE role = 'staff' AND status = 'active'"
    );
    res.json({ staff: rows });
  } catch (err) {
    console.error('getStaffList error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Deliveries ────────────────────────────────────────────────────────────────

// ── Admin: Adjust Delivery (correct wrong jar/amount entries) ─────────────────
export const adjustDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = Number(req.params.deliveryId);
    const { deliveredQuantity, collectedAmount, reason } = req.body as {
      deliveredQuantity: number;
      collectedAmount: number;
      reason?: string;
    };

    if (isNaN(deliveryId) || deliveredQuantity == null || collectedAmount == null) {
      res.status(400).json({ message: 'deliveryId, deliveredQuantity and collectedAmount are required' });
      return;
    }
    if (Number(deliveredQuantity) < 0 || Number(collectedAmount) < 0) {
      res.status(400).json({ message: 'Values cannot be negative' });
      return;
    }

    // Fetch existing delivery + joined order + admin name
    const [delRows] = await pool.query<RowDataPacket[]>(
      `SELECT d.*, o.customer_id, o.id AS order_id, o.price_per_jar, u.name AS admin_name
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN users  u ON u.id = ?
       WHERE d.id = ?`,
      [req.user!.id, deliveryId]
    );
    if (!delRows.length) { res.status(404).json({ message: 'Delivery not found' }); return; }
    const del = delRows[0];

    const oldQty    = Number(del.delivered_quantity);
    const newQty    = Number(deliveredQuantity);
    const oldAmount = Number(del.collected_amount);
    const newAmount = Number(collectedAmount);
    const qtyDiff   = newQty - oldQty;
    const amtDiff   = newAmount - oldAmount;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Update delivery row (deliveries has no updated_at column)
      await conn.query(
        `UPDATE deliveries SET delivered_quantity = ?, collected_amount = ? WHERE id = ?`,
        [newQty, newAmount, deliveryId]
      );

      // 2. Balance adjustment
      //    - pay_later: pending_balance was added as price_per_jar × qty.
      //      collected_amount stays 0, so we must use qtyDiff × price_per_jar.
      //    - other modes: adjust by amtDiff (collected_amount change).
      if (del.payment_mode === 'pay_later') {
        if (qtyDiff !== 0) {
          const balanceAdjust = qtyDiff * Number(del.price_per_jar); // negative = reduction
          await conn.query(
            `UPDATE users SET pending_balance = GREATEST(0, pending_balance + ?) WHERE id = ?`,
            [balanceAdjust, del.customer_id]
          );
        }
      } else if (amtDiff !== 0) {
        // For cash/online adjustments, reflect the difference in pending_balance if needed
        await conn.query(
          `UPDATE users SET pending_balance = GREATEST(0, pending_balance + ?) WHERE id = ?`,
          [amtDiff, del.customer_id]
        );
      }

      // 3. Timeline entry
      const payLaterBalanceNote = del.payment_mode === 'pay_later' && qtyDiff !== 0
        ? `Balance \u20b9${qtyDiff * Number(del.price_per_jar) > 0 ? '+' : ''}\u20b9${qtyDiff * Number(del.price_per_jar)}`
        : null;

      const noteText = [
        `Admin correction by ${del.admin_name}:`,
        qtyDiff !== 0 ? `Jars ${oldQty}\u2192${newQty} (${qtyDiff > 0 ? '+' : ''}${qtyDiff})` : null,
        del.payment_mode !== 'pay_later' && amtDiff !== 0 ? `Amount \u20b9${oldAmount}\u2192\u20b9${newAmount}` : null,
        payLaterBalanceNote,
        reason ? `Reason: ${reason}` : null,
      ].filter(Boolean).join(' \u00b7 ');

      await conn.query(
        `INSERT INTO order_timeline (order_id, status, note, created_by, created_at)
         VALUES (?, 'adjustment', ?, ?, NOW())`,
        [del.order_id, noteText, req.user!.id]
      );

      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }

    // SSE notify admin
    SSE.broadcastToRole('admin', 'order_updated', { orderId: del.order_id });

    res.json({
      message: 'Delivery adjusted successfully',
      deliveryId,
      oldQty, newQty, oldAmount, newAmount,
    });
  } catch (err) {
    console.error('adjustDelivery error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Staff Direct Delivery (staff visits customer without prior order) ─────────
// Creates an instant order for the customer + immediately completes it atomically.
export const staffDirectDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId, quantity, paymentMode, collectedAmount, notes } = req.body;

    if (!customerId || !quantity || !paymentMode || collectedAmount == null) {
      res.status(400).json({ message: 'customerId, quantity, paymentMode, collectedAmount are required' });
      return;
    }
    if (!['cash', 'online', 'advance', 'pay_later'].includes(paymentMode)) {
      res.status(400).json({ message: 'Invalid paymentMode' }); return;
    }
    if (req.user!.role !== 'staff' && req.user!.role !== 'admin') {
      res.status(403).json({ message: 'Only staff can record direct deliveries' }); return;
    }

    // Fetch customer details (name, jar_rate, address)
    const [custRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, phone, jar_rate,
              (SELECT address FROM user_addresses WHERE user_id = users.id AND is_default = 1 LIMIT 1) AS address
       FROM users WHERE id = ? AND role = 'customer' AND status = 'active'`,
      [customerId]
    );
    if (!custRows.length) {
      res.status(404).json({ message: 'Customer not found or not active' }); return;
    }
    const customer = custRows[0];
    const pricePerJar = Number(customer.jar_rate) || DEFAULT_PRICE;
    const totalAmount = pricePerJar * Number(quantity);

    // 1. Create a direct order on behalf of the customer
    const orderId = await OrderModel.createOrder(Number(customerId), {
      type:        'instant',
      quantity:    Number(quantity),
      pricePerJar,
      notes:       notes ? `[Staff Direct] ${notes}` : '[Staff Direct Delivery]',
      address:     customer.address || undefined,
    });

    // 2. Assign immediately to the delivering staff member
    await pool.query(
      `UPDATE orders SET staff_id = ?, status = 'assigned', updated_at = NOW() WHERE id = ?`,
      [req.user!.id, orderId]
    );

    // 3. Create the delivery record
    await OrderModel.createDelivery({
      orderId,
      staffId:           req.user!.id,
      deliveredQuantity: Number(quantity),
      collectedAmount:   Number(collectedAmount),
      paymentMode,
      notes: notes || undefined,
    });

    // 4. Mark order completed
    await OrderModel.updateOrderStatus(orderId, 'completed', req.user!.id);

    // 5. Update inventory
    await Inv.recordDeliveryInventory(req.user!.id, Number(quantity), orderId);

    // 6. Financial transaction
    if (paymentMode !== 'pay_later') {
      await Inv.createTransaction({
        customerId:  Number(customerId),
        orderId,
        amount:      Number(collectedAmount),
        mode:        paymentMode,
        type:        'credit',
        collectedBy: req.user!.id,
      });
    } else {
      await pool.query(
        `INSERT INTO pending_payments (customer_id, order_id, amount) VALUES (?, ?, ?)`,
        [customerId, orderId, totalAmount]
      );
      await pool.query(
        'UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
        [totalAmount, customerId]
      );
    }

    // 7. Notify customer
    const notifBody = paymentMode === 'pay_later'
      ? `${quantity} jars delivered. Payment of ₹${totalAmount} is pending.`
      : `${quantity} jars delivered. Amount collected: ₹${collectedAmount}.`;

    notify(() =>
      NotifService.sendToUser({
        userId: Number(customerId),
        title:  paymentMode === 'pay_later' ? 'Jars Delivered — Payment Pending 💳' : 'Jars Delivered! 🎉',
        body:   notifBody,
        type:   'delivery',
        data:   { orderId: String(orderId) },
      })
    );

    // 8. SSE
    SSE.sendToUser(Number(customerId), 'order_status_changed', { orderId, status: 'completed' });
    SSE.broadcastToRoles(['admin', 'staff'], 'delivery_completed', { orderId, staffId: req.user!.id });

    // 9. Billing sync
    const month = new Date().toISOString().slice(0, 7);
    const syncAmt = paymentMode === 'pay_later' ? totalAmount : Number(collectedAmount);
    BillingModel.syncDeliveryToBill(Number(customerId), month, paymentMode, syncAmt)
      .catch(e => console.warn('[Billing] syncDeliveryToBill (direct) failed:', e?.message));

    res.status(201).json({
      message: 'Direct delivery recorded successfully',
      orderId,
      customer: customer.name,
      quantity: Number(quantity),
      amount:   Number(collectedAmount),
      mode:     paymentMode,
    });
  } catch (err) {
    console.error('staffDirectDelivery error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const completeDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, deliveredQuantity, collectedAmount, paymentMode, notes } = req.body;

    if (!orderId || deliveredQuantity == null || collectedAmount == null || !paymentMode) {
      res.status(400).json({ message: 'orderId, deliveredQuantity, collectedAmount and paymentMode are required' });
      return;
    }
    if (!['cash','online','advance','pay_later'].includes(paymentMode)) {
      res.status(400).json({ message: 'Invalid paymentMode' }); return;
    }

    const order = await OrderModel.getOrderById(Number(orderId));
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }

    // Any staff can complete any active order (first-come-first-served)
    if (req.user!.role !== 'staff' && req.user!.role !== 'admin') {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    if (['completed', 'cancelled'].includes(order.status)) {
      res.status(400).json({ message: 'Order is already ' + order.status }); return;
    }

    const existing = await OrderModel.getDeliveryByOrder(order.id);
    if (existing) { res.status(409).json({ message: 'Delivery already recorded for this order' }); return; }

    await OrderModel.createDelivery({
      orderId:           order.id,
      staffId:           req.user!.id,
      deliveredQuantity: Number(deliveredQuantity),
      collectedAmount:   Number(collectedAmount),
      paymentMode,
      notes:             notes || undefined,
    });

    await OrderModel.updateOrderStatus(order.id, 'completed', req.user!.id);

    // Update inventory: reduce staff assigned, increase empty_collected
    await Inv.recordDeliveryInventory(req.user!.id, Number(deliveredQuantity), order.id);

    // Record financial transaction (skip for pay_later — balance not collected yet)
    if (paymentMode !== 'pay_later') {
      await Inv.createTransaction({
        customerId:  order.customer_id,
        orderId:     order.id,
        amount:      Number(collectedAmount),
        mode:        paymentMode,
        type:        'credit',
        collectedBy: req.user!.id,
      });
    } else {
      // pay_later: record in pending_payments and increment user balance
      await pool.query(
        `INSERT INTO pending_payments (customer_id, order_id, amount)
         VALUES (?, ?, ?)`,
        [order.customer_id, order.id, order.total_amount]
      );
      await pool.query(
        'UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
        [order.total_amount, order.customer_id]
      );
    }

    // Notify customer
    const notifBody = paymentMode === 'pay_later'
      ? `Your order of ${deliveredQuantity} jars has been delivered. Payment of ₹${order.total_amount} is pending.`
      : `Your order of ${deliveredQuantity} jars has been delivered. Amount collected: ₹${collectedAmount}.`;

    notify(() =>
      NotifService.sendToUser({
        userId: order.customer_id,
        title:  paymentMode === 'pay_later' ? 'Order Delivered — Payment Pending 💳' : 'Order Delivered! 🎉',
        body:   notifBody,
        type:   'order',
        data:   { orderId: String(order.id) },
      })
    );

    // Notify all other staff that this order has been delivered
    notify(() =>
      NotifService.sendToRole(
        'staff',
        'Order Delivered',
        `Order #${order.id} — ${order.quantity} jars for ${order.customer_name} has been delivered.`,
        'delivery',
        { orderId: String(order.id) }
      )
    );

    // SSE: notify customer + admin + staff of completed delivery
    SSE.sendToUser(order.customer_id, 'order_status_changed', { orderId: order.id, status: 'completed' });
    SSE.broadcastToRoles(['admin', 'staff'], 'delivery_completed', { orderId: order.id, staffId: req.user!.id });

    // Sync delivery payment to bill (if bill exists for this month)
    const deliveryMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const syncAmount    = paymentMode === 'pay_later' ? Number(order.total_amount) : Number(collectedAmount);
    BillingModel.syncDeliveryToBill(
      order.customer_id,
      deliveryMonth,
      paymentMode,
      syncAmount
    ).catch(err => console.warn('[Billing] syncDeliveryToBill failed (non-fatal):', err?.message));

    res.status(201).json({ message: 'Delivery completed successfully' });
  } catch (err) {
    console.error('completeDelivery error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let rows;
    if (req.user!.role === 'staff') {
      rows = await OrderModel.getDeliveriesByStaff(req.user!.id);
    } else {
      const [all] = await pool.query<RowDataPacket[]>(`
        SELECT d.*, o.quantity, o.type,
               c.name AS customer_name,
               s.name AS staff_name
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        JOIN users  c ON c.id = o.customer_id
        JOIN users  s ON s.id = d.staff_id
        ORDER BY d.created_at DESC
      `);
      rows = all;
    }
    res.json({ deliveries: rows });
  } catch (err) {
    console.error('getDeliveries error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Calendar ──────────────────────────────────────────────────────────────────

export const getCalendarData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, customerId } = req.query as Record<string, string>;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ message: 'month query param required in YYYY-MM format' });
      return;
    }

    let targetCustomerId: number;

    if (req.user!.role === 'customer') {
      targetCustomerId = req.user!.id;
    } else if (customerId) {
      targetCustomerId = Number(customerId);
    } else {
      res.status(400).json({ message: 'customerId query param required for admin' });
      return;
    }

    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        DATE_FORMAT(d.delivered_at, '%Y-%m-%d')    AS date,
        SUM(d.delivered_quantity)                   AS jars_delivered,
        COUNT(DISTINCT d.order_id)                 AS orders_count,
        SUM(d.collected_amount)                    AS total_amount
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE o.customer_id = ?
        AND DATE_FORMAT(d.delivered_at, '%Y-%m') = ?
        AND d.status = 'delivered'
      GROUP BY DATE_FORMAT(d.delivered_at, '%Y-%m-%d')
      ORDER BY date ASC
    `, [targetCustomerId, month]);

    res.json({ days: rows });
  } catch (err) {
    console.error('getCalendarData error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /orders/calendar/day?date=YYYY-MM-DD[&customerId=x]  (customer self or admin for a customer)
export const getCalendarDayDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date, customerId } = req.query as Record<string, string>;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ message: 'date query param required in YYYY-MM-DD format' });
      return;
    }

    let targetCustomerId: number;
    if (req.user!.role === 'customer') {
      targetCustomerId = req.user!.id;
    } else if (customerId) {
      targetCustomerId = Number(customerId);
    } else {
      res.status(400).json({ message: 'customerId query param required for admin/staff' });
      return;
    }

    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        d.id,
        d.delivered_quantity                                AS jars,
        TIME_FORMAT(COALESCE(d.delivered_at, d.created_at), '%h:%i %p') AS time_str,
        HOUR(COALESCE(d.delivered_at, d.created_at))        AS hour,
        u.name                                              AS staff_name
      FROM deliveries d
      JOIN orders o     ON o.id  = d.order_id
      LEFT JOIN users u ON u.id  = d.staff_id
      WHERE o.customer_id = ?
        AND DATE(COALESCE(d.delivered_at, d.created_at)) = ?
        AND d.status = 'delivered'
      ORDER BY COALESCE(d.delivered_at, d.created_at) ASC
    `, [targetCustomerId, date]);

    const deliveries = rows.map((r: RowDataPacket) => {
      const h = Number(r.hour);
      const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
      return {
        id:         r.id,
        jars:       Number(r.jars),
        time:       r.time_str,
        period,
        staff_name: r.staff_name || 'Unknown',
      };
    });

    const totalJars = deliveries.reduce((s, d) => s + d.jars, 0);
    res.json({ date, deliveries, totalJars });
  } catch (err) {
    console.error('getCalendarDayDetail error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Staff Daily Summary ────────────────────────────────────────────────────────

export const getDailySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = req.user!.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC

    // Today's deliveries
    const [deliveryRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*)                                                                                AS deliveries_done,
        COALESCE(SUM(delivered_quantity), 0)                                                    AS jars_delivered,
        COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN collected_amount ELSE 0 END), 0)     AS cash_collected
      FROM deliveries
      WHERE staff_id = ? AND DATE(delivered_at) = ? AND status = 'delivered'
    `, [staffId, today]);

    // Pending orders still assigned to this staff
    const [pendingRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS pending_orders
      FROM orders
      WHERE staff_id = ? AND status IN ('assigned', 'pending')
    `, [staffId]);

    // Jar inventory
    const [invRows] = await pool.query<RowDataPacket[]>(
      `SELECT assigned_jars, empty_collected FROM staff_inventory WHERE staff_id = ?`,
      [staffId]
    );

    // Cash in hand (uncollected pending cash transactions)
    const [cashRows] = await pool.query<RowDataPacket[]>(`
      SELECT COALESCE(SUM(amount), 0) AS cash_in_hand
      FROM transactions
      WHERE collected_by = ? AND mode = 'cash' AND status = 'pending' AND type = 'credit'
    `, [staffId]);

    res.json({
      today,
      deliveries_done:  Number(deliveryRows[0].deliveries_done),
      jars_delivered:   Number(deliveryRows[0].jars_delivered),
      cash_collected:   Number(deliveryRows[0].cash_collected),
      pending_orders:   Number(pendingRows[0].pending_orders),
      assigned_jars:    Number(invRows[0]?.assigned_jars   ?? 0),
      empty_collected:  Number(invRows[0]?.empty_collected ?? 0),
      cash_in_hand:     Number(cashRows[0]?.cash_in_hand   ?? 0),
    });
  } catch (err) {
    console.error('getDailySummary error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── Razorpay Order Payment ────────────────────────────────────────────────────

// Lazy-init Razorpay instance (same pattern as wallet controller)
let _razorpay: Razorpay | null = null;
const getRazorpay = () => {
  if (!_razorpay) {
    const key_id     = process.env.RAZORPAY_KEY_ID     || '';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!key_id || !key_secret) throw new Error('Razorpay keys not configured');
    _razorpay = new Razorpay({ key_id, key_secret });
  }
  return _razorpay;
};

// POST /api/orders/:id/pay/create  — create Razorpay order for paying an app order
export const createOrderPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const order = await OrderModel.getOrderById(orderId);
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    if (order.customer_id !== req.user!.id) { res.status(403).json({ message: 'Access denied' }); return; }
    if (order.status === 'cancelled') { res.status(400).json({ message: 'Cannot pay for a cancelled order' }); return; }

    const baseAmount = Number(order.total_amount);
    if (!baseAmount || baseAmount < 1) { res.status(400).json({ message: 'Invalid order amount' }); return; }

    const { fee: platformFee, total: chargeAmount } = await withPlatformFee(baseAmount);

    const rzpOrder = await getRazorpay().orders.create({
      amount:   Math.round(chargeAmount * 100), // paise — base + platform fee
      currency: 'INR',
      receipt:  `order_${orderId}_${Date.now()}`,
      notes:    { userId: String(req.user!.id), orderId: String(orderId), purpose: 'order_payment', platformFee: String(platformFee) },
    });

    res.json({
      rzpOrderId:   rzpOrder.id,
      amount:       rzpOrder.amount,          // total in paise (base + fee)
      currency:     rzpOrder.currency,
      keyId:        process.env.RAZORPAY_KEY_ID,
      orderAmount:  baseAmount,               // base order amount (what gets credited)
      platformFee,                            // fee amount in rupees
    });
  } catch (err) {
    console.error('createOrderPayment error:', err);
    res.status(500).json({ message: 'Failed to create payment order' });
  }
};

// POST /api/orders/:id/pay/verify  — verify Razorpay payment for an app order
export const verifyOrderPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ message: 'Missing payment verification fields' }); return;
    }

    const order = await OrderModel.getOrderById(orderId);
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    if (order.customer_id !== req.user!.id) { res.status(403).json({ message: 'Access denied' }); return; }

    // Verify Razorpay signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      res.status(400).json({ message: 'Payment verification failed — invalid signature' }); return;
    }

    const amount = Number(order.total_amount);
    const userId = req.user!.id;

    // Record the payment transaction
    await pool.query(
      `INSERT INTO transactions
         (customer_id, order_id, amount, mode, type, status, note)
       VALUES (?, ?, ?, 'online', 'credit', 'completed', ?)`,
      [userId, orderId, amount, `Online payment for Order #${orderId} via Razorpay (${razorpay_payment_id})`]
    );

    // Notify customer
    notify(() =>
      NotifService.sendToUser({
        userId,
        title: '✅ Payment Successful!',
        body:  `₹${amount} paid for Order #${orderId} via Razorpay.`,
        type:  'payment',
        data:  { orderId: String(orderId) },
      })
    );

    notify(() =>
      NotifService.sendToRole(
        'admin',
        '💳 Online Payment Received',
        `Order #${orderId} — ₹${amount} paid online by customer.`,
        'payment',
        { orderId: String(orderId) }
      )
    );

    SSE.broadcastToRole('admin', 'order_updated', { orderId, status: 'paid_online' });

    res.json({ message: 'Payment verified successfully', orderId, amount });
  } catch (err) {
    console.error('verifyOrderPayment error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};
