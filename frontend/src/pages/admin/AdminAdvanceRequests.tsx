import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, CheckCircle2, XCircle, Clock, RefreshCw,
  User, Phone, IndianRupee, ShieldCheck, ShieldX,
  Banknote, X, Plus, Minus,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { advanceApi, AdvanceAccessRequest, AdvanceAccess } from '../../api/advance';

const STATUS_TABS: { key: AdvanceAccess; label: string }[] = [
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

export const AdminAdvanceRequests = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdvanceAccessRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<AdvanceAccess>('pending');
  const [acting,   setActing]   = useState<number | null>(null);

  // Cash top-up modal state
  const [cashTarget, setCashTarget]   = useState<AdvanceAccessRequest | null>(null);
  const [cashType,   setCashType]     = useState<'credit' | 'debit'>('credit');
  const [cashAmount, setCashAmount]   = useState('');
  const [cashNote,   setCashNote]     = useState('');
  const [addingCash, setAddingCash]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await advanceApi.getAccessRequests(tab);
      setRequests(data.requests);
    } catch { toast('Failed to load requests', 'error'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (userId: number, name: string) => {
    setActing(userId);
    try {
      await advanceApi.approveAccess(userId);
      toast(`✅ Advance access approved for ${name}`, 'success');
      load();
    } catch { toast('Failed to approve', 'error'); }
    finally { setActing(null); }
  };

  const handleReject = async (userId: number, name: string) => {
    setActing(userId);
    try {
      await advanceApi.rejectAccess(userId);
      toast(`Advance request rejected for ${name}`, 'success');
      load();
    } catch { toast('Failed to reject', 'error'); }
    finally { setActing(null); }
  };

  const handleCashTopup = async () => {
    if (!cashTarget) return;
    const amt = parseFloat(cashAmount);
    if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
    setAddingCash(true);
    try {
      const { data } = await advanceApi.adminCashTopup(cashTarget.id, amt, cashType, cashNote || undefined);
      const verb = cashType === 'credit' ? 'added to' : 'removed from';
      toast(`${cashType === 'credit' ? '💵' : '📉'} ₹${amt} ${verb} ${cashTarget.name}'s balance`, 'success');
      setRequests(prev => prev.map(r => r.id === cashTarget.id
        ? { ...r, prepaid_balance: data.balance }
        : r
      ));
      setCashTarget(null);
      setCashAmount('');
      setCashNote('');
      setCashType('credit');
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Failed to update balance', 'error');
    } finally { setAddingCash(false); }
  };

  return (
    <div className="max-w-2xl space-y-5">

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all
              ${tab === key
                ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
            {key === 'pending'  && <Clock       className={`w-3.5 h-3.5 ${tab === key ? 'text-amber-300' : 'text-amber-500'}`} />}
            {key === 'approved' && <ShieldCheck className={`w-3.5 h-3.5 ${tab === key ? 'text-green-300' : 'text-green-500'}`} />}
            {key === 'rejected' && <ShieldX     className={`w-3.5 h-3.5 ${tab === key ? 'text-red-300'   : 'text-red-500'}`}   />}
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-10 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <CreditCard className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600">No {tab} requests</p>
          <p className="text-xs text-slate-400 mt-1">
            {tab === 'pending'
              ? 'No customers are waiting for advance payment approval.'
              : `No ${tab} advance payment requests found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req, i) => (
            <motion.div key={req.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">

              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-11 h-11 bg-brand-50 rounded-2xl flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-brand-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800">{req.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                      ${req.advance_access === 'pending'  ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : req.advance_access === 'approved' ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {req.advance_access}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {req.phone}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-slate-600">
                      <IndianRupee className="w-3 h-3" /> Balance: ₹{Number(req.prepaid_balance).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Requested: {new Date(req.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Action buttons — only for pending */}
              {req.advance_access === 'pending' && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    disabled={acting === req.id}
                    onClick={() => handleApprove(req.id, req.name)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-all active:scale-[0.98]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {acting === req.id ? 'Processing…' : 'Approve'}
                  </button>
                  <button
                    disabled={acting === req.id}
                    onClick={() => handleReject(req.id, req.name)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-all active:scale-[0.98]">
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              )}

              {/* Approved: show status + Add Cash button */}
              {req.advance_access === 'approved' && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2">
                    <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
                    <p className="text-xs text-green-700 font-medium flex-1">Advance access granted</p>
                  </div>
                  {/* 💵 Adjust Balance button */}
                  <button
                    onClick={() => { setCashTarget(req); setCashAmount(''); setCashNote(''); setCashType('credit'); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all active:scale-[0.98]">
                    <Banknote className="w-3.5 h-3.5" />
                    Adjust Advance Balance
                  </button>
                </div>
              )}

              {req.advance_access === 'rejected' && (
                <div className="mt-3 flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
                  <ShieldX className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700 font-medium">Access denied — customer may re-request</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Cash Top-up Modal ── */}
      <AnimatePresence>
        {cashTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setCashTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className={`px-5 py-4 flex items-center justify-between shrink-0 ${cashType === 'credit' ? 'bg-emerald-600' : 'bg-red-500'} transition-colors`}>
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-white" />
                  <div>
                    <p className="text-sm font-bold text-white">Adjust Advance Balance</p>
                    <p className="text-xs text-white/70">{cashTarget.name}</p>
                  </div>
                </div>
                <button onClick={() => setCashTarget(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                {/* Credit / Debit toggle */}
                <div className="flex gap-2 bg-slate-100 rounded-2xl p-1">
                  <button
                    onClick={() => setCashType('credit')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      cashType === 'credit'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    <Plus className="w-3 h-3" /> Add Credit
                  </button>
                  <button
                    onClick={() => setCashType('debit')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      cashType === 'debit'
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    <Minus className="w-3 h-3" /> Reduce
                  </button>
                </div>

                {/* Current balance info */}
                <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                  cashType === 'credit' ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  <p className={`text-xs font-semibold ${cashType === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>Current Balance</p>
                  <p className={`text-base font-extrabold ${cashType === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>
                    ₹{Number(cashTarget.prepaid_balance).toFixed(2)}
                  </p>
                </div>

                {/* Amount input */}
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                    {cashType === 'credit' ? 'Amount to Credit (₹)' : 'Amount to Reduce (₹)'}
                  </label>
                  <div className={`flex items-center gap-2 bg-white border-2 rounded-2xl px-4 py-3 transition-all ${
                    cashType === 'credit'
                      ? 'border-slate-200 focus-within:border-emerald-500'
                      : 'border-slate-200 focus-within:border-red-400'
                  }`}>
                    <IndianRupee className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-lg font-bold text-slate-800 placeholder-slate-300 outline-none"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Quick amount pills */}
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map(amt => (
                    <button key={amt}
                      onClick={() => setCashAmount(String(amt))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        cashAmount === String(amt)
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                      }`}>
                      +₹{amt}
                    </button>
                  ))}
                </div>

                {/* Note */}
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1.5 block">Note (optional)</label>
                  <input
                    value={cashNote}
                    onChange={e => setCashNote(e.target.value)}
                    placeholder="e.g. Cash received on 26 July"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-400 transition-all"
                  />
                </div>

                {/* Preview */}
                {cashAmount && parseFloat(cashAmount) > 0 && (() => {
                  const current   = Number(cashTarget.prepaid_balance);
                  const amt       = parseFloat(cashAmount);
                  const newBal    = cashType === 'credit' ? current + amt : current - amt;
                  const isNeg     = newBal < 0;
                  const accent    = cashType === 'credit' ? 'emerald' : 'red';
                  return (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className={`flex items-center justify-between border rounded-2xl px-4 py-3 bg-${accent}-50 border-${accent}-200`}>
                      <p className={`text-xs text-${accent}-700`}>Balance after this</p>
                      <p className={`text-base font-extrabold ${isNeg ? 'text-red-600' : `text-${accent}-700`}`}>
                        ₹{newBal.toFixed(2)}{isNeg ? ' ⚠️' : ''}
                      </p>
                    </motion.div>
                  );
                })()}

                {/* Debit warning */}
                {cashType === 'debit' && parseFloat(cashAmount) > Number(cashTarget.prepaid_balance) && (
                  <p className="text-xs text-red-500 font-semibold text-center">
                    ⚠️ Amount exceeds current balance — this will be rejected
                  </p>
                )}

                {/* Submit */}
                <button
                  disabled={!cashAmount || parseFloat(cashAmount) <= 0 || addingCash}
                  onClick={handleCashTopup}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50 transition-all active:scale-[0.98] ${
                    cashType === 'credit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'
                  }`}>
                  {addingCash ? (
                    <>Processing…</>
                  ) : cashType === 'credit' ? (
                    <><Plus className="w-4 h-4" /> Add ₹{parseFloat(cashAmount) > 0 ? parseFloat(cashAmount).toFixed(2) : '0'} to Balance</>
                  ) : (
                    <><Minus className="w-4 h-4" /> Reduce by ₹{parseFloat(cashAmount) > 0 ? parseFloat(cashAmount).toFixed(2) : '0'}</>
                  )}
                </button>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
};
