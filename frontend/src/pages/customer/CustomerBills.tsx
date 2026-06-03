import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Download, ChevronDown, IndianRupee,
  CheckCircle2, AlertCircle, Clock, Banknote,
  CalendarDays, CalendarRange, Calendar as CalendarIcon,
  CreditCard, Filter, RefreshCw, Package, Wifi, WifiOff,
} from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { billingApi, Bill, Transaction } from '../../api/billing';
import { eachDateInRange } from '../../utils/date';

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const thisMonthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

type PayFilter = 'all' | 'online' | 'cash' | 'pending';
type ReportMode = 'monthly' | 'day' | 'range';

// ── Mode config ───────────────────────────────────────────────────────────────
const MODE_CFG = {
  online:  { label: 'Online',  icon: CreditCard, bg: 'bg-blue-50', border: 'border-blue-200',  text: 'text-blue-700',   dot: 'bg-blue-400'  },
  cash:    { label: 'Cash',    icon: Banknote,   bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700',  dot: 'bg-green-400' },
  advance: { label: 'Advance', icon: IndianRupee, bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-400' },
};
const STATUS_CFG = {
  completed: { label: 'Paid',    bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2 },
  pending:   { label: 'Pending', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Clock },
};
const BILL_STATUS = {
  paid:    { label: 'Paid',    bg: 'bg-green-50 border-green-200',  text: 'text-green-700',  icon: CheckCircle2 },
  partial: { label: 'Partial', bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  icon: Clock },
  unpaid:  { label: 'Unpaid',  bg: 'bg-red-50 border-red-200',      text: 'text-red-600',    icon: AlertCircle },
};

// ── Component ─────────────────────────────────────────────────────────────────
export const CustomerBills = () => {
  const { toast } = useToast();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills,        setBills]        = useState<Bill[]>([]);
  const [txLoading,    setTxLoading]    = useState(true);
  const [billLoading,  setBillLoading]  = useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [payFilter,    setPayFilter]    = useState<PayFilter>('all');
  const [expandedTx,   setExpandedTx]  = useState<number | null>(null);
  const [expandedBill, setExpandedBill] = useState<number | null>(null);

  // ── Report ──────────────────────────────────────────────────────────────────
  const [reportMode,   setReportMode]  = useState<ReportMode>('monthly');
  const [dayDate,      setDayDate]     = useState(todayStr());
  const [rangeStart,   setRangeStart]  = useState(thisMonthStart());
  const [rangeEnd,     setRangeEnd]    = useState(todayStr());
  const [report,       setReport]      = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadTransactions = async () => {
    setTxLoading(true);
    try {
      const { data } = await billingApi.myTransactions();
      // Only show credit transactions (money received from customer) — exclude internal debits
      setTransactions(data.transactions.filter(t => t.type === 'credit'));
    } catch { toast('Failed to load payment records', 'error'); }
    finally { setTxLoading(false); }
  };

  const loadBills = async () => {
    setBillLoading(true);
    try {
      const { data } = await billingApi.list();
      setBills(data.bills);
    } catch { toast('Failed to load bills', 'error'); }
    finally { setBillLoading(false); }
  };

  const loadReport = async (start: string, end: string) => {
    setReportLoading(true); setReport(null);
    try {
      const { data } = await billingApi.deliveryReport({ startDate: start, endDate: end });
      setReport(data.report);
    } catch { toast('Failed to load report', 'error'); }
    finally { setReportLoading(false); }
  };

  useEffect(() => { loadTransactions(); loadBills(); }, []);

  useEffect(() => {
    if (reportMode === 'day') loadReport(dayDate, dayDate);
    else if (reportMode === 'range' && rangeStart <= rangeEnd) loadReport(rangeStart, rangeEnd);
    else setReport(null);
  }, [reportMode, dayDate, rangeStart, rangeEnd]);

  // ── Derived summary ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const online  = transactions.filter(t => t.mode === 'online' && t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);
    const cash    = transactions.filter(t => t.mode === 'cash'   && t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);
    const pending = transactions.filter(t => t.status === 'pending').reduce((s, t) => s + Number(t.amount), 0);
    const billPending = bills.reduce((s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.paid_amount)), 0);
    return { online, cash, totalPaid: online + cash, pending, billPending };
  }, [transactions, bills]);

  // ── Filtered transactions ────────────────────────────────────────────────────
  const filteredTx = useMemo(() => {
    if (payFilter === 'all')     return transactions;
    if (payFilter === 'online')  return transactions.filter(t => t.mode === 'online');
    if (payFilter === 'cash')    return transactions.filter(t => t.mode === 'cash');
    if (payFilter === 'pending') return transactions.filter(t => t.status === 'pending');
    return transactions;
  }, [transactions, payFilter]);

  const FILTER_TABS: { key: PayFilter; label: string; count?: number }[] = [
    { key: 'all',     label: 'All',     count: transactions.length },
    { key: 'online',  label: 'Online',  count: transactions.filter(t => t.mode === 'online').length },
    { key: 'cash',    label: 'Cash',    count: transactions.filter(t => t.mode === 'cash').length },
    { key: 'pending', label: 'Pending', count: transactions.filter(t => t.status === 'pending').length },
  ];

  const REPORT_TABS: { mode: ReportMode; label: string; icon: typeof CalendarIcon }[] = [
    { mode: 'monthly', label: 'Monthly Bills', icon: CalendarIcon  },
    { mode: 'day',     label: 'Day',           icon: CalendarDays  },
    { mode: 'range',   label: 'Date Range',    icon: CalendarRange },
  ];

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Summary strip ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 rounded-2xl p-5">

        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Payment Summary</p>
          <button onClick={() => { loadTransactions(); loadBills(); }}
            className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Total paid */}
          <div className="bg-slate-800 rounded-xl p-3">
            <p className="text-slate-500 text-[10px] font-medium mb-1">Total Paid</p>
            <p className="text-white font-bold text-lg leading-none">₹{summary.totalPaid.toLocaleString('en-IN')}</p>
          </div>
          {/* Online */}
          <div className="bg-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1 mb-1">
              <CreditCard className="w-3 h-3 text-blue-400" />
              <p className="text-slate-500 text-[10px] font-medium">Online</p>
            </div>
            <p className="text-blue-400 font-bold text-lg leading-none">₹{summary.online.toLocaleString('en-IN')}</p>
          </div>
          {/* Cash */}
          <div className="bg-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1 mb-1">
              <Banknote className="w-3 h-3 text-green-400" />
              <p className="text-slate-500 text-[10px] font-medium">Cash</p>
            </div>
            <p className="text-green-400 font-bold text-lg leading-none">₹{summary.cash.toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* Pending row */}
        <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            {summary.pending > 0 || summary.billPending > 0
              ? <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              : <div className="w-2 h-2 rounded-full bg-green-400" />}
            <p className="text-slate-400 text-xs font-medium">
              {summary.pending > 0 || summary.billPending > 0
                ? 'Outstanding amount'
                : 'All bills cleared 🎉'}
            </p>
          </div>
          {(summary.pending > 0 || summary.billPending > 0) && (
            <p className="text-red-400 font-bold text-sm">
              ₹{(summary.pending + summary.billPending).toLocaleString('en-IN')}
            </p>
          )}
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Per-order payment transactions
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-brand-600" />
            Order Payments
          </h2>
          {/* Filter tabs */}
          <div className="flex gap-1.5">
            {FILTER_TABS.map(tab => (
              <button key={tab.key} onClick={() => setPayFilter(tab.key)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all
                  ${payFilter === tab.key
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 ${payFilter === tab.key ? 'text-white/70' : 'text-slate-400'}`}>
                    ({tab.count})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {txLoading ? (
          <div className="space-y-2">
            {[0,1,2].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : filteredTx.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <Filter className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">
              {payFilter === 'all' ? 'No payment records yet' : `No ${payFilter} payments found`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTx.map((tx, i) => {
              const modeCfg   = MODE_CFG[tx.mode] || MODE_CFG.cash;
              const statCfg   = STATUS_CFG[tx.status];
              const ModeIcon  = modeCfg.icon;
              const StatIcon  = statCfg.icon;
              const isOpen    = expandedTx === tx.id;

              return (
                <motion.div key={tx.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

                  {/* Main row */}
                  <button onClick={() => setExpandedTx(isOpen ? null : tx.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/50 transition-colors">

                    {/* Mode icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${modeCfg.bg} border ${modeCfg.border}`}>
                      <ModeIcon className={`w-4.5 h-4.5 ${modeCfg.text}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800">
                          {tx.order_id ? `Order #${tx.order_id}` : 'Bill Payment'}
                        </p>
                        {/* Mode badge */}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${modeCfg.bg} ${modeCfg.border} ${modeCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${modeCfg.dot}`} />
                          {modeCfg.label}
                        </span>
                        {/* Status badge */}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statCfg.bg} ${statCfg.text}`}>
                          <StatIcon className="w-2.5 h-2.5" />
                          {statCfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(tx.created_at)} · {formatTime(tx.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <p className={`text-base font-extrabold ${tx.status === 'completed' ? 'text-slate-900' : 'text-amber-600'}`}>
                        ₹{Number(tx.amount).toLocaleString('en-IN')}
                      </p>
                      <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                        className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Amount',       value: `₹${Number(tx.amount).toLocaleString('en-IN')}`, color: 'text-slate-800' },
                              { label: 'Mode',         value: modeCfg.label,                                    color: modeCfg.text },
                              { label: 'Status',       value: statCfg.label,                                    color: tx.status === 'completed' ? 'text-green-700' : 'text-amber-700' },
                              { label: 'Order',        value: tx.order_id ? `#${tx.order_id}` : '—',            color: 'text-slate-600' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                                <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
                              </div>
                            ))}
                          </div>
                          {tx.note && (
                            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                              📝 {tx.note}
                            </p>
                          )}
                          {tx.mode === 'cash' && tx.status === 'pending' && (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                              <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <p className="text-xs text-amber-700 font-medium">
                                Cash collected — pending staff verification
                              </p>
                            </div>
                          )}
                          {tx.mode === 'online' && tx.status === 'completed' && (
                            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                              <Wifi className="w-3.5 h-3.5 text-green-600 shrink-0" />
                              <p className="text-xs text-green-700 font-medium">
                                Online payment verified via Razorpay
                              </p>
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

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Monthly bills + delivery report
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-brand-600" />
          Monthly Bills &amp; Reports
        </h2>

        {/* Report mode tabs */}
        <div className="flex gap-2 mb-4">
          {REPORT_TABS.map(({ mode, label, icon: Icon }) => (
            <button key={mode} onClick={() => setReportMode(mode)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all
                ${reportMode === mode
                  ? 'bg-brand-600 text-white border-brand-600 shadow-brand'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Date pickers ── */}
        {reportMode === 'day' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 mb-4">
            <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
            <input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-all" />
            {report && (
              <button onClick={() => window.open(billingApi.deliveryReportPdfUrl({ startDate: dayDate, endDate: dayDate }), '_blank')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:opacity-90 transition-all">
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
            )}
          </motion.div>
        )}

        {reportMode === 'range' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 block tracking-wider">From</label>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 block tracking-wider">To</label>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 transition-all" />
              </div>
            </div>
            {report && (
              <button onClick={() => window.open(billingApi.deliveryReportPdfUrl({ startDate: rangeStart, endDate: rangeEnd }), '_blank')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-white text-xs font-bold hover:opacity-90 active:scale-[0.98] transition-all">
                <Download className="w-3.5 h-3.5" /> Download Report PDF
              </button>
            )}
          </motion.div>
        )}

        {/* ── Day / range delivery report ── */}
        {reportMode !== 'monthly' && (
          <div className="mb-4">
            {reportLoading ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : report ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Delivery Report</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {report.startDate === report.endDate
                        ? new Date(report.startDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                        : `${new Date(report.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${new Date(report.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 px-5 py-4">
                  {[
                    { label: 'Total Jars', value: report.totalJars, color: 'text-slate-800' },
                    { label: 'Rate',       value: `₹${report.jarRate}`,        color: 'text-slate-800' },
                    { label: 'Total',      value: `₹${report.totalAmount}`,    color: 'text-brand-700' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 font-medium">{item.label}</p>
                      <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const jarMap = new Map(report.days.map((d: any) => [d.date, d.jars]));
                  const allDates = eachDateInRange(report.startDate, report.endDate).map(date => ({
                    date, jars: (jarMap.get(date) as number) ?? 0,
                  }));
                  return (
                    <div className="px-5 pb-5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Daily Breakdown</p>
                      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
                        {allDates.map(({ date, jars }) => {
                          const d = new Date(date + 'T00:00:00');
                          const hasJars = jars > 0;
                          return (
                            <div key={date} className={`rounded-xl p-1.5 text-center border transition-all ${hasJars ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                              <p className="text-[9px] text-slate-400 leading-none">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                              <p className={`text-xs font-bold leading-tight mt-0.5 ${hasJars ? 'text-slate-700' : 'text-slate-400'}`}>{d.getDate()}</p>
                              <p className={`text-sm font-bold leading-none mt-0.5 ${hasJars ? 'text-green-600' : 'text-slate-300'}`}>{jars}</p>
                            </div>
                          );
                        })}
                      </div>
                      {report.totalJars === 0 && <p className="text-center text-xs text-slate-400 mt-3">No deliveries in this period</p>}
                    </div>
                  );
                })()}
              </motion.div>
            ) : null}
          </div>
        )}

        {/* ── Monthly bills list ── */}
        {reportMode === 'monthly' && (
          <>
            {billLoading ? (
              <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
            ) : bills.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-600">No monthly bills yet</p>
                <p className="text-xs text-slate-400 mt-1">Bills are generated by admin at month end.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bills.map((b, i) => {
                  const cfg    = BILL_STATUS[b.status] || BILL_STATUS.unpaid;
                  const Icon   = cfg.icon;
                  const due    = Math.max(0, Number(b.total_amount) - Number(b.paid_amount));
                  const isOpen = expandedBill === b.id;

                  return (
                    <motion.div key={b.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

                      <button onClick={() => setExpandedBill(isOpen ? null : b.id)}
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50/50 transition-colors">

                        {/* Month badge */}
                        <div className="w-12 h-12 bg-slate-800 rounded-2xl flex flex-col items-center justify-center shrink-0">
                          <span className="text-white text-[11px] font-bold leading-none">
                            {MONTH_NAMES[Number(b.month.split('-')[1]) - 1].toUpperCase()}
                          </span>
                          <span className="text-slate-400 text-[10px] leading-none mt-0.5">
                            {b.month.split('-')[0].slice(2)}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">
                              {MONTH_NAMES[Number(b.month.split('-')[1]) - 1]} {b.month.split('-')[0]}
                            </p>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                              <Icon className="w-2.5 h-2.5" />
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{b.total_jars} jars × ₹{b.jar_rate}/jar</p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-base font-bold text-slate-900">₹{Number(b.total_amount).toFixed(0)}</p>
                            {due > 0 && <p className="text-[10px] text-red-500 font-semibold">₹{due.toFixed(0)} due</p>}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                            className="overflow-hidden">
                            <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-3">

                              {/* Breakdown grid */}
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: 'Subtotal',      value: `₹${b.subtotal}`,          color: 'text-slate-700' },
                                  { label: 'Prev. Pending', value: `₹${b.previous_pending}`,  color: 'text-red-600'   },
                                  { label: 'Advance Used',  value: `-₹${b.advance_used}`,     color: 'text-green-600' },
                                  { label: 'Amount Paid',   value: `₹${b.paid_amount}`,       color: 'text-green-700' },
                                ].map(({ label, value, color }) => (
                                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                                    <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Balance due / cleared */}
                              <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${due > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                <div className="flex items-center gap-2">
                                  {due > 0
                                    ? <AlertCircle className="w-4 h-4 text-red-500" />
                                    : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                  <p className={`text-sm font-bold ${due > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                    {due > 0 ? 'Balance Due' : 'Fully Paid'}
                                  </p>
                                </div>
                                <p className={`text-base font-bold ${due > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                  {due > 0 ? `₹${due.toFixed(2)}` : '✓ Cleared'}
                                </p>
                              </div>

                              {/* Due date */}
                              <p className="text-xs text-slate-400 text-center">
                                Due: {new Date(b.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </p>

                              {/* Download PDF */}
                              <button
                                onClick={e => { e.stopPropagation(); window.open(billingApi.pdfUrl(b.id), '_blank'); }}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-white text-xs font-bold hover:opacity-90 active:scale-[0.98] transition-all">
                                <Download className="w-4 h-4" /> Download Bill PDF
                              </button>

                              {due > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                                  <p className="text-xs text-amber-700 font-semibold">
                                    ₹{due.toFixed(2)} due — please pay cash to your delivery staff
                                  </p>
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
          </>
        )}
      </div>
    </div>
  );
};
