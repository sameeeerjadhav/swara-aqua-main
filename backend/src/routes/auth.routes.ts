import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { signup, login, getMe, refreshToken, changePassword, updateProfile, forgotPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload, uploadMyPhoto } from '../controllers/photo.controller';

const router = Router();

// Strict rate limit on login/signup — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true, // only count failed attempts
});

// Looser limit on refresh — 60 per 15 minutes
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many refresh requests. Please try again later.' },
});

router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.get('/me', authenticate, getMe);
router.post('/refresh', refreshLimiter, refreshToken);
router.post('/change-password', authenticate, changePassword);
router.patch('/profile', authenticate, updateProfile);
router.post('/profile-photo', authenticate, upload.single('photo'), uploadMyPhoto);
router.post('/forgot-password', authLimiter, forgotPassword);  // ← public: customer submits reset request

export default router;

