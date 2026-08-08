import { Router } from 'express';
import {
  getStats, getUsers, updateStatus, createStaff, updateJarRate,
  getCustomerProfile, getCustomerBalances, getStaffProfile, createCustomer,
  createOrderForCustomer, getSettings, updateSetting,
  getCustomersForStaff, getCustomerDeliveryCalendar, getCustomerDayDeliveries,
  updateUserProfile, deleteUser,
  getCustomerOrder, saveCustomerOrder,
  getStaffCustomerOrder, saveStaffCustomerOrder, resetStaffCustomerOrder,
  resetUserPassword,
  getPasswordResetRequests, approvePasswordReset, rejectPasswordReset,
  addManualDelivery, updateManualDelivery, deleteManualDelivery,
  updateDeliveryPayment,
} from '../controllers/admin.controller';
import {
  listGroups, createGroup, updateGroup, deleteGroup,
  setCustomerGroup, bulkAssignGroup,
  getGroupOrder, saveGroupOrder,
} from '../controllers/groups.controller';
import { upload as photoUpload, uploadCustomerPhoto } from '../controllers/photo.controller';
import { getStatus as getFirebaseStatus, uploadCredentials, reloadCredentials } from '../controllers/firebase-setup.controller';
import { allowAdmin, authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/stats',              ...allowAdmin, getStats);
router.get('/users',              ...allowAdmin, getUsers);
router.get('/users/:id/profile',  ...allowAdmin, getCustomerProfile);
router.patch('/users/:id/status', ...allowAdmin, updateStatus);
router.patch('/users/:id/jar-rate', ...allowAdmin, updateJarRate);
router.patch('/users/:id/profile',  ...allowAdmin, updateUserProfile);
router.delete('/users/:id',         ...allowAdmin, deleteUser);
router.post('/users/:id/photo',   ...allowAdmin, photoUpload.single('photo'), uploadCustomerPhoto);
router.post('/users/:id/reset-password', ...allowAdmin, resetUserPassword);
router.post('/staff',             ...allowAdmin, createStaff);
router.post('/customer',          ...allowAdmin, createCustomer);
router.post('/orders',            ...allowAdmin, createOrderForCustomer);
router.get('/staff/:id/profile',  ...allowAdmin, getStaffProfile);
router.get('/customer-balances',  ...allowAdmin, getCustomerBalances);
router.get('/settings',           ...allowAdmin, getSettings);
router.put('/settings/:key',      ...allowAdmin, updateSetting);
router.get('/customers-list',              authenticate, getCustomersForStaff);
router.get('/customer-deliveries/:id',     authenticate, getCustomerDeliveryCalendar);
router.get('/customer-deliveries/:id/day', authenticate, getCustomerDayDeliveries);

// Manual delivery entries (admin only)
router.post('/customers/:id/manual-delivery',    ...allowAdmin, addManualDelivery);
router.put('/manual-deliveries/:entryId',         ...allowAdmin, updateManualDelivery);
router.delete('/manual-deliveries/:entryId',      ...allowAdmin, deleteManualDelivery);

// Admin: edit order-based delivery payment (correct staff mistakes)
router.patch('/deliveries/:id/payment',           ...allowAdmin, updateDeliveryPayment);

router.get('/customer-order',         ...allowAdmin, getCustomerOrder);
router.put('/customer-order',         ...allowAdmin, saveCustomerOrder);
router.get('/staff/customer-order',   authenticate,  getStaffCustomerOrder);
router.put('/staff/customer-order',   authenticate,  saveStaffCustomerOrder);
router.delete('/staff/customer-order',authenticate,  resetStaffCustomerOrder);

router.get('/firebase/status',    ...allowAdmin, getFirebaseStatus);
router.post('/firebase/upload',   ...allowAdmin, uploadCredentials);
router.post('/firebase/reload',   ...allowAdmin, reloadCredentials);

// Password reset requests
router.get('/password-reset-requests',              ...allowAdmin, getPasswordResetRequests);
router.post('/password-reset-requests/:id/approve', ...allowAdmin, approvePasswordReset);
router.delete('/password-reset-requests/:id',       ...allowAdmin, rejectPasswordReset);

// ── Customer Groups ──────────────────────────────────────────────────────────
router.get('/groups',                   authenticate, listGroups);        // admin + staff (read)
router.post('/groups',                  ...allowAdmin, createGroup);
router.put('/groups/:id',               ...allowAdmin, updateGroup);
router.delete('/groups/:id',            ...allowAdmin, deleteGroup);
router.patch('/customers/:id/group',    ...allowAdmin, setCustomerGroup); // single customer assign
router.patch('/groups/:id/assign',      ...allowAdmin, bulkAssignGroup);  // bulk assign
// Group delivery order (admin saves global; staff saves personal)
router.get('/groups/:id/order',         authenticate,  getGroupOrder);
router.put('/groups/:id/order',         authenticate,  saveGroupOrder);

export default router;
