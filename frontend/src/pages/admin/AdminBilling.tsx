import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, RefreshCw, Plus, X, IndianRupee, CheckCircle, FileText,
  Banknote, CreditCard, ChevronDown, ChevronUp, User, Search,
  BarChart3, Printer, Zap, CalendarDays, AlertCircle,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import {
  billingApi, Bill, BillingSummary, CustomerSummary, DeliveryReport,
} from '../../api/billing';
import { eachDateInRange } from '../../utils/date';
import api from '../../api/axios';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  paid:    { label: 'Paid',    dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  partial: { label: 'Partial', dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  unpaid:  { label: 'Unpaid',  dot: 'bg-red-400',     bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200'     },
};

// ── Stat Tile ──────────────────────────────────────────────────────────────────
const StatTile = ({ label, value, sub, valueColor = 'text-white', icon: Icon }: {
  label: string; value: string; sub?: string; valueColor?: string; icon?: React.ElementType;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-1.5 mb-0.5">
      {Icon && <Icon className="w-3 h-3 text-white/40" />}
      <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">{label}</p>
    </div>
    <p className={`text-xl font-extrabold leading-none ${valueColor}`}>{value}</p>
    {sub && <p className="text-white/30 text-[10px] mt-0.5">{sub}</p>}
  </div>
);

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.unpaid;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ── Payment Pills ─────────────────────────────────────────────────────────────
const PayPills = ({ b }: { b: Bill }) => (
  <div className="flex flex-wrap gap-1">
    {Number(b.cash_paid)        > 0 && <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">💵 {fmt(b.cash_paid)}</span>}
    {Number(b.online_paid)      > 0 && <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">💳 {fmt(b.online_paid)}</span>}
    {Number(b.advance_paid)     > 0 && <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">🏦 {fmt(b.advance_paid)}</span>}
    {Number(b.pay_later_amount) > 0 && <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">⏳ {fmt(b.pay_later_amount)}</span>}
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
export const AdminBilling = () => {
  const { toast } = useToast();

  const [bills,        setBills]        = useState<Bill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [summary,      setSummary]      = useState<BillingSummary | null>(null);
  const [custSums,     setCustSums]     = useState<CustomerSummary[]>([]);
  const [sumLoading,   setSumLoading]   = useState(true);
  const [customers,    setCustomers]    = useState<{ id: number; name: string; phone: string }[]>([]);

  const [monthFilter,  setMonthFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [custFilter,   setCustFilter]   = useState('');
  const [searchQ,      setSearchQ]      = useState('');

  const [genMonth,        setGenMonth]        = useState(thisMonth);
  const [genCustomerId,   setGenCustomerId]   = useState('');
  const [generating,      setGenerating]      = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const [payBill,   setPayBill]   = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode,   setPayMode]   = useState<'cash' | 'online'>('cash');
  const [paying,    setPaying]    = useState(false);

  const [viewTab,      setViewTab]      = useState<'customer' | 'bills' | 'summary'>('customer');
  const [expandedCust, setExpandedCust] = useState<number | null>(null);

  const [showReport,    setShowReport]    = useState(false);
  const [reportCustId,  setReportCustId]  = useState('');
  const [reportStart,   setReportStart]   = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [reportEnd,     setReportEnd]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [report,        setReport]        = useState<DeliveryReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadBills = useCallback(async () => {
    setBillsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (monthFilter)  params.month      = monthFilter;
      if (statusFilter) params.status     = statusFilter;
      if (custFilter)   params.customerId = custFilter;
      const { data } = await billingApi.list(params);
      setBills(data.bills);
    } catch { toast('Failed to load bills', 'error'); }
    finally { setBillsLoading(false); }
  }, [monthFilter, statusFilter, custFilter]);

  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try {
      const params = monthFilter ? { month: monthFilter } : undefined;
      const { data } = await billingApi.summary(params);
      setSummary(data.summary);
      setCustSums(data.customers);
    } catch { /* silent */ }
    finally { setSumLoading(false); }
  }, [monthFilter]);

  useEffect(() => { loadBills(); loadSummary(); }, [loadBills, loadSummary]);
  useEffect(() => {
    api.get('/admin/users').then(({ data }) =>
      setCustomers((data.users as any[]).filter(u => u.role === 'customer'))
    ).catch(() => {});
  }, []);

  const refresh = () => { loadBills(); loadSummary(); };

  const handleGenerate = async () => {
    setConfirmGenerate(false);
    setGenerating(true);
    try {
      const custId = genCustomerId ? Number(genCustomerId) : undefined;
      const { data } = await billingApi.generate(genMonth, custId);
      const recalc   = data.recalculated ?? 0;
      const cleaned  = data.deleted      ?? 0;
      const custName = custId ? customers.find(c => c.id === custId)?.name || `#${custId}` : 'All Customers';
      const parts = [
        data.generated > 0 ? `Generated: ${data.generated}` : null,
        recalc         > 0 ? `Updated: ${recalc}`           : null,
        cleaned        > 0 ? `Cleaned: ${cleaned}`          : null,
        data.skipped   > 0 ? `Skipped: ${data.skipped}`     : null,
      ].filter(Boolean).join(' · ');
      toast(`${custName} — ${parts || 'No changes'}`, data.errors > 0 ? 'warning' : 'success');
      refresh();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Generation failed', 'error');
    } finally { setGenerating(false); }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payBill || !payAmount || Number(payAmount) <= 0) { toast('Enter a valid amount', 'error'); return; }
    setPaying(true);
    try {
      await billingApi.recordPayment(payBill.id, Number(payAmount), payMode);
      toast(`${payMode === 'cash' ? '💵 Cash' : '💳 Online'} ₹${payAmount} recorded ✅`, 'success');
      setPayBill(null); setPayAmount(''); setPayMode('cash');
      refresh();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Payment failed', 'error');
    } finally { setPaying(false); }
  };

  const billDue = (b: Bill) => Math.max(0, Number(b.total_amount) - Number(b.paid_amount));

  const filteredBills = useMemo(() => {
    if (!searchQ.trim()) return bills;
    const q = searchQ.toLowerCase();
    return bills.filter(b =>
      b.customer_name?.toLowerCase().includes(q) ||
      b.customer_phone?.includes(q) ||
      b.month.includes(q)
    );
  }, [bills, searchQ]);

  const summaryRows = useMemo(() => {
    const map = new Map<number, { name: string; phone: string; jars: number; total: number; cash: number; online: number; advance: number; payLater: number; paid: number; pending: number; }>();
    for (const b of bills) {
      const due = billDue(b);
      const ex  = map.get(b.customer_id);
      if (ex) { ex.jars += Number(b.total_jars); ex.total += Number(b.total_amount); ex.cash += Number(b.cash_paid); ex.online += Number(b.online_paid); ex.advance += Number(b.advance_paid); ex.payLater += Number(b.pay_later_amount); ex.paid += Number(b.paid_amount); ex.pending += due; }
      else { map.set(b.customer_id, { name: b.customer_name || '', phone: b.customer_phone || '', jars: Number(b.total_jars), total: Number(b.total_amount), cash: Number(b.cash_paid), online: Number(b.online_paid), advance: Number(b.advance_paid), payLater: Number(b.pay_later_amount), paid: Number(b.paid_amount), pending: due }); }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [bills]);

  const summaryTotals = useMemo(() => summaryRows.reduce((acc, r) => ({
    jars: acc.jars + r.jars, total: acc.total + r.total, cash: acc.cash + r.cash, online: acc.online + r.online,
    advance: acc.advance + r.advance, payLater: acc.payLater + r.payLater, paid: acc.paid + r.paid, pending: acc.pending + r.pending,
  }), { jars: 0, total: 0, cash: 0, online: 0, advance: 0, payLater: 0, paid: 0, pending: 0 }), [summaryRows]);

  const genCustName = customers.find(c => String(c.id) === genCustomerId)?.name;

  return (
    <div className="max-w-6xl space-y-5">

      {/* ── Top Bar: Overview + Generate ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* Billing Overview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/5" />
          <div className="absolute right-20 -bottom-8 w-24 h-24 rounded-full bg-brand-500/10" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Billing Overview</p>
                  <p className="text-white/40 text-[10px]">{monthFilter || 'All Time'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} title="Filter month"
                  className="text-xs bg-white/10 text-white border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-400 transition-all" />
                <button onClick={refresh}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-all">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {sumLoading ? (
              <div className="grid grid-cols-3 gap-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl bg-white/5" />)}</div>
            ) : summary ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  <StatTile icon={IndianRupee} label="Total Billed"   value={fmt(summary.total_billed)}  sub={`${summary.total_bills} bills`} />
                  <StatTile icon={CheckCircle} label="Total Paid"     value={fmt(summary.total_paid)}    valueColor="text-emerald-400" />
                  <StatTile icon={AlertCircle} label="Total Pending"  value={fmt(summary.total_pending)} valueColor="text-red-400" sub={`${summary.unpaid_count} unpaid · ${summary.partial_count} partial`} />
                  <StatTile icon={CreditCard}  label="Online Paid"    value={fmt(summary.online_paid)}   valueColor="text-blue-400" />
                  <StatTile icon={Banknote}    label="Cash Paid"      value={fmt(summary.cash_paid)}     valueColor="text-emerald-300" />
                  <StatTile icon={Banknote}    label="Cash Pending ✓" value={fmt(summary.cash_pending_verification)} valueColor="text-amber-400" />
                </div>
                <div className="flex items-center gap-4 pt-3 mt-3 border-t border-white/10">
                  {[
                    { label: `${summary.paid_count} Paid`,      dot: 'bg-emerald-400' },
                    { label: `${summary.partial_count} Partial`, dot: 'bg-amber-400'   },
                    { label: `${summary.unpaid_count} Unpaid`,   dot: 'bg-red-400'     },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${item.dot}`} />
                      <span className="text-white/50 text-xs">{item.label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </motion.div>

        {/* Generate Bills */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
              <Zap className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Generate Bills</p>
              <p className="text-[10px] text-slate-400">Create or recalculate bills</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Month</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              <input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)}
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Customer</label>
            <select value={genCustomerId} onChange={e => setGenCustomerId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-400 transition-all">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name} ({c.phone})</option>)}
            </select>
          </div>

          <Button loading={generating} icon={<Plus className="w-4 h-4" />} onClick={() => setConfirmGenerate(true)} className="w-full">
            {genCustomerId ? `Generate for ${genCustName || 'Customer'}` : 'Generate All'}
          </Button>
        </motion.div>
      </div>

      {/* ── View Tabs ── */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {([
          { id: 'customer', label: 'Customers',   icon: User     },
          { id: 'bills',    label: 'All Bills',    icon: FileText },
          { id: 'summary',  label: 'Summary Bill', icon: BarChart3 },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setViewTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all
              ${viewTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Customer Billing Tab ── */}
      <AnimatePresence mode="wait">
      {viewTab === 'customer' && (
        <motion.div key="customer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User className="w-4 h-4 text-brand-600" />Customer-wise Billing</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">{custSums.filter(c => Number(c.total_pending) > 0).length} customers with pending dues</p>
            </div>
          </div>

          {sumLoading ? (
            <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : custSums.filter(c => Number(c.bill_count) > 0 || Number(c.total_billed) > 0).length === 0 ? (
            <div className="py-16 text-center">
              <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">No customer billing data</p>
              <p className="text-xs text-slate-400 mt-1">Generate bills first</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
              {custSums.filter(c => Number(c.bill_count) > 0 || Number(c.total_billed) > 0).map((c, i) => {
                const isExpanded = expandedCust === c.customer_id;
                const custBills  = filteredBills.filter(b => b.customer_id === c.customer_id);
                const hasDue     = Number(c.total_pending) > 0;
                return (
                  <motion.div key={c.customer_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}>
                    <button
                      onClick={() => { setExpandedCust(isExpanded ? null : c.customer_id); if (!isExpanded) setCustFilter(String(c.customer_id)); else setCustFilter(''); }}
                      className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50/70 transition-colors">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-extrabold
                        ${hasDue ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                        {c.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800">{c.customer_name}</p>
                          <span className="text-[10px] text-slate-400">{c.customer_phone}</span>
                          {hasDue && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-bold">{c.due_bills} due</span>}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{c.bill_count} bills</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                        <div><p className="text-[10px] text-slate-400">Billed</p><p className="text-sm font-bold text-slate-700">{fmt(c.total_billed)}</p></div>
                        <div><p className="text-[10px] text-slate-400">Paid</p><p className="text-sm font-bold text-emerald-600">{fmt(c.total_paid)}</p></div>
                        <div><p className="text-[10px] text-slate-400">Pending</p><p className={`text-sm font-bold ${hasDue ? 'text-red-600' : 'text-slate-300'}`}>{hasDue ? fmt(c.total_pending) : '—'}</p></div>
                      </div>
                      <div className="sm:hidden text-right shrink-0">
                        <p className="text-[10px] text-slate-400">Pending</p>
                        <p className={`text-sm font-bold ${hasDue ? 'text-red-600' : 'text-slate-300'}`}>{hasDue ? fmt(c.total_pending) : '—'}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                          className="overflow-hidden bg-slate-50 border-t border-slate-100">
                          {billsLoading ? (
                            <div className="p-4"><Skeleton className="h-12 rounded-xl" /></div>
                          ) : custBills.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-6">No bills yet</p>
                          ) : (
                            <div className="p-4 space-y-2">
                              {custBills.map(b => {
                                const due = billDue(b);
                                return (
                                  <div key={b.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 space-y-2.5">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-slate-900 flex flex-col items-center justify-center shrink-0">
                                        <span className="text-white text-[9px] font-bold leading-none">{MONTH_NAMES[Number(b.month.split('-')[1]) - 1]}</span>
                                        <span className="text-slate-400 text-[9px] leading-none mt-0.5">{b.month.split('-')[0].slice(2)}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2"><p className="text-xs font-bold text-slate-700">{b.month}</p><StatusBadge status={b.status} /></div>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{b.total_jars} jars × ₹{b.jar_rate}</p>
                                      </div>
                                      <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                                        <div><p className="text-[9px] text-slate-400">Total</p><p className="text-xs font-bold text-slate-800">{fmt(b.total_amount)}</p></div>
                                        <div><p className="text-[9px] text-slate-400">Paid</p><p className="text-xs font-bold text-emerald-600">{fmt(b.paid_amount)}</p></div>
                                        <div><p className="text-[9px] text-slate-400">Due</p><p className={`text-xs font-bold ${due > 0 ? 'text-red-600' : 'text-slate-300'}`}>{due > 0 ? fmt(due) : '—'}</p></div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => window.open(billingApi.pdfUrl(b.id), '_blank')} title="PDF"
                                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-brand-50 text-brand-500 transition-colors">
                                          <Download className="w-3.5 h-3.5" />
                                        </button>
                                        {b.status !== 'paid' && (
                                          <button onClick={() => { setPayBill(b); setPayAmount(String(due.toFixed(2))); setPayMode('cash'); }}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors">
                                            <IndianRupee className="w-3 h-3" />
                                            <span className="hidden sm:inline">Record</span>
                                            <span className="sm:hidden">{fmt(due)}</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <PayPills b={b} />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── All Bills Tab ── */}
      {viewTab === 'bills' && (
        <motion.div key="bills" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" /> All Bills
                {filteredBills.length !== bills.length && <span className="text-xs text-brand-600 font-bold">({filteredBills.length} of {bills.length})</span>}
              </h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search customer…"
                  className="pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-400 transition-all w-44" />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={custFilter} onChange={e => setCustFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand-400 transition-all">
                <option value="">All Customers</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex items-center gap-1">
                {['', 'paid', 'partial', 'unpaid'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all capitalize
                      ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
                    {s || 'All'}
                  </button>
                ))}
              </div>
              {(custFilter || statusFilter || monthFilter || searchQ) && (
                <button onClick={() => { setCustFilter(''); setStatusFilter(''); setMonthFilter(''); setSearchQ(''); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-all">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['#', 'Customer', 'Month', 'Jars', 'Total', 'Online', 'Cash', 'Total Paid', 'Due', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {billsLoading ? [...Array(4)].map((_, i) => (
                    <tr key={i}>{[...Array(10)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>)}</tr>
                  )) : filteredBills.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-14 text-slate-400 text-sm">No bills found — try adjusting filters</td></tr>
                  ) : filteredBills.map((b, i) => {
                    const due = billDue(b);
                    return (
                      <motion.tr key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-3 text-xs font-bold text-slate-300">#{b.id}</td>
                        <td className="px-4 py-3"><p className="text-sm font-semibold text-slate-800">{b.customer_name}</p><p className="text-[10px] text-slate-400">{b.customer_phone}</p></td>
                        <td className="px-4 py-3 text-sm text-slate-600 font-medium">{b.month}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700">{b.total_jars}</td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-800">{fmt(b.total_amount)}</td>
                        <td className="px-4 py-3">{Number(b.online_paid) > 0 ? <span className="flex items-center gap-1 text-sm font-semibold text-blue-600"><CreditCard className="w-3 h-3" />{fmt(b.online_paid)}</span> : <span className="text-slate-200 text-xs">—</span>}</td>
                        <td className="px-4 py-3">{Number(b.cash_paid) > 0 ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600"><Banknote className="w-3 h-3" />{fmt(b.cash_paid)}</span> : <span className="text-slate-200 text-xs">—</span>}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(b.paid_amount)}</td>
                        <td className="px-4 py-3">{due > 0 ? <span className="text-sm font-bold text-red-600">{fmt(due)}</span> : <span className="text-slate-200 text-xs">—</span>}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => window.open(billingApi.pdfUrl(b.id), '_blank')} title="PDF"
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-brand-50 text-brand-500 transition-colors"><Download className="w-3.5 h-3.5" /></button>
                            {b.status !== 'paid' && (
                              <button onClick={() => { setPayBill(b); setPayAmount(String(due.toFixed(2))); setPayMode('cash'); }} title="Record payment"
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"><IndianRupee className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {billsLoading ? [...Array(3)].map((_, i) => <div key={i} className="p-4 space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-24" /></div>)
              : filteredBills.map(b => {
                  const due = billDue(b);
                  return (
                    <div key={b.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between"><div><p className="text-sm font-bold text-slate-800">{b.customer_name}</p><p className="text-xs text-slate-400">{b.month} · {b.total_jars} jars</p></div><StatusBadge status={b.status} /></div>
                      <div className="grid grid-cols-3 gap-2">
                        {[{label:'Total',value:fmt(b.total_amount),color:'text-slate-800'},{label:'Paid',value:fmt(b.paid_amount),color:'text-emerald-600'},{label:'Due',value:due>0?fmt(due):'—',color:due>0?'text-red-600':'text-slate-300'}].map(item => (
                          <div key={item.label} className="bg-slate-50 rounded-xl p-2.5 text-center"><p className="text-[9px] text-slate-400">{item.label}</p><p className={`text-sm font-bold ${item.color}`}>{item.value}</p></div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.open(billingApi.pdfUrl(b.id), '_blank')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"><Download className="w-3.5 h-3.5" /> PDF</button>
                        {b.status !== 'paid' && (
                          <button onClick={() => { setPayBill(b); setPayAmount(String(due.toFixed(2))); setPayMode('cash'); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"><IndianRupee className="w-3.5 h-3.5" /> Record Payment</button>
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </motion.div>
      )}

      {/* ── Summary Bill Tab ── */}
      {viewTab === 'summary' && (
        <motion.div key="summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-600" />All Customers Summary Bill</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">{monthFilter || 'All Time'} · {summaryRows.length} customers</p>
            </div>
            <button onClick={() => { if (!monthFilter) { toast('Select a month first', 'error'); return; } window.open(billingApi.summaryBillPdfUrl(monthFilter), '_blank'); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:opacity-90 transition-all">
              <Printer className="w-3.5 h-3.5" /> Download PDF
            </button>
          </div>
          {!monthFilter && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <span className="text-xs text-amber-700">⚠️ Select a month in the Billing Overview to see per-month summary</span>
            </div>
          )}
          {billsLoading ? (
            <div className="p-5 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
          ) : summaryRows.length === 0 ? (
            <div className="p-12 text-center"><BarChart3 className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">No bills for this period</p><p className="text-xs text-slate-400 mt-1">Generate bills first or pick a different month</p></div>
          ) : (
            <div className="overflow-x-auto">
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['#', 'Customer', 'Phone', 'Jars', 'Total', 'Cash', 'Online', 'Advance', 'Pay-Later', 'Paid', 'Pending'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {summaryRows.map((r, i) => (
                      <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${r.pending > 0 ? 'bg-red-50/20' : ''}`}>
                        <td className="px-3 py-3 text-slate-300 font-bold">{i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${r.pending > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-700'}`}>{r.name.charAt(0).toUpperCase()}</div>
                            <span className="font-semibold text-slate-800 whitespace-nowrap">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-400">{r.phone}</td>
                        <td className="px-3 py-3 font-bold text-slate-700">{r.jars}</td>
                        <td className="px-3 py-3 font-bold text-slate-800">{fmt(r.total)}</td>
                        <td className="px-3 py-3">{r.cash > 0 ? <span className="flex items-center gap-1 font-semibold text-emerald-700"><Banknote className="w-3 h-3" />{fmt(r.cash)}</span> : <span className="text-slate-200">—</span>}</td>
                        <td className="px-3 py-3">{r.online > 0 ? <span className="flex items-center gap-1 font-semibold text-blue-700"><CreditCard className="w-3 h-3" />{fmt(r.online)}</span> : <span className="text-slate-200">—</span>}</td>
                        <td className="px-3 py-3">{r.advance > 0 ? <span className="font-semibold text-purple-700">{fmt(r.advance)}</span> : <span className="text-slate-200">—</span>}</td>
                        <td className="px-3 py-3">{r.payLater > 0 ? <span className="font-semibold text-amber-700">{fmt(r.payLater)}</span> : <span className="text-slate-200">—</span>}</td>
                        <td className="px-3 py-3 font-bold text-emerald-700">{fmt(r.paid)}</td>
                        <td className="px-3 py-3">{r.pending > 0 ? <span className="font-bold text-red-600">{fmt(r.pending)}</span> : <span className="text-emerald-500 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Clear</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-slate-900 border-t-2 border-slate-700">
                      <td colSpan={3} className="px-3 py-3 text-slate-400 text-[10px] font-bold uppercase tracking-wider">Totals</td>
                      <td className="px-3 py-3 font-extrabold text-white">{summaryTotals.jars}</td>
                      <td className="px-3 py-3 font-extrabold text-white">{fmt(summaryTotals.total)}</td>
                      <td className="px-3 py-3 font-extrabold text-emerald-400">{fmt(summaryTotals.cash)}</td>
                      <td className="px-3 py-3 font-extrabold text-blue-400">{fmt(summaryTotals.online)}</td>
                      <td className="px-3 py-3 font-extrabold text-purple-400">{fmt(summaryTotals.advance)}</td>
                      <td className="px-3 py-3 font-extrabold text-amber-400">{fmt(summaryTotals.payLater)}</td>
                      <td className="px-3 py-3 font-extrabold text-emerald-400">{fmt(summaryTotals.paid)}</td>
                      <td className="px-3 py-3 font-extrabold text-red-400">{summaryTotals.pending > 0 ? fmt(summaryTotals.pending) : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Delivery Report ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <button onClick={() => setShowReport(r => !r)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-800">Delivery Report</p>
              <p className="text-[10px] text-slate-400">Day-by-day delivery breakdown for a customer</p>
            </div>
          </div>
          {showReport ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        <AnimatePresence>
          {showReport && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-5 pb-5 pt-4 border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Customer</label>
                    <select value={reportCustId} onChange={e => setReportCustId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 transition-all">
                      <option value="">Select customer…</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">From</label>
                    <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">To</label>
                    <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-400 transition-all" />
                  </div>
                  <Button size="sm" loading={reportLoading}
                    onClick={async () => {
                      if (!reportCustId) { toast('Select a customer', 'error'); return; }
                      setReportLoading(true); setReport(null);
                      try {
                        const { data } = await billingApi.deliveryReport({ customerId: Number(reportCustId), startDate: reportStart, endDate: reportEnd });
                        setReport(data.report);
                      } catch { toast('Failed to load report', 'error'); }
                      finally { setReportLoading(false); }
                    }}>View Report</Button>
                </div>

                {report && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-50 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{report.customer.name}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(report.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — {new Date(report.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <button onClick={() => window.open(billingApi.deliveryReportPdfUrl({ customerId: Number(reportCustId), startDate: reportStart, endDate: reportEnd }), '_blank')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:opacity-90 transition-all">
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[{ label: 'Jars', value: String(report.totalJars), color: 'text-slate-800' }, { label: 'Rate', value: `₹${report.jarRate}`, color: 'text-slate-800' }, { label: 'Amount', value: `₹${report.totalAmount}`, color: 'text-brand-700' }].map(item => (
                        <div key={item.label} className="bg-white rounded-xl p-3 text-center"><p className="text-[10px] text-slate-400">{item.label}</p><p className={`text-lg font-extrabold ${item.color}`}>{item.value}</p></div>
                      ))}
                    </div>
                    {(() => {
                      const jarMap   = new Map(report.days.map(d => [d.date, d.jars]));
                      const allDates = eachDateInRange(report.startDate, report.endDate).map(date => ({ date, jars: (jarMap.get(date) as number) ?? 0 }));
                      return (
                        <div className="grid gap-1 max-h-52 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
                          {allDates.map(({ date, jars }) => {
                            const d = new Date(date + 'T00:00:00');
                            const h = jars > 0;
                            return (
                              <div key={date} className={`rounded-xl p-1.5 text-center border transition-colors ${h ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-100'}`}>
                                <p className="text-[8px] text-slate-400 leading-none">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                                <p className={`text-[11px] font-bold leading-tight mt-0.5 ${h ? 'text-slate-700' : 'text-slate-300'}`}>{d.getDate()}</p>
                                <p className={`text-xs font-bold ${h ? 'text-brand-600' : 'text-slate-200'}`}>{jars}</p>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Confirm Generate Dialog ── */}
      <AnimatePresence>
        {confirmGenerate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmGenerate(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0 text-2xl">⚠️</div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Generate Bills?</p>
                  <p className="text-xs text-slate-500 mt-1">{genCustomerId ? `For ${genCustName || 'selected customer'}` : 'For all active customers'} · <strong>{genMonth}</strong></p>
                </div>
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 rounded-2xl px-4 py-3 leading-relaxed">
                Existing bills for this month will be <strong>recalculated</strong> from fresh delivery data. Months with no deliveries will be skipped automatically.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmGenerate(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleGenerate} disabled={generating}
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {generating ? 'Generating…' : 'Yes, Generate'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Record Payment Modal ── */}
      <AnimatePresence>
        {payBill && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setPayBill(null)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="bg-slate-900 px-5 pt-5 pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <IndianRupee className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm">Record Payment</h3>
                      <p className="text-slate-400 text-xs mt-0.5">{payBill.customer_name} · {payBill.month}</p>
                    </div>
                  </div>
                  <button onClick={() => setPayBill(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[{ label: 'Total', value: fmt(payBill.total_amount), color: 'text-white' }, { label: 'Collected', value: fmt(payBill.paid_amount), color: 'text-emerald-400' }, { label: 'Due', value: fmt(billDue(payBill)), color: 'text-red-400' }].map(item => (
                    <div key={item.label} className="bg-slate-800 rounded-xl p-2.5 text-center">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 py-5">
                <form onSubmit={handlePay} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Payment Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'cash',   label: '💵 Cash',   active: 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-400/20' },
                        { id: 'online', label: '💳 Online', active: 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-400/20' },
                      ] as const).map(m => (
                        <button key={m.id} type="button" onClick={() => setPayMode(m.id)}
                          className={`flex items-center justify-center py-3 rounded-2xl border font-bold text-sm transition-all
                            ${payMode === m.id ? m.active : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Amount (₹)</label>
                    <input type="number" min={0.01} step="0.01" value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      placeholder={`Due: ₹${billDue(payBill).toFixed(0)}`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xl font-bold outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                  </div>
                  <Button type="submit" loading={paying} size="lg" className="w-full" icon={<CheckCircle className="w-4 h-4" />}>
                    Record {payMode === 'cash' ? '💵 Cash' : '💳 Online'} ₹{payAmount || '0'}
                  </Button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
