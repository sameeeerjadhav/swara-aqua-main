import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Calendar, X, Plus, Package, AlertTriangle,
  Check, XCircle, ChevronRight, ChevronLeft, User, Phone, MapPin, ClipboardList,
  Banknote, CreditCard, Clock, Truck, Hash, FileText, CircleDot, Copy, Navigation,
  Edit3, Save,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { OrderStatusBadge } from '../../components/ui/OrderStatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ordersApi, Order, TimelineEntry, Delivery } from '../../api/orders';
import { useSSE } from '../../hooks/useSSE';
import api from '../../api/axios';
import { subscriptionApi, CancelRequest } from '../../api/subscription';
import { PaymentEditModal, PaymentEditTarget, PM_LABEL } from '../../components/ui/PaymentEditModal';

interface CustomerOption { id: number; name: string; phone: string; jar_rate: number; }


// ── Clickable phone number — opens dialer + copy button ──
const PhoneLink = ({ phone, className = '' }: { phone: string; className?: string }) => {
  const handleDial = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${phone}`;
  };
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone).catch(() => {});
  };
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

const STATUS_FILTERS = ['all', 'pending', 'completed', 'cancelled'];

// Returns YYYY-MM-DD for today
const todayStr = () => new Date().toISOString().split('T')[0];
// Returns YYYY-MM for this month
const thisMonthStr = () => new Date().toISOString().slice(0, 7);

// ── Order Detail Modal ────────────────────────────────────────────────────────
const OrderDetailModal = ({ orderId, onClose }: { orderId: number; onClose: () => void }) => {
  const [order,    setOrder]    = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    ordersApi.get(orderId)
      .then(({ data }) => {
        setOrder(data.order);
        setTimeline(data.timeline ?? []);
        setDelivery(data.delivery ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

  const STATUS_COLOR: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
    assigned:  'bg-blue-100 text-blue-700',
  };

  const PAYMENT_ICON: Record<string, JSX.Element> = {
    cash:    <Banknote className="w-3.5 h-3.5" />,
    online:  <CreditCard className="w-3.5 h-3.5" />,
    advance: <CircleDot className="w-3.5 h-3.5" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-50 rounded-xl flex items-center justify-center">
              <Package className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Order #{orderId}</p>
              {order && <p className="text-[11px] text-slate-400 capitalize">{order.type} order</p>}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="px-6 py-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
          </div>
        ) : !order ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">Could not load order details</div>
        ) : (
          <div className="px-6 py-5 space-y-5">

            {/* Status badge */}
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full capitalize ${STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {order.status}
              </span>
              {order.paid_online && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <CreditCard className="w-3 h-3" /> Paid Online
                </span>
              )}
            </div>

            {/* Customer */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</p>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center font-bold text-brand-600 text-sm shrink-0">
                  {order.customer_name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{order.customer_name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <PhoneLink phone={order.customer_phone ?? ''} />
                  </p>
                </div>
              </div>
            </div>

            {/* Order meta grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-2xl p-3.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Quantity</p>
                <p className="text-xl font-bold text-slate-800">{order.quantity} <span className="text-sm font-semibold text-slate-400">jars</span></p>
              </div>
              <div className="bg-brand-50 rounded-2xl p-3.5">
                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-1">Total Amount</p>
                <p className="text-xl font-bold text-brand-700">₹{order.total_amount}</p>
                <p className="text-[10px] text-brand-400">₹{order.price_per_jar}/jar</p>
              </div>
            </div>

            {/* Staff */}
            {order.staff_name && (
              <div className="flex items-center gap-2.5 bg-slate-50 rounded-2xl p-3.5">
                <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Staff</p>
                  <p className="text-sm font-semibold text-slate-700">{order.staff_name}</p>
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-500"><Clock className="w-3.5 h-3.5" />Ordered</span>
                <span className="font-semibold text-slate-700">{fmt(order.created_at)}</span>
              </div>
              {order.delivery_date && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500"><Truck className="w-3.5 h-3.5" />Delivery Date</span>
                  <span className="font-semibold text-slate-700">{fmt(order.delivery_date)}</span>
                </div>
              )}
            </div>

            {/* Delivery record */}
            {delivery && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Delivery Record</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-lg font-bold text-emerald-700">{delivery.delivered_quantity}</p>
                    <p className="text-[10px] text-slate-400">Jars Delivered</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5">
                    <p className="text-lg font-bold text-emerald-700">₹{delivery.collected_amount}</p>
                    <p className="text-[10px] text-slate-400">Collected</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 flex flex-col items-center justify-center gap-1">
                    {PAYMENT_ICON[delivery.payment_mode] ?? <Banknote className="w-3.5 h-3.5" />}
                    <p className="text-[10px] text-slate-400 capitalize">{delivery.payment_mode}</p>
                  </div>
                </div>
                {delivery.delivered_at && (
                  <p className="text-[10px] text-emerald-600 text-center">{fmt(delivery.delivered_at)}</p>
                )}
                {delivery.notes && (
                  <p className="text-xs text-slate-500 text-center italic">{delivery.notes}</p>
                )}
              </div>
            )}

            {/* Address */}
            {order.address && (
              <div className="flex items-start gap-2.5 bg-slate-50 rounded-2xl p-3.5">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Delivery Address</p>
                  <p className="text-sm text-slate-700">{order.address}</p>
                </div>
              </div>
            )}

            {/* Notes */}
            {order.notes && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl p-3.5">
                <FileText className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-0.5">Notes</p>
                  <p className="text-sm text-slate-700">{order.notes}</p>
                </div>
              </div>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Timeline</p>
                <div className="relative pl-4">
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-200" />
                  <div className="space-y-4">
                    {timeline.map((t) => (
                      <div key={t.id} className="relative flex items-start gap-3">
                        <div className="absolute -left-2.5 top-1 w-2 h-2 rounded-full bg-brand-400 ring-2 ring-white" />
                        <div className="pl-2">
                          <p className="text-xs font-semibold text-slate-700 capitalize">{t.status.replace(/_/g, ' ')}</p>
                          {t.note && <p className="text-[11px] text-slate-400 mt-0.5">{t.note}</p>}
                          <p className="text-[10px] text-slate-300 mt-0.5">
                            {t.actor_name && <span className="text-slate-400">{t.actor_name} · </span>}
                            {fmt(t.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const AdminOrders = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Pre-apply filter from URL query param e.g. ?status=pending
  const [statusFilter, setStatusFilter] = useState(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    if (!s) return 'all';
    // Map legacy/backend values to UI filter names
    if (s === 'assigned') return 'pending';      // assigned = still undelivered
    if (s === 'delivered') return 'completed';   // delivered = same as completed in UI
    return STATUS_FILTERS.includes(s) ? s : 'all';
  });
  const [dateFilter, setDateFilter] = useState('');   // YYYY-MM-DD
  const [monthFilter, setMonthFilter] = useState('');   // YYYY-MM
  const [dateMode, setDateMode] = useState<'date' | 'month' | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [editingPaymentOrder, setEditingPaymentOrder] = useState<PaymentEditTarget | null>(null);

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
  const [crLoading, setCrLoading] = useState(false);
  const [showCancelRequests, setShowCancelRequests] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = async (pageOverride?: number, silent = false) => {
    if (!silent) setLoading(true);
    const currentPage = pageOverride ?? page;
    try {
      const params: Record<string, string | number> = {};
      // 'pending' from admin's view = pending + assigned (both undelivered)
      // 'completed' from admin's view = completed + delivered (both finished)
      if (statusFilter === 'pending') {
        params.status = 'pending,assigned';
      } else if (statusFilter === 'completed') {
        params.status = 'completed,delivered';
      } else if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (search) params.search = search;
      if (dateFilter) params.date = dateFilter;
      else if (monthFilter) params.month = monthFilter;
      params.page  = currentPage;
      params.limit = pageSize;
      const res = await ordersApi.list(params);
      setOrders(res.data.orders);
      setTotalOrders(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    } catch { if (!silent) toast('Failed to load orders', 'error'); }
    finally { if (!silent) setLoading(false); }
  };

  // Reset to page 1 whenever filters change, then reload
  useEffect(() => { setPage(1); }, [statusFilter, dateFilter, monthFilter, pageSize]);
  useEffect(() => { load(); }, [page, statusFilter, dateFilter, monthFilter, pageSize]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(1); };

  const clearDateFilters = () => { setDateFilter(''); setMonthFilter(''); setDateMode(null); };

  // SSE: silently refresh in background — no table flicker, no scroll jump
  useSSE({
    order_created:      () => load(undefined, true),
    order_updated:      () => load(undefined, true),
    delivery_completed: () => load(undefined, true),
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
      }).catch(() => { });
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
                        {[0, 1].map(i => <div key={i} className="h-16 bg-amber-100 rounded-xl" />)}
                      </div>
                    </div>
                  ) : cancelRequests.map(cr => (
                    <div key={cr.id} className={`px-5 py-4 ${cr.status !== 'pending' ? 'opacity-60' : ''
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
                              <PhoneLink phone={cr.customer_phone ?? ''} className="text-[11px] text-slate-500" />
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
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg capitalize ${cr.status === 'approved'
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

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowNewOrder(true)}>
          New Order
        </Button>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>
          Refresh
        </Button>
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
              {s === 'all' ? 'All' : s === 'completed' ? 'Completed' : s === 'cancelled' ? 'Cancelled' : 'Pending'}
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
                [0, 1, 2, 3].map(i => (
                  <tr key={i}>{[0, 1, 2, 3, 4, 5, 6, 7].map(j => (
                    <td key={j} className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
                  ))}</tr>
                ))
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No orders found</td></tr>
              ) : orders.map((o, i) => (
                <motion.tr key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  onClick={() => setSelectedOrderId(o.id)}
                  className="hover:bg-brand-50/50 transition-colors cursor-pointer group">
                  <td className="px-4 py-3.5 text-xs font-bold text-slate-400">#{o.id}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-semibold text-slate-800">{o.customer_name}</p>
                    <PhoneLink phone={o.customer_phone ?? ''} className="text-xs text-slate-400" />
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-600 capitalize">{o.type}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-700">{o.quantity}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-brand-600">₹{o.total_amount}</span>
                      {/* Payment mode badge */}
                      {o.delivery_payment_mode && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                          PM_LABEL[o.delivery_payment_mode]?.cls ?? ''
                        }`}>
                          {PM_LABEL[o.delivery_payment_mode]?.icon} {PM_LABEL[o.delivery_payment_mode]?.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><OrderStatusBadge status={o.status} /></td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{o.staff_name || '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {/* Edit payment — only for delivered orders */}
                      {(o.status === 'completed' || o.status === 'delivered') && (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingPaymentOrder({
                            order_id: o.id,
                            delivery_id: o.delivery_id,
                            customer_name: o.customer_name,
                            quantity: o.quantity,
                            total_amount: o.total_amount,
                            delivery_payment_mode: o.delivery_payment_mode,
                            delivery_collected_amount: o.delivery_collected_amount,
                            advance_access: o.customer_advance_access,
                          }); }}
                          title="Correct payment mode"
                          className="p-1 rounded-lg hover:bg-brand-100 text-slate-400 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile — staff-style order cards */}
        <div className="md:hidden p-3 space-y-3">
          {loading ? (
            [0,1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No orders found</div>
          ) : orders.map((o, i) => (
            <motion.div key={o.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`bg-white rounded-2xl border shadow-card p-4 transition-all
                ${o.status === 'cancelled' ? 'opacity-60 border-dashed border-slate-200'
                  : ['completed','delivered'].includes(o.status) ? 'border-green-100'
                  : o.status === 'assigned' ? 'border-brand-100 ring-1 ring-brand-100'
                  : 'border-slate-100'}`}>

              {/* Top row: #ID + status badge | amount + jars */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-400">#{o.id}</span>
                  <OrderStatusBadge status={o.status} />
                  {o.type !== 'instant' && (
                    <span className="text-[9px] font-bold bg-purple-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide capitalize">
                      {o.type}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-base font-bold text-brand-600">₹{o.total_amount}</p>
                  <p className="text-xs text-slate-400">{o.quantity} jar{o.quantity > 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Customer name */}
              <p className="text-sm font-bold text-slate-800 mb-1">{o.customer_name}</p>

              {/* Address */}
              {o.address && (
                <p className="text-xs text-slate-400 flex items-center gap-1 mb-2 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />{o.address}
                </p>
              )}

              {/* Staff */}
              {o.staff_name && (
                <p className="text-[11px] text-slate-400 mb-2">→ {o.staff_name}</p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setSelectedOrderId(o.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-brand-300 transition-all active:scale-95">
                  View Details
                </button>
                {/* Edit payment — for all completed/delivered orders */}
                {(o.status === 'completed' || o.status === 'delivered') && (
                  <button
                    onClick={() => setEditingPaymentOrder({
                      order_id: o.id,
                      delivery_id: o.delivery_id,
                      customer_name: o.customer_name,
                      quantity: o.quantity,
                      total_amount: o.total_amount,
                      delivery_payment_mode: o.delivery_payment_mode,
                      delivery_collected_amount: o.delivery_collected_amount,
                      advance_access: o.customer_advance_access,
                    })}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100 transition-all active:scale-95">
                    <Edit3 className="w-3.5 h-3.5" />
                    {o.delivery_payment_mode ? PM_LABEL[o.delivery_payment_mode]?.icon : ''} Fix Payment
                  </button>
                )}
                {(o.address || (o.latitude && o.longitude)) && (
                  <button
                    onClick={() => {
                      if (o.latitude && o.longitude) {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${o.latitude},${o.longitude}`, '_blank');
                      } else if (o.address) {
                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`, '_blank');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-brand-600 hover:bg-brand-50 hover:border-brand-300 transition-all active:scale-95">
                    <Navigation className="w-3.5 h-3.5" />
                    Navigate
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Pagination Bar ── */}
      {!loading && totalOrders > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">

          {/* Left: summary + page size */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-bold text-slate-700">{(page - 1) * pageSize + 1}</span>–
              <span className="font-bold text-slate-700">{Math.min(page * pageSize, totalOrders)}</span>
              {' '}of{' '}
              <span className="font-bold text-slate-700">{totalOrders}</span> orders
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Per page:</span>
              {[10, 25, 50, 100].map(n => (
                <button key={n} onClick={() => setPageSize(n)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${
                    pageSize === n ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Right: prev / page number pills / next */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce<(number | '...')[]>((acc, n, idx, arr) => {
                  if (idx > 0 && (n as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '...' ? (
                    <span key={`e${i}`} className="px-1 text-slate-400 text-xs">…</span>
                  ) : (
                    <button key={n} onClick={() => setPage(n as number)}
                      className={`min-w-[28px] h-7 rounded-lg text-xs font-semibold transition-all ${
                        page === n ? 'bg-brand-600 text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {n}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* ─── Order Detail Modal ─── */}
      <AnimatePresence>
        {selectedOrderId !== null && (
          <OrderDetailModal
            orderId={selectedOrderId}
            onClose={() => setSelectedOrderId(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Payment Correction Modal ─── */}
      <AnimatePresence>
        {editingPaymentOrder && (
          <PaymentEditModal
            target={editingPaymentOrder}
            onSaved={() => { setEditingPaymentOrder(null); load(undefined, true); }}
            onClose={() => setEditingPaymentOrder(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
};
