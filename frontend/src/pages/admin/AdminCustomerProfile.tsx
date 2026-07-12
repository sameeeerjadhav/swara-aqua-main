import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, MapPin, Droplets, Package, CreditCard, IndianRupee,
  ChevronLeft, ChevronRight, FileText, CalendarDays, Pencil, Trash2, AlertTriangle, Camera, Copy,
  Plus, Check, X, Clock, Banknote, Smartphone, Wallet, Save, Edit3,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { OrderStatusBadge } from '../../components/ui/OrderStatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { EditProfileModal } from '../../components/ui/EditProfileModal';
import {
  calendarApi, DayDelivery, CustomerProfile, CustomerProfileStats,
  ManualDeliveryPayload,
} from '../../api/calendar';
import { customerOrderApi } from '../../api/customerOrder';
import api from '../../api/axios';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Period = 'morning' | 'afternoon' | 'evening';
const PERIOD_META: Record<Period, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  morning:   { label: 'Morning',   emoji: '🌅', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  afternoon: { label: 'Afternoon', emoji: '☀️',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  evening:   { label: 'Evening',   emoji: '🌆', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const BILL_STATUS: Record<string, string> = {
  paid:    'bg-green-50 text-green-700 border-green-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  unpaid:  'bg-red-50   text-red-600   border-red-200',
};

const PM_ICON: Record<string, React.ReactNode> = {
  cash:    <Banknote className="w-3 h-3" />,
  online:  <Smartphone className="w-3 h-3" />,
  advance: <Wallet className="w-3 h-3" />,
};

// ── Clickable phone ────────────────────────────────────────────────────────────
const PhoneLink = ({ phone, className = '' }: { phone: string; className?: string }) => {
  const handleDial = (e: React.MouseEvent) => { e.stopPropagation(); window.location.href = `tel:${phone}`; };
  const handleCopy = (e: React.MouseEvent) => { e.stopPropagation(); navigator.clipboard.writeText(phone).catch(() => {}); };
  return (
    <span className={`inline-flex items-center gap-1 group/ph ${className}`}>
      <a href={`tel:${phone}`} onClick={handleDial}
        className="text-brand-600 hover:text-brand-700 hover:underline transition-colors font-medium">
        {phone}
      </a>
      <button onClick={handleCopy} title="Copy number"
        className="opacity-0 group-hover/ph:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100">
        <Copy className="w-3 h-3 text-slate-400" />
      </button>
    </span>
  );
};

// ── Add / Edit delivery form ───────────────────────────────────────────────────
interface DeliveryFormProps {
  customerId: number;
  jarRate: number;
  date: string;
  editing?: DayDelivery | null;
  onSaved: () => void;
  onCancel: () => void;
}

const DeliveryForm = ({ customerId, jarRate, date, editing, onSaved, onCancel }: DeliveryFormProps) => {
  const { toast } = useToast();
  const [jars,    setJars]    = useState(editing ? editing.jars : 1);
  const [isPaid,  setIsPaid]  = useState(editing ? editing.is_paid : false);
  const [amount,  setAmount]  = useState(editing ? editing.amount_collected : jarRate);
  const [mode,    setMode]    = useState<'cash' | 'online' | 'advance'>(
    editing && editing.payment_mode !== 'none' ? (editing.payment_mode as any) : 'cash'
  );
  const [timeH,   setTimeH]   = useState(() => {
    if (editing?.time) {
      const m = editing.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (m) {
        let h = parseInt(m[1]);
        if (m[3].toUpperCase() === 'PM' && h < 12) h += 12;
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
        return h;
      }
    }
    return 9;
  });
  const [notes,   setNotes]   = useState(editing?.notes || '');
  const [saving,  setSaving]  = useState(false);

  // Auto-recalc amount when jars change (only if user hasn't manually set it)
  const [amountTouched, setAmountTouched] = useState(!!editing);
  useEffect(() => {
    if (!amountTouched) setAmount(jars * jarRate);
  }, [jars, jarRate, amountTouched]);

  const handleSave = async () => {
    if (jars < 1) { toast('Jars must be at least 1', 'error'); return; }
    setSaving(true);
    try {
      const hh = String(timeH).padStart(2, '0');
      const payload: ManualDeliveryPayload = {
        jars,
        amount_collected: isPaid ? amount : 0,
        is_paid: isPaid,
        payment_mode: isPaid ? mode : 'cash',
        delivery_date: date,
        delivery_time: `${hh}:00:00`,
        notes: notes.trim() || undefined,
      };
      if (editing) {
        await calendarApi.updateManualDelivery(editing.id, payload);
        toast('Delivery entry updated', 'success');
      } else {
        await calendarApi.addManualDelivery(customerId, payload);
        toast('Delivery entry added', 'success');
      }
      onSaved();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to save entry', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hours12 = [
    { value: 6, label: '6 AM' }, { value: 7, label: '7 AM' }, { value: 8, label: '8 AM' },
    { value: 9, label: '9 AM' }, { value: 10, label: '10 AM' }, { value: 11, label: '11 AM' },
    { value: 12, label: '12 PM' }, { value: 13, label: '1 PM' }, { value: 14, label: '2 PM' },
    { value: 15, label: '3 PM' }, { value: 16, label: '4 PM' }, { value: 17, label: '5 PM' },
    { value: 18, label: '6 PM' }, { value: 19, label: '7 PM' }, { value: 20, label: '8 PM' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-brand-50 to-aqua-50 border border-brand-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-brand-800">
          {editing ? '✏️ Edit Delivery Entry' : '➕ Add Delivery Entry'}
        </p>
        <button onClick={onCancel} className="p-1 rounded-lg hover:bg-white/70 transition-colors">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Jars */}
      <div>
        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
          Jars Delivered
        </label>
        <div className="flex items-center gap-2">
          <button onClick={() => setJars(j => Math.max(1, j - 1))}
            className="w-9 h-9 bg-white border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors font-bold text-slate-600">
            −
          </button>
          <input
            type="number" min={1} value={jars}
            onChange={e => setJars(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 text-center bg-white border border-slate-200 rounded-xl px-2 py-2 text-lg font-extrabold text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10"
          />
          <button onClick={() => setJars(j => j + 1)}
            className="w-9 h-9 bg-white border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors font-bold text-slate-600">
            +
          </button>
          <span className="text-xs text-slate-400 ml-1">× ₹{jarRate}/jar = ₹{jars * jarRate}</span>
        </div>
      </div>

      {/* Time */}
      <div>
        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
          <Clock className="w-3 h-3" /> Delivery Time
        </label>
        <div className="flex flex-wrap gap-1.5">
          {hours12.map(h => (
            <button key={h.value}
              onClick={() => setTimeH(h.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all
                ${timeH === h.value
                  ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payment */}
      <div>
        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
          Payment
        </label>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setIsPaid(false)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-semibold transition-all
              ${!isPaid ? 'bg-red-500 text-white border-red-500 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-red-200'}`}>
            <X className="w-3.5 h-3.5" /> Unpaid
          </button>
          <button
            onClick={() => setIsPaid(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-semibold transition-all
              ${isPaid ? 'bg-green-500 text-white border-green-500 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-green-200'}`}>
            <Check className="w-3.5 h-3.5" /> Paid
          </button>
        </div>

        <AnimatePresence>
          {isPaid && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden">
              {/* Amount */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Amount Collected (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number" min={0} value={amount}
                    onChange={e => { setAmountTouched(true); setAmount(parseFloat(e.target.value) || 0); }}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10"
                  />
                </div>
              </div>
              {/* Payment mode */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Payment Mode</label>
                <div className="flex gap-2">
                  {(['cash', 'online', 'advance'] as const).map(m => (
                    <button key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold capitalize transition-all
                        ${mode === m
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-brand-200'}`}>
                      {PM_ICON[m]} {m}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Customer was not home, left at door…"
          rows={2}
          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 resize-none placeholder-slate-300"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : editing ? 'Update' : 'Add Entry'}
        </button>
      </div>
    </motion.div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
export const AdminCustomerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [stats, setStats]     = useState<CustomerProfileStats | null>(null);
  const [bills, setBills]     = useState<any[]>([]);
  const [orders, setOrders]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit,   setShowEdit]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  // Set position
  const [posInput,   setPosInput]   = useState('');
  const [posTotal,   setPosTotal]   = useState(0);
  const [posSaving,  setPosSaving]  = useState(false);
  const [posOrder,   setPosOrder]   = useState<number[]>([]);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calData,  setCalData]  = useState<{ day: number; jars: number }[]>([]);
  const [calLoading, setCalLoading] = useState(true);

  // Day detail state
  const [selectedDate, setSelectedDate]   = useState<string | null>(null);
  const [dayDeliveries, setDayDeliveries] = useState<DayDelivery[]>([]);
  const [dayTotal, setDayTotal]           = useState(0);
  const [dayLoading, setDayLoading]       = useState(false);

  // Add/edit delivery form state
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [editingEntry, setEditingEntry] = useState<DayDelivery | null>(null);
  const [deletingId,   setDeletingId]   = useState<number | null>(null);

  const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      calendarApi.getCustomerProfile(Number(id)),
      api.get('/admin/users'),
      customerOrderApi.getAdmin().catch(() => ({ data: { ordered_ids: [] } })),
    ]).then(([profileRes, usersRes, orderRes]) => {
        setProfile(profileRes.data.customer);
        setStats(profileRes.data.stats);
        setBills(profileRes.data.bills);
        setOrders(profileRes.data.orders);
        const allCustomers = (usersRes.data.users as any[]).filter((u: any) => u.role === 'customer');
        setPosTotal(allCustomers.length);
        const savedIds: number[] = orderRes.data.ordered_ids ?? [];
        const inOrder  = savedIds.filter(sid => allCustomers.some((c: any) => c.id === sid));
        const notIn    = allCustomers.filter((c: any) => !savedIds.includes(c.id)).map((c: any) => c.id);
        const fullOrder = [...inOrder, ...notIn];
        setPosOrder(fullOrder);
        const currentPos = fullOrder.indexOf(Number(id));
        if (currentPos !== -1) setPosInput(String(currentPos + 1));
      })
      .catch(() => toast('Failed to load customer profile', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const loadCalendar = useCallback(() => {
    if (!id) return;
    setCalLoading(true);
    calendarApi.getAdminCalendar(Number(id), calMonthStr)
      .then(({ data }) => setCalData(data.calendar))
      .catch(() => setCalData([]))
      .finally(() => setCalLoading(false));
  }, [id, calMonthStr]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const loadDayDetail = useCallback(async (dateStr: string) => {
    if (!id) return;
    setDayLoading(true);
    try {
      const { data } = await calendarApi.getAdminDayDetail(Number(id), dateStr);
      setDayDeliveries(data.deliveries);
      setDayTotal(data.totalJars);
    } catch {
      setDayDeliveries([]);
      setDayTotal(0);
    } finally { setDayLoading(false); }
  }, [id]);

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowAddForm(false);
    setEditingEntry(null);
    loadDayDetail(dateStr);
  };

  const handleDeliverySaved = () => {
    setShowAddForm(false);
    setEditingEntry(null);
    if (selectedDate) loadDayDetail(selectedDate);
    loadCalendar(); // refresh calendar totals
  };

  const handleDeleteEntry = async (entry: DayDelivery) => {
    if (!entry.is_manual) return; // only manual entries can be deleted
    setDeletingId(entry.id);
    try {
      await calendarApi.deleteManualDelivery(entry.id);
      toast('Entry deleted', 'success');
      if (selectedDate) loadDayDetail(selectedDate);
      loadCalendar();
    } catch {
      toast('Failed to delete entry', 'error');
    } finally { setDeletingId(null); }
  };

  const prevMonth = () => {
    setSelectedDate(null); setShowAddForm(false); setEditingEntry(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDate(null); setShowAddForm(false); setEditingEntry(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  // Calendar grid helpers
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const dayMap = new Map(calData.map(d => [d.day, d.jars]));
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const calTotalJars   = calData.reduce((s, d) => s + d.jars, 0);
  const calDaysWithData = calData.filter(d => d.jars > 0).length;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayDetailLabel = selectedDate ? (() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })() : '';

  if (loading) {
    return (
      <div className="max-w-4xl space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl text-center py-20">
        <p className="text-slate-400">Customer not found</p>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)} className="mt-4">
          Back
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await (await import('../../api/axios')).default.delete(`/admin/users/${id}`);
      toast('Customer account deleted. All records preserved.', 'success');
      navigate(-1);
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to delete', 'error');
    } finally { setDeleting(false); setShowDelete(false); }
  };

  const handleSetPosition = async () => {
    const pos = Number(posInput);
    if (!pos || pos < 1 || pos > posTotal || !profile) return;
    setPosSaving(true);
    try {
      const arr = [...posOrder];
      const from = arr.indexOf(profile.id);
      if (from !== -1) arr.splice(from, 1);
      arr.splice(pos - 1, 0, profile.id);
      await customerOrderApi.saveAdmin(arr);
      setPosOrder(arr);
      toast(`${profile.name} moved to position ${pos}`, 'success');
    } catch { toast('Failed to update position', 'error'); }
    finally { setPosSaving(false); }
  };

  return (
    <div className="max-w-4xl space-y-6">

      {/* Edit Profile Modal */}
      {profile && (
        <EditProfileModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          initialName={profile.name}
          initialPhone={profile.phone}
          apiEndpoint={`/admin/users/${id}/profile`}
          isAdmin
          showJarRate
          initialJarRate={profile.jar_rate}
          onSave={({ name, phone, jar_rate }) => setProfile(p => p ? { ...p, name, phone, jar_rate: jar_rate ?? p.jar_rate } : p)}
        />
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDelete && profile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDelete(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Customer Account</h3>
                  <p className="text-xs text-slate-400">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-5">
                <strong>{profile.name}</strong>'s login will be disabled. All order history, bills and delivery records are preserved.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowDelete(false)}>Cancel</Button>
                <Button variant="danger" size="md" className="flex-1" loading={deleting} onClick={handleDelete}>Delete</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back + Header */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-all shrink-0">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl border border-red-100 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar name={profile.name} photo={profile.profile_photo} size="lg" className="w-14 h-14" />
            <label htmlFor="admin-profile-photo-upload"
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md cursor-pointer border border-slate-100 hover:bg-brand-50 transition-colors"
              title="Upload photo">
              <Camera className="w-3 h-3 text-brand-600" />
            </label>
            <input id="admin-profile-photo-upload" type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('photo', file);
                try {
                  const res = await api.post(`/admin/users/${id}/photo`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  setProfile(p => p ? { ...p, profile_photo: res.data.profile_photo } : p);
                  toast('Photo updated!', 'success');
                } catch { toast('Failed to upload photo', 'error'); }
                e.target.value = '';
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate">{profile.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge status={profile.status} />
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                <PhoneLink phone={profile.phone} />
              </span>
              <span className="text-xs text-slate-400">
                Joined {new Date(profile.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Jar Rate',     value: `₹${profile.jar_rate || 50}`, icon: IndianRupee, color: 'from-brand-500 to-aqua-500' },
          { label: 'Total Jars',   value: stats?.total_jars_delivered || 0, icon: Droplets, color: 'from-blue-500 to-cyan-500' },
          { label: 'Total Orders', value: stats?.total_orders || 0, icon: Package, color: 'from-purple-500 to-pink-500' },
          { label: 'Pending',      value: `₹${stats?.pending_amount || 0}`, icon: CreditCard, color: 'from-red-500 to-orange-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
            <div className={`w-9 h-9 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-2`}>
              <Icon className="w-4.5 h-4.5 text-white" />
            </div>
            <p className="text-xl font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </motion.div>
        ))}
      </div>

      {/* Set Position in List */}
      {posTotal > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 flex items-center justify-center rounded-xl bg-brand-50 text-brand-600 text-sm font-bold shrink-0">
              #{posOrder.indexOf(profile.id) + 1 || '—'}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">Position in Customer List</p>
              <p className="text-xs text-slate-400">Change delivery order position (1 – {posTotal})</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={posTotal} value={posInput}
              onChange={e => setPosInput(e.target.value)}
              placeholder={`1 – ${posTotal}`}
              className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 text-center outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all"
            />
            <span className="text-xs text-slate-400">out of {posTotal}</span>
            <button onClick={handleSetPosition}
              disabled={posSaving || !posInput || Number(posInput) < 1 || Number(posInput) > posTotal}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors">
              {posSaving ? 'Saving…' : '✓ Set Position'}
            </button>
          </div>
        </div>
      )}

      {/* Address */}
      {profile.address && (
        <div className="flex items-start gap-2 bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-700">{profile.address}</p>
        </div>
      )}

      {/* ── Delivery Calendar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            {selectedDate ? (
              <>
                <button onClick={() => { setSelectedDate(null); setShowAddForm(false); setEditingEntry(null); }}
                  className="flex items-center gap-1.5 text-brand-600 text-xs font-semibold hover:text-brand-700 transition-colors mb-1">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back to Calendar
                </button>
                <h3 className="text-sm font-bold text-slate-800">{dayDetailLabel}</h3>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-slate-800">Delivery Calendar</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {calTotalJars} jars · {calDaysWithData} delivery days
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedDate ? (
              /* Add Delivery Button — only for today or past dates */
              !showAddForm && !editingEntry && selectedDate <= todayStr && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                  <Plus className="w-3.5 h-3.5" /> Add Delivery
                </button>
              )
            ) : (
              <>
                <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <span className="text-sm font-semibold text-slate-700 min-w-[130px] text-center">
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!selectedDate ? (
            /* ── Month grid ── */
            <motion.div key="cal-grid"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}>
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
                {DAYS_OF_WEEK.map(d => (
                  <div key={d} className="py-2.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{d}</div>
                ))}
              </div>
              {calLoading ? (
                <div className="p-4"><Skeleton className="h-48 w-full rounded-xl" /></div>
              ) : (
                <div className="grid grid-cols-7">
                  {cells.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} className="aspect-square border-b border-r border-slate-50 bg-slate-50/30" />;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const jars = dayMap.get(day) || 0;
                    const isToday  = dateStr === todayStr;
                    const isFuture = dateStr > todayStr;
                    const hasData  = jars > 0;
                    return (
                      <button key={dateStr}
                        onClick={() => !isFuture && handleDayClick(dateStr)}
                        disabled={isFuture}
                        className={`aspect-square border-b border-r border-slate-50 p-1 flex flex-col items-center justify-center transition-all
                          ${isFuture
                            ? 'opacity-30 cursor-not-allowed bg-slate-50/20'
                            : isToday
                              ? 'ring-2 ring-brand-400 ring-inset bg-brand-50/40 cursor-pointer active:scale-95'
                              : hasData
                                ? 'bg-gradient-to-br from-brand-50 to-aqua-400/10 hover:from-brand-100 hover:to-aqua-400/20 cursor-pointer active:scale-95'
                                : 'hover:bg-slate-50 cursor-pointer active:scale-95'
                          }
                        `}>
                        <span className={`text-[10px] font-medium ${
                          isFuture ? 'text-slate-300'
                          : isToday ? 'text-brand-700 font-bold'
                          : hasData ? 'text-brand-600'
                          : 'text-slate-400'
                        }`}>
                          {day}
                        </span>
                        {hasData && (
                          <span className="text-xs font-bold text-brand-700 leading-none mt-0.5">{jars}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!calLoading && (
                <p className="text-center text-[10px] text-slate-400 py-2">Tap any day to view or add deliveries</p>
              )}
            </motion.div>
          ) : (
            /* ── Day Detail ── */
            <motion.div key="day-detail"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.18 }}
              className="p-4 space-y-3">

              {/* Add/Edit form */}
              <AnimatePresence>
                {(showAddForm || editingEntry) && (
                  <DeliveryForm
                    key={editingEntry ? `edit-${editingEntry.id}` : 'add'}
                    customerId={Number(id)}
                    jarRate={profile.jar_rate || 50}
                    date={selectedDate!}
                    editing={editingEntry}
                    onSaved={handleDeliverySaved}
                    onCancel={() => { setShowAddForm(false); setEditingEntry(null); }}
                  />
                )}
              </AnimatePresence>

              {dayLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />)}
                </div>
              ) : dayDeliveries.length === 0 && !showAddForm ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <CalendarDays className="w-10 h-10 text-slate-200" />
                  <p className="text-sm text-slate-400">No deliveries on this day</p>
                  <button onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition-colors">
                    <Plus className="w-4 h-4" /> Add First Delivery
                  </button>
                </div>
              ) : (
                <>
                  {dayDeliveries.map((d, i) => {
                    const p = PERIOD_META[d.period as Period] || PERIOD_META.morning;
                    return (
                      <motion.div key={`${d.id}-${d.is_manual}`}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-2xl border px-4 py-3.5 ${p.bg} ${p.border} relative`}>
                        {/* Manual badge + actions */}
                        {d.is_manual && (
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                              Manual
                            </span>
                            <button
                              onClick={() => { setEditingEntry(d); setShowAddForm(false); }}
                              className="p-1 rounded-lg hover:bg-white/80 transition-colors">
                              <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-brand-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(d)}
                              disabled={deletingId === d.id}
                              className="p-1 rounded-lg hover:bg-white/80 transition-colors disabled:opacity-50">
                              <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                            </button>
                          </div>
                        )}

                        {/* Main delivery info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{p.emoji}</span>
                            <div>
                              <p className={`text-xs font-bold ${p.text}`}>{p.label}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{d.time}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white/70 rounded-xl px-3 py-1.5 border border-white">
                            <Droplets className="w-3.5 h-3.5 text-brand-500" />
                            <span className="text-sm font-extrabold text-slate-800">{d.jars} jar{d.jars !== 1 ? 's' : ''}</span>
                          </div>
                        </div>

                        {/* Payment info */}
                        <div className="mt-2 pt-2 border-t border-white/60 flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold text-slate-600">
                            {d.is_manual ? (d.notes ? `📝 ${d.notes}` : `By ${d.staff_name}`) : `Delivered by ${d.staff_name}`}
                          </span>
                          {d.is_manual && (
                            <div className="flex items-center gap-1.5">
                              {d.is_paid ? (
                                <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                                  {PM_ICON[d.payment_mode] || <Check className="w-3 h-3" />}
                                  ₹{d.amount_collected} · {d.payment_mode}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                                  Unpaid
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Day total */}
                  <div className="flex items-center justify-between bg-brand-50 border border-brand-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-brand-500" />
                      <span className="text-sm font-semibold text-slate-700">Total for the day</span>
                    </div>
                    <span className="text-sm font-extrabold text-brand-700">{dayTotal} jar{dayTotal !== 1 ? 's' : ''}</span>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bills History ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" /> Bills History
          </h3>
        </div>
        {bills.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No bills generated yet</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {bills.map((b: any) => (
              <div key={b.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{b.month}</p>
                  <p className="text-xs text-slate-400">{b.total_jars} jars · Due {new Date(b.due_date).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-brand-600">₹{b.total_amount}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${BILL_STATUS[b.status]}`}>
                    {b.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Orders ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" /> Recent Orders
          </h3>
        </div>
        {orders.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No orders yet</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {orders.map((o: any) => (
              <div key={o.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">#{o.id}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{o.quantity} jars · <span className="capitalize text-slate-500">{o.type}</span></p>
                    <p className="text-xs text-slate-400">
                      {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-brand-600">₹{o.total_amount}</p>
                  <OrderStatusBadge status={o.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
