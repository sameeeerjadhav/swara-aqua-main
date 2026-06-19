import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Users, Phone, MapPin, RefreshCw,
  Package, IndianRupee, CheckCircle2, X,
  Droplets, Clock, Navigation,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ordersApi, staffApi, CustomerForStaff } from '../../api/orders';
import { useLang } from '../../context/LanguageContext';
import { t } from '../../i18n/staff';

type PaymentMode = 'cash' | 'online' | 'pay_later';

const MODE_OPTIONS: { id: PaymentMode; label: string; color: string; bg: string }[] = [
  { id: 'cash',      label: '💵 Cash',      color: 'text-green-700',  bg: 'bg-green-50 border-green-300' },
  { id: 'online',    label: '📱 Online',    color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300' },
  { id: 'pay_later', label: '⏳ Pay Later', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-300' },
];

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
  const [mode, setMode]             = useState<PaymentMode>('cash');
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
            <div className="w-11 h-11 bg-gradient-to-br from-brand-500 to-aqua-400 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
              {customer.name.charAt(0).toUpperCase()}
            </div>
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
  customer, onClose, onDeliver,
}: {
  customer: CustomerForStaff;
  onClose: () => void;
  onDeliver: () => void;
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

        {/* Close */}
        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('customer_profile', lang)}</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 pb-5 pt-2 border-b border-slate-100">
          <div className="w-20 h-20 bg-gradient-to-br from-brand-500 to-aqua-400 rounded-3xl flex items-center justify-center text-white font-extrabold text-3xl shadow-md mb-3">
            {customer.name.charAt(0).toUpperCase()}
          </div>
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

          {/* Pending balance */}
          {Number(customer.pending_balance) > 0 && (
            <div className="flex items-center justify-between bg-red-50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700">{t('pending_balance', lang)}</span>
              </div>
              <span className="text-sm font-extrabold text-red-600">₹{Number(customer.pending_balance).toLocaleString('en-IN')}</span>
            </div>
          )}

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

// ── Main Page ──────────────────────────────────────────────────────────────────
export const StaffCustomers = () => {
  const { toast } = useToast();
  const { lang }  = useLang();
  const [customers, setCustomers]   = useState<CustomerForStaff[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [profiled, setProfiled]     = useState<CustomerForStaff | null>(null); // profile sheet
  const [selected, setSelected]     = useState<CustomerForStaff | null>(null); // delivery sheet
  const [successData, setSuccessData] = useState<{
    customer: string; quantity: number; amount: number; mode: string; orderId: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await staffApi.getCustomersList();
      setCustomers(data.customers);
    } catch {
      toast('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

      {/* Search + Refresh */}
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
      </div>

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
                <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-aqua-400 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shrink-0 shadow-sm">
                  {c.name.charAt(0).toUpperCase()}
                </div>

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
                    {Number(c.pending_balance) > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                        <IndianRupee className="w-2.5 h-2.5" /> ₹{Number(c.pending_balance).toLocaleString('en-IN')} due
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

      {/* Profile sheet */}
      <AnimatePresence>
        {profiled && !selected && (
          <ProfileSheet
            key={`profile-${profiled.id}`}
            customer={profiled}
            onClose={() => setProfiled(null)}
            onDeliver={() => setSelected(profiled)}
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
    </div>
  );
};
