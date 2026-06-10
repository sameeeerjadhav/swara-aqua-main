import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, Calendar, X, Plus, Package, AlertTriangle, Check, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { OrderStatusBadge } from '../../components/ui/OrderStatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ordersApi, Order } from '../../api/orders';
import { useSSE } from '../../hooks/useSSE';
import api from '../../api/axios';
import { subscriptionApi, CancelRequest } from '../../api/subscription';

interface CustomerOption { id: number; name: string; phone: string; jar_rate: number; }

const STATUS_FILTERS = ['all', 'pending', 'assigned', 'delivered', 'completed', 'cancelled'];

// Returns YYYY-MM-DD for today
const todayStr = () => new Date().toISOString().split('T')[0];
// Returns YYYY-MM for this month
const thisMonthStr = () => new Date().toISOString().slice(0, 7);

export const AdminOrders = () => {
  const { toast } = useToast();
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter,   setDateFilter]   = useState('');   // YYYY-MM-DD
  const [monthFilter,  setMonthFilter]  = useState('');   // YYYY-MM
  const [dateMode,     setDateMode]     = useState<'date' | 'month' | null>(null);

  // New Order modal
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newOrder, setNewOrder] = useState({ type: 'instant' as string, quantity: 1, deliveryDate: '', notes: '', address: '' });
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Cancel requests
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([]);
  const [crLoading, setCrLoading]           = useState(false);
  const [showCancelRequests, setShowCancelRequests] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search)      params.search = search;
      if (dateFilter)  params.date   = dateFilter;
      else if (monthFilter) params.month = monthFilter;
      const res = await ordersApi.list(params);
      setOrders(res.data.orders);
    } catch { toast('Failed to load orders', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter, dateFilter, monthFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const clearDateFilters = () => { setDateFilter(''); setMonthFilter(''); setDateMode(null); };

  // SSE: auto-refresh when orders change
  useSSE({
    order_created:      () => load(),
    order_updated:      () => load(),
    delivery_completed: () => load(),
  });

  // Cancel requests
  const loadCancelRequests = async () => {
    setCrLoading(true);
    try {
      const { data } = await subscriptionApi.getCancelRequests();
      setCancelRequests(data.requests);
    } catch { /* silent */ }
    finally { setCrLoading(false); }
  };

  useEffect(() => { loadCancelRequests(); }, []);

  const handleReview = async (id: number, action: 'approved' | 'rejected') => {
    try {
      await subscriptionApi.reviewCancelRequest(id, action);
      toast(`Cancel request ${action}`, action === 'approved' ? 'success' : 'warning');
      await loadCancelRequests();
      await load();
    } catch { toast('Failed to update', 'error'); }
  };

  // Load customer list when modal opens
  useEffect(() => {
    if (showNewOrder && customerList.length === 0) {
      api.get('/admin/users').then(res => {
        const custs = (res.data.users as any[]).filter(u => u.role === 'customer' && u.status === 'active');
        setCustomerList(custs);
      }).catch(() => {});
    }
  }, [showNewOrder]);

  const filteredCustomers = customerList.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch)
  ).slice(0, 8);

  const handlePlaceOrder = async () => {
    if (!selectedCustomer) { toast('Select a customer', 'error'); return; }
    if (newOrder.quantity < 1) { toast('Quantity must be at least 1', 'error'); return; }
    if (newOrder.type === 'preorder' && !newOrder.deliveryDate) { toast('Select delivery date for preorder', 'error'); return; }
    setSubmittingOrder(true);
    try {
      await api.post('/admin/orders', {
        customerId: selectedCustomer.id,
        type: newOrder.type,
        quantity: newOrder.quantity,
        deliveryDate: newOrder.type === 'preorder' ? newOrder.deliveryDate : undefined,
        notes: newOrder.notes || undefined,
        address: newOrder.address || undefined,
      });
      toast(`Order placed for ${selectedCustomer.name}!`, 'success');
      setShowNewOrder(false);
      setSelectedCustomer(null);
      setCustomerSearch('');
      setNewOrder({ type: 'instant', quantity: 1, deliveryDate: '', notes: '', address: '' });
      await load();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to place order', 'error');
    } finally { setSubmittingOrder(false); }
  };

  const activeDateLabel = dateFilter
    ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : monthFilter
    ? new Date(monthFilter + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-5xl space-y-4">

      {/* ── Cancel Requests Alert Banner ── */}
      {cancelRequests.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Header */}
          <button
            onClick={() => setShowCancelRequests(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-amber-100/60 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-amber-900">Cancellation Requests</p>
                <p className="text-[11px] text-amber-600 mt-0.5">Customers waiting for your decision</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                {cancelRequests.filter(r => r.status === 'pending').length} pending
              </span>
            </div>
          </button>

          {/* Requests list */}
          <AnimatePresence initial={false}>
            {showCancelRequests && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                className="overflow-hidden">
                <div className="divide-y divide-amber-100">
                  {crLoading ? (
                    <div className="px-5 py-4">
                      <div className="animate-pulse space-y-3">
                        {[0,1].map(i => <div key={i} className="h-16 bg-amber-100 rounded-xl" />)}
                      </div>
                    </div>
                  ) : cancelRequests.map(cr => (
                    <div key={cr.id} className={`px-5 py-4 ${
                      cr.status !== 'pending' ? 'opacity-60' : ''
                    }`}>
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-xl bg-amber-200 flex items-center justify-center shrink-0 font-bold text-amber-700 text-sm">
                          {cr.customer_name?.charAt(0).toUpperCase()}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{cr.customer_name}</p>
                              <p className="text-[11px] text-slate-500">{cr.customer_phone}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-slate-700">Order #{cr.order_id}</p>
                              <p className="text-[11px] text-slate-400 capitalize">{cr.order_type} &middot; {cr.quantity} jars &middot; &#8377;{cr.total_amount}</p>
                            </div>
                          </div>

                          {/* Reason */}
                          <div className="mt-2 bg-white/70 border border-amber-200 rounded-xl px-3 py-2">
                            <p className="text-xs text-slate-500 font-semibold mb-0.5">Reason for cancellation</p>
                            <p className="text-xs text-slate-700">{cr.reason}</p>
                          </div>

                          {/* Time + Actions */}
                          <div className="flex items-center justify-between mt-2.5">
                            <p className="text-[10px] text-slate-400">
                              {new Date(cr.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>

                            {cr.status === 'pending' ? (
                              <div className="flex gap-2">
                                <button onClick={() => handleReview(cr.id, 'rejected')}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-semibold transition-colors">
                                  <XCircle className="w-3.5 h-3.5" /> Reject
                                </button>
                                <button onClick={() => handleReview(cr.id, 'approved')}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors shadow-sm">
                                  <Check className="w-3.5 h-3.5" /> Approve
                                </button>
                              </div>
                            ) : (
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg capitalize ${
                                cr.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-600 border border-red-200'
                              }`}>
                                {cr.status === 'approved' ? '\u2705' : '\u274c'} {cr.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">All Orders</h2>
          <p className="text-xs text-slate-400 mt-0.5">{orders.length} orders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowNewOrder(true)}>
            New Order
          </Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">

        {/* Search + date pickers row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <form onSubmit={handleSearch}
            className="flex-1 min-w-[180px] flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm focus-within:border-brand-400 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customer..."
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
          </form>

          {/* Date picker button */}
          <button
            onClick={() => setDateMode(m => m === 'date' ? null : 'date')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all
              ${dateMode === 'date' || dateFilter
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
            <Calendar className="w-3.5 h-3.5" /> By Day
          </button>

          {/* Month picker button */}
          <button
            onClick={() => setDateMode(m => m === 'month' ? null : 'month')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all
              ${dateMode === 'month' || monthFilter
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
            <Calendar className="w-3.5 h-3.5" /> By Month
          </button>
        </div>

        {/* Inline date/month input */}
        {dateMode === 'date' && (
          <div className="flex items-center gap-2">
            <input type="date" value={dateFilter} max={todayStr()}
              onChange={e => { setDateFilter(e.target.value); setMonthFilter(''); }}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 transition-all" />
            {dateFilter && (
              <button onClick={clearDateFilters}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
          </div>
        )}
        {dateMode === 'month' && (
          <div className="flex items-center gap-2">
            <input type="month" value={monthFilter} max={thisMonthStr()}
              onChange={e => { setMonthFilter(e.target.value); setDateFilter(''); }}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 transition-all" />
            {monthFilter && (
              <button onClick={clearDateFilters}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
          </div>
        )}

        {/* Active date filter pill */}
        {activeDateLabel && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold px-3 py-1 rounded-full">
              <Calendar className="w-3 h-3" /> {activeDateLabel}
              <button onClick={clearDateFilters} className="ml-1 hover:text-brand-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all capitalize
                ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['#', 'Customer', 'Type', 'Qty', 'Amount', 'Status', 'Staff', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [0,1,2,3].map(i => (
                  <tr key={i}>{[0,1,2,3,4,5,6,7].map(j => (
                    <td key={j} className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
                  ))}</tr>
                ))
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No orders found</td></tr>
              ) : orders.map((o, i) => (
                <motion.tr key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5 text-xs font-bold text-slate-400">#{o.id}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-semibold text-slate-800">{o.customer_name}</p>
                    <p className="text-xs text-slate-400">{o.customer_phone}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-600 capitalize">{o.type}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-700">{o.quantity}</td>
                  <td className="px-4 py-3.5 text-sm font-bold text-brand-600">₹{o.total_amount}</td>
                  <td className="px-4 py-3.5"><OrderStatusBadge status={o.status} /></td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{o.staff_name || '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile — compact list rows */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            [0,1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                <Skeleton className="h-4 w-12 shrink-0" />
              </div>
            ))
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No orders found</div>
          ) : orders.map(o => (
            <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">

              {/* Customer info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-semibold text-slate-800 truncate">{o.customer_name}</p>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  {o.quantity} jars · {o.staff_name || 'Unassigned'} · {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>

              {/* Right: status + amount stacked */}
              <div className="shrink-0 text-right flex flex-col items-end gap-1">
                <OrderStatusBadge status={o.status} />
                <span className="text-xs font-bold text-brand-600">₹{o.total_amount}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ─── New Order Modal (with customer picker) ─── */}
      <AnimatePresence>
        {showNewOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowNewOrder(false)}>
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">

              {/* Drag handle (mobile) */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-slate-300" />
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Place New Order</h3>
                  <p className="text-xs text-slate-400 mt-0.5">On behalf of a customer</p>
                </div>
                <button onClick={() => setShowNewOrder(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">

                {/* Customer picker */}
                <div className="relative">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Customer *</label>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-brand-800">{selectedCustomer.name}</p>
                        <p className="text-xs text-brand-500">{selectedCustomer.phone} · ₹{selectedCustomer.jar_rate || 50}/jar</p>
                      </div>
                      <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700">Change</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input value={customerSearch}
                          onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                          onFocus={() => setShowCustomerDropdown(true)}
                          placeholder="Search customer by name or phone…"
                          className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
                      </div>
                      {showCustomerDropdown && filteredCustomers.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                          {filteredCustomers.map(c => (
                            <button key={c.id} type="button"
                              onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                                <p className="text-xs text-slate-400">{c.phone}</p>
                              </div>
                              <span className="text-xs font-bold text-brand-600">₹{c.jar_rate || 50}/jar</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {showCustomerDropdown && customerSearch && filteredCustomers.length === 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 px-4 py-3 text-center text-sm text-slate-400">
                          No customers found
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Order type */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Order Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['instant', 'preorder', 'monthly', 'bulk'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setNewOrder(f => ({ ...f, type: t }))}
                        className={`py-2.5 rounded-xl text-xs font-semibold border transition-all capitalize
                          ${newOrder.type === t
                            ? 'bg-brand-600 text-white border-brand-600 shadow-brand'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-brand-300 hover:bg-brand-50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity + Total */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Quantity (Jars)</label>
                    <input type="number" min={1} value={newOrder.quantity}
                      onChange={e => setNewOrder(f => ({ ...f, quantity: Math.max(1, Number(e.target.value)) }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all font-semibold" />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="bg-gradient-to-br from-brand-50 to-aqua-400/10 border border-brand-100 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-brand-500 font-medium">Total</p>
                      <p className="text-lg font-bold text-brand-700">₹{newOrder.quantity * (selectedCustomer?.jar_rate || 50)}</p>
                    </div>
                  </div>
                </div>

                {/* Delivery date (preorder only) */}
                {newOrder.type === 'preorder' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Delivery Date & Time</label>
                    <input type="datetime-local" value={newOrder.deliveryDate}
                      onChange={e => setNewOrder(f => ({ ...f, deliveryDate: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                  </div>
                )}

                {/* Address */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Address (optional)</label>
                  <textarea value={newOrder.address} onChange={e => setNewOrder(f => ({ ...f, address: e.target.value }))}
                    placeholder="Delivery address…" rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none" />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                  <input value={newOrder.notes} onChange={e => setNewOrder(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any instructions…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" size="md" className="flex-1"
                    onClick={() => setShowNewOrder(false)}>
                    Cancel
                  </Button>
                  <Button size="md" className="flex-1" loading={submittingOrder} onClick={handlePlaceOrder}
                    icon={<Package className="w-4 h-4" />}>
                    Place Order
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
