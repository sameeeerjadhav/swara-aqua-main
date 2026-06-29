import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Clock, IndianRupee, Package,
  Droplets, ArrowRight, MapPin, ChevronRight,
  Zap, UserRound,
} from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ordersApi, Order } from '../../api/orders';
import { useSSE } from '../../hooks/useSSE';
import { useLang } from '../../context/LanguageContext';
import { t } from '../../i18n/staff';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, delay, ease: 'easeOut' as const } },
});

interface DailySummary {
  today: string;
  deliveries_done: number;
  jars_delivered: number;
  cash_collected: number;
  pending_orders: number;
  assigned_jars: number;
  empty_collected: number;
  cash_in_hand: number;
}

export const StaffHome = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const { lang }  = useLang();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [pending, setPending] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQR, setExpandedQR] = useState<{ src: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [sumRes, ordRes] = await Promise.all([
        ordersApi.getDailySummary(),
        ordersApi.list(),
      ]);
      setSummary(sumRes.data);
      setPending(ordRes.data.orders.filter(o => o.status === 'assigned'));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useSSE({
    order_created:      () => load(),
    order_assigned:     () => load(),
    order_updated:      () => load(),
    delivery_completed: () => load(),
  });

  const firstName = user?.name?.split(' ')[0] ?? 'Staff';
  const now = new Date();
  const timeOfDay = now.getHours() < 12
    ? t('good_morning', lang)
    : now.getHours() < 17
      ? t('good_afternoon', lang)
      : t('good_evening', lang);
  const today = now.toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const stats = [
    {
      label: t('delivered', lang),
      value: summary?.deliveries_done ?? 0,
      icon: CheckCircle2,
      from: 'from-emerald-500', to: 'to-green-400',
      glow: 'rgba(16,185,129,0.35)',
      href: '/staff/deliveries?tab=completed',
    },
    {
      label: t('jars_out', lang),
      value: summary?.jars_delivered ?? 0,
      icon: Droplets,
      from: 'from-brand-500', to: 'to-aqua-400',
      glow: 'rgba(37,99,235,0.35)',
      href: '/staff/inventory',
    },
    {
      label: t('collected', lang),
      value: `₹${Number(summary?.cash_collected ?? 0).toLocaleString('en-IN')}`,
      icon: IndianRupee,
      from: 'from-amber-500', to: 'to-orange-400',
      glow: 'rgba(245,158,11,0.35)',
      href: '/staff/deliveries?tab=completed',
    },
    {
      label: t('pending', lang),
      value: summary?.pending_orders ?? 0,
      icon: Clock,
      from: 'from-purple-500', to: 'to-indigo-400',
      glow: 'rgba(139,92,246,0.35)',
      href: '/staff/deliveries?tab=pending',
    },
  ];

  return (
    <div className="space-y-5 max-w-xl">

      {/* ── Hero greeting ── */}
      <motion.div {...fadeUp(0)}
        className="relative overflow-hidden rounded-3xl"
        style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0369a1 60%, #06b6d4 100%)' }}>

        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute bottom-0 right-16 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 pointer-events-none" />

        <div className="relative z-10 px-6 py-6 flex items-center justify-between">
          <div>
            <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">{today}</p>
            <h1 className="text-white font-bold text-2xl mt-1 leading-tight">
              {timeOfDay},<br />
              <span className="text-aqua-200">{firstName}!</span>
            </h1>
            <p className="text-white/50 text-xs mt-2 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-300" />
              {t('ready_today', lang)}
            </p>
          </div>

          {/* Avatar circle */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-3xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <UserRound className="w-8 h-8 text-white/80" />
            </div>
            <span className="text-[10px] text-white/50 font-semibold bg-white/10 rounded-full px-2.5 py-0.5">
              {user?.role ?? 'Staff'}
            </span>
          </div>
        </div>

        {/* Progress bar (deliveries done / total pending) */}
        {!loading && summary && (summary.deliveries_done + summary.pending_orders) > 0 && (
          <div className="relative z-10 px-6 pb-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-white/50 font-semibold">{t('todays_progress', lang)}</p>
              <p className="text-[10px] text-white/70 font-bold">
                {summary.deliveries_done} / {summary.deliveries_done + summary.pending_orders}
              </p>
            </div>
            <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((summary.deliveries_done / (summary.deliveries_done + summary.pending_orders)) * 100)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-aqua-300 to-emerald-300"
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Stats grid ── */}
      <motion.div {...fadeUp(0.08)} className="grid grid-cols-2 gap-3">
        {loading ? (
          [0,1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-3xl" />)
        ) : (
          stats.map(({ label, value, icon: Icon, from, to, glow, href }, i) => (
            <motion.div key={label}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.3 }}
              onClick={() => navigate(href)}
              className="bg-white rounded-3xl border border-slate-100 shadow-card p-4 flex flex-col gap-2 cursor-pointer hover:shadow-md hover:border-slate-200 active:scale-[0.97] transition-all">
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${from} ${to} flex items-center justify-center`}
                style={{ boxShadow: `0 4px 14px ${glow}` }}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-extrabold text-slate-800 leading-none">{value}</p>
              <p className="text-[11px] text-slate-400 font-medium">{label}</p>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* ── Jars & Cash status ── */}
      {!loading && summary && (
        <motion.div {...fadeUp(0.22)} className="grid grid-cols-2 gap-3">

          {/* Jars with you — click → inventory */}
          <div
            onClick={() => navigate('/staff/inventory')}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-aqua-500 p-4 cursor-pointer active:scale-[0.97] transition-all">
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-white/70" />
              <p className="text-[11px] font-bold text-white/70 uppercase tracking-wide">{t('jars_with_you', lang)}</p>
            </div>
            <p className="text-4xl font-extrabold text-white leading-none">{summary.assigned_jars}</p>
            <p className="text-white/50 text-[11px] mt-2 flex items-center gap-1">
              <Droplets className="w-3 h-3" />
              {summary.empty_collected} {t('empties_back', lang)}
            </p>
          </div>

          {/* Cash in hand — click → deliveries */}
          <div
            onClick={() => navigate('/staff/deliveries')}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 to-orange-400 p-4 cursor-pointer active:scale-[0.97] transition-all">
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
            <div className="flex items-center gap-2 mb-3">
              <IndianRupee className="w-4 h-4 text-white/70" />
              <p className="text-[11px] font-bold text-white/70 uppercase tracking-wide">{t('cash_in_hand', lang)}</p>
            </div>
            <p className="text-3xl font-extrabold text-white leading-none">
              ₹{Number(summary.cash_in_hand).toLocaleString('en-IN')}
            </p>
            <p className="text-white/50 text-[11px] mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {t('pending_submission', lang)}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Pending deliveries ── */}
      <motion.div {...fadeUp(0.32)}>

        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-slate-700">{t('assigned_orders', lang)}</p>
            {!loading && (
              <p className="text-[10px] text-slate-400 mt-0.5">{pending.length} {t('awaiting_delivery', lang)}</p>
            )}
          </div>
          <button onClick={() => navigate('/staff/deliveries')}
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
            {t('view_all', lang)} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[0,1,2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-card p-8 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <p className="text-sm font-bold text-slate-700">{t('all_caught_up', lang)}</p>
            <p className="text-xs text-slate-400 mt-1">{t('no_pending_deliveries', lang)}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pending.slice(0, 5).map((o, i) => (
              <motion.button key={o.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.06 }}
                onClick={() => navigate('/staff/deliveries')}
                className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-card hover:border-brand-200 hover:shadow-md transition-all text-left active:scale-[0.98]">

                {/* Number badge */}
                <div className="w-10 h-10 bg-gradient-to-br from-brand-100 to-aqua-50 rounded-2xl flex items-center justify-center shrink-0">
                  <span className="text-brand-600 font-extrabold text-sm">{i + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{o.customer_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                      <Package className="w-3 h-3" /> {o.quantity} jar{o.quantity > 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-200">·</span>
                    <span className="flex items-center gap-0.5 text-[11px] text-amber-600 font-semibold">
                      <IndianRupee className="w-3 h-3" /> {Number(o.total_amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100">
                    Assigned
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                </div>
              </motion.button>
            ))}

            {pending.length > 5 && (
              <button onClick={() => navigate('/staff/deliveries')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-50 border border-brand-100 text-xs font-bold text-brand-600 hover:bg-brand-100 transition-colors active:scale-[0.98]">
                View {pending.length - 5} more orders
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </motion.div>

      {/* ── QR Code Promo ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-brand-600 to-aqua-500 rounded-3xl p-5 shadow-lg mx-0"
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
