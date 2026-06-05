import { Router } from 'express';
import { authenticate, allowAdmin, allowCustomer } from '../middleware/auth.middleware';
import {
  getMyPending,
  createPendingPayOrder,
  verifyPendingPayment,
  getAdminPendingSummary,
} from '../controllers/pending.controller';

const router = Router();

// Customer routes
router.get('/my',         ...allowCustomer, getMyPending);
router.post('/pay-order', ...allowCustomer, createPendingPayOrder);
router.post('/verify',    ...allowCustomer, verifyPendingPayment);

// Admin route
router.get('/admin',      ...allowAdmin, getAdminPendingSummary);

export default router;
