import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, allowAdmin } from '../middleware/auth.middleware';
import {
  getAdvance,
  createTopupOrder,
  verifyTopup,
  payOrderWithAdvance,
  requestAdvanceAccess,
  getAdvanceAccessRequests,
  approveAdvanceAccess,
  rejectAdvanceAccess,
} from '../controllers/advance.controller';

const router = Router();

// Strict rate limit on financial write operations - 20 per 15 min per IP
const advanceWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many payment requests. Please try again later.' },
});

// Customer routes
router.get('/',                    authenticate, getAdvance);
router.post('/request-access',     authenticate, requestAdvanceAccess);
router.post('/topup/order',        authenticate, advanceWriteLimiter, createTopupOrder);
router.post('/topup/verify',       authenticate, advanceWriteLimiter, verifyTopup);
router.post('/pay-order',          authenticate, advanceWriteLimiter, payOrderWithAdvance);

// Admin routes
router.get('/access-requests',                    ...allowAdmin, getAdvanceAccessRequests);
router.patch('/access-requests/:userId/approve',  ...allowAdmin, approveAdvanceAccess);
router.patch('/access-requests/:userId/reject',   ...allowAdmin, rejectAdvanceAccess);

export default router;
