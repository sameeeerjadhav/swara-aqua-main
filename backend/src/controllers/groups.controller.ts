import { Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import type { AuthRequest } from '../middleware/auth.middleware';

const errDetail = (err: unknown) =>
  process.env.NODE_ENV !== 'production'
    ? { detail: (err as Error).message }
    : {};

// ── GET /admin/groups ─────────────────────────────────────────────────────────
// List all groups with member count (admin + staff)
export const listGroups = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.id, g.name, g.color, g.icon, g.description, g.created_at,
              COUNT(u.id) AS member_count
       FROM customer_groups g
       LEFT JOIN users u ON u.group_id = g.id AND u.role = 'customer' AND u.deleted_at IS NULL
       GROUP BY g.id
       ORDER BY g.name ASC`
    );
    res.json({ groups: rows });
  } catch (err) {
    console.error('listGroups error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── POST /admin/groups ────────────────────────────────────────────────────────
// Create a group (admin only)
export const createGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, color = '#3B82F6', icon = '👥', description = null } = req.body;
    if (!name?.trim()) { res.status(400).json({ message: 'Group name is required' }); return; }

    const [result] = await pool.query<any>(
      `INSERT INTO customer_groups (name, color, icon, description) VALUES (?, ?, ?, ?)`,
      [name.trim(), color, icon, description || null]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.*, 0 AS member_count FROM customer_groups g WHERE g.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ message: 'Group created', group: rows[0] });
  } catch (err) {
    console.error('createGroup error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── PUT /admin/groups/:id ─────────────────────────────────────────────────────
// Update group details (admin only)
export const updateGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, color, icon, description } = req.body;
    if (!name?.trim()) { res.status(400).json({ message: 'Group name is required' }); return; }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM customer_groups WHERE id = ?`, [id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Group not found' }); return; }

    await pool.query(
      `UPDATE customer_groups SET name=?, color=?, icon=?, description=? WHERE id=?`,
      [name.trim(), color || '#3B82F6', icon || '👥', description || null, id]
    );
    res.json({ message: 'Group updated' });
  } catch (err) {
    console.error('updateGroup error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── DELETE /admin/groups/:id ──────────────────────────────────────────────────
// Delete a group; customers in it become ungrouped (group_id → NULL via FK)
export const deleteGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM customer_groups WHERE id = ?`, [id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Group not found' }); return; }

    // Unset group for all members first (belt + suspenders, FK handles it anyway)
    await pool.query(`UPDATE users SET group_id = NULL WHERE group_id = ?`, [id]);
    await pool.query(`DELETE FROM customer_groups WHERE id = ?`, [id]);
    res.json({ message: 'Group deleted, customers moved to ungrouped' });
  } catch (err) {
    console.error('deleteGroup error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── PATCH /admin/customers/:id/group ─────────────────────────────────────────
// Assign or unassign a single customer to/from a group (admin only)
// body: { group_id: number | null }
export const setCustomerGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = Number(req.params.id);
    const { group_id } = req.body;                   // null = ungrouped

    // Validate customer exists
    const [cust] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM users WHERE id = ? AND role = 'customer' AND deleted_at IS NULL`,
      [customerId]
    );
    if (!cust.length) { res.status(404).json({ message: 'Customer not found' }); return; }

    // If group_id provided, validate it exists
    if (group_id !== null && group_id !== undefined) {
      const [grp] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM customer_groups WHERE id = ?`, [group_id]
      );
      if (!grp.length) { res.status(404).json({ message: 'Group not found' }); return; }
    }

    await pool.query(
      `UPDATE users SET group_id = ? WHERE id = ?`,
      [group_id ?? null, customerId]
    );
    res.json({ message: group_id ? 'Customer assigned to group' : 'Customer removed from group' });
  } catch (err) {
    console.error('setCustomerGroup error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// ── PATCH /admin/groups/:id/assign ───────────────────────────────────────────
// Bulk-assign multiple customers to a group (admin only)
// body: { customer_ids: number[] }
export const bulkAssignGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = Number(req.params.id);
    const { customer_ids } = req.body as { customer_ids: number[] };

    if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
      res.status(400).json({ message: 'customer_ids array is required' }); return;
    }

    const [grp] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM customer_groups WHERE id = ?`, [groupId]
    );
    if (!grp.length) { res.status(404).json({ message: 'Group not found' }); return; }

    const placeholders = customer_ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE users SET group_id = ? WHERE id IN (${placeholders}) AND role = 'customer'`,
      [groupId, ...customer_ids]
    );
    res.json({ message: `${customer_ids.length} customer(s) assigned to group` });
  } catch (err) {
    console.error('bulkAssignGroup error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};
