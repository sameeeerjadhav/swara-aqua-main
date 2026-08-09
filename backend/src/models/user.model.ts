import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export type Role = 'admin' | 'staff' | 'customer';
export type Status = 'active' | 'pending' | 'rejected';

export interface User {
  id: number;
  name: string;
  phone: string;
  password: string;
  role: Role;
  status: Status;
  jar_rate: number;
  profile_photo?: string | null;
  deleted_at?: Date | null;
  created_at: Date;
}

export const findByPhone = async (phone: string): Promise<User | null> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM users WHERE phone = ? AND deleted_at IS NULL',
    [phone]
  );
  return rows.length ? (rows[0] as User) : null;
};

export const findById = async (id: number): Promise<User | null> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, name, phone, role, status, jar_rate, advance_balance, wallet_balance, wallet_access, profile_photo, created_at FROM users WHERE id = ?',
    [id]
  );
  return rows.length ? (rows[0] as User) : null;
};

/** Used internally when password comparison is needed (login, change-password). */
export const findByIdWithPassword = async (id: number): Promise<User | null> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM users WHERE id = ?',
    [id]
  );
  return rows.length ? (rows[0] as User) : null;
};

export const createUser = async (
  name: string,
  phone: string,
  hashedPassword: string
): Promise<number> => {
  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (name, phone, password, role, status) VALUES (?, ?, ?, 'customer', 'pending')",
    [name, phone, hashedPassword]
  );
  return result.insertId;
};

export const getAllUsers = async (): Promise<Omit<User, 'password'>[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.name, u.phone, u.role, u.status, u.jar_rate,
            u.prepaid_balance, u.advance_access, u.created_at, u.profile_photo,
            u.group_id,
            g.name  AS group_name,
            g.color AS group_color,
            g.icon  AS group_icon,
            ua.address       AS address,
            ua.label         AS address_label
     FROM users u
     LEFT JOIN customer_groups g ON g.id = u.group_id
     LEFT JOIN user_addresses ua
       ON ua.user_id = u.id AND ua.is_default = 1
     WHERE u.deleted_at IS NULL`
  );
  return rows as Omit<User, 'password'>[];
};

export const updateUserStatus = async (id: number, status: Status): Promise<void> => {
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
};

export const updateJarRate = async (id: number, jarRate: number): Promise<void> => {
  await pool.query('UPDATE users SET jar_rate = ? WHERE id = ?', [jarRate, id]);
};

export const updatePassword = async (id: number, hashedPassword: string): Promise<void> => {
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
};

export const updateName = async (id: number, name: string): Promise<void> => {
  await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, id]);
};
