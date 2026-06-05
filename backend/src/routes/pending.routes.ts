import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getMyPending,
  createPendingPayOrder,
  verifyPendingPayment,
  getAdminPendingSummary,
} from '../controllers/pending.controller';

const router = Router();

// Customer routes
router.get('/my',        authenticate, requireRole('customer'), getMyPending);
router.post('/pay-order', authenticate, requireRole('customer'), createPendingPayOrder);
router.post('/verify',    authenticate, requireRole('customer'), verifyPendingPayment);

// Admin route
router.get('/admin',     authenticate, requireRole('admin'), getAdminPendingSummary);

export default router;
