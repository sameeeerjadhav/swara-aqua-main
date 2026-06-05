import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, Plus, ArrowDownLeft, ArrowUpRight,
  CheckCircle2, Clock, XCircle, Sparkles,
  RefreshCw, ShieldCheck, ShieldX, ReceiptText,
  ChevronDown, X,
} from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { advanceApi, AdvanceAccess, AdvanceTransaction } from '../../api/advance';
import { loadRazorpay } from '../../utils/razorpay';
import { withPlatformFee } from '../../utils/platformFee';

// ── Helpers ───────────────────────────────────────────────────────────────────
const getPlatformFee = (base: number) => {
  if (base < 100)  return 2;
  if (base < 300)  return 10;
  if (base < 500)  return 15;
  return 20;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

const TX_AMOUNTS = [100, 200, 500, 1000];

// ── Status config ─────────────────────────────────────────────────────────────
const ACCESS_CFG: Record<AdvanceAccess, { label: string; color: string; bg: string; icon: typeof ShieldCheck }> = {
  none:     { label: 'Not Requested', color: 'text-slate-500', bg: 'bg-slate-100',  icon: ShieldX },
  pending:  { label: 'Pending Approval', color: 'text-amber-600', bg: 'bg-amber-50',  icon: Clock },
  approved: { label: 'Active',        color: 'text-green-600',  bg: 'bg-green-50',   icon: ShieldCheck },
  rejected: { label: 'Rejected',      color: 'text-red-600',    bg: 'bg-red-50',     icon: ShieldX },
};

const TX_TYPE_CFG = {
  credit: { label: 'Credit', icon: ArrowDownLeft, color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200' },
  debit:  { label: 'Debit',  icon: ArrowUpRight,  color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200'   },
};

// ── Add Credit Modal ──────────────────────────────────────────────────────────
const AddCreditModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: (amount: number) => void }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const base       = parseFloat(amount) || 0;
  const fee        = base > 0 ? getPlatformFee(base) : 0;
  const total      = base + fee;
  const isValid    = base >= 1;

  const handlePay = async () => {
    if (!isValid) { toast('Enter amount ≥ ₹1', 'error'); return; }
    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { toast('Razorpay failed to load', 'error'); return; }

      const { data } = await advanceApi.createTopupOrder(base);
      await new Promise<void>((resolve, reject) => {
        const options = {
          key:         data.keyId,
          amount:      data.amount,
          currency:    'INR',
          name:        'Swara Aqua',
          description: `Advance Credit · ₹${base} + ₹${data.platformFee} fee`,
          order_id:    data.orderId,
          handler: async (response: any) => {
            try {
              await advanceApi.verifyTopup({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                amount:              data.amount,
              });
              toast(`✅ ₹${base} advance credit added!`, 'success');
              resolve();
            } catch { reject(new Error('Verification failed')); }
          },
          modal: { ondismiss: () => reject(new Error('dismissed')) },
          theme: { color: '#2563eb' },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      });
      onSuccess(base);
    } catch (err: any) {
      if (err?.message !== 'dismissed') {
        toast(err?.response?.data?.message || err?.message || 'Payment failed', 'error');
      }
    } finally { setPaying(false); }
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
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-500/20 flex items-center justify-center">
                <Plus className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Add Advance Credit</h2>
                <p className="text-slate-400 text-xs mt-0.5">Credit via Razorpay · platform fee applies</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick amount buttons */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {TX_AMOUNTS.map(a => (
              <button key={a} onClick={() => setAmount(String(a))}
                className={`py-2 rounded-xl text-sm font-bold border transition-all
                  ${amount === String(a)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-brand-500'}`}>
                ₹{a}
              </button>
            ))}
          </div>

          {/* Custom amount input */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">₹</span>
            <input
              type="number" inputMode="decimal" min={1}
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-4 py-3 text-white text-base font-semibold placeholder-slate-500 outline-none focus:border-brand-500 transition-all" />
          </div>
        </div>

        {/* Fee breakdown + pay button */}
        <div className="px-5 py-4 space-y-3">
          {base > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Credit amount</span><span className="font-semibold text-slate-700">₹{base.toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Platform fee</span><span className="font-semibold text-amber-600">+₹{fee}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-700 font-bold border-t border-slate-100 pt-2">
                <span>You pay</span><span className="text-brand-700">₹{total.toFixed(0)}</span>
              </div>
            </div>
          )}

          <button onClick={handlePay} disabled={!isValid || paying}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
              ${!isValid || paying ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
            {paying
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
              : <><Sparkles className="w-4 h-4" />Add ₹{base || '—'} Credit</>}
          </button>

          <p className="text-center text-[10px] text-slate-400">
            Platform fee (₹{fee}) is non-refundable · powered by Razorpay
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const CustomerAdvance = () => {
  const { toast } = useToast();
  const [balance,     setBalance]     = useState(0);
  const [access,      setAccess]      = useState<AdvanceAccess>('none');
  const [transactions, setTransactions] = useState<AdvanceTransaction[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [requesting,  setRequesting]  = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [expanded,    setExpanded]    = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await advanceApi.get();
      setBalance(Number(data.balance ?? 0));
      setAccess(data.advanceAccess);
      setTransactions(data.transactions);
    } catch { toast('Failed to load advance balance', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      const { data } = await advanceApi.requestAccess();
      setAccess(data.advanceAccess);
      toast('Access request submitted! Admin will review shortly.', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Request failed', 'error');
    } finally { setRequesting(false); }
  };

  const accessCfg = ACCESS_CFG[access];
  const AccessIcon = accessCfg.icon;

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Balance card ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 rounded-2xl p-5 relative overflow-hidden">

        {/* Background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Advance Balance</p>
              {loading
                ? <Skeleton className="h-10 w-40 mt-2 bg-slate-800" />
                : <p className="text-4xl font-extrabold text-white mt-1">₹{balance.toLocaleString('en-IN')}</p>
              }
            </div>
            <button onClick={load}
              className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Access status */}
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${accessCfg.bg}`}>
            <AccessIcon className={`w-4 h-4 ${accessCfg.color} shrink-0`} />
            <p className={`text-xs font-semibold ${accessCfg.color}`}>
              {accessCfg.label}
              {access === 'approved' && ' — You can add credit and pay orders'}
              {access === 'pending'  && ' — Admin will activate your account soon'}
              {access === 'none'     && ' — Request access to start using advance payments'}
              {access === 'rejected' && ' — Contact admin for assistance'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {access === 'approved' && (
              <button onClick={() => setShowAddCredit(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 active:scale-[0.98] transition-all">
                <Plus className="w-4 h-4" /> Add Credit
              </button>
            )}
            {(access === 'none' || access === 'rejected') && (
              <button onClick={handleRequestAccess} disabled={requesting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-60">
                {requesting
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Requesting…</>
                  : <><ShieldCheck className="w-4 h-4" />Request Access</>}
              </button>
            )}
            {access === 'pending' && (
              <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-50 border border-amber-200">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-amber-700 text-sm font-semibold">Awaiting Approval</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── How it works ── */}
      {access !== 'approved' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3">How Advance Payments Work</h3>
          <div className="space-y-3">
            {[
              { step: '1', text: 'Request access — admin reviews and approves your account' },
              { step: '2', text: 'Add credit via Razorpay — credited to your advance balance' },
              { step: '3', text: 'Use "Pay Using Advance Balance" at checkout — no Razorpay fees!' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </div>
                <p className="text-xs text-slate-600">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <p className="text-xs text-amber-700">
              ⚠️ Platform fee (₹5–₹20) applies when adding credit via Razorpay. No fee when paying orders using advance balance.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Transaction history ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-brand-600" />
            Transaction History
          </h2>
          <span className="text-xs text-slate-400">{transactions.length} records</span>
        </div>

        {loading ? (
          <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
            <ReceiptText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-500">No transactions yet</p>
            <p className="text-xs text-slate-400 mt-1">Your advance credit & debit history will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx, i) => {
              const cfg     = TX_TYPE_CFG[tx.type];
              const Icon    = cfg.icon;
              const isOpen  = expanded === tx.id;

              return (
                <motion.div key={tx.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

                  <button onClick={() => setExpanded(isOpen ? null : tx.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/50 transition-colors">

                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                      <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {tx.note || (tx.type === 'credit' ? 'Advance Credit' : 'Advance Debit')}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(tx.created_at)} · {formatTime(tx.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <p className={`text-base font-extrabold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'credit' ? '+' : '-'}₹{Number(tx.amount).toFixed(0)}
                      </p>
                      <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                        className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-slate-100 pt-3 grid grid-cols-2 gap-2">
                          {[
                            { label: 'Type',   value: tx.type === 'credit' ? '+ Credit' : '− Debit', color: cfg.color },
                            { label: 'Mode',   value: tx.mode,              color: 'text-slate-600' },
                            { label: 'Status', value: tx.status,            color: tx.status === 'completed' ? 'text-green-700' : 'text-amber-600' },
                            { label: 'Amount', value: `₹${Number(tx.amount).toFixed(2)}`, color: 'text-slate-800' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-3">
                              <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                              <p className={`text-sm font-bold mt-0.5 ${color} capitalize`}>{value}</p>
                            </div>
                          ))}
                          {tx.reference_id && (
                            <div className="col-span-2 bg-slate-50 rounded-xl p-3">
                              <p className="text-[10px] text-slate-400 font-medium">Reference ID</p>
                              <p className="text-xs font-mono text-slate-600 mt-0.5 break-all">{tx.reference_id}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Credit Modal ── */}
      <AnimatePresence>
        {showAddCredit && (
          <AddCreditModal
            onClose={() => setShowAddCredit(false)}
            onSuccess={() => { setShowAddCredit(false); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
