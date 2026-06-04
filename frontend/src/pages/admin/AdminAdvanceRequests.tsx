import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard, CheckCircle2, XCircle, Clock, RefreshCw,
  User, Phone, IndianRupee, ShieldCheck, ShieldX,
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

export const AdminAdvanceRequests = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdvanceAccessRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<AdvanceAccess>('pending');
  const [acting,   setActing]   = useState<number | null>(null);

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

  return (
    <div className="max-w-2xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Advance Payment Requests</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage customer advance payment activation requests</p>
        </div>
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
                    <span className="flex items-center gap-1">
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

              {/* State info */}
              {req.advance_access === 'approved' && (
                <div className="mt-3 flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
                  <p className="text-xs text-green-700 font-medium">Advance access granted — customer can add credit and pay orders</p>
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
    </div>
  );
};
