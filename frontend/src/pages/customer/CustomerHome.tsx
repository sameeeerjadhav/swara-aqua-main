import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Droplets, ArrowRight, Plus,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  TrendingUp, AlertTriangle, Receipt, Sparkles, X, CreditCard,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { TouchEvent } from 'react';
import api, { getUploadUrl } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { useSSE } from '../../hooks/useSSE';
import { useToast } from '../../components/ui/Toast';
import { subscriptionApi, Subscription } from '../../api/subscription';
import { pendingApi } from '../../api/pending';
import { loadRazorpay } from '../../utils/razorpay';
import { advanceApi } from '../../api/advance';
import { billingApi } from '../../api/billing';
import { usePlatformFee } from '../../hooks/usePlatformFee';
import type { Bill } from '../../api/billing';

const LOW_ADVANCE_THRESHOLD = 60;

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp  = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } };

// ── Banner Carousel (API-driven, desktop) ──────────────────────────────────────
interface Banner { id: number; title: string | null; image_url: string; link_url: string | null; }

const BannerCarousel = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannersRef = useRef<Banner[]>([]);

  useEffect(() => {
    api.get('/banners/active')
      .then((res) => {
        const list: Banner[] = res.data.banners || [];
        setBanners(list);
        bannersRef.current = list;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (banners.length < 2) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % bannersRef.current.length);
    }, 4000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [banners.length]);

  const go = (dir: 1 | -1) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setCurrent(c => (c + dir + bannersRef.current.length) % bannersRef.current.length);
    if (bannersRef.current.length > 1) {
      timerRef.current = setInterval(() => {
        setCurrent(c => (c + 1) % bannersRef.current.length);
      }, 4000);
    }
  };

  if (loading) return <div className="h-44 w-full rounded-3xl bg-slate-100 animate-pulse" />;
  if (banners.length === 0) return null;

  const safeIndex = current % banners.length;
  const b = banners[safeIndex];
  return (
    <div className="relative w-full rounded-3xl overflow-hidden shadow-lg">
      <AnimatePresence mode="wait">
        <motion.div key={b.id} className="w-full"
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
          {b.link_url ? (
            <a href={b.link_url} target="_blank" rel="noopener noreferrer" className="block w-full">
              <img src={getUploadUrl(b.image_url)} alt={b.title || 'Banner'}
                className="w-full h-44 sm:h-52 object-cover block"
                fetchPriority="high"
                decoding="async"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/800x300/e2e8f0/94a3b8?text=Banner'; }} />
            </a>
          ) : (
            <img src={getUploadUrl(b.image_url)} alt={b.title || 'Banner'}
              className="w-full h-44 sm:h-52 object-cover block"
              fetchPriority="high"
              decoding="async"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/800x300/e2e8f0/94a3b8?text=Banner'; }} />
          )}
          {b.title && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-5 py-4">
              <p className="text-white text-sm font-bold">{b.title}</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {banners.length > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors">
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors">
            <ChevronRightIcon className="w-4 h-4 text-white" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === safeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ── Promo Image Carousel (static images, peek-style) ──────────────────────────
const PROMO_IMAGES = [
  '/show/image1.png',
  '/show/image2.png',
  '/show/image3.png',
];

const SLIDE_WIDTH_PERCENT = 72;
const SLIDE_GAP = 12;

const PromoCarousel = () => {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const total = PROMO_IMAGES.length;

  const goTo = useCallback((index: number) => {
    setCurrent(index);
    if (scrollRef.current) {
      const containerWidth = scrollRef.current.offsetWidth;
      const slideWidth = (containerWidth * SLIDE_WIDTH_PERCENT) / 100;
      const scrollTo = index * (slideWidth + SLIDE_GAP);
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(prev => {
        const next = prev + 1 >= total ? 0 : prev + 1;
        if (scrollRef.current) {
          if (next === 0) {
            scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
          } else {
            const containerWidth = scrollRef.current.offsetWidth;
            const slideWidth = (containerWidth * SLIDE_WIDTH_PERCENT) / 100;
            const scrollTo = next * (slideWidth + SLIDE_GAP);
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
          }
        }
        return next;
      });
    }, 3000);
  }, [total]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resetTimer]);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      const next = diff > 0
        ? (current + 1) % total
        : (current - 1 + total) % total;
      goTo(next);
    }
    resetTimer();
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const containerWidth = scrollRef.current.offsetWidth;
    const slideWidth = (containerWidth * SLIDE_WIDTH_PERCENT) / 100;
    const scrollLeft = scrollRef.current.scrollLeft;
    const index = Math.round(scrollLeft / (slideWidth + SLIDE_GAP));
    if (index !== current && index >= 0 && index < total) {
      setCurrent(index);
    }
  };

  return (
    <div className="promo-carousel-outer">
      <div
        className="promo-carousel-scroll no-scrollbar"
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onScroll={handleScroll}
      >
        {PROMO_IMAGES.map((src, i) => (
          <div className="promo-carousel-card" key={i}>
            <img
              src={src}
              alt={`Promo ${i + 1}`}
              className="promo-carousel-card-img"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>
      <div className="promo-carousel-dots">
        {PROMO_IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => { goTo(i); resetTimer(); }}
            className={`promo-dot ${i === current ? 'promo-dot-active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
};

// ── Inline Pay Bill Modal (reuses same logic as CustomerBills PayBillModal) ────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface HomeBillPayModalProps {
  bill: Bill;
  due: number;
  advanceBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

const HomeBillPayModal = ({ bill, due, advanceBalance, onClose, onSuccess }: HomeBillPayModalProps) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<'advance' | 'razorpay'>(advanceBalance >= due ? 'advance' : 'razorpay');
  const [paying, setPaying] = useState(false);

  const feeInfo      = usePlatformFee(mode === 'razorpay' ? due : 0);
  const platformFee  = feeInfo.fee;
  const totalCharged = mode === 'razorpay' ? feeInfo.total : due;
  const canUseAdvance = advanceBalance > 0;

  const [y, m] = bill.month.split('-');
  const monthLabel = `${MONTHS_SHORT[Number(m) - 1]} ${y}`;

  const handlePay = async () => {
    setPaying(true);
    try {
      if (mode === 'advance') {
        await billingApi.payBillAdvanceSingle(bill.id);
        toast(`✅ ₹${Math.min(advanceBalance, due).toFixed(0)} paid via Advance Balance!`, 'success');
        onSuccess();
      } else {
        const rzpLoaded = await loadRazorpay();
        if (!rzpLoaded) { toast('Razorpay failed to load', 'error'); return; }
        const { data } = await billingApi.payBillOrder(bill.id);
        await new Promise<void>((resolve, reject) => {
          const options = {
            key:         data.keyId,
            amount:      data.amount,
            currency:    data.currency,
            name:        'Swara Aqua',
            description: `${monthLabel} bill · ₹${due.toFixed(0)} due`,
            order_id:    data.rzpOrderId,
            handler: async (response: any) => {
              try {
                await billingApi.payBillVerify(bill.id, {
                  razorpay_order_id:   response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature:  response.razorpay_signature,
                  amount:              data.due,
                });
                toast(`✅ ₹${data.due.toFixed(0)} paid for ${monthLabel} bill!`, 'success');
                resolve();
              } catch { reject(new Error('Verification failed')); }
            },
            modal: { ondismiss: () => reject(new Error('dismissed')) },
            theme: { color: '#2563eb' },
          };
          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        });
        onSuccess();
      }
    } catch (err: any) {
      if (err?.message !== 'dismissed') {
        toast(err?.response?.data?.message || err?.message || 'Payment failed', 'error');
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 px-5 pt-6 pb-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Pay Bill</h2>
                <p className="text-slate-400 text-xs mt-0.5">{monthLabel} bill</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bill summary */}
          <div className="bg-slate-800 rounded-2xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-xs">Total Bill</span>
              <span className="text-white text-sm font-bold">₹{Number(bill.total_amount).toFixed(0)}</span>
            </div>
            {Number(bill.paid_amount) > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-green-400 text-xs">Already Paid</span>
                <span className="text-green-400 text-sm font-bold">−₹{Number(bill.paid_amount).toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-slate-700">
              <span className="text-red-400 text-xs font-bold">Amount Due</span>
              <span className="text-red-400 text-sm font-bold">₹{due.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Payment mode */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Pay via</p>
            <div className="grid grid-cols-2 gap-2">
              {canUseAdvance && (
                <button type="button" onClick={() => setMode('advance')}
                  className={`flex flex-col items-center py-3 rounded-2xl border font-bold text-sm transition-all
                    ${mode === 'advance'
                      ? 'bg-green-50 border-green-400 text-green-700 ring-2 ring-green-400/20'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  <span className="text-lg">💰</span>
                  <span className="text-xs mt-0.5">Advance</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">₹{advanceBalance.toFixed(0)} available</span>
                </button>
              )}
              <button type="button" onClick={() => setMode('razorpay')}
                className={`flex flex-col items-center py-3 rounded-2xl border font-bold text-sm transition-all col-span-${canUseAdvance ? '1' : '2'}
                  ${mode === 'razorpay'
                    ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-400/20'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                <span className="text-lg">💳</span>
                <span className="text-xs mt-0.5">Razorpay</span>
                {mode === 'razorpay' && platformFee > 0 && (
                  <span className="text-[10px] text-slate-400 mt-0.5">+₹{platformFee.toFixed(0)} fee</span>
                )}
              </button>
            </div>
          </div>

          {/* Amount due summary */}
          <div className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">You'll pay</span>
            <span className="text-base font-extrabold text-slate-900">₹{totalCharged.toFixed(0)}</span>
          </div>

          {/* Pay button */}
          <button onClick={handlePay} disabled={paying}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:scale-[0.97] text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-brand-600/20 disabled:opacity-60">
            {paying ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</span>
            ) : (
              <><Sparkles className="w-4 h-4" /> Pay ₹{totalCharged.toFixed(0)}</>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
export const CustomerHome = ({ onOrderPress }: { onOrderPress?: () => void }) => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const { refresh } = useOrders();

  // Active plan
  const [plan, setPlan] = useState<Subscription | null>(null);
  const [expandedQR, setExpandedQR] = useState<{ src: string; label: string } | null>(null);
  useEffect(() => {
    subscriptionApi.getMy().then((res) => setPlan(res.data.subscription)).catch(() => {});
  }, []);

  // Poll: auto-refresh when order status changes
  useSSE({
    order_status_changed: () => refresh(),
  });

  const handleOrder = () => {
    if (onOrderPress) onOrderPress(); else navigate('/customer/orders?new=1');
  };

  // Advance balance — for low-balance notification
  const [advanceBalance,      setAdvanceBalance]      = useState<number | null>(null);
  const [advanceAccessStatus, setAdvanceAccessStatus] = useState<string>('');

  useEffect(() => {
    advanceApi.get()
      .then(({ data }) => {
        setAdvanceBalance(Number(data.balance ?? 0));
        setAdvanceAccessStatus(data.advanceAccess || '');
      })
      .catch(() => {});
  }, []);

  const showLowAdvance = (
    advanceBalance !== null &&
    advanceAccessStatus === 'approved' &&
    advanceBalance <= LOW_ADVANCE_THRESHOLD
  );

  // Pending balance (pay-later door debt)
  const [pendingBalance, setPendingBalance] = useState(0);
  const [payingPending, setPayingPending] = useState(false);

  useEffect(() => {
    pendingApi.getMy()
      .then(({ data }) => setPendingBalance(data.pending_balance))
      .catch(() => {});
  }, []);

  const handlePayPending = async () => {
    setPayingPending(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { toast('Razorpay failed to load', 'error'); return; }
      const { data } = await pendingApi.createPayOrder();
      await new Promise<void>((resolve, reject) => {
        const options = {
          key:         data.keyId,
          amount:      data.amount,
          currency:    'INR',
          name:        'Swara Aqua',
          description: `Clear pending balance ₹${data.baseAmount}`,
          order_id:    data.orderId,
          handler: async (response: any) => {
            try {
              await pendingApi.verify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              });
              setPendingBalance(0);
              toast('✅ Pending balance cleared!', 'success');
              resolve();
            } catch { reject(new Error('Verification failed')); }
          },
          modal: { ondismiss: () => reject(new Error('dismissed')) },
          theme: { color: '#ef4444' },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      });
    } catch (err: any) {
      if (err?.message !== 'dismissed') toast(err?.response?.data?.message || 'Payment failed', 'error');
    } finally { setPayingPending(false); }
  };

  // ── Current month bill ──────────────────────────────────────────────────────
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [currentBill,    setCurrentBill]    = useState<Bill | null>(null);
  const [billAdvanceBal, setBillAdvanceBal] = useState(0);
  const [payingBillHome, setPayingBillHome] = useState(false);

  const loadCurrentBill = useCallback(() => {
    billingApi.list()
      .then(({ data }) => {
        const bills: Bill[] = data.bills || [];
        const thisMonth = bills.find((b: Bill) => b.month === currentMonth);
        setCurrentBill(thisMonth ?? null);
      })
      .catch(() => {});
    advanceApi.get()
      .then(({ data }) => setBillAdvanceBal(Number(data.balance ?? 0)))
      .catch(() => {});
  }, [currentMonth]);

  useEffect(() => { loadCurrentBill(); }, [loadCurrentBill]);

  // Computed bill due
  const billDue = currentBill
    ? Math.max(0, Number(currentBill.total_amount) - Number(currentBill.paid_amount))
    : 0;

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ―― Low Advance Balance Alert ―― */}
      {showLowAdvance && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-orange-700">Low Advance Balance</p>
              <p className="text-xs text-orange-500">
                Only ₹{advanceBalance} left — refill to avoid interruption
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/customer/advance')}
            className="shrink-0 bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-orange-600 active:scale-95 transition-all"
          >
            Refill Now
          </button>
        </motion.div>
      )}

      {/* ―― Outstanding Balance Alert (pay-later door debt) ―― */}
      {pendingBalance > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <span className="text-lg">💳</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-red-700">Outstanding Balance</p>
              <p className="text-xs text-red-500">₹{pendingBalance.toLocaleString('en-IN')} due — tap to clear</p>
            </div>
          </div>
          <button
            onClick={handlePayPending}
            disabled={payingPending}
            className="shrink-0 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60"
          >
            {payingPending ? 'Processing…' : 'Pay Now'}
          </button>
        </motion.div>
      )}

      {/* ―― Monthly Bill Payment Card ―― */}
      {currentBill && billDue > 0 && (() => {
        const [y, m] = currentBill.month.split('-');
        const monthLabel = `${MONTHS_SHORT[Number(m) - 1]} ${y}`;
        return (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-xl border border-slate-700/50"
          >
            {/* Glow accents */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative px-5 pt-4 pb-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-brand-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{monthLabel} Bill Generated</p>
                    <p className="text-slate-400 text-[11px]">{currentBill.total_jars} jars × ₹{currentBill.jar_rate}/jar</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full animate-pulse">
                  ₹{billDue.toLocaleString('en-IN')} DUE
                </span>
              </div>

              {/* Amount breakdown */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-800/70 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-slate-400 mb-0.5">Total Bill</p>
                  <p className="text-white text-sm font-bold">₹{Number(currentBill.total_amount).toFixed(0)}</p>
                </div>
                <div className="bg-slate-800/70 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-slate-400 mb-0.5">Paid</p>
                  <p className="text-green-400 text-sm font-bold">₹{Number(currentBill.paid_amount).toFixed(0)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-red-400 mb-0.5">Remaining</p>
                  <p className="text-red-400 text-sm font-bold">₹{billDue.toFixed(0)}</p>
                </div>
              </div>

              {/* CTA row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPayingBillHome(true)}
                  className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:scale-[0.97] text-white font-bold text-sm py-3 rounded-2xl transition-all shadow-lg shadow-brand-600/20"
                >
                  <Sparkles className="w-4 h-4" />
                  Pay ₹{billDue.toLocaleString('en-IN')} Now
                </button>
                <button
                  onClick={() => navigate('/customer/bills')}
                  className="w-11 h-11 rounded-2xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors"
                  title="View all bills"
                >
                  <Receipt className="w-4 h-4 text-slate-300" />
                </button>
              </div>
            </div>

            {/* Pay modal portal */}
            <AnimatePresence>
              {payingBillHome && (
                <HomeBillPayModal
                  bill={currentBill}
                  due={billDue}
                  advanceBalance={billAdvanceBal}
                  onClose={() => setPayingBillHome(false)}
                  onSuccess={() => { setPayingBillHome(false); loadCurrentBill(); }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        );
      })()}

      {/* ── Section: We Serve At ── */}
      <div className="flex items-center gap-3">
        <h3 style={{ fontFamily: "'DM Sans', sans-serif" }}
          className="text-sm font-medium text-slate-500 whitespace-nowrap tracking-wide">
          We Serve At
        </h3>
        <div className="flex-1 h-px bg-slate-200 rounded-full" />
      </div>

      {/* ── Banner Carousel ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <BannerCarousel />
      </motion.div>

      {/* ── Order Card ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="order-promo-card rounded-3xl px-5 py-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl leading-tight">
            <span className="font-extrabold text-white">Swara </span>
            <span className="font-normal text-white/90">Regular</span>
          </h2>
          <p className="text-white/70 text-sm mt-1">
            <span className="text-2xl font-extrabold text-white">₹{user?.jar_rate || 50}</span>
            <span className="text-white/60 text-xs ml-1">per refill</span>
          </p>
        </div>
        <button
          onClick={handleOrder}
          className="bg-white text-brand-600 font-bold text-sm px-5 py-2.5 rounded-full shadow-md hover:shadow-lg active:scale-95 transition-all"
        >
          Order Now
        </button>
      </motion.div>

      {/* ── Promo Image Carousel (mobile only) ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="block md:hidden"
      >
        <PromoCarousel />
      </motion.div>

      {/* ── Active Plan Card ── HIDDEN: client doesn't need this feature */}
      {false && plan && plan.status === 'active' && (() => {
        const p = plan!;
        return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          onClick={() => navigate('/customer/subscription')}
          className="bg-white rounded-2xl border border-purple-100 shadow-card overflow-hidden cursor-pointer active:scale-[0.98] transition-transform">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-white" />
              <span className="text-sm font-bold text-white">My Daily Plan</span>
            </div>
            <span className="text-[10px] font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full uppercase">Active</span>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              {p.slots?.map(slot => (
                <div key={slot.id} className="flex items-center gap-1.5 bg-purple-50 rounded-lg px-2.5 py-1.5">
                  <span className="text-xs font-bold text-purple-700">{slot.slot_label}</span>
                  <span className="text-[10px] text-purple-500">{slot.delivery_time}</span>
                  <span className="text-xs font-extrabold text-purple-700 bg-purple-100 rounded px-1">{slot.quantity}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-400">
                {p.slots?.reduce((s, sl) => s + sl.quantity, 0)} jars/day · ₹{(p.slots?.reduce((s, sl) => s + sl.quantity, 0) || 0) * (user?.jar_rate || 50)}/day
              </p>
              <span className="text-[10px] font-semibold text-purple-500 flex items-center gap-0.5">
                View Plan <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </motion.div>
        );
      })()}

      {/* ── Section: Quick Actions ── */}
      <div className="flex items-center gap-3 mt-2">
        <h3 style={{ fontFamily: "'DM Sans', sans-serif" }}
          className="text-sm font-medium text-slate-500 whitespace-nowrap tracking-wide">
          Quick Actions
        </h3>
        <div className="flex-1 h-px bg-slate-200 rounded-full" />
      </div>

      {/* ── Quick actions ── */}
      <motion.div variants={stagger} initial="hidden" animate="show">
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Plus,       label: 'Order',    color: 'bg-brand-600',  iconColor: 'text-white',    action: handleOrder },
            { icon: Package,    label: 'Orders',   color: 'bg-green-100',  iconColor: 'text-green-600', action: () => navigate('/customer/orders') },
            { icon: Droplets,   label: 'Refill',   color: 'bg-blue-100',   iconColor: 'text-blue-600',  action: handleOrder },
            { icon: TrendingUp, label: 'Bills',    color: 'bg-amber-100',  iconColor: 'text-amber-600', action: () => navigate('/customer/bills') },
          ].map(({ icon: Icon, label, color, iconColor, action }) => (
            <motion.button key={label} variants={fadeUp} onClick={action}
              className="flex flex-col items-center gap-2 py-3 rounded-2xl active:scale-95 transition-transform">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color} shadow-sm`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif" }}
                className="text-xs font-normal text-slate-500">{label}</p>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── QR Code Promo ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
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

      {/* ── Tagline ── */}
      <div className="py-10 mt-4 pl-1">
        <p className="text-4xl font-extrabold text-blue-400 leading-tight">
          Stay
        </p>
        <p className="text-4xl font-extrabold text-blue-400 leading-tight">
          hydrated !!
        </p>
        <p className="text-xl font-semibold text-slate-400 mt-3">
          With Swara Aqua
        </p>
      </div>

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
