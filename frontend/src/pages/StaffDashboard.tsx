import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Warehouse, UserRound, Users, UsersRound } from 'lucide-react';
import { DashboardLayout } from '../components/layouts/DashboardLayout';
import { StaffHome } from './staff/StaffHome';
import { StaffDeliveries } from './staff/StaffDeliveries';
import { StaffInventory } from './staff/StaffInventory';
import { StaffCasualDeliveries } from './staff/StaffCasualDeliveries';
import { StaffCustomers } from './staff/StaffCustomers';
import { StaffGroups } from './staff/StaffGroups';
import { ProfilePage } from './shared/ProfilePage';
import { LanguageProvider, useLang } from '../context/LanguageContext';
import { t } from '../i18n/staff';

// Nav order: Deliveries | Customers | Dashboard | Groups | More → (Casual, Inventory)
const NAV_ITEMS = [
  { key: 'nav_deliveries' as const, icon: ClipboardList,  to: '/staff/deliveries' },
  { key: 'nav_customers'  as const, icon: Users,          to: '/staff/customers'  },
  { key: 'nav_dashboard'  as const, icon: LayoutDashboard,to: '/staff'            },
  { key: 'nav_groups'     as const, icon: UsersRound,     to: '/staff/groups'     },
  // Items below index 4 go into the "More" overflow drawer
  { key: 'nav_casual'     as const, icon: UserRound,      to: '/staff/casual'     },
  { key: 'nav_inventory'  as const, icon: Warehouse,      to: '/staff/inventory'  },
];

const TITLE_KEYS: Record<string, string> = {
  '/staff':            'Dashboard',
  '/staff/deliveries': 'Deliveries',
  '/staff/customers':  'Customers',
  '/staff/groups':     'Groups',
  '/staff/casual':     'Casual Deliveries',
  '/staff/inventory':  'Inventory',
  '/staff/profile':    'Profile',
};

function StaffDashboardInner() {
  const { pathname } = useLocation();
  const { lang } = useLang();

  const navItems = NAV_ITEMS.map(({ key, icon, to }) => ({
    label: t(key, lang),
    icon,
    to,
  }));

  return (
    <DashboardLayout navItems={navItems} title={TITLE_KEYS[pathname] || 'Dashboard'}>
      <Routes>
        <Route index element={<StaffHome />} />
        <Route path="deliveries" element={<StaffDeliveries />} />
        <Route path="customers"  element={<StaffCustomers />} />
        <Route path="groups"     element={<StaffGroups />} />
        <Route path="casual"     element={<StaffCasualDeliveries />} />
        <Route path="inventory"  element={<StaffInventory />} />
        <Route path="profile"    element={<ProfilePage />} />
        <Route path="*"          element={<Navigate to="/staff" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default function StaffDashboard() {
  return (
    <LanguageProvider>
      <StaffDashboardInner />
    </LanguageProvider>
  );
}
