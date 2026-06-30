import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  UserRound, Phone, Package, IndianRupee, RefreshCw,
  CalendarDays, Users, Trash2, MapPin, Navigation,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import api from '../../api/axios';

interface CasualDelivery {
  id: number;
  staff_id: number;
  staff_name: string;
  person_name: string | null;
  phone: string | null;
  quantity: number;
  amount_collected: number;
  payment_mode: 'cash' | 'online' | 'credit';
  notes: string | null;
  created_at: string;
}

const PM_COLORS: Record<string, string> = {
  cash:   'bg-green-50 text-green-700 border-green-200',
  online: 'bg-blue-50 text-blue-700 border-blue-200',
  credit: 'bg-amber-50 text-amber-700 border-amber-200',
};

const todayStr = () => new Date().toISOString().split('T')[0];
const monthStr = () => new Date().toISOString().slice(0, 7);

export const AdminCasualDeliveries = () => {
  const { toast } = useToast();
  const [records,    setRecords]    = useState<CasualDelivery[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [deleting,   setDeleting]   = useState<number | null>(null);
  const [confirmId,  setConfirmId]  = useState<number | null>(null);
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [staffFilter, setStaffFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (startDate)    params.startDate = startDate;
      if (endDate)      params.endDate   = endDate;
      if (staffFilter)  params.staffId   = staffFilter;
      const { data } = await api.get<{ deliveries: CasualDelivery[] }>('/casual-deliveries', { params });
      setRecords(data.deliveries);
    } catch { toast('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, [startDate, endDate, staffFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: number) => {
    setConfirmId(id);
  };

  const doDelete = async () => {
    if (confirmId === null) return;
    const id = confirmId;
    setConfirmId(null);
    setDeleting(id);
    try {
      await api.delete(`/casual-deliveries/${id}`);
      setRecords(r => r.filter(x => x.id !== id));
      toast('Record deleted', 'success');
    } catch { toast('Failed to delete', 'error'); }
    finally { setDeleting(null); }
  };

  const totalJars   = records.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = records.reduce((s, r) => s + Number(r.amount_collected), 0);

  // Unique staff list for filter
  const staffList = Array.from(
    new Map(records.map(r => [r.staff_id, r.staff_name])).entries()
  );

  return (
    <div className="max-w-2xl space-y-5">

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filters</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 block mb-1">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-all" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 block mb-1">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-all" />
          </div>
        </div>
        <button onClick={() => { setStartDate(''); setEndDate(''); setStaffFilter(''); }}
          className="text-xs text-slate-400 hover:text-brand-500 transition-colors">
          Clear filters
        </button>
      </div>

      {/* Summary */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Records',    value: records.length },
            { label: 'Total Jars', value: totalJars },
            { label: 'Collected',  value: `₹${totalAmount.toFixed(0)}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-card p-3.5 text-center">
              <p className="text-[10px] text-slate-400 font-medium">{label}</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-10 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <UserRound className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600">No records found</p>
          <p className="text-xs text-slate-400 mt-1">No casual deliveries for the selected period.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec, i) => (
            <motion.div key={rec.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 transition-all hover:border-brand-100 hover:shadow-md">

              {/* Top row: Name + Amount */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-aqua-500 flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-white font-bold text-sm">
                      {rec.person_name ? rec.person_name.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-bold text-slate-800">
                        {rec.person_name || <span className="text-slate-400 font-medium italic">Unknown</span>}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PM_COLORS[rec.payment_mode]}`}>
                        {rec.payment_mode}
                      </span>
                    </div>
                    {/* Staff name */}
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Users className="w-3 h-3" />
                      <span>{rec.staff_name}</span>
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0 ml-3">
                  <p className="text-base font-bold text-brand-600">₹{Number(rec.amount_collected).toFixed(0)}</p>
                  <p className="text-xs text-slate-400">{rec.quantity} jar{rec.quantity > 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Detail row: phone + quantity + date */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {rec.phone && (
                  <a href={`tel:${rec.phone}`} onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:underline transition-colors">
                    <Phone className="w-3 h-3" />{rec.phone}
                  </a>
                )}
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Package className="w-3 h-3 text-slate-400" />{rec.quantity} jar{rec.quantity > 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <CalendarDays className="w-3 h-3" />
                  {new Date(rec.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                  {' '}
                  {new Date(rec.created_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true,
                  })}
                </span>
              </div>

              {/* Notes */}
              {rec.notes && (
                <p className="text-[11px] text-slate-400 italic mb-3">"{rec.notes}"</p>
              )}

              {/* Bottom action row */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                <span className="text-[10px] text-slate-300 font-mono">#{rec.id}</span>
                <button
                  disabled={deleting === rec.id}
                  onClick={() => handleDelete(rec.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting === rec.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete Record"
        message="This casual delivery record will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
};
