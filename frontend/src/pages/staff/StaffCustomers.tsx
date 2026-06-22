import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  Search, Users, Phone, MapPin, RefreshCw,
  Package, IndianRupee, CheckCircle2, X,
  Droplets, Clock, Navigation,
  ChevronRight, Eye, CalendarDays, ChevronLeft,
  GripVertical, ListOrdered, RotateCcw,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { Avatar } from '../../components/ui/Avatar';
import { ordersApi, staffApi, CustomerForStaff } from '../../api/orders';
import { useLang } from '../../context/LanguageContext';
import { t } from '../../i18n/staff';
import { customerOrderApi, applyOrder } from '../../api/customerOrder';

type PaymentMode = 'cash' | 'online' | 'pay_later';

const MODE_OPTIONS: { id: PaymentMode; label: string; color: string; bg: string }[] = [
  { id: 'cash',      label: '💵 Cash',      color: 'text-green-700',  bg: 'bg-green-50 border-green-300' },
  { id: 'online',    label: '📱 Online',    color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300' },
  { id: 'pay_later', label: '⏳ Pay Later', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-300' },
];

// ── Period helpers ─────────────────────────────────────────────────────────────
type Period = 'morning' | 'afternoon' | 'evening';
const PERIOD_META: Record<Period, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  morning:   { label: 'Morning',   emoji: '🌅', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  afternoon: { label: 'Afternoon', emoji: '☀️',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  evening:   { label: 'Evening',   emoji: '🌆', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

// ── Calendar Modal ──────────────────────────────────────────────────────────
const CalendarModal = ({ customer, onClose }: { customer: CustomerForStaff; onClose: () => void }) => {
  const today = new Date();
  const [month, setMonth] = useState(today.toISOString().slice(0, 7));
  const [calendar, setCalendar] = useState<{ day: number; jars: number }[]>([]);
  const [totalJars, setTotalJars] = useState(0);
  const [loading, setLoading] = useState(true);

  // Day detail state
  type DayDelivery = { id: number; jars: number; time: string; period: string; staff_name: string };
  const [selectedDay, setSelectedDay] = useState<{ day: number; dateStr: string } | null>(null);
  const [dayDeliveries, setDayDeliveries] = useState<DayDelivery[]>([]);
  const [dayTotal, setDayTotal] = useState(0);
  const [dayLoading, setDayLoading] = useState(false);

  const loadCalendar = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const { data } = await staffApi.getCustomerCalendar(customer.id, m);
      setCalendar(data.calendar);
      setTotalJars(data.totalJars);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [customer.id]);

  useEffect(() => { loadCalendar(month); }, [month, loadCalendar]);

  const changeMonth = (delta: number) => {
    setSelectedDay(null);
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  const dayLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handleDayClick = async (cell: { day: number; jars: number }) => {
    if (cell.jars === 0) return; // non-delivery day — ignore
    const dateStr = `${month}-${String(cell.day).padStart(2, '0')}`;
    setSelectedDay({ day: cell.day, dateStr });
    setDayLoading(true);
    try {
      const { data } = await staffApi.getDayDeliveries(customer.id, dateStr);
      setDayDeliveries(data.deliveries);
      setDayTotal(data.totalJars);
    } catch { setDayDeliveries([]); setDayTotal(0); }
    finally { setDayLoading(false); }
  };

  // Build weeks grid
  const firstDay = (() => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).getDay(); })();
  const weeks: ({ day: number; jars: number } | null)[][] = [];
  let week: ({ day: number; jars: number } | null)[] = Array(firstDay).fill(null);
  for (const cell of calendar) {
    week.push(cell);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] sm:inset-x-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:max-w-sm sm:mx-auto overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-aqua-500 px-5 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedDay && (
                <button onClick={() => setSelectedDay(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 text-white mr-1">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div>
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">
                  {selectedDay ? 'Day Detail' : 'Delivery Calendar'}
                </p>
                <p className="text-white font-extrabold text-base">
                  {selectedDay ? dayLabel(selectedDay.dateStr) : customer.name}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white active:bg-white/30 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── CALENDAR VIEW ── */}
        <AnimatePresence mode="wait">
          {!selectedDay ? (
            <motion.div key="calendar" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 overflow-hidden">
              {/* Month nav */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                <button onClick={() => changeMonth(-1)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <p className="text-sm font-bold text-slate-800">{monthLabel(month)}</p>
                <button onClick={() => changeMonth(1)}
                  disabled={month >= today.toISOString().slice(0, 7)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-30">
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              {/* Calendar grid */}
              <div className="overflow-y-auto flex-1 px-4 pb-5 pt-3">
                <div className="grid grid-cols-7 mb-2">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <p key={d} className="text-center text-[11px] font-bold text-slate-400 pb-1">{d}</p>
                  ))}
                </div>

                {loading ? (
                  <div className="space-y-1.5">
                    {[0,1,2,3,4].map(ri => (
                      <div key={ri} className="grid grid-cols-7 gap-1.5">
                        {[0,1,2,3,4,5,6].map(ci => <div key={ci} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {weeks.map((wk, wi) => (
                      <div key={wi} className="grid grid-cols-7 gap-1.5">
                        {wk.map((cell, di) => {
                          if (!cell) return <div key={di} className="h-12" />;
                          const hasDelivery = cell.jars > 0;
                          return (
                            <button key={di}
                              onClick={() => handleDayClick(cell)}
                              disabled={!hasDelivery}
                              className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all ${
                                hasDelivery
                                  ? 'bg-green-50 border-green-200 active:scale-95 cursor-pointer hover:bg-green-100 hover:border-green-300'
                                  : 'bg-slate-50 border-slate-200 cursor-default'
                              }`}
                            >
                              <p className={`text-[11px] font-bold leading-none ${hasDelivery ? 'text-green-700' : 'text-slate-400'}`}>
                                {cell.day}
                              </p>
                              <p className={`text-sm font-extrabold leading-none ${hasDelivery ? 'text-green-800' : 'text-slate-300'}`}>
                                {hasDelivery ? cell.jars : '·'}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Total bar */}
                <div className="mt-4 flex items-center justify-between bg-brand-50 border border-brand-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-brand-500" />
                    <span className="text-sm font-semibold text-slate-700">Total this month</span>
                  </div>
                  <span className="text-sm font-extrabold text-brand-700">{totalJars} jar{totalJars !== 1 ? 's' : ''}</span>
                </div>

                <p className="text-center text-[10px] text-slate-400 mt-2">Tap a green day to see delivery details</p>
              </div>
            </motion.div>
          ) : (
            /* ── DAY DETAIL VIEW ── */
            <motion.div key="daydetail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 px-4 pb-5 pt-4 space-y-3">

                {dayLoading ? (
                  <div className="space-y-3">
                    {[0,1,2].map(i => (
                      <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                ) : dayDeliveries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <CalendarDays className="w-10 h-10 text-slate-200" />
                    <p className="text-sm text-slate-400">No delivery records for this day</p>
                  </div>
                ) : (
                  <>
                    {dayDeliveries.map((d, i) => {
                      const p = PERIOD_META[d.period as Period] || PERIOD_META.morning;
                      return (
                        <motion.div key={d.id}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`rounded-2xl border px-4 py-3.5 ${p.bg} ${p.border}`}>
                          <div className="flex items-center justify-between">
                            {/* Period badge */}
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{p.emoji}</span>
                              <div>
                                <p className={`text-xs font-bold ${p.text}`}>{p.label}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{d.time}</p>
                              </div>
                            </div>
                            {/* Jar count */}
                            <div className="flex items-center gap-1.5 bg-white/70 rounded-xl px-3 py-1.5 border border-white">
                              <Droplets className="w-3.5 h-3.5 text-brand-500" />
                              <span className="text-sm font-extrabold text-slate-800">{d.jars} jar{d.jars !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          {/* Staff */}
                          <div className="mt-2 pt-2 border-t border-white/60 flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">Delivered by</span>
                            <span className="text-[11px] font-semibold text-slate-600">{d.staff_name}</span>
                          </div>
                        </motion.div>
                      );
                    })}

                    {/* Day total */}
                    <div className="flex items-center justify-between bg-brand-50 border border-brand-100 rounded-2xl px-4 py-3 mt-1">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-brand-500" />
                        <span className="text-sm font-semibold text-slate-700">Total for the day</span>
                      </div>
                      <span className="text-sm font-extrabold text-brand-700">{dayTotal} jar{dayTotal !== 1 ? 's' : ''}</span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};

// ── Navigate to customer address ───────────────────────────────────────────────
const openMaps = (c: CustomerForStaff, e: React.MouseEvent) => {
  e.stopPropagation(); // don't open profile sheet
  const query = c.address
    ? encodeURIComponent(c.address)
    : encodeURIComponent(c.name);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
};

// ── Call phone helper ─────────────────────────────────────────────────────────
const CallPhone = ({ phone }: { phone: string }) => (
  <a
    href={`tel:${phone}`}
    onClick={e => e.stopPropagation()}
    className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-xl hover:bg-brand-100 active:scale-95 transition-all"
  >
    <Phone className="w-3.5 h-3.5" />
    {phone}
  </a>
);

// ── Success flash card ─────────────────────────────────────────────────────────
const SuccessCard = ({
  data, onClose,
}: {
  data: { customer: string; quantity: number; amount: number; mode: string; orderId: number };
  onClose: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9, y: 30 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.9, y: 30 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
    onClick={onClose}
  >
    <div className="bg-white rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <h3 className="text-xl font-extrabold text-slate-900 mb-1">Delivered! 🎉</h3>
      <p className="text-slate-500 text-sm mb-5">
        {data.quantity} jar{data.quantity > 1 ? 's' : ''} delivered to <span className="font-bold text-slate-800">{data.customer}</span>
      </p>
      <div className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-2 text-left">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Amount</span>
          <span className="font-bold text-slate-800">
            {data.mode === 'pay_later' ? 'Pending' : `₹${data.amount}`}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Mode</span>
          <span className="font-semibold capitalize text-slate-700">
            {data.mode === 'pay_later' ? 'Pay Later' : data.mode}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Order #</span>
          <span className="font-semibold text-brand-600">{data.orderId}</span>
        </div>
      </div>
      <Button className="w-full" onClick={onClose}>Done</Button>
    </div>
  </motion.div>
);

// ── Delivery Bottom Sheet ──────────────────────────────────────────────────────
const DeliverySheet = ({
  customer, onClose, onSuccess,
}: {
  customer: CustomerForStaff;
  onClose: () => void;
  onSuccess: (data: { customer: string; quantity: number; amount: number; mode: string; orderId: number }) => void;
}) => {
  const { toast } = useToast();
  const { lang }  = useLang();
  const jarRate = Number(customer.jar_rate) || 50;
  const [quantity, setQuantity]     = useState(1);
  const [mode, setMode]             = useState<PaymentMode>('pay_later');
  const [amount, setAmount]         = useState(jarRate);
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateQty = (q: number) => {
    const safeQ = Math.max(1, q);
    setQuantity(safeQ);
    if (mode !== 'pay_later') setAmount(safeQ * jarRate);
    else setAmount(0);
  };
  const updateMode = (m: PaymentMode) => {
    setMode(m);
    if (m === 'pay_later') setAmount(0);
    else setAmount(quantity * jarRate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity < 1) { toast('Quantity must be at least 1', 'error'); return; }
    setSubmitting(true);
    try {
      const { data } = await ordersApi.staffDirectDelivery({
        customerId: customer.id,
        quantity,
        paymentMode: mode,
        collectedAmount: mode === 'pay_later' ? 0 : amount,
        notes: notes || undefined,
      });
      onSuccess({ customer: data.customer, quantity: data.quantity, amount: data.amount, mode: data.mode, orderId: data.orderId });
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to record delivery', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Avatar name={customer.name} photo={customer.profile_photo} size="sm" className="w-11 h-11" />
            <div>
              <p className="font-bold text-slate-900">{customer.name}</p>
              <p className="text-xs text-slate-400">{customer.phone} · ₹{jarRate}/jar</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Quantity */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">{t('jars_delivered', lang)}</label>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => updateQty(quantity - 1)}
                className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 text-xl font-bold flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all">−</button>
              <div className="flex-1 text-center">
                <p className="text-4xl font-extrabold text-slate-900">{quantity}</p>
                <p className="text-xs text-slate-400 mt-0.5">{quantity === 1 ? '1 jar' : `${quantity} jars`} · ₹{quantity * jarRate}</p>
              </div>
              <button type="button" onClick={() => updateQty(quantity + 1)}
                className="w-11 h-11 rounded-2xl bg-brand-600 text-white text-xl font-bold flex items-center justify-center hover:bg-brand-700 active:scale-95 transition-all shadow-sm">+</button>
            </div>
          </div>

          {/* Payment mode */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">{t('payment_mode', lang)}</label>
            <div className="grid grid-cols-3 gap-2">
              {MODE_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => updateMode(opt.id)}
                  className={`py-2.5 px-2 rounded-2xl border-2 text-xs font-bold transition-all text-center
                    ${mode === opt.id ? `${opt.bg} ${opt.color} shadow-sm` : 'bg-white border-slate-200 text-slate-500'}`}>
                  {opt.id === 'cash' ? t('cash', lang) : opt.id === 'online' ? t('online', lang) : t('pay_later', lang)}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          {mode !== 'pay_later' ? (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">{t('amount_collected', lang)}</label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                <IndianRupee className="w-4 h-4 text-slate-400 shrink-0" />
                <input type="number" min={0} step={0.5} value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="flex-1 bg-transparent text-base font-bold text-slate-800 outline-none" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Auto-filled: ₹{quantity} × ₹{jarRate} = ₹{quantity * jarRate}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-800">{t('pay_later_selected', lang)}</p>
                <p className="text-xs text-amber-600">₹{quantity * jarRate} {t('pay_later_note', lang)}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">{t('notes_optional', lang)}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={t('notes_ph', lang)}
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none placeholder-slate-400" />
          </div>

          <Button type="submit" loading={submitting} size="lg" className="w-full" icon={<Droplets className="w-4 h-4" />}>
            {t('mark_delivered', lang)} · {quantity} {lang === 'mr' ? 'जार' : `Jar${quantity > 1 ? 's' : ''}`}
          </Button>
        </form>
      </motion.div>
    </>
  );
};

// ── Customer Profile Sheet ─────────────────────────────────────────────────────
const ProfileSheet = ({
  customer, onClose, onDeliver, onCalendar,
}: {
  customer: CustomerForStaff;
  onClose: () => void;
  onDeliver: () => void;
  onCalendar: () => void;
}) => {
  const { lang } = useLang();
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Close + Calendar */}
        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('customer_profile', lang)}</p>
          <div className="flex items-center gap-2">
            <button onClick={onCalendar}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
              title="View delivery calendar">
              <Eye className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 pb-5 pt-2 border-b border-slate-100">
            <Avatar name={customer.name} photo={customer.profile_photo} size="xl" />
          <h3 className="text-xl font-extrabold text-slate-900">{customer.name}</h3>

          {/* Callable phone */}
          <div className="mt-2">
            <CallPhone phone={customer.phone} />
          </div>
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-3">

          {/* Jar rate */}
          <div className="flex items-center justify-between bg-brand-50 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-semibold text-brand-800">{t('jar_rate', lang)}</span>
            </div>
            <span className="text-sm font-extrabold text-brand-700">₹{customer.jar_rate}{t('per_jar', lang)}</span>
          </div>

          {/* Today's delivered jars */}
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
            Number(customer.today_jars) > 0 ? 'bg-green-50' : 'bg-slate-50'
          }`}>
            <div className="flex items-center gap-2">
              <Droplets className={`w-4 h-4 ${Number(customer.today_jars) > 0 ? 'text-green-600' : 'text-slate-400'}`} />
              <span className={`text-sm font-semibold ${Number(customer.today_jars) > 0 ? 'text-green-800' : 'text-slate-500'}`}>
                Jars Delivered Today
              </span>
            </div>
            <span className={`text-sm font-extrabold ${Number(customer.today_jars) > 0 ? 'text-green-700' : 'text-slate-400'}`}>
              {Number(customer.today_jars)} jar{Number(customer.today_jars) !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Address + Navigate */}
          {customer.address && (
            <div className="bg-slate-50 rounded-2xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    {customer.address_label && (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{customer.address_label}</p>
                    )}
                    <p className="text-sm text-slate-700 font-medium">{customer.address}</p>
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customer.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-aqua-500 px-3 py-2 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Navigate
                </a>
              </div>
            </div>
          )}

          {/* No address — just a navigate by name button */}
          {!customer.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 active:scale-95 transition-all"
            >
              <Navigation className="w-4 h-4" />
              Open in Maps
            </a>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-6 pt-1">
          <Button size="lg" className="w-full" icon={<Droplets className="w-4 h-4" />} onClick={onDeliver}>
            {t('deliver_jars', lang)}
          </Button>
        </div>
      </motion.div>
    </>
  );
};

// ── Animated drag item for staff reorder mode ───────────────────────────────────
const DraggableStaffCustomerItem = ({
  item, index, total, onMove,
}: {
  item: CustomerForStaff;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="relative"
      style={{ listStyle: 'none' }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{
        scale: 1.03,
        boxShadow: '0 16px 40px -8px rgba(0,0,0,0.18)',
        zIndex: 50,
        borderColor: 'rgb(99 102 241)',
      }}
    >
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3 py-3 select-none">
        <span className="w-6 text-center text-xs font-bold text-slate-400 shrink-0">{index + 1}</span>
        <GripVertical
          className="w-5 h-5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={e => controls.start(e)}
        />
        <Avatar name={item.name} photo={item.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
          <p className="text-xs text-slate-400">{item.phone}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onMove(index, Math.max(0, index - 1))} disabled={index === 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V4M4 8l4-4 4 4" /></svg>
          </button>
          <button onClick={() => onMove(index, Math.min(total - 1, index + 1))} disabled={index === total - 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v8M4 8l4 4 4-4" /></svg>
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export const StaffCustomers = () => {
  const { toast } = useToast();
  const { lang }  = useLang();
  const [customers, setCustomers]   = useState<CustomerForStaff[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [profiled, setProfiled]     = useState<CustomerForStaff | null>(null);
  const [selected, setSelected]     = useState<CustomerForStaff | null>(null);
  const [successData, setSuccessData] = useState<{
    customer: string; quantity: number; amount: number; mode: string; orderId: number;
  } | null>(null);
  const [calendarCustomer, setCalendarCustomer] = useState<CustomerForStaff | null>(null);

  // Rearrange mode
  const [reorderMode,   setReorderMode]   = useState(false);
  const [reorderedList, setReorderedList] = useState<CustomerForStaff[]>([]);
  const [savingOrder,   setSavingOrder]   = useState(false);
  const [orderSource,   setOrderSource]   = useState<'staff' | 'admin'>('admin');

  const load = useCallback(async () => {

    setLoading(true);
    try {
      const [{ data }, orderRes] = await Promise.all([
        staffApi.getCustomersList(),
        customerOrderApi.getStaff().catch(() => ({ data: { ordered_ids: [], source: 'admin' as const } })),
      ]);
      const orderedCustomers = applyOrder(data.customers, orderRes.data.ordered_ids ?? []);
      setCustomers(orderedCustomers);
      setReorderedList(orderedCustomers);
      setOrderSource(orderRes.data.source ?? 'admin');
    } catch {
      toast('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Drag helpers
  const moveItem = useCallback((from: number, to: number) => {
    if (from === to) return;
    setReorderedList(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await customerOrderApi.saveStaff(reorderedList.map(c => c.id));
      setCustomers(reorderedList);
      setOrderSource('staff');
      setReorderMode(false);
      toast('Your delivery order saved!', 'success');
    } catch { toast('Failed to save order', 'error'); }
    finally { setSavingOrder(false); }
  };

  const resetToAdmin = async () => {
    setSavingOrder(true);
    try {
      await customerOrderApi.resetStaff();
      setOrderSource('admin');
      toast('Reset to admin order', 'success');
      await load();
      setReorderMode(false);
    } catch { toast('Failed to reset', 'error'); }
    finally { setSavingOrder(false); }
  };

  const cancelReorder = () => {
    setReorderedList([...customers]);
    setReorderMode(false);
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const handleSuccess = (data: typeof successData) => {
    setSelected(null);
    setProfiled(null);
    setSuccessData(data);
    load();
  };

  return (
    <div className="max-w-xl space-y-4">

      {/* Search + Refresh + Reorder */}
      {!reorderMode && (
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('search', lang)}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
            {t('refresh', lang)}
          </Button>
          <button
            onClick={() => { setReorderedList([...customers]); setReorderMode(true); }}
            title="Reorder customers"
            className="flex items-center justify-center w-10 h-10 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50 active:scale-95 transition-all shadow-sm shrink-0"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── REORDER MODE ─── */}
      {reorderMode && (
        <div className="space-y-2">
          {/* Banner */}
          <div className="flex items-center justify-between bg-brand-600 text-white rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-bold">Rearrange Delivery Order</p>
              <p className="text-xs opacity-70 mt-0.5">
                {orderSource === 'staff' ? 'Your personal order' : "Using admin's default order"}
              </p>
            </div>
            <div className="flex gap-2">
              {orderSource === 'staff' && (
                <button onClick={resetToAdmin} disabled={savingOrder}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-xl transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
              <button onClick={cancelReorder}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>

          {/* Animated drag list */}
          <Reorder.Group
            axis="y"
            values={reorderedList}
            onReorder={setReorderedList}
            className="space-y-2 outline-none"
          >
            {reorderedList.map((c, i) => (
              <DraggableStaffCustomerItem
                key={c.id}
                item={c}
                index={i}
                total={reorderedList.length}
                onMove={moveItem}
              />
            ))}
          </Reorder.Group>

          {/* Save bar */}
          <div className="flex gap-2 pt-1">
            <button onClick={cancelReorder}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-2xl transition-colors">
              Cancel
            </button>
            <button onClick={saveOrder} disabled={savingOrder}
              className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-2xl transition-colors disabled:opacity-60">
              {savingOrder ? 'Saving…' : '💾 Save My Order'}
            </button>
          </div>
        </div>
      )}

      {/* ─── NORMAL MODE ─── */}
      {!reorderMode && (
        <>
      {/* Count */}
      {!loading && (
        <p className="text-xs text-slate-400 font-medium">
          <span className="font-bold text-slate-700">{filtered.length}</span> customer{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">{t('no_customers', lang)}</p>
          {search && <p className="text-xs text-slate-400 mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c, i) => (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm"
            >
              {/* Main row — click to open profile */}
              <div
                onClick={() => setProfiled(c)}
                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors rounded-2xl"
              >
                {/* Avatar */}
                <Avatar name={c.name} photo={c.profile_photo} size="md" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </span>
                    {c.address && (
                      <span className="flex items-center gap-1 text-xs text-slate-400 truncate max-w-[130px]">
                        <MapPin className="w-3 h-3 shrink-0" /> {c.address_label || c.address}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                      <Package className="w-2.5 h-2.5" /> ₹{c.jar_rate}/jar
                    </span>
                    {Number(c.today_jars) > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                        <Droplets className="w-2.5 h-2.5" /> {Number(c.today_jars)} today
                      </span>
                    )}
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {c.address && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all"
                      title="Navigate"
                    >
                      <Navigation className="w-4 h-4" />
                    </a>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Profile sheet */}
      <AnimatePresence>
        {profiled && !selected && (
          <ProfileSheet
            key={`profile-${profiled.id}`}
            customer={profiled}
            onClose={() => setProfiled(null)}
            onDeliver={() => setSelected(profiled)}
            onCalendar={() => { setCalendarCustomer(profiled); }}
          />
        )}
      </AnimatePresence>

      {/* Delivery bottom sheet */}
      <AnimatePresence>
        {selected && (
          <DeliverySheet
            key={`deliver-${selected.id}`}
            customer={selected}
            onClose={() => { setSelected(null); }}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>

      {/* Success card */}
      <AnimatePresence>
        {successData && (
          <SuccessCard data={successData} onClose={() => setSuccessData(null)} />
        )}
      </AnimatePresence>

      {/* Calendar modal */}
      <AnimatePresence>
        {calendarCustomer && (
          <CalendarModal
            key={`cal-${calendarCustomer.id}`}
            customer={calendarCustomer}
            onClose={() => setCalendarCustomer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
