import { Router } from 'express';
import { authenticate, allowAdmin } from '../middleware/auth.middleware';
import {
  generateBills, getBills, getBillById, downloadBillPDF, recordPayment, payBillWithAdvance,
  getDeliveryReport, getDeliveryReportPDF, getBillingSummary,
  clearDuesAdvance, clearDuesOrder, clearDuesVerify,
} from '../controllers/billing.controller';
import {
  getRevenue, getPendingPayments, getStaffPerformance, getCustomerGrowth,
  getJarsTrend, getOrdersByType, getTopCustomers, getOrderVolume,
} from '../controllers/reports.controller';

const router = Router();

// ── Static routes FIRST (before /:id) ────────────────────────────────────────
router.post('/generate',                 ...allowAdmin, generateBills);
router.get('/reports/revenue',           ...allowAdmin, getRevenue);
router.get('/reports/pending',           ...allowAdmin, getPendingPayments);
router.get('/reports/staff-performance', ...allowAdmin, getStaffPerformance);
router.get('/reports/customer-growth',   ...allowAdmin, getCustomerGrowth);
router.get('/reports/jars-trend',        ...allowAdmin, getJarsTrend);
router.get('/reports/orders-by-type',    ...allowAdmin, getOrdersByType);
router.get('/reports/top-customers',     ...allowAdmin, getTopCustomers);
router.get('/reports/order-volume',      ...allowAdmin, getOrderVolume);
router.get('/summary',                   ...allowAdmin, getBillingSummary);

// ── Clear All Dues (customer) ─────────────────────────────────────────────────
router.post('/clear-dues/advance',       authenticate, clearDuesAdvance);
router.post('/clear-dues/order',         authenticate, clearDuesOrder);
router.post('/clear-dues/verify',        authenticate, clearDuesVerify);

// ── Delivery report (flexible date range — admin + customer) ──────────────────
router.get('/delivery-report',           authenticate, getDeliveryReport);
router.get('/delivery-report/pdf',       authenticate, getDeliveryReportPDF);

// ── Billing list + detail ─────────────────────────────────────────────────────
router.get('/',              authenticate, getBills);
router.get('/:id/pdf',       authenticate, downloadBillPDF);
router.get('/:id',           authenticate, getBillById);
router.patch('/:id/pay',    ...allowAdmin, recordPayment);
router.patch('/:id/pay-advance', authenticate, payBillWithAdvance);

export default router;
