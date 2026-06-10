import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import { SplashScreen } from './components/SplashScreen';
import { OfflineIndicator } from './components/PWAInstall';

// Lazy load heavy dashboards — only downloaded when user navigates there
const LoginPage       = lazy(() => import('./pages/LoginPage'));
const SignupPage      = lazy(() => import('./pages/SignupPage'));
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard'));
const StaffDashboard  = lazy(() => import('./pages/StaffDashboard'));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const DownloadAppPage = lazy(() => import('./pages/DownloadAppPage').then(m => ({ default: m.DownloadAppPage })));

// Minimal loader for Suspense (brief, between routes)
const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white">
    <img src="/icons/justlogo.png" alt="" style={{ width: 64, height: 64, objectFit: 'contain', opacity: 0.5 }} />
  </div>
);

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      <AuthProvider>
        <NotificationProvider>
        <ToastProvider>
          <OfflineIndicator />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login"    element={<LoginPage />} />
              <Route path="/signup"   element={<SignupPage />} />
              <Route path="/download" element={<DownloadAppPage />} />
              <Route path="/admin/*" element={
                <ProtectedRoute allowedRole="admin"><AdminDashboard /></ProtectedRoute>
              } />
              <Route path="/staff/*" element={
                <ProtectedRoute allowedRole="staff"><StaffDashboard /></ProtectedRoute>
              } />
              <Route path="/customer/*" element={
                <ProtectedRoute allowedRole="customer"><CustomerDashboard /></ProtectedRoute>
              } />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
        </NotificationProvider>
      </AuthProvider>
    </>
  );
};

export default App;
