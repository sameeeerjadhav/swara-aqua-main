import { Router } from 'express';
import {
  getStats, getUsers, updateStatus, createStaff, updateJarRate,
  getCustomerProfile, getCustomerBalances, getStaffProfile, createCustomer,
  createOrderForCustomer, getSettings, updateSetting,
  getCustomersForStaff, getCustomerDeliveryCalendar, getCustomerDayDeliveries,
  updateUserProfile, deleteUser,
  getCustomerOrder, saveCustomerOrder,
  getStaffCustomerOrder, saveStaffCustomerOrder, resetStaffCustomerOrder,
} from '../controllers/admin.controller';
import { upload as photoUpload, uploadCustomerPhoto } from '../controllers/photo.controller';
import { getStatus as getFirebaseStatus, uploadCredentials, reloadCredentials } from '../controllers/firebase-setup.controller';
import { allowAdmin, authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/stats',              ...allowAdmin, getStats);
router.get('/users',              ...allowAdmin, getUsers);
router.get('/users/:id/profile',  ...allowAdmin, getCustomerProfile);
router.patch('/users/:id/status', ...allowAdmin, updateStatus);
router.patch('/users/:id/jar-rate', ...allowAdmin, updateJarRate);
router.patch('/users/:id/profile',  ...allowAdmin, updateUserProfile);   // ← NEW: admin edit any user
router.delete('/users/:id',         ...allowAdmin, deleteUser);           // ← NEW: soft delete user
router.post('/users/:id/photo',   ...allowAdmin, photoUpload.single('photo'), uploadCustomerPhoto);
router.post('/staff',             ...allowAdmin, createStaff);
router.post('/customer',          ...allowAdmin, createCustomer);
router.post('/orders',            ...allowAdmin, createOrderForCustomer);
router.get('/staff/:id/profile',  ...allowAdmin, getStaffProfile);
router.get('/customer-balances',  ...allowAdmin, getCustomerBalances);
router.get('/settings',           ...allowAdmin, getSettings);
router.put('/settings/:key',      ...allowAdmin, updateSetting);
router.get('/customers-list',              authenticate, getCustomersForStaff); // staff + admin
router.get('/customer-deliveries/:id',     authenticate, getCustomerDeliveryCalendar);  // staff + admin
router.get('/customer-deliveries/:id/day', authenticate, getCustomerDayDeliveries);     // staff + admin

router.get('/customer-order',       ...allowAdmin,  getCustomerOrder);         // admin get order
router.put('/customer-order',       ...allowAdmin,  saveCustomerOrder);        // admin save order
router.get('/staff/customer-order',  authenticate, getStaffCustomerOrder);     // staff get order
router.put('/staff/customer-order',  authenticate, saveStaffCustomerOrder);    // staff save order
router.delete('/staff/customer-order', authenticate, resetStaffCustomerOrder); // staff reset order

router.get('/firebase/status',    ...allowAdmin, getFirebaseStatus);
router.post('/firebase/upload',   ...allowAdmin, uploadCredentials);
router.post('/firebase/reload',   ...allowAdmin, reloadCredentials);

export default router;
