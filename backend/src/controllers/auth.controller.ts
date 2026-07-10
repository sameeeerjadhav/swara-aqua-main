import { Request, Response } from 'express';
import { errDetail } from '../utils/errors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as UserModel from '../models/user.model';
import * as NotifService from '../services/notification.service';
import { AuthRequest } from '../middleware/auth.middleware';

const notify = (fn: () => Promise<void>) => {
  fn().catch(err => console.warn('FCM notification failed (non-fatal):', err?.message));
};

import { StringValue } from 'ms';

const signToken = (id: number, role: string) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as StringValue,
  });

const signRefreshToken = (id: number, role: string) =>
  jwt.sign({ id, role }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as StringValue,
  });

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone, password, address } = req.body;

    if (!name || !phone || !password) {
      res.status(400).json({ message: 'All fields are required' });
      return;
    }

    // Normalise: strip spaces/dashes, then validate as Indian mobile number
    const cleanPhone = String(phone).replace(/[\s\-]/g, '');
    if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      res.status(400).json({
        message: 'Enter a valid 10-digit Indian mobile number (must start with 6, 7, 8 or 9)',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await UserModel.findByPhone(cleanPhone);
    if (existing) {
      res.status(409).json({ message: 'Phone number already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const userId = await UserModel.createUser(name.trim(), cleanPhone, hashed);

    // Save address if provided
    if (address && address.trim()) {
      const AddrModel = await import('../models/address.model');
      await AddrModel.addAddress(userId, { label: 'Home', address: address.trim(), isDefault: true });
    }

    notify(() =>
      NotifService.sendToRole(
        'admin',
        'New Customer Registration 👤',
        `${name} (${phone}) signed up — pending your approval`,
        'approval',
        { userId: String(userId), customerId: String(userId) }
      )
    );

    res.status(201).json({
      message: 'Registration submitted. Waiting for admin approval.',
      userId,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      res.status(400).json({ message: 'Phone and password are required' });
      return;
    }

    const user = await UserModel.findByPhone(phone);
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    if (user.status === 'pending') {
      res.status(403).json({ message: 'Your account is pending admin approval' });
      return;
    }

    if (user.status === 'rejected') {
      res.status(403).json({ message: 'Your account has been rejected' });
      return;
    }

    const accessToken = signToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id, user.role);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        jar_rate: user.jar_rate,
        profile_photo: user.profile_photo || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (err) {
    console.error('GetMe error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: 'Refresh token required' });
    return;
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string
    ) as { id: number; role: string };

    const accessToken = signToken(decoded.id, decoded.role);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current and new passwords are required' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ message: 'New password must be at least 6 characters' });
      return;
    }

    const user = await UserModel.findByIdWithPassword(req.user!.id);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(401).json({ message: 'Current password is incorrect' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await UserModel.updatePassword(req.user!.id, hashed);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// PATCH /auth/profile — update name and/or password
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, currentPassword, newPassword } = req.body;
    const userId = req.user!.id;
    const pool = (await import('../config/db')).default;

    // Update name if provided
    if (name && name.trim()) {
      await pool.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), userId]);
    }

    // Update phone if provided
    if (phone && phone.trim()) {
      const cleanPhone = String(phone).replace(/[\s\-]/g, '');
      if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
        res.status(400).json({ message: 'Enter a valid 10-digit Indian mobile number' }); return;
      }
      // Check for duplicate phone (excluding self)
      const [dup] = await pool.query<any[]>(
        'SELECT id FROM users WHERE phone = ? AND id != ? AND deleted_at IS NULL', [cleanPhone, userId]
      );
      if ((dup as any[]).length) {
        res.status(409).json({ message: 'This phone number is already registered to another account' }); return;
      }
      await pool.query('UPDATE users SET phone = ? WHERE id = ?', [cleanPhone, userId]);
    }

    // Update password if provided
    if (currentPassword && newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ message: 'New password must be at least 6 characters' });
        return;
      }
      const [rows] = await pool.query<any[]>('SELECT password FROM users WHERE id = ?', [userId]);
      const user = (rows as any[])[0];
      if (!user) { res.status(404).json({ message: 'User not found' }); return; }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) { res.status(401).json({ message: 'Current password is incorrect' }); return; }
      const hashed = await bcrypt.hash(newPassword, 12);
      await UserModel.updatePassword(userId, hashed);
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /auth/forgot-password -- public endpoint
// Customer submits phone + desired new password; stored pending for admin approval
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword) {
      res.status(400).json({ message: 'Phone and new password are required' }); return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ message: 'New password must be at least 6 characters' }); return;
    }

    const pool = (await import('../config/db')).default;
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, role FROM users WHERE phone = ? AND deleted_at IS NULL',
      [String(phone).replace(/[\s\-]/g, '')]
    );
    if (!(rows as any[]).length) {
      // Generic message to avoid phone enumeration
      res.json({ message: 'If this number is registered, your request has been submitted to the admin.' }); return;
    }
    const user = (rows as any[])[0];

    // Only customers can request password reset this way; admins/staff use the admin panel
    if (user.role !== 'customer') {
      res.json({ message: 'If this number is registered, your request has been submitted to the admin.' }); return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    // Cancel any previous pending requests for this user
    await pool.query(
      'UPDATE password_reset_requests SET status = ? WHERE user_id = ? AND status = ?',
      ['rejected', user.id, 'pending']
    );

    // Insert new request
    await pool.query(
      'INSERT INTO password_reset_requests (user_id, new_password) VALUES (?, ?)',
      [user.id, hashed]
    );

    // Notify admin
    notify(() =>
      NotifService.sendToRole(
        'admin',
        'Password Reset Request',
        user.name + ' (' + phone + ') has requested a password reset. Please review in the admin panel.',
        'approval',
        { userId: String(user.id) }
      )
    );

    res.json({ message: 'Your password reset request has been submitted. The admin will review and update your password.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
