import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Package, TrendingUp, Clock, ChevronRight,
  XCircle, IndianRupee, AlertCircle,
  BarChart3, Bell, UserRound, Wallet, Banknote, KeyRound, CheckCircle, X,
} from 'lucide-react';

import { StatCardSkeleton } from '../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import api from '../../api/axios';
import { ordersApi } from '../../api/orders';
import { inventoryApi } from '../../api/inventory';
import { useSSE, useSSEEventOnly } from '../../hooks/useSSE';

interface UserStats  { total: number; pending: number; active: number; customers: number; staff: number; advance_requests: number; }

interface OrderStats { total: number; pending: number; assigned: number; completed: number; cancelled: number; total_revenue: number; stats_month: string; }

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp  = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' as const } } };



// ── Metric card (clickable, vertical layout) ──
const MetricCard = ({
  label, value, icon, gradient, loading, to,
}: {
  label: string; value: string | number;
  icon: React.ReactNode; gradient: string; loading?: boolean; to?: string;
}) => {
  const navigate = useNavigate();
  return (
    <motion.div variants={fadeUp}
      onClick={() => to && navigate(to)}
      className={`bg-white rounded-2xl border border-slate-100 shadow-card p-4 flex flex-col gap-3 transition-all
        ${to ? 'cursor-pointer hover:shadow-md hover:border-brand-200 active:scale-[0.97]' : 'hover:shadow-md'}`}>
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
        {icon}
      </div>
      {/* Value + label */}
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-6 w-12 bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-extrabold text-slate-900 leading-none">{value}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1 leading-tight">{label}</p>
        </div>
      )}
    </motion.div>
  );
};

export const AdminHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userStats,    setUserStats]    = useState<UserStats | null>(null);
  const [orderStats,   setOrderStats]   = useState<OrderStats | null>(null);
  const [pendingCash,  setPendingCash]  = useState(0);
  const [expandedQR,   setExpandedQR]   = useState<{ src: string; label: string } | null>(null);
  const [pwdResetRequests, setPwdResetRequests] = useState<{ id: number; user_name: string; user_phone: string; created_at: string }[]>([]);
  const [pwdActionId, setPwdActionId] = useState<number | null>(null);
  const loading = !userStats || !orderStats;

  const loadStats = () => {
    api.get('/admin/stats').then(({ data }) => setUserStats(data.stats)).catch(() => {});
    ordersApi.stats().then(({ data }) => setOrderStats(data.stats)).catch(() => {});
    // Load pending cash submissions count
    inventoryApi.getCashSubmissions()
      .then(({ data }) => setPendingCash(data.submissions.filter((s: { status: string }) => s.status === 'pending').length))
      .catch(() => {});
    // Load password reset requests
    api.get('/admin/password-reset-requests')
      .then(({ data }) => setPwdResetRequests(data.requests))
      .catch(() => {});
  };

  useEffect(() => { loadStats(); }, []);

  // SSE: auto-refresh dashboard stats when orders change (safe to poll every 15s)
  useSSE({
    order_created:      () => loadStats(),
    order_updated:      () => loadStats(),
    delivery_completed: () => loadStats(),
  });

  // Event-only: cash submission toast must NOT fire on every poll cycle
  useSSEEventOnly({
    cash_submitted: (data: { staffName?: string; amount?: number }) => {
      setPendingCash(prev => prev + 1);
      toast(
        `💰 ${data.staffName || 'Staff'} submitted ₹${data.amount?.toLocaleString('en-IN') || '...'} — verify in Transactions`,
        'success'
      );
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Pending Cash Alert Banner ── */}
      {pendingCash > 0 && (
        <motion.button
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/admin/transactions')}
          className="w-full flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 text-left hover:bg-amber-100 active:scale-[0.98] transition-all shadow-sm"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">
              {pendingCash} Cash Submission{pendingCash > 1 ? 's' : ''} Pending Verification
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Tap to go to Transactions → Cash Submissions</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
        </motion.button>
      )}

      {/* ── Password Reset Requests Banner ── */}
      {pwdResetRequests.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card">
          <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border-b border-violet-100">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4 text-violet-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-violet-800">
                {pwdResetRequests.length} Password Reset Request{pwdResetRequests.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-violet-500">Approve to apply the customer's new password</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {pwdResetRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.user_name}</p>
                  <p className="text-xs text-slate-400">{r.user_phone} &middot; {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    disabled={pwdActionId === r.id}
                    onClick={async () => {
                      setPwdActionId(r.id);
                      try {
                        await api.post(`/admin/password-reset-requests/${r.id}/approve`);
                        setPwdResetRequests(prev => prev.filter(x => x.id !== r.id));
                        toast(`Password updated for ${r.user_name}`, 'success');
                      } catch { toast('Failed to approve request', 'error'); }
                      finally { setPwdActionId(null); }
                    }}
                    className="flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-green-100 transition-colors disabled:opacity-50">
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    disabled={pwdActionId === r.id}
                    onClick={async () => {
                      setPwdActionId(r.id);
                      try {
                        await api.delete(`/admin/password-reset-requests/${r.id}`);
                        setPwdResetRequests(prev => prev.filter(x => x.id !== r.id));
                        toast(`Request rejected`, 'success');
                      } catch { toast('Failed to reject request', 'error'); }
                      finally { setPwdActionId(null); }
                    }}
                    className="flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Revenue hero ── */}
      {orderStats && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-3xl p-5 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-white/5" />
          <div className="absolute right-12 -bottom-6 w-28 h-28 rounded-full bg-white/5" />

          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-2">
                {orderStats.stats_month ? `${orderStats.stats_month} Revenue` : 'Total Revenue'}
              </p>
              <p className="text-white font-extrabold text-3xl">
                ₹{Number(orderStats.total_revenue).toLocaleString('en-IN')}
              </p>
              <p className="text-white/40 text-xs mt-1">{orderStats.total} orders this month</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Clickable mini tiles → navigate with filter */}
              <div
                className="bg-white/10 rounded-2xl px-3 py-2.5 text-center border border-white/10 cursor-pointer hover:bg-white/20 transition-colors active:scale-95"
                onClick={() => navigate('/admin/orders?status=completed')}>
                <p className="text-white font-bold text-lg leading-none">{orderStats.completed}</p>
                <p className="text-white/50 text-[10px] font-medium mt-0.5">Completed</p>
              </div>
              <div
                className="bg-amber-400/20 rounded-2xl px-3 py-2.5 text-center border border-amber-400/20 cursor-pointer hover:bg-amber-400/30 transition-colors active:scale-95"
                onClick={() => navigate('/admin/orders?status=pending')}>
                <p className="text-amber-300 font-bold text-lg leading-none">{orderStats.pending}</p>
                <p className="text-amber-300/70 text-[10px] font-medium mt-0.5">Pending</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── People metrics ── */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">People</p>
        <motion.div variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard loading={loading} label="Customers"
            value={userStats?.customers ?? '—'}
            gradient="from-brand-500 to-brand-400"
            to="/admin/customers"
            icon={<Users className="w-5 h-5 text-white" />} />
          <MetricCard loading={loading} label="Staff"
            value={userStats?.staff ?? '—'}
            gradient="from-green-500 to-emerald-400"
            to="/admin/staff"
            icon={<UserRound className="w-5 h-5 text-white" />} />
          <MetricCard loading={loading} label="Pending Approval"
            value={userStats?.pending ?? '—'}
            gradient="from-amber-500 to-orange-400"
            to="/admin/customers"
            icon={<Clock className="w-5 h-5 text-white" />} />
          <MetricCard loading={loading} label="Advance Requests"
            value={userStats?.advance_requests ?? '—'}
            gradient="from-violet-500 to-purple-400"
            to="/admin/advance-requests"
            icon={<Wallet className="w-5 h-5 text-white" />} />

        </motion.div>
      </div>

      {/* ── Order metrics ── */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Orders {orderStats?.stats_month ? `— ${orderStats.stats_month}` : ''}
        </p>
        <motion.div variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard loading={loading} label="Total Orders"
            value={orderStats?.total ?? '—'}
            gradient="from-brand-600 to-blue-500"
            to="/admin/orders"
            icon={<Package className="w-5 h-5 text-white" />} />
          <MetricCard loading={loading} label="Pending"
            value={orderStats?.pending ?? '—'}
            gradient="from-amber-500 to-yellow-400"
            to="/admin/orders?status=pending"
            icon={<AlertCircle className="w-5 h-5 text-white" />} />
          <MetricCard loading={loading} label="Completed"
            value={orderStats?.completed ?? '—'}
            gradient="from-green-500 to-teal-400"
            to="/admin/orders?status=completed"
            icon={<TrendingUp className="w-5 h-5 text-white" />} />
          <MetricCard loading={loading} label="Cancelled"
            value={orderStats?.cancelled ?? '—'}
            gradient="from-red-500 to-rose-400"
            to="/admin/orders?status=cancelled"
            icon={<XCircle className="w-5 h-5 text-white" />} />
        </motion.div>
      </div>

      {/* ── Quick actions ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: Clock, gradient: 'from-amber-500 to-orange-400',
              label: 'Pending Approvals',
              sub: `${userStats?.pending ?? '—'} users waiting for review`,
              to: '/admin/customers',
              urgent: (userStats?.pending ?? 0) > 0,
            },
            {
              icon: Package, gradient: 'from-brand-600 to-brand-500',
              label: 'Manage Orders',
              sub: `${orderStats?.pending ?? '—'} orders need attention`,
              to: '/admin/orders?status=pending',
              urgent: false,
            },
            {
              icon: BarChart3, gradient: 'from-purple-500 to-indigo-500',
              label: 'Reports & Analytics',
              sub: 'Revenue, delivery, trends',
              to: '/admin/reports',
              urgent: false,
            },
            {
              icon: Bell, gradient: 'from-teal-500 to-aqua-500',
              label: 'Send Notification',
              sub: 'Push to customers or staff',
              to: '/admin/notifications',
              urgent: false,
            },
          ].map(({ icon: Icon, gradient, label, sub, to, urgent }) => (
            <button key={label} onClick={() => navigate(to)}
              className={`flex items-center justify-between p-4 bg-white rounded-2xl border transition-all group text-left hover:shadow-md active:scale-[0.98]
                ${urgent ? 'border-amber-200 hover:border-amber-300' : 'border-slate-100 hover:border-brand-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{label}</p>
                    {urgent && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        Action needed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </motion.div>
      {/* ── QR Code Promo ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-gradient-to-br from-brand-600 to-aqua-500 rounded-3xl p-5 shadow-lg"
      >
        <p className="text-white font-extrabold text-base leading-tight mb-1">Share &amp; Refer</p>
        <p className="text-white/75 text-xs mb-4">Know someone who needs pure water? Let them scan the right QR for their phone!</p>

        <div className="grid grid-cols-2 gap-3">
          {/* Android APK QR */}
          <div className="bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-md cursor-pointer active:scale-95 transition-transform"
            onClick={() => setExpandedQR({ src: '/swaraapkqr.png', label: '🤖 Android App' })}>
            <div className="flex items-center gap-1 bg-green-100 rounded-full px-2 py-0.5">
              <span className="text-green-700 text-[10px] font-bold">🤖 Android</span>
            </div>
            <img src="/swaraapkqr.png" alt="Android APK QR Code" className="w-24 h-24 object-contain" />
            <div className="text-center">
              <p className="text-[11px] font-bold text-slate-700">Android App</p>
              <p className="text-[10px] text-slate-400 leading-tight">Tap to enlarge &amp; scan</p>
            </div>
          </div>

          {/* iOS / Web QR */}
          <div className="bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-md cursor-pointer active:scale-95 transition-transform"
            onClick={() => setExpandedQR({ src: '/permanentqr.png', label: ' iOS / Web' })}>
            <div className="flex items-center gap-1 bg-blue-100 rounded-full px-2 py-0.5">
              <span className="text-blue-700 text-[10px] font-bold"> iOS / Web</span>
            </div>
            <img src="/permanentqr.png" alt="iOS / Web QR Code" className="w-24 h-24 object-contain" />
            <div className="text-center">
              <p className="text-[11px] font-bold text-slate-700">iPhone &amp; Web</p>
              <p className="text-[10px] text-slate-400 leading-tight">Tap to enlarge &amp; scan</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Fullscreen QR overlay ── */}
      <AnimatePresence>
        {expandedQR && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6"
            onClick={() => setExpandedQR(null)}>
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full">
              <p className="text-sm font-bold text-slate-700">{expandedQR.label}</p>
              <img src={expandedQR.src} alt="QR Code" className="w-64 h-64 object-contain" />
              <p className="text-xs text-slate-400 text-center">Point your phone camera at the QR code to scan</p>
              <button onClick={() => setExpandedQR(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-600 transition-colors">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
