import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, MapPin, Droplets, Package, CreditCard, IndianRupee,
  ChevronLeft, ChevronRight, FileText, CalendarDays, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { OrderStatusBadge } from '../../components/ui/OrderStatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { EditProfileModal } from '../../components/ui/EditProfileModal';
import { calendarApi, CalendarDay, DayDelivery, CustomerProfile, CustomerProfileStats } from '../../api/calendar';

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

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calDays, setCalDays]   = useState<CalendarDay[]>([]);
  const [calLoading, setCalLoading] = useState(true);

  // Day detail state
  const [selectedDate, setSelectedDate]     = useState<string | null>(null);
  const [dayDeliveries, setDayDeliveries]   = useState<DayDelivery[]>([]);
  const [dayTotal, setDayTotal]             = useState(0);
  const [dayLoading, setDayLoading]         = useState(false);

  const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    calendarApi.getCustomerProfile(Number(id))
      .then(({ data }) => {
        setProfile(data.customer);
        setStats(data.stats);
        setBills(data.bills);
        setOrders(data.orders);
      })
      .catch(() => toast('Failed to load customer profile', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setCalLoading(true);
    calendarApi.getCalendar(calMonthStr, Number(id))
      .then(({ data }) => setCalDays(data.days))
      .catch(() => {})
      .finally(() => setCalLoading(false));
  }, [id, calYear, calMonth]);

  const prevMonth = () => {
    setSelectedDate(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDate(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const handleDayClick = async (dateStr: string, hasData: boolean) => {
    if (!hasData) return;
    setSelectedDate(dateStr);
    setDayLoading(true);
    try {
      const { data } = await calendarApi.getDayDetail(dateStr, Number(id));
      setDayDeliveries(data.deliveries);
      setDayTotal(data.totalJars);
    } catch {
      setDayDeliveries([]);
      setDayTotal(0);
    } finally { setDayLoading(false); }
  };

  const dayDetailLabel = selectedDate ? (() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })() : '';

  // Calendar grid
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const dayMap = new Map<string, CalendarDay>();
  calDays.forEach(d => {
    const dateStr = typeof d.date === 'string' ? d.date.split('T')[0] : '';
    if (dateStr) dayMap.set(dateStr, d);
  });

  // Use local date parts — toISOString() is UTC and causes off-by-one in IST+5:30
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const calTotalJars = calDays.reduce((s, d) => s + Number(d.jars_delivered), 0);
  const calTotalAmount = calDays.reduce((s, d) => s + Number(d.total_amount), 0);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

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
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')} className="mt-4">
          Back to Users
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await (await import('../../api/axios')).default.delete(`/admin/users/${id}`);
      toast('Customer account deleted. All records preserved.', 'success');
      navigate('/admin/users');
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to delete', 'error');
    } finally { setDeleting(false); setShowDelete(false); }
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
        {/* Top row: back arrow + action buttons */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/admin/users')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-all shrink-0">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          {/* Edit + Delete */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl border border-red-100 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
        {/* Profile info */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg bg-gradient-to-br from-brand-500 to-aqua-500 shadow-sm shrink-0">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate">{profile.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge status={profile.status} />
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Phone className="w-3 h-3" />{profile.phone}
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
          { label: 'Jar Rate',       value: `₹${profile.jar_rate || 50}`, icon: IndianRupee, color: 'from-brand-500 to-aqua-500' },
          { label: 'Total Jars',     value: stats?.total_jars_delivered || 0, icon: Droplets, color: 'from-blue-500 to-cyan-500' },
          { label: 'Total Orders',   value: stats?.total_orders || 0, icon: Package, color: 'from-purple-500 to-pink-500' },
          { label: 'Pending',        value: `₹${stats?.pending_amount || 0}`, icon: CreditCard, color: 'from-red-500 to-orange-500' },
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

      {/* Address */}
      {profile.address && (
        <div className="flex items-start gap-2 bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-700">{profile.address}</p>
        </div>
      )}

      {/* ── Calendar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            {selectedDate ? (
              <>
                <button onClick={() => setSelectedDate(null)}
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
                  {calTotalJars} jars · ₹{calTotalAmount} · {calDays.filter(d => Number(d.jars_delivered) > 0).length} days
                </p>
              </>
            )}
          </div>
          {!selectedDate && (
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <span className="text-sm font-semibold text-slate-700 min-w-[130px] text-center">
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!selectedDate ? (
            <motion.div key="cal-grid"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}>
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
                    const data = dayMap.get(dateStr);
                    const isToday = dateStr === todayStr;
                    const hasData = !!data && Number(data.jars_delivered) > 0;
                    return (
                      <button key={dateStr}
                        onClick={() => handleDayClick(dateStr, hasData)}
                        disabled={!hasData}
                        className={`aspect-square border-b border-r border-slate-50 p-1 flex flex-col items-center justify-center transition-all
                          ${isToday ? 'ring-2 ring-brand-400 ring-inset bg-brand-50/40' : ''}
                          ${hasData ? 'bg-gradient-to-br from-brand-50 to-aqua-400/10 cursor-pointer hover:from-brand-100 hover:to-aqua-400/20 active:scale-95' : 'cursor-default'}
                        `}>
                        <span className={`text-[10px] font-medium ${isToday ? 'text-brand-700 font-bold' : hasData ? 'text-brand-600' : 'text-slate-400'}`}>
                          {day}
                        </span>
                        {hasData && (
                          <span className="text-xs font-bold text-brand-700 leading-none mt-0.5">{data!.jars_delivered}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!calLoading && (
                <p className="text-center text-[10px] text-slate-400 py-2">Tap a delivery day to see details</p>
              )}
            </motion.div>
          ) : (
            /* ── Day Detail ── */
            <motion.div key="day-detail"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.18 }}
              className="p-4 space-y-3">
              {dayLoading ? (
                <div className="space-y-3">
                  {[0,1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />)}
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
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-2xl border px-4 py-3.5 ${p.bg} ${p.border}`}>
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
                        <div className="mt-2 pt-2 border-t border-white/60 flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">Delivered by</span>
                          <span className="text-[11px] font-semibold text-slate-600">{d.staff_name}</span>
                        </div>
                      </motion.div>
                    );
                  })}
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
