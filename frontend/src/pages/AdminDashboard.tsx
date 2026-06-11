import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, UsersRound, Package, Bell, Warehouse, CreditCard, FileText, BarChart2, Image, UserRound, Wallet } from 'lucide-react';
import { DashboardLayout } from '../components/layouts/DashboardLayout';
import { AdminHome } from './admin/AdminHome';
import { AdminUsers } from './admin/AdminUsers';
import { AdminCustomers } from './admin/AdminCustomers';
import { AdminOrders } from './admin/AdminOrders';
import { AdminNotifications } from './admin/AdminNotifications';
import { AdminInventory } from './admin/AdminInventory';
import { AdminTransactions } from './admin/AdminTransactions';
import { AdminBilling } from './admin/AdminBilling';
import { AdminReports } from './admin/AdminReports';
import { AdminCustomerProfile } from './admin/AdminCustomerProfile';
import { AdminStaffProfile } from './admin/AdminStaffProfile';
import { AdminProfile } from './admin/AdminProfile';
import { AdminBanners } from './admin/AdminBanners';
import { AdminCasualDeliveries } from './admin/AdminCasualDeliveries';
import { AdminAdvanceRequests } from './admin/AdminAdvanceRequests';

const NAV = [
  // ── Bottom nav primary (index 0-3, center is index 2) ──
  { label: 'Advance',    icon: Wallet,          to: '/admin/advance-requests' },
  { label: 'Reports',    icon: BarChart2,        to: '/admin/reports' },
  { label: 'Dashboard',  icon: LayoutDashboard,  to: '/admin' },
  { label: 'Billing',    icon: FileText,         to: '/admin/billing' },
  // ── Overflow (More drawer) ──
  { label: 'Orders',     icon: Package,          to: '/admin/orders' },
  { label: 'Customers',  icon: UsersRound,       to: '/admin/customers' },
  { label: 'Staff',      icon: Users,            to: '/admin/staff' },
  { label: 'Inventory',  icon: Warehouse,        to: '/admin/inventory' },
  { label: 'Transactions', icon: CreditCard,     to: '/admin/transactions' },
  { label: 'Notifications', icon: Bell,          to: '/admin/notifications' },
  { label: 'Banners',    icon: Image,            to: '/admin/banners' },
  { label: 'Casual Deliveries', icon: UserRound, to: '/admin/casual-deliveries' },
];

const TITLES: Record<string, string> = {
  '/admin':               'Dashboard',
  '/admin/orders':        'Orders',
  '/admin/customers':     'Customers',
  '/admin/staff':         'Staff',
  '/admin/inventory':     'Inventory',
  '/admin/transactions':  'Transactions',
  '/admin/billing':       'Billing',
  '/admin/reports':       'Reports',
  '/admin/notifications': 'Notifications',
  '/admin/casual-deliveries':   'Casual Deliveries',
  '/admin/advance-requests':  'Advance Payment Requests',
  '/admin/banners':       'Banner Management',
  '/admin/profile':       'My Profile',
};

export default function AdminDashboard() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] || 'Dashboard';

  return (
    <DashboardLayout navItems={NAV} title={title}>
      <Routes>
        <Route index element={<AdminHome />} />
        <Route path="orders"        element={<AdminOrders />} />
        <Route path="customers"     element={<AdminCustomers />} />
        <Route path="customers/:id" element={<AdminCustomerProfile />} />
        <Route path="staff"         element={<AdminUsers />} />
        <Route path="staff/:id"      element={<AdminStaffProfile />} />
        <Route path="inventory"     element={<AdminInventory />} />
        <Route path="transactions"  element={<AdminTransactions />} />
        <Route path="billing"       element={<AdminBilling />} />
        <Route path="reports"       element={<AdminReports />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="banners"           element={<AdminBanners />} />
        <Route path="wallet-requests"    element={<Navigate to="/admin/advance-requests" replace />} />
        <Route path="advance-requests"   element={<AdminAdvanceRequests />} />
        <Route path="casual-deliveries"  element={<AdminCasualDeliveries />} />
        <Route path="profile"       element={<AdminProfile />} />
        {/* Legacy redirect */}
        <Route path="users"         element={<Navigate to="/admin/staff" replace />} />
        <Route path="settings"      element={<Navigate to="/admin/profile" replace />} />
        <Route path="*"             element={<Navigate to="/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
