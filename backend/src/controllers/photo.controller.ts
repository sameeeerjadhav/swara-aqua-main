import { Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import pool from '../config/db';
import { AuthRequest } from '../middleware/auth.middleware';

// ── Upload directory ──────────────────────────────────────────────────────────
const isProdEnv = process.env.NODE_ENV === 'production';
const uploadDir = isProdEnv
  ? path.join(os.homedir(), 'uploads', 'avatars')
  : path.join(__dirname, '..', '..', 'uploads', 'avatars');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Use user id from JWT so re-uploads overwrite the old file
    const userId = (req as AuthRequest).user?.id || Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `avatar_${userId}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Helper — delete old avatar file if it exists
const deleteOldAvatar = async (userId: number) => {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT profile_photo FROM users WHERE id = ?', [userId]
    );
    const old = (rows as any[])[0]?.profile_photo;
    if (old) {
      const filename = old.split('/uploads/avatars/')[1];
      if (filename) {
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
  } catch { /* ignore */ }
};

// ── POST /users/profile-photo  (customer uploads their own) ──────────────────
export const uploadMyPhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ message: 'Image file required' }); return; }

    await deleteOldAvatar(req.user!.id);

    const photo_url = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET profile_photo = ? WHERE id = ?',
      [photo_url, req.user!.id]);

    res.json({ message: 'Photo updated', profile_photo: photo_url });
  } catch (err) {
    console.error('uploadMyPhoto error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to upload photo' });
  }
};

// ── POST /admin/users/:id/photo  (admin uploads for a customer) ──────────────
export const uploadCustomerPhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ message: 'Image file required' }); return; }

    const targetId = Number(req.params.id);
    if (!targetId) { res.status(400).json({ message: 'Invalid user id' }); return; }

    await deleteOldAvatar(targetId);

    const photo_url = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET profile_photo = ? WHERE id = ?',
      [photo_url, targetId]);

    res.json({ message: 'Photo updated', profile_photo: photo_url });
  } catch (err) {
    console.error('uploadCustomerPhoto error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to upload photo' });
  }
};
