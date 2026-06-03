import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, allowAdmin } from '../middleware/auth.middleware';
import {
  getWallet,
  createTopupOrder,
  verifyTopup,
  payOrderWithWallet,
  requestWalletAccess,
  getWalletAccessRequests,
  approveWalletAccess,
  rejectWalletAccess,
} from '../controllers/wallet.controller';

const router = Router();

// Strict rate limit on financial write operations — 20 per 15 min per IP
const walletWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many payment requests. Please try again later.' },
});

// Customer routes
router.get('/',                    authenticate, getWallet);
router.post('/request-access',     authenticate, requestWalletAccess);
router.post('/topup/order',        authenticate, walletWriteLimiter, createTopupOrder);
router.post('/topup/verify',       authenticate, walletWriteLimiter, verifyTopup);
router.post('/pay-order',          authenticate, walletWriteLimiter, payOrderWithWallet);

// Admin routes
router.get('/access-requests',                    ...allowAdmin, getWalletAccessRequests);
router.patch('/access-requests/:userId/approve',  ...allowAdmin, approveWalletAccess);
router.patch('/access-requests/:userId/reject',   ...allowAdmin, rejectWalletAccess);

export default router;
