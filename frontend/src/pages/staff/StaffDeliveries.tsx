import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, CheckCircle, X, Package, Phone, User, RefreshCw, Clock, Calendar, CalendarClock, Repeat, Droplets, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { OrderStatusBadge } from '../../components/ui/OrderStatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ordersApi, Order, Delivery, TimelineEntry } from '../../api/orders';
import { useAuth } from '../../context/AuthContext';
import { useSSE } from '../../hooks/useSSE';
import { useLang } from '../../context/LanguageContext';
import { t } from '../../i18n/staff';

type PaymentMode = 'cash' | 'online' | 'pay_later';
type FilterTab = 'pending' | 'completed' | 'daily' | 'preorder';

// Tabs are built dynamically using lang inside the component

export const StaffDeliveries = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { lang } = useLang();
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [step, setStep] = useState<'view' | 'deliver'>('deliver');
  const [submitting, setSubmitting] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [selectedTimeline, setSelectedTimeline] = useState<TimelineEntry[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') as FilterTab | null;
    return tab && ['pending','completed','daily','preorder'].includes(tab) ? tab : 'pending';
  });
  const [deliverySuccess, setDeliverySuccess] = useState<{ orderId: number; customer: string; jars: number; amount: number; mode: string } | null>(null);
  const [search, setSearch] = useState('');

  const [deliveryForm, setDeliveryForm] = useState({
    deliveredQuantity: 0,
    collectedAmount: 0,
    paymentMode: 'cash' as PaymentMode,
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await ordersApi.list(); setOrders(data.orders); }
    catch { toast('Failed to load orders', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  // SSE: auto-refresh when staff gets new assignments or orders change
  useSSE({
    order_assigned:     () => load(),
    order_created:      () => load(),
    order_updated:      () => load(),
    delivery_completed: () => load(),
  });

  const openOrder = (order: Order) => {
    setSelected(order);
    setSelectedDelivery(null);
    setSelectedTimeline([]);
    setDeliveryForm({
      deliveredQuantity: order.quantity,
      collectedAmount:   Boolean(order.paid_online) ? 0 : order.total_amount,
      paymentMode:       Boolean(order.paid_online) ? 'online' : 'cash',
      notes: '',
    });
    setStep('deliver');
  };

  const viewOrder = async (order: Order) => {
    setSelected(order);
    setStep('view');
    try {
      const { data } = await ordersApi.get(order.id);
      setSelectedDelivery(data.delivery || null);
      setSelectedTimeline(data.timeline || []);
    } catch { /* silent */ }
  };

  const handleCompleteDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (deliveryForm.deliveredQuantity < 1) { toast('Delivered quantity must be at least 1', 'error'); return; }
    setSubmitting(true);
    try {
      await ordersApi.completeDelivery({
        orderId: selected.id,
        deliveredQuantity: deliveryForm.deliveredQuantity,
        collectedAmount: deliveryForm.collectedAmount,
        paymentMode: deliveryForm.paymentMode,
        notes: deliveryForm.notes || undefined,
      });
      setDeliverySuccess({
        orderId: selected.id,
        customer: selected.customer_name || 'Customer',
        jars: deliveryForm.deliveredQuantity,
        amount: deliveryForm.collectedAmount,
        mode: deliveryForm.paymentMode,
      });
      setSelected(null);
      await load();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to complete delivery', 'error');
    } finally { setSubmitting(false); }
  };

  const openMaps = (order: Order) => {
    if (order.latitude && order.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`, '_blank');
    } else if (order.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`, '_blank');
    } else {
      toast('No location available for this order', 'warning');
    }
  };

  // Split by filter tab
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

  const pendingOrders   = orders.filter(o => o.status === 'assigned');
  const completedOrders = orders.filter(o => ['completed', 'delivered'].includes(o.status));
  const preOrders       = orders.filter(o =>
    o.status === 'pending' &&
    o.delivery_date &&
    new Date(o.delivery_date).toISOString().split('T')[0] > today
  );

  // Daily orders: monthly/subscription orders for today & tomorrow
  const dailyOrdersToday = orders.filter(o =>
    o.type === 'monthly' &&
    o.delivery_date &&
    new Date(o.delivery_date).toISOString().split('T')[0] === today
  );
  const dailyOrdersTomorrow = orders.filter(o =>
    o.type === 'monthly' &&
    o.delivery_date &&
    new Date(o.delivery_date).toISOString().split('T')[0] === tomorrow
  );

  // Group daily orders by customer
  type CustomerGroup = { customerId: number; name: string; phone?: string; address?: string; orders: Order[] };
  const groupByCustomer = (list: Order[]): CustomerGroup[] => {
    const map = new Map<number, CustomerGroup>();
    for (const o of list) {
      if (!map.has(o.customer_id)) {
        map.set(o.customer_id, { customerId: o.customer_id, name: o.customer_name || 'Customer', phone: o.customer_phone, address: o.address || undefined, orders: [] });
      }
      map.get(o.customer_id)!.orders.push(o);
    }
    return Array.from(map.values());
  };
  const todayGroups = groupByCustomer(dailyOrdersToday);
  const tomorrowGroups = groupByCustomer(dailyOrdersTomorrow);

  // Client-side search filter (name or phone)
  const matchesSearch = (o: Order) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_phone || '').includes(q)
    );
  };

  const visibleOrders = (activeTab === 'pending'
    ? pendingOrders
    : activeTab === 'completed'
    ? completedOrders
    : activeTab === 'preorder'
    ? preOrders
    : []).filter(matchesSearch); // daily tab uses its own render

  const filteredTodayGroups    = todayGroups.filter(g => matchesSearch({ customer_name: g.name, customer_phone: g.phone } as Order));
  const filteredTomorrowGroups = tomorrowGroups.filter(g => matchesSearch({ customer_name: g.name, customer_phone: g.phone } as Order));

  const tabCount: Record<FilterTab, number> = {
    pending:   pendingOrders.length,
    daily:     dailyOrdersToday.length + dailyOrdersTomorrow.length,
    completed: completedOrders.length,
    preorder:  preOrders.length,
  };

  const TABS = [
    { id: 'pending'   as FilterTab, label: t('tab_pending', lang),   icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'daily'     as FilterTab, label: t('tab_daily', lang),     icon: <Repeat className="w-3.5 h-3.5" /> },
    { id: 'completed' as FilterTab, label: t('tab_completed', lang), icon: <CheckCircle className="w-3.5 h-3.5" /> },
    { id: 'preorder'  as FilterTab, label: t('tab_preorder', lang),  icon: <Calendar className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Delivery Success Screen ── */}
      <AnimatePresence>
        {deliverySuccess && (
          <motion.div
            key="delivery-success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-emerald-600 via-green-500 to-teal-500 px-6"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              className="w-full max-w-sm text-center"
            >
              {/* Animated tick circle */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 320, damping: 20 }}
                className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6 shadow-2xl"
              >
                <motion.svg viewBox="0 0 52 52" className="w-12 h-12" initial="hidden" animate="visible">
                  <motion.circle cx="26" cy="26" r="24" fill="none" stroke="white" strokeWidth="2.5"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }} />
                  <motion.path fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                    d="M14 26 l9 9 l15 -16"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }} />
                </motion.svg>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <p className="text-white/80 text-sm font-semibold tracking-wide uppercase mb-1">
                  {lang === 'mr' ? 'डिलिव्हरी पूर्ण! 🎉' : 'Delivery Complete!'}
                </p>
                <h2 className="text-2xl font-extrabold text-white mb-1">{deliverySuccess.customer}</h2>
                <p className="text-white/70 text-sm mb-6">
                  {deliverySuccess.jars} jar{deliverySuccess.jars > 1 ? 's' : ''} · ₹{deliverySuccess.amount} · {deliverySuccess.mode}
                </p>

                <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-2.5 mb-8">
                  <Droplets className="w-4 h-4 text-white/80" />
                  <span className="text-white font-bold text-sm">Order #{deliverySuccess.orderId}</span>
                </div>

                  {lang === 'mr' ? '✅ शाब्बास! पुढील डिलिव्हरीकडे जा.' : '✅ Great work! Move on to the next delivery.'}

                <button
                  onClick={() => { setDeliverySuccess(null); setActiveTab('pending'); }}
                  className="w-full bg-white text-emerald-700 font-bold text-base py-4 rounded-2xl shadow-xl hover:bg-white/90 active:scale-95 transition-all"
                >
                  {lang === 'mr' ? 'डिलिव्हरीकडे परत जा' : 'Back to Deliveries'}
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {lang === 'mr' ? 'माझ्या डिलिव्हरी' : 'My Deliveries'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {pendingOrders.length} {t('tab_pending', lang).toLowerCase()} · {completedOrders.length} {t('tab_completed', lang).toLowerCase()}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
          {t('refresh', lang)}
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all
              ${activeTab === tab.id
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
            {tab.icon}
            {tab.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              {tabCount[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'mr' ? 'नाव किंवा फोन शोधा…' : 'Search by name or phone…'}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : activeTab === 'daily' ? (
        /* ── Daily Orders: grouped by customer ── */
        <div className="space-y-5">
          {filteredTodayGroups.length === 0 && filteredTomorrowGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-10 text-center">
              <Repeat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">
                {lang === 'mr' ? 'कोणतेही दैनंदिन ऑर्डर नाहीत' : 'No daily plan orders'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {lang === 'mr' ? 'मासिक सदस्यता डिलिव्हरी येथे दिसतील.' : 'Monthly subscription deliveries will show here.'}
              </p>
            </div>
          ) : (
            <>
              {/* Today */}
              {filteredTodayGroups.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> {lang === 'mr' ? 'आजच्या योजना डिलिव्हरी' : "Today's Plan Deliveries"}
                  </p>
                  <div className="space-y-3">
                    {filteredTodayGroups.map(g => <DailyCustomerCard key={g.customerId} group={g} onDeliver={openOrder} onNavigate={openMaps} />)}
                  </div>
                </div>
              )}

              {/* Tomorrow */}
              {filteredTomorrowGroups.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Tomorrow's Upcoming
                  </p>
                  <div className="space-y-3">
                    {filteredTomorrowGroups.map(g => <DailyCustomerCard key={g.customerId} group={g} onDeliver={openOrder} onNavigate={openMaps} isTomorrow />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-10 text-center">
          {search.trim() ? (
            <>
              <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">No results for &ldquo;{search}&rdquo;</p>
              <p className="text-xs text-slate-400 mt-1">Try a different name or phone number.</p>
              <button onClick={() => setSearch('')} className="mt-3 text-xs text-brand-600 font-semibold hover:underline">Clear search</button>
            </>
          ) : (
            <>
              {activeTab === 'pending' && <>
                <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">No pending deliveries</p>
                <p className="text-xs text-slate-400 mt-1">New assignments will appear here automatically.</p>
              </>}
              {activeTab === 'completed' && <>
                <CheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">No completed orders yet</p>
                <p className="text-xs text-slate-400 mt-1">Completed deliveries will show here.</p>
              </>}
              {activeTab === 'preorder' && <>
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">No upcoming pre-orders</p>
                <p className="text-xs text-slate-400 mt-1">Future scheduled orders will appear here.</p>
              </>}
            </>
          )}
        </div>
      ) : (() => {
        // ── Group visibleOrders by date ───────────────────────────────────────
        const todayStr  = new Date().toISOString().split('T')[0];
        const yestDate  = new Date(); yestDate.setDate(yestDate.getDate() - 1);
        const yestStr   = yestDate.toISOString().split('T')[0];

        const dateLabel = (iso: string) => {
          const d = iso.split('T')[0];
          if (d === todayStr) return lang === 'mr' ? 'आज' : 'Today';
          if (d === yestStr)  return lang === 'mr' ? 'काल' : 'Yesterday';
          const dt = new Date(iso);
          return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: dt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
        };

        // Build ordered list of [dateKey, orders[]] pairs (most recent first)
        const groups = new Map<string, Order[]>();
        for (const o of visibleOrders) {
          const key = (o.created_at || '').split('T')[0];
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(o);
        }

        return (
          <div className="space-y-1">
            {Array.from(groups.entries()).map(([key, groupOrders]) => (
              <div key={key}>
                {/* ── Date divider ── */}
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                    {dateLabel(key + 'T00:00:00')}
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                {/* ── Orders for this date ── */}
                <div className="space-y-3">
                  {groupOrders.map(o => (
                    <OrderCard key={o.id} order={o}
                      onOpen={['completed','delivered'].includes(o.status) ? viewOrder : openOrder}
                      onNavigate={openMaps}
                      isAssignedToMe={o.staff_id === user?.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Delivery Bottom Sheet ── */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setSelected(null)}>

            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              onClick={e => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 sm:relative sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
                bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md sm:mx-auto shadow-2xl
                max-h-[92vh] flex flex-col">

              {/* ── Drag handle (mobile) ── */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              {/* ── Header ── */}
              <div className={`px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0
                ${selected.staff_id === user?.id ? 'bg-brand-50/50' : 'bg-slate-50/50'}`}>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-slate-400">Order #{selected.id}</span>
                    <OrderStatusBadge status={selected.status} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{selected.customer_name}</h3>
                </div>
                <button onClick={() => setSelected(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

                {/* Order summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[11px] text-slate-400 mb-0.5">Jars</p>
                    <p className="text-xl font-extrabold text-slate-800">{selected.quantity}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[11px] text-slate-400 mb-0.5">Amount</p>
                    <p className="text-xl font-extrabold text-brand-600">₹{selected.total_amount}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[11px] text-slate-400 mb-0.5">Type</p>
                    <p className="text-sm font-bold text-slate-700 capitalize mt-0.5">{selected.type}</p>
                  </div>
                </div>

                {/* Contact & address */}
                <div className="space-y-2">
                  {selected.customer_phone && (
                    <a href={`tel:${selected.customer_phone}`}
                      className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl p-3 active:bg-green-100 transition-colors">
                      <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{selected.customer_phone}</p>
                        <p className="text-[11px] text-slate-400">Tap to call</p>
                      </div>
                    </a>
                  )}
                  {selected.address && (
                    <button onClick={() => openMaps(selected)}
                      className="w-full flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3 active:bg-blue-100 transition-colors text-left">
                      <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
                        <Navigation className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{selected.address}</p>
                        <p className="text-[11px] text-slate-400">Tap to navigate</p>
                      </div>
                    </button>
                  )}
                </div>

                {/* ── Delivery form (for pending/assigned orders) ── */}
                {step === 'deliver' && !['completed', 'delivered'].includes(selected.status) && (
                  <form onSubmit={handleCompleteDelivery} className="space-y-4">

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Delivered Qty</label>
                        <input type="number" inputMode="numeric" min={1} max={selected.quantity}
                          value={deliveryForm.deliveredQuantity}
                          onChange={e => setDeliveryForm(f => ({ ...f, deliveredQuantity: Number(e.target.value) }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-base font-semibold text-center outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Amount (₹)</label>
                        <input type="number" inputMode="decimal" min={0}
                          value={deliveryForm.collectedAmount}
                          disabled={deliveryForm.paymentMode === 'pay_later'}
                          onChange={e => setDeliveryForm(f => ({ ...f, collectedAmount: Number(e.target.value) }))}
                          className={`w-full border rounded-xl px-3 py-3 text-base font-semibold text-center outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all
                            ${deliveryForm.paymentMode === 'pay_later'
                              ? 'bg-amber-50 border-amber-200 text-amber-500 cursor-not-allowed'
                              : 'bg-slate-50 border-slate-200'}`} />
                      </div>
                    </div>

                    {/* Payment mode — hidden for pre-paid online orders */}
                    {Boolean(selected.paid_online) ? (
                      <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-green-700">Paid Online</p>
                          <p className="text-[11px] text-green-500">Customer already paid via Razorpay</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Payment Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['cash', 'online', 'pay_later'] as PaymentMode[]).map(m => (
                            <button key={m} type="button"
                              onClick={() => setDeliveryForm(f => ({
                                ...f,
                                paymentMode: m,
                                collectedAmount: m === 'pay_later' ? 0 : f.collectedAmount,
                              }))}
                              className={`py-2.5 rounded-xl text-xs font-semibold border transition-all
                                ${deliveryForm.paymentMode === m
                                  ? m === 'pay_later'
                                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                    : 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 active:bg-slate-50'}`}>
                              {m === 'cash' ? '💵 Cash' : m === 'online' ? '💳 Online' : '⏳ Pay Later'}
                            </button>
                          ))}
                        </div>
                        {deliveryForm.paymentMode === 'pay_later' && (
                          <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                            ⚠️ Amount will be added to customer's pending balance
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                      <textarea value={deliveryForm.notes}
                        onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Any delivery notes..."
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none" />
                    </div>

                    <Button type="submit" loading={submitting} size="lg" className="w-full !py-3.5 !text-base"
                      icon={<CheckCircle className="w-5 h-5" />}>
                      Complete Delivery
                    </Button>
                  </form>
                )}

                {/* ── Completed order details ── */}
                {['completed', 'delivered'].includes(selected.status) && (
                  <div className="space-y-3">
                    {/* Delivery info card */}
                    {selectedDelivery ? (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Delivery Details</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white rounded-xl p-3 text-center">
                            <p className="text-[10px] text-slate-400 mb-0.5">Delivered</p>
                            <p className="text-lg font-extrabold text-emerald-700">{selectedDelivery.delivered_quantity} jars</p>
                          </div>
                          <div className="bg-white rounded-xl p-3 text-center">
                            <p className="text-[10px] text-slate-400 mb-0.5">Collected</p>
                            <p className="text-lg font-extrabold text-brand-600">₹{selectedDelivery.collected_amount}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[10px] text-slate-400 mb-0.5">Payment</p>
                            <p className="text-sm font-bold text-slate-700 capitalize">{selectedDelivery.payment_mode}</p>
                          </div>
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[10px] text-slate-400 mb-0.5">Delivered At</p>
                            <p className="text-sm font-bold text-slate-700">
                              {selectedDelivery.delivered_at
                                ? new Date(selectedDelivery.delivered_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
                                : new Date(selectedDelivery.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                            </p>
                          </div>
                        </div>

                        {selectedDelivery.notes && (
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[10px] text-slate-400 mb-0.5">Notes</p>
                            <p className="text-xs text-slate-600">{selectedDelivery.notes}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50 rounded-xl p-4 text-center">
                        <p className="text-xs text-slate-400">Loading delivery details...</p>
                      </div>
                    )}

                    {/* Timeline */}
                    {selectedTimeline.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Timeline</p>
                        <div className="space-y-0">
                          {selectedTimeline.map((t, i) => (
                            <div key={t.id} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                                  i === 0 ? 'bg-emerald-500' : 'bg-slate-300'
                                }`} />
                                {i < selectedTimeline.length - 1 && (
                                  <div className="w-px flex-1 bg-slate-200 my-1 min-h-[16px]" />
                                )}
                              </div>
                              <div className="flex-1 pb-2.5">
                                <p className="text-xs font-bold text-slate-700 capitalize">{t.status.replace(/_/g, ' ')}</p>
                                {t.note && <p className="text-[11px] text-slate-500">{t.note}</p>}
                                <p className="text-[10px] text-slate-300 mt-0.5">
                                  {new Date(t.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


const OrderCard = ({ order, onOpen, onNavigate, isAssignedToMe }: {
  order: Order;
  onOpen: (o: Order) => void;
  onNavigate: (o: Order) => void;
  isAssignedToMe: boolean;
}) => {
  const isDone = ['completed', 'delivered'].includes(order.status);
  const isCancelled = order.status === 'cancelled';
  const isFuture = order.status === 'pending' && !!order.delivery_date;
  const isMonthly = order.type === 'monthly';

  // Parse slot label from notes like "[Morning] Auto-generated from subscription #5"
  const slotMatch = order.notes?.match(/^\[(\w+)\]/);
  const slotLabel = slotMatch ? slotMatch[1] : null;

  // Delivery time from delivery_date
  const deliveryTime = order.delivery_date
    ? new Date(order.delivery_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl border shadow-card p-4 transition-all
        ${isCancelled ? 'opacity-50 border-dashed border-slate-200 blur-[0.2px]'
          : isDone ? 'border-green-100 opacity-80' : isMonthly ? 'border-purple-100 ring-1 ring-purple-100' : isAssignedToMe ? 'border-brand-100 ring-1 ring-brand-100' : 'border-slate-100'}`}>

      {/* Cancelled tag */}
      {isCancelled && (
        <div className="mb-2 flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-xl px-2.5 py-1">
          <span className="text-[10px]">❌</span>
          <span className="text-[10px] font-bold text-red-500">Order Cancelled</span>
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-slate-400">#{order.id}</span>
            <OrderStatusBadge status={order.status} />
            {isAssignedToMe && !isDone && !isCancelled && (
              <span className="text-[9px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Yours
              </span>
            )}
            {isMonthly && (
              <span className="text-[9px] font-bold bg-purple-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-0.5">
                <Repeat className="w-2.5 h-2.5" />
                Plan
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-800">{order.customer_name}</p>

          {/* Delivery time — all pending orders */}
          {!isDone && !isCancelled && deliveryTime && (
            <div className="flex items-center gap-1.5 mt-1">
              {isMonthly ? (
                <>
                  <CalendarClock className="w-3 h-3 text-purple-500 shrink-0" />
                  <span className="text-[11px] font-semibold text-purple-600">
                    {slotLabel && `${slotLabel} · `}{deliveryTime}
                  </span>
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-[11px] font-semibold text-amber-600">
                    Expected: {deliveryTime}
                  </span>
                </>
              )}
            </div>
          )}

          {order.staff_name && !isAssignedToMe && (
            <p className="text-[11px] text-slate-400 mt-0.5">→ {order.staff_name}</p>
          )}
          {isFuture && order.delivery_date && (
            <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
              📅 Scheduled: {new Date(order.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
          {order.address && (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />{order.address}
            </p>
          )}
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-base font-bold text-brand-600">₹{order.total_amount}</p>
          <p className="text-xs text-slate-400">{order.quantity} jars</p>
        </div>
      </div>
      {!isCancelled && (
        <div className="flex gap-2">
          {!isDone && (
            <Button variant={isAssignedToMe ? 'primary' : 'secondary'} size="sm" className="flex-1"
              onClick={() => onOpen(order)}>
              {order.status === 'assigned' ? 'Deliver' : 'Open'}
            </Button>
          )}
          {isDone && (
            <Button variant="secondary" size="sm" className="flex-1"
              onClick={() => onOpen(order)}>
              View Details
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<Navigation className="w-3.5 h-3.5" />}
            onClick={() => onNavigate(order)} className="text-brand-600 hover:bg-brand-50">
            Navigate
          </Button>
        </div>
      )}
    </motion.div>
  );
};


// ── Daily Customer Card: groups a customer's plan orders with progress ────────
const DailyCustomerCard = ({ group, onDeliver, onNavigate, isTomorrow }: {
  group: { customerId: number; name: string; phone?: string; address?: string; orders: Order[] };
  onDeliver: (o: Order) => void;
  onNavigate: (o: Order) => void;
  isTomorrow?: boolean;
}) => {
  const { orders } = group;
  const delivered = orders.filter(o => ['completed', 'delivered'].includes(o.status));
  const pending   = orders.filter(o => !['completed', 'delivered', 'cancelled'].includes(o.status));
  const totalJars = orders.reduce((s, o) => s + o.quantity, 0);
  const deliveredJars = delivered.reduce((s, o) => s + o.quantity, 0);
  const progress = totalJars > 0 ? (deliveredJars / totalJars) * 100 : 0;

  // Sort by delivery time
  const sorted = [...orders].sort((a, b) => {
    const ta = a.delivery_date ? new Date(a.delivery_date).getTime() : 0;
    const tb = b.delivery_date ? new Date(b.delivery_date).getTime() : 0;
    return ta - tb;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-purple-100 shadow-card overflow-hidden">

      {/* Customer header */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{group.name}</p>
            {group.phone && (
              <a href={`tel:${group.phone}`} className="text-[11px] text-purple-500 font-semibold hover:underline">
                {group.phone}
              </a>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-extrabold text-purple-700">{deliveredJars}/{totalJars}</p>
          <p className="text-[10px] text-purple-400 font-semibold">jars done</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-2 pb-1">
        <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
          />
        </div>
      </div>

      {/* Slot rows */}
      <div className="px-4 py-2 space-y-1.5">
        {sorted.map(o => {
          const isDone = ['completed', 'delivered'].includes(o.status);
          const slotMatch = o.notes?.match(/^\[(\w+)\]/);
          const slotLabel = slotMatch ? slotMatch[1] : o.type;
          const time = o.delivery_date
            ? new Date(o.delivery_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
            : '';

          return (
            <div key={o.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all
                ${isDone ? 'bg-emerald-50/60' : 'bg-slate-50 hover:bg-purple-50'}`}>
              {/* Status icon */}
              {isDone ? (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-purple-300 flex items-center justify-center shrink-0">
                  <Clock className="w-3 h-3 text-purple-400" />
                </div>
              )}

              {/* Slot info */}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${isDone ? 'text-emerald-700 line-through' : 'text-slate-700'}`}>
                  {slotLabel} — {o.quantity} jar{o.quantity > 1 ? 's' : ''}
                </p>
                <p className={`text-[10px] ${isDone ? 'text-emerald-500' : 'text-purple-500'}`}>
                  {isDone ? '✓ Delivered' : `⏰ ${time}`}
                </p>
              </div>

              {/* Amount */}
              <span className={`text-xs font-bold shrink-0 ${isDone ? 'text-emerald-600' : 'text-slate-500'}`}>
                ₹{o.total_amount}
              </span>

              {/* Deliver button for pending */}
              {!isDone && !isTomorrow && (
                <button onClick={() => onDeliver(o)}
                  className="text-[10px] font-bold bg-purple-600 text-white px-2.5 py-1 rounded-lg hover:bg-purple-700 active:scale-95 transition-all shrink-0">
                  Deliver
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Address + navigate */}
      {group.address && (
        <div className="px-4 pb-3">
          <button onClick={() => onNavigate(orders[0])}
            className="w-full flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-left active:bg-blue-100 transition-colors">
            <Navigation className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-xs text-slate-600 truncate flex-1">{group.address}</span>
            <span className="text-[10px] font-semibold text-blue-500 shrink-0">Navigate</span>
          </button>
        </div>
      )}
    </motion.div>
  );
};
