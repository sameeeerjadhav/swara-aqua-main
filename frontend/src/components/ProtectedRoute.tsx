import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, Role } from '../context/AuthContext';
import Spinner from './Spinner';

const ROLE_HOME: Record<Role, string> = {
  admin:    '/admin',
  staff:    '/staff/deliveries',
  customer: '/customer',
};

interface Props {
  children: React.ReactNode;
  allowedRole: Role;
}

const ProtectedRoute = ({ children, allowedRole }: Props) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;

  // Not logged in — save intended URL so we can return after login
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Logged in but wrong role (e.g. admin opens /staff/* link from notification)
  // → redirect to their own correct home, not to /login
  if (user.role !== allowedRole) return <Navigate to={ROLE_HOME[user.role]} replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
