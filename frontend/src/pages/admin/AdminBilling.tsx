import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, RefreshCw, Plus, X, IndianRupee, CheckCircle, FileText,
  Banknote, CreditCard, AlertCircle, Clock, ChevronDown, ChevronUp,
  User, Search, TrendingDown, BarChart3, Wallet,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import {
  billingApi, Bill, BillingSummary, CustomerSummary, DeliveryReport,
} from '../../api/billing';
import { eachDateInRange } from '../../utils/date';
import api from '../../api/axios';

// ── Config ─────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  paid:    { label: 'Paid',    bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  partial: { label: 'Partial', bg: 'bg-amber-50',  text: 'text-amber-700', border: 'border-amber-200' },
  unpaid:  { label: 'Unpaid',  bg: 'bg-red-50',    text: 'text-red-600',   border: 'border-red-200'   },
};

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ── Summary Card ───────────────────────────────────────────────────────────────
const SCard = ({ label, value, sub, color = 'text-white', accent = '' }: {
  label: string; value: string; sub?: string; color?: string; accent?: string;
}) => (
  <div className={`rounded-xl p-3.5 ${accent || 'bg-slate-800'}`}>
    <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-xl font-extrabold leading-none ${color}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
export const AdminBilling = () => {
  const { toast } = useToast();

  // ── Bills state ─────────────────────────────────────────────────────────────
  const [bills,        setBills]        = useState<Bill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);

  // ── Summary state ───────────────────────────────────────────────────────────
  const [summary,    setSummary]    = useState<BillingSummary | null>(null);
  const [custSums,   setCustSums]   = useState<CustomerSummary[]>([]);
  const [sumLoading, setSumLoading] = useState(true);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [monthFilter,  setMonthFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [custFilter,   setCustFilter]   = useState('');         // customer_id
  const [searchQ,      setSearchQ]      = useState('');

  // ── Generate ─────────────────────────────────────────────────────────────────
  const [genMonth,   setGenMonth]   = useState(thisMonth);
  const [generating, setGenerating] = useState(false);

  // ── Pay modal ────────────────────────────────────────────────────────────────
  const [payBill,   setPayBill]   = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying,    setPaying]    = useState(false);

  // ── Customer view ─────────────────────────────────────────────────────────────
  const [expandedCust, setExpandedCust] = useState<number | null>(null);

  // ── Delivery report ──────────────────────────────────────────────────────────
  const [showReport,    setShowReport]    = useState(false);
  const [reportCustId,  setReportCustId]  = useState('');
  const [reportStart,   setReportStart]   = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [reportEnd,     setReportEnd]     = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [report,        setReport]        = useState<DeliveryReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [customers,     setCustomers]     = useState<{id:number;name:string;phone:string}[]>([]);

  // ── Load bills ───────────────────────────────────────────────────────────────
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

  // ── Load summary ─────────────────────────────────────────────────────────────
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

  // ── Generate ──────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await billingApi.generate(genMonth);
      const recalc = data.recalculated ?? 0;
      toast(
        recalc > 0
          ? `Generated: ${data.generated}, Updated: ${recalc}, Skipped: ${data.skipped}`
          : `Generated: ${data.generated}, Skipped: ${data.skipped}`,
        'success'
      );
      refresh();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Generation failed', 'error');
    } finally { setGenerating(false); }
  };

  // ── Pay ───────────────────────────────────────────────────────────────────────
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payBill || !payAmount || Number(payAmount) <= 0) { toast('Enter valid amount', 'error'); return; }
    setPaying(true);
    try {
      await billingApi.recordPayment(payBill.id, Number(payAmount));
      toast('Payment recorded ✅', 'success');
      setPayBill(null); setPayAmount('');
      refresh();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Payment failed', 'error');
    } finally { setPaying(false); }
  };

  // ── Filtered bills (client-side search) ──────────────────────────────────────
  const filteredBills = useMemo(() => {
    if (!searchQ.trim()) return bills;
    const q = searchQ.toLowerCase();
    return bills.filter(b =>
      b.customer_name?.toLowerCase().includes(q) ||
      b.customer_phone?.includes(q) ||
      b.month.includes(q)
    );
  }, [bills, searchQ]);

  // ── Per-bill due ──────────────────────────────────────────────────────────────
  const billDue = (b: Bill) => Math.max(0, Number(b.total_amount) - Number(b.paid_amount));

  return (
    <div className="max-w-6xl space-y-5">

      {/* ══════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Billing</h2>
          <p className="text-xs text-slate-400 mt-0.5">{bills.length} bills loaded</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={refresh}>Refresh</Button>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-card">
            <input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)}
              className="text-sm outline-none text-slate-700 bg-transparent" />
            <Button size="sm" loading={generating} icon={<Plus className="w-3.5 h-3.5" />} onClick={handleGenerate}>
              Generate
            </Button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SUMMARY STRIP
      ══════════════════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 rounded-2xl p-5">

        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Billing Overview {monthFilter ? `· ${monthFilter}` : '· All Time'}
          </p>
          <input type="month" value={monthFilter} onChange={e => { setMonthFilter(e.target.value); }}
            className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-500 transition-all"
            title="Filter by month" />
        </div>

        {sumLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SCard label="Total Billed"    value={fmt(summary.total_billed)}   sub={`${summary.total_bills} bills`} />
            <SCard label="Total Paid"      value={fmt(summary.total_paid)}      color="text-emerald-400" />
            <SCard label="Online Paid"     value={fmt(summary.online_paid)}     color="text-blue-400"    accent="bg-slate-800" />
            <SCard label="Cash Paid"       value={fmt(summary.cash_paid)}       color="text-green-400"   accent="bg-slate-800" />
            <SCard label="Cash (Pending ✓)" value={fmt(summary.cash_pending_verification)} color="text-amber-400" accent="bg-slate-800" />
            <SCard label="Total Pending"   value={fmt(summary.total_pending)}   color="text-red-400"
              sub={`${summary.unpaid_count} unpaid · ${summary.partial_count} partial`} />
          </div>
        ) : null}

        {/* Status mini-badges */}
        {summary && (
          <div className="flex gap-3 mt-3">
            {[
              { label: `${summary.paid_count} Paid`,    dot: 'bg-green-400' },
              { label: `${summary.partial_count} Partial`, dot: 'bg-amber-400' },
              { label: `${summary.unpaid_count} Unpaid`, dot: 'bg-red-400' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                <span className="text-slate-400 text-xs">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════
          CUSTOMER BREAKDOWN TABLE
      ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <User className="w-4 h-4 text-brand-600" />
            Customer-wise Billing
          </h3>
          <span className="text-xs text-slate-400">{custSums.filter(c => Number(c.total_pending) > 0).length} customers with dues</span>
        </div>

        {sumLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {custSums.filter(c => Number(c.bill_count) > 0 || Number(c.total_billed) > 0).map((c, i) => {
              const isExpanded = expandedCust === c.customer_id;
              const custBills  = filteredBills.filter(b => b.customer_id === c.customer_id);
              const hasDue     = Number(c.total_pending) > 0;

              return (
                <motion.div key={c.customer_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                  {/* Row */}
                  <button
                    onClick={() => {
                      setExpandedCust(isExpanded ? null : c.customer_id);
                      // Load bills filtered by this customer
                      if (!isExpanded) setCustFilter(String(c.customer_id));
                      else setCustFilter('');
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/60 transition-colors">

                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold
                      ${hasDue ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {c.customer_name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.customer_name}</p>
                        <span className="text-[10px] text-slate-400">{c.customer_phone}</span>
                        {hasDue && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                            {c.due_bills} due
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amounts */}
                    <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
                      <div>
                        <p className="text-[10px] text-slate-400">Billed</p>
                        <p className="text-sm font-bold text-slate-700">{fmt(c.total_billed)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Paid</p>
                        <p className="text-sm font-bold text-green-600">{fmt(c.total_paid)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Pending</p>
                        <p className={`text-sm font-bold ${hasDue ? 'text-red-600' : 'text-slate-400'}`}>
                          {hasDue ? fmt(c.total_pending) : '—'}
                        </p>
                      </div>
                    </div>

                    {isExpanded
                      ? <ChevronUp   className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>

                  {/* Expanded: customer's bills */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden bg-slate-50 border-t border-slate-100">
                        {billsLoading ? (
                          <div className="p-4"><Skeleton className="h-12 rounded-xl" /></div>
                        ) : custBills.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-6">No bills for this customer yet</p>
                        ) : (
                          <div className="p-4 space-y-2">
                            {custBills.map(b => {
                              const cfg = STATUS_CFG[b.status] || STATUS_CFG.unpaid;
                              const due = billDue(b);
                              return (
                                <div key={b.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4">
                                  {/* Month */}
                                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex flex-col items-center justify-center shrink-0">
                                    <span className="text-white text-[9px] font-bold leading-none">
                                      {['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(b.month.split('-')[1]) - 1]}
                                    </span>
                                    <span className="text-slate-400 text-[9px] leading-none mt-0.5">{b.month.split('-')[0].slice(2)}</span>
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-bold text-slate-700">{b.month}</p>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                        {cfg.label}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400">{b.total_jars} jars × ₹{b.jar_rate}</p>
                                  </div>

                                  <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                                    <div>
                                      <p className="text-[9px] text-slate-400">Total</p>
                                      <p className="text-xs font-bold text-slate-800">{fmt(b.total_amount)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] text-slate-400">Paid</p>
                                      <p className="text-xs font-bold text-green-600">{fmt(b.paid_amount)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] text-slate-400">Due</p>
                                      <p className={`text-xs font-bold ${due > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        {due > 0 ? fmt(due) : '—'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => window.open(billingApi.pdfUrl(b.id), '_blank')}
                                      className="p-1.5 rounded-lg hover:bg-brand-50 text-brand-500 transition-colors" title="PDF">
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    {b.status !== 'paid' && (
                                      <button onClick={() => { setPayBill(b); setPayAmount(String(due.toFixed(2))); }}
                                        className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Record payment">
                                        <IndianRupee className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
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
      </div>

      {/* ══════════════════════════════════════════════════════════════
          FULL BILLS TABLE (with search + filters)
      ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">

        {/* Table header bar */}
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              All Bills
              {filteredBills.length !== bills.length && (
                <span className="text-xs text-brand-600 font-bold">({filteredBills.length} of {bills.length})</span>
              )}
            </h3>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Search customer…"
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-400 transition-all w-48" />
            </div>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Customer filter */}
            <select value={custFilter} onChange={e => setCustFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand-400 transition-all">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Status filter */}
            {['', 'paid', 'partial', 'unpaid'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all capitalize
                  ${statusFilter === s
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
                {s || 'All Status'}
              </button>
            ))}

            {/* Clear filters */}
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
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['#', 'Customer', 'Month', 'Jars', 'Total', 'Paid (Online)', 'Paid (Cash)', 'Total Paid', 'Due', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {billsLoading ? (
                [...Array(4)].map(i => (
                  <tr key={i}>
                    {[...Array(11)].map(j => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>)}
                  </tr>
                ))
              ) : filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400 text-sm">
                    No bills found — try adjusting the filters
                  </td>
                </tr>
              ) : filteredBills.map((b, i) => {
                const cfg = STATUS_CFG[b.status] || STATUS_CFG.unpaid;
                const due = billDue(b);
                // Parse paid amount by mode from bill (we use paid_amount as total paid; online vs cash split comes from transactions — show what bill has)
                const paidOnline = Number((b as any).paid_online_amount || 0);
                const paidCash   = Number(b.paid_amount) - paidOnline;

                return (
                  <motion.tr key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-4 py-3 text-xs font-bold text-slate-400">#{b.id}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-800">{b.customer_name}</p>
                      <p className="text-[10px] text-slate-400">{b.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-medium">{b.month}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{b.total_jars}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-800">{fmt(b.total_amount)}</td>
                    <td className="px-4 py-3">
                      {paidOnline > 0
                        ? <span className="flex items-center gap-1 text-sm font-semibold text-blue-600">
                            <CreditCard className="w-3 h-3" />{fmt(paidOnline)}
                          </span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {paidCash > 0
                        ? <span className="flex items-center gap-1 text-sm font-semibold text-green-600">
                            <Banknote className="w-3 h-3" />{fmt(paidCash)}
                          </span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(b.paid_amount)}</td>
                    <td className="px-4 py-3">
                      {due > 0
                        ? <span className="text-sm font-bold text-red-600">{fmt(due)}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border capitalize ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => window.open(billingApi.pdfUrl(b.id), '_blank')}
                          className="p-1.5 rounded-lg hover:bg-brand-50 text-brand-500 transition-colors opacity-0 group-hover:opacity-100" title="PDF">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {b.status !== 'paid' && (
                          <button onClick={() => { setPayBill(b); setPayAmount(String(due.toFixed(2))); }}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors opacity-0 group-hover:opacity-100" title="Record payment">
                            <IndianRupee className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {billsLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="p-4 space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-24" /></div>)
          ) : filteredBills.map(b => {
            const cfg = STATUS_CFG[b.status] || STATUS_CFG.unpaid;
            const due = billDue(b);
            return (
              <div key={b.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{b.customer_name}</p>
                    <p className="text-xs text-slate-400">{b.month} · {b.total_jars} jars</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border capitalize ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Total',   value: fmt(b.total_amount),  color: 'text-slate-800' },
                    { label: 'Paid',    value: fmt(b.paid_amount),   color: 'text-green-600' },
                    { label: 'Due',     value: due > 0 ? fmt(due) : '—', color: due > 0 ? 'text-red-600' : 'text-slate-300' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-[9px] text-slate-400 font-medium">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => window.open(billingApi.pdfUrl(b.id), '_blank')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  {b.status !== 'paid' && (
                    <button onClick={() => { setPayBill(b); setPayAmount(String(due.toFixed(2))); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 border border-green-200 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors">
                      <IndianRupee className="w-3.5 h-3.5" /> Record Payment
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DELIVERY REPORT SECTION
      ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <button onClick={() => setShowReport(r => !r)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-bold text-slate-800">Delivery Report</h3>
            <span className="text-[10px] text-slate-400">Day / Date Range</span>
          </div>
          {showReport ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        <AnimatePresence>
          {showReport && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">

                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Customer</label>
                    <select value={reportCustId} onChange={e => setReportCustId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-all">
                      <option value="">Select customer...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                    </select>
                  </div>
                  <div className="min-w-[130px]">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">From</label>
                    <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-all" />
                  </div>
                  <div className="min-w-[130px]">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">To</label>
                    <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-all" />
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
                    }}>
                    View Report
                  </Button>
                </div>

                {report && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-50 rounded-2xl p-4 space-y-3">
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
                      {[
                        { label: 'Jars',   value: String(report.totalJars),  color: 'text-slate-800' },
                        { label: 'Rate',   value: `₹${report.jarRate}`,      color: 'text-slate-800' },
                        { label: 'Amount', value: `₹${report.totalAmount}`,  color: 'text-brand-700' },
                      ].map(item => (
                        <div key={item.label} className="bg-white rounded-xl p-3 text-center">
                          <p className="text-[10px] text-slate-400">{item.label}</p>
                          <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {(() => {
                      const jarMap = new Map(report.days.map(d => [d.date, d.jars]));
                      const allDates = eachDateInRange(report.startDate, report.endDate).map(date => ({
                        date, jars: (jarMap.get(date) as number) ?? 0,
                      }));
                      return (
                        <div className="grid gap-1 max-h-48 overflow-y-auto"
                          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))' }}>
                          {allDates.map(({ date, jars }) => {
                            const d = new Date(date + 'T00:00:00');
                            const hasJars = jars > 0;
                            return (
                              <div key={date} className={`rounded-lg p-1 text-center border ${hasJars ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100'}`}>
                                <p className="text-[8px] text-slate-400 leading-none">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                                <p className={`text-[10px] font-bold leading-tight mt-0.5 ${hasJars ? 'text-slate-700' : 'text-slate-300'}`}>{d.getDate()}</p>
                                <p className={`text-xs font-bold ${hasJars ? 'text-green-600' : 'text-slate-200'}`}>{jars}</p>
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

      {/* ══════════════════════════════════════════════════════════════
          RECORD PAYMENT MODAL
      ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {payBill && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPayBill(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6">

              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Payment</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{payBill.customer_name} · {payBill.month}</p>
                </div>
                <button onClick={() => setPayBill(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { label: 'Total',   value: fmt(payBill.total_amount), color: 'text-slate-800' },
                  { label: 'Paid',    value: fmt(payBill.paid_amount),  color: 'text-green-600' },
                  { label: 'Due',     value: fmt(billDue(payBill)),     color: 'text-red-600'   },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400">{item.label}</p>
                    <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handlePay} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Amount (₹)</label>
                  <input type="number" min={0.01} step="0.01" value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-lg font-bold outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                </div>
                <Button type="submit" loading={paying} size="lg" className="w-full" icon={<CheckCircle className="w-4 h-4" />}>
                  Record ₹{payAmount || '0'}
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
