import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import { OfflineIndicator } from './components/PWAInstall';

// Lazy load heavy dashboards — only downloaded when user navigates there
const LoginPage       = lazy(() => import('./pages/LoginPage'));
const SignupPage      = lazy(() => import('./pages/SignupPage'));
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard'));
const StaffDashboard  = lazy(() => import('./pages/StaffDashboard'));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const DownloadAppPage = lazy(() => import('./pages/DownloadAppPage').then(m => ({ default: m.DownloadAppPage })));

// Animated splash screen shown while JS chunks download
const PageLoader = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-white gap-4">

    {/* Rotating logo */}
    <div
      style={{
        animation: 'splashSpin 0.7s cubic-bezier(0.34,1.56,0.64,1) both',
        width: 120,
        height: 120,
      }}
    >
      <img
        src="/icons/justlogo.png"
        alt="Sarvam Logo"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>

    {/* Name fades + slides up after logo */}
    <div
      style={{
        animation: 'splashFadeUp 0.5s ease 0.5s both',
        opacity: 0,
        width: 180,
      }}
    >
      <img
        src="/icons/justname.png"
        alt="Sarvam Enterprises"
        style={{ width: '100%', objectFit: 'contain' }}
      />
    </div>

    {/* Keyframes injected inline */}
    <style>{`
      @keyframes splashSpin {
        0%   { opacity: 0; transform: rotate(-180deg) scale(0.4); }
        100% { opacity: 1; transform: rotate(0deg)    scale(1);   }
      }
      @keyframes splashFadeUp {
        0%   { opacity: 0; transform: translateY(16px); }
        100% { opacity: 1; transform: translateY(0);    }
      }
    `}</style>
  </div>
);

const App = () => (
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
);

export default App;
