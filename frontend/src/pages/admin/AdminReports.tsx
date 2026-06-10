import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ComposedChart,
} from 'recharts';
import {
  TrendingUp, IndianRupee, Clock, RefreshCw, Calendar, X,
  Droplets, Package, Users, CheckCircle, ShoppingBag, Trophy,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { StatCardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import {
  billingApi,
  RevenuePoint, RevenueSummary, PendingCustomer, StaffPerf,
  CustomerGrowthPoint, JarsTrendPoint, OrderTypePoint, TopCustomer, OrderVolumePoint,
} from '../../api/billing';

// ─────────────────────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  blue:    '#2563EB',
  cyan:    '#06B6D4',
  green:   '#22C55E',
  amber:   '#F59E0B',
  purple:  '#8B5CF6',
  rose:    '#F43F5E',
  indigo:  '#6366F1',
  teal:    '#14B8A6',
  orange:  '#F97316',
  pink:    '#EC4899',
};
const PIE_COLORS = [C.blue, C.cyan, C.green, C.amber, C.purple];

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtINR  = (v: number) => `₹${v.toLocaleString('en-IN')}`;
const fmtK    = (v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`;
const fmtNum  = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

const ORDER_TYPE_LABELS: Record<string, string> = {
  instant:  'Instant',
  preorder: 'Pre-order',
  monthly:  'Monthly',
  bulk:     'Bulk',
};
const ORDER_TYPE_COLORS: Record<string, string> = {
  instant:  C.blue,
  preorder: C.cyan,
  monthly:  C.purple,
  bulk:     C.amber,
};

// ─────────────────────────────────────────────────────────────────────────────
// MiniStat card
// ─────────────────────────────────────────────────────────────────────────────
const MiniStat = ({ label, value, sub, icon, gradient }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; gradient: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className={`shrink-0 w-[155px] sm:w-auto sm:flex-1 rounded-2xl p-4 ${gradient} border border-white/10`}>
    <div className="flex items-center justify-between mb-3">
      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
        {icon}
      </div>
    </div>
    <p className="text-lg font-extrabold text-white leading-tight">{value}</p>
    {sub && <p className="text-[10px] text-white/60 font-medium">{sub}</p>}
    <p className="text-[11px] text-white/70 font-medium mt-0.5">{label}</p>
  </motion.div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Chart wrapper
// ─────────────────────────────────────────────────────────────────────────────
const ChartCard = ({ title, subtitle, badge, delay = 0, children, className = '' }: {
  title: string; subtitle?: string; badge?: React.ReactNode; delay?: number;
  children: React.ReactNode; className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    className={`bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden ${className}`}>
    <div className="px-4 sm:px-5 py-4 border-b border-slate-50 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {badge}
    </div>
    <div className="px-2 sm:px-4 py-4">{children}</div>
  </motion.div>
);

const Shimmer = ({ h = 'h-52' }: { h?: string }) => (
  <div className={`${h} bg-slate-50 rounded-xl animate-pulse`} />
);
const Empty = ({ h = 'h-52' }: { h?: string }) => (
  <div className={`${h} flex items-center justify-center text-slate-400 text-sm`}>No data yet</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip
// ─────────────────────────────────────────────────────────────────────────────
const ttStyle = { borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12, padding: '8px 12px' };

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export const AdminReports = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading] = useState(true);

  // Data states
  const [revenue,    setRevenue]    = useState<RevenuePoint[]>([]);
  const [summary,    setSummary]    = useState<RevenueSummary | null>(null);
  const [pending,    setPending]    = useState<PendingCustomer[]>([]);
  const [staff,      setStaff]      = useState<StaffPerf[]>([]);
  const [customers,  setCustomers]  = useState<CustomerGrowthPoint[]>([]);
  const [jarsTrend,  setJarsTrend]  = useState<JarsTrendPoint[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderTypePoint[]>([]);
  const [topCusts,   setTopCusts]   = useState<TopCustomer[]>([]);
  const [orderVol,   setOrderVol]   = useState<OrderVolumePoint[]>([]);

  // Date filters
  const [dateFilter,  setDateFilter]  = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const params = useCallback((): Record<string, string> => {
    const p: Record<string, string> = { period };
    if (dateFilter)  { p.period = 'daily';   p.days   = '1'; }
    if (monthFilter) { p.period = 'monthly'; p.months = '1'; }
    return p;
  }, [period, dateFilter, monthFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = params();
      const [revRes, pendRes, staffRes, custRes, jarsRes, typesRes, topRes, volRes] =
        await Promise.all([
          billingApi.revenue(p),
          billingApi.pending(),
          billingApi.staffPerformance(monthFilter || undefined),
          billingApi.customerGrowth(p),
          billingApi.jarsTrend(p),
          billingApi.ordersByType(),
          billingApi.topCustomers(),
          billingApi.orderVolume(p),
        ]);
      setRevenue(revRes.data.data);
      setSummary(revRes.data.summary);
      setPending(pendRes.data.data);
      setStaff(staffRes.data.data);
      setCustomers(custRes.data.data);
      setJarsTrend(jarsRes.data.data);
      setOrderTypes(typesRes.data.data);
      setTopCusts(topRes.data.data);
      setOrderVol(volRes.data.data);
    } catch { toast('Failed to load reports', 'error'); }
    finally { setLoading(false); }
  }, [period, dateFilter, monthFilter]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => { setDateFilter(''); setMonthFilter(''); setShowDatePicker(false); };

  const xKey = period === 'monthly' ? 'month' : 'date';

  const formatX = (val: string) => {
    if (!val) return '';
    if (period === 'monthly') {
      const [y, m] = val.split('-');
      return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-IN', { month: 'short' });
    }
    return new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const activeDateLabel = dateFilter
    ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : monthFilter
    ? new Date(monthFilter + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : null;

  // Pie data for payment split
  const paymentPie = summary ? [
    { name: 'Cash',    value: Number(summary.cash_total)    },
    { name: 'Online',  value: Number(summary.online_total)  },
    { name: 'Advance', value: Number(summary.advance_total) },
    { name: 'Pending', value: Number(summary.total_pending) },
  ].filter(d => d.value > 0) : [];

  // Pie data for order types
  const orderTypePie = orderTypes.map(t => ({
    name:  ORDER_TYPE_LABELS[t.type] || t.type,
    value: Number(t.count),
    color: ORDER_TYPE_COLORS[t.type] || C.blue,
  }));

  const chartH = typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 240;
  const smH    = typeof window !== 'undefined' && window.innerWidth < 640 ? 180 : 210;

  return (
    <div className="max-w-5xl space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Analytics</h2>
          <p className="text-xs text-slate-400 mt-0.5">Full business overview</p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* ── Period + Date Filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {(['daily', 'monthly'] as const).map(p => (
            <button key={p} onClick={() => { setPeriod(p); clearFilters(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize
                ${period === p ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {p}
            </button>
          ))}
        </div>
        <button onClick={() => setShowDatePicker(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all
            ${showDatePicker || dateFilter || monthFilter
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
          <Calendar className="w-3.5 h-3.5" />
          {activeDateLabel || 'Filter Date'}
        </button>
        {activeDateLabel && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold px-2.5 py-1 rounded-full hover:bg-brand-100 transition-colors">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDatePicker && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-2 pb-1">
              {period === 'daily' ? (
                <input type="date" value={dateFilter}
                  onChange={e => { setDateFilter(e.target.value); setMonthFilter(''); }}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-400 transition-all" />
              ) : (
                <input type="month" value={monthFilter}
                  onChange={e => { setMonthFilter(e.target.value); setDateFilter(''); }}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-400 transition-all" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 1: 8 Summary Stat Cards                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
        {loading || !summary ? [0,1,2,3,4,5,6,7].map(i => (
          <div key={i} className="shrink-0 w-[155px] sm:w-auto"><StatCardSkeleton /></div>
        )) : (<>
          <MiniStat label="Today's Revenue"  value={fmtINR(Number(summary.today))}
            icon={<IndianRupee className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-blue-500 to-blue-700" />
          <MiniStat label="This Month"       value={fmtINR(Number(summary.this_month))}
            icon={<TrendingUp className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" />
          <MiniStat label="Total Pending"    value={fmtINR(Number(summary.total_pending))}
            icon={<Clock className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-rose-500 to-rose-700" />
          <MiniStat label="All Time Revenue" value={fmtINR(Number(summary.all_time))}
            icon={<IndianRupee className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-violet-500 to-purple-700" />
          <MiniStat label="Deliveries Today" value={String(Number(summary.deliveries_today))}
            sub={`${Number(summary.jars_today)} jars`}
            icon={<Package className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-cyan-500 to-cyan-700" />
          <MiniStat label="Active Customers" value={String(Number(summary.total_customers))}
            icon={<Users className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" />
          <MiniStat label="Pending Approvals" value={String(Number(summary.pending_approvals))}
            icon={<CheckCircle className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-amber-500 to-amber-700" />
          <MiniStat label="Cash Collected"   value={fmtINR(Number(summary.cash_total))}
            icon={<Droplets className="w-4 h-4 text-white" />}
            gradient="bg-gradient-to-br from-teal-500 to-teal-700" />
        </>)}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 2: Revenue Trend (full width)                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <ChartCard title="Revenue Trend" subtitle={`Cash · Online · Advance — ${period === 'daily' ? 'Last 30 days' : 'Last 12 months'}`}>
        {loading ? <Shimmer /> : revenue.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart data={revenue} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.blue}   stopOpacity={0.18} />
                  <stop offset="95%" stopColor={C.blue}   stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                tickFormatter={formatX} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => [fmtINR(Number(v)), '']} contentStyle={ttStyle} />
              <Legend iconType="circle" iconSize={8}
                formatter={v => <span style={{ fontSize: 11, color: '#64748B' }}>{v}</span>} />
              <Area type="monotone" dataKey="total"   stroke={C.blue}   strokeWidth={2.5} fill="url(#gTotal)" name="Total" />
              <Area type="monotone" dataKey="cash"    stroke={C.amber}  strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Cash" />
              <Area type="monotone" dataKey="online"  stroke={C.green}  strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Online" />
              <Area type="monotone" dataKey="advance" stroke={C.purple} strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Advance" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 3: Order Volume + Jars Delivered side by side                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Order Volume */}
        <ChartCard title="Order Volume" subtitle="Orders placed per period" delay={0.05}>
          {loading ? <Shimmer h="h-44" /> : orderVol.length === 0 ? <Empty h="h-44" /> : (
            <ResponsiveContainer width="100%" height={smH}>
              <ComposedChart data={orderVol} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.indigo} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={C.cyan} stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  tickFormatter={formatX} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={ttStyle} />
                <Bar dataKey="orders" fill="url(#gOrders)" radius={[6, 6, 0, 0]} name="Orders" />
                <Line type="monotone" dataKey="jars_ordered" stroke={C.amber} strokeWidth={2} dot={false} name="Jars Ordered" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Jars Delivered */}
        <ChartCard title="Jars Delivered" subtitle="Actual deliveries per period" delay={0.08}>
          {loading ? <Shimmer h="h-44" /> : jarsTrend.length === 0 ? <Empty h="h-44" /> : (
            <ResponsiveContainer width="100%" height={smH}>
              <AreaChart data={jarsTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gJars" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.cyan} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  tickFormatter={formatX} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false}
                  tickFormatter={fmtNum} />
                <Tooltip contentStyle={ttStyle} />
                <Area type="monotone" dataKey="jars" stroke={C.cyan} strokeWidth={2.5}
                  fill="url(#gJars)" name="Jars Delivered" />
                <Area type="monotone" dataKey="deliveries" stroke={C.teal} strokeWidth={1.5}
                  fill="none" strokeDasharray="4 2" name="Delivery Count" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 4: New Customers + Cumulative                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <ChartCard title="New Customers" subtitle={period === 'daily' ? 'Daily signups (30 days)' : 'Monthly signups'} delay={0.1}>
        {loading ? <Shimmer /> : customers.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart data={customers} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gCust" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.cyan} stopOpacity={1} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                tickFormatter={formatX} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={ttStyle} />
              <Legend iconType="circle" iconSize={8}
                formatter={v => <span style={{ fontSize: 11, color: '#64748B' }}>{v}</span>} />
              <Bar dataKey="new_customers" fill="url(#gCust)" radius={[6, 6, 0, 0]} name="New Customers" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 5: Payment Split Pie + Order Type Pie                             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Payment Split */}
        <ChartCard title="Payment Split" subtitle="Cash · Online · Advance vs Pending" delay={0.12}>
          {loading ? <Shimmer h="h-52" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={paymentPie} cx="50%" cy="50%" innerRadius={50} outerRadius={78}
                  paddingAngle={3} dataKey="value">
                  {paymentPie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [fmtINR(Number(v)), '']} contentStyle={ttStyle} />
                <Legend iconType="circle" iconSize={8}
                  formatter={v => <span style={{ fontSize: 11, color: '#64748B' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Order Types */}
        <ChartCard title="Orders by Type" subtitle="Instant · Pre-order · Monthly · Bulk" delay={0.14}>
          {loading ? <Shimmer h="h-52" /> : orderTypePie.length === 0 ? <Empty h="h-52" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={orderTypePie} cx="50%" cy="50%" innerRadius={50} outerRadius={78}
                  paddingAngle={3} dataKey="value">
                  {orderTypePie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, name: any, props: any) => [
                    `${v} orders · ${fmtINR(Number(props.payload.revenue || 0))}`,
                    props.payload.name,
                  ]}
                  contentStyle={ttStyle} />
                <Legend iconType="circle" iconSize={8}
                  formatter={v => <span style={{ fontSize: 11, color: '#64748B' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 6: Staff Performance — grouped bar                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <ChartCard title="Staff Performance"
        subtitle="Deliveries · Jars · Cash & Online collected"
        delay={0.16}>
        {loading ? <Shimmer /> : staff.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart data={staff} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={ttStyle}
                formatter={(v: any, name: string) =>
                  name.includes('collected') ? [fmtINR(Number(v)), name] : [v, name]
                } />
              <Legend iconType="circle" iconSize={8}
                formatter={v => <span style={{ fontSize: 11, color: '#64748B' }}>{v}</span>} />
              <Bar dataKey="deliveries"       fill={C.blue}   radius={[4, 4, 0, 0]} name="Deliveries" />
              <Bar dataKey="jars_delivered"   fill={C.cyan}   radius={[4, 4, 0, 0]} name="Jars Delivered" />
              <Bar dataKey="cash_collected"   fill={C.amber}  radius={[4, 4, 0, 0]} name="Cash Collected" />
              <Bar dataKey="online_collected" fill={C.green}  radius={[4, 4, 0, 0]} name="Online Collected" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 7: Top Customers                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <ChartCard title="Top Customers by Revenue"
        subtitle="Based on total payments received"
        badge={<Trophy className="w-4 h-4 text-amber-500" />}
        delay={0.18}>
        {loading ? <Shimmer /> : topCusts.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={smH}>
            <BarChart data={topCusts} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gTop" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor={C.purple} stopOpacity={1} />
                  <stop offset="100%" stopColor={C.pink}   stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }}
                tickLine={false} axisLine={false} width={80} />
              <Tooltip formatter={(v: any) => [fmtINR(Number(v)), 'Total Paid']} contentStyle={ttStyle} />
              <Bar dataKey="total_paid" fill="url(#gTop)" radius={[0, 6, 6, 0]} name="Total Paid" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 8: Pending Payments Table                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {pending.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-800">Pending Payments</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Customers with unpaid bills</p>
            </div>
            <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-0.5 rounded-full font-bold">
              {pending.length}
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Customer', 'Phone', 'Pending Amount', 'Bills', 'Oldest Due'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pending.map((p, i) => (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">{p.name}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500">{p.phone}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-red-600">{fmtINR(Number(p.pending_amount))}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">{p.bill_count}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(p.oldest_due).toLocaleDateString('en-IN')}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {pending.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 bg-gradient-to-br from-red-400 to-red-600 shadow-sm">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-400">{p.phone} · {p.bill_count} bill{p.bill_count > 1 ? 's' : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-red-600">{fmtINR(Number(p.pending_amount))}</p>
                  <p className="text-[10px] text-slate-400">Due {new Date(p.oldest_due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

    </div>
  );
};
