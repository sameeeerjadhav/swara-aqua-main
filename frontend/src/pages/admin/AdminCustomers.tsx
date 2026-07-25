import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, CheckCircle, XCircle, RefreshCw, X, IndianRupee, Pencil, Eye, ChevronRight, Calendar, User, UserPlus, Package, Droplets, Sun, CloudSun, Sunset, Plus, Minus, RotateCcw, Check, Copy, MapPin, Camera, Trash2, AlertTriangle, GripVertical, ListOrdered, KeyRound, Tag } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { Avatar } from '../../components/ui/Avatar';
import api from '../../api/axios';
import { subscriptionApi } from '../../api/subscription';
import { pendingApi } from '../../api/pending';
import { customerOrderApi, applyOrder } from '../../api/customerOrder';
import { groupsApi, type CustomerGroup } from '../../api/groups';

interface CustomerRow { id: number; name: string; phone: string; role: string; status: string; jar_rate: number; prepaid_balance: number; advance_access: string; created_at: string; profile_photo?: string | null; group_id?: number | null; group_name?: string | null; group_color?: string | null; group_icon?: string | null; }
interface MonthBill { month: string; total_amount: number; paid_amount: number; pending: number; status: string; }
interface BalanceInfo { total: number; months: MonthBill[]; }
interface SavedAddress { label: string; address: string; is_default: number; }
interface PendingDetail { id: number; name: string; phone: string; status: string; created_at: string; address: string | null; savedAddresses: SavedAddress[]; }

const LOW_BAL_THRESHOLD = 60;
const STATUS_FILTERS = ['all', 'low_balance', 'pay_later', 'active', 'pending', 'rejected'];

// ── Color palette for groups ──────────────────────────────────────────────────
const GROUP_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
];
const GROUP_ICONS = ['👥', '⭐', '💎', '🚀', '🏷️', '💰', '🎯', '📦', '🌟', '🔑'];

// ── Group badge helper ────────────────────────────────────────────────────────
const GroupBadge = ({ name, color, icon, small = false }: { name: string; color: string; icon: string; small?: boolean }) => (
  <span
    className={`inline-flex items-center gap-1 font-semibold rounded-full border ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`}
    style={{ color, borderColor: color + '40', backgroundColor: color + '12' }}
  >
    <span>{icon}</span>{name}
  </span>
);


// ── Clickable phone — opens dialer on click, copy button on hover ──
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
const MONTH_LABELS: Record<string, string> = {};
const getMonthLabel = (m: string) => {
  if (MONTH_LABELS[m]) return MONTH_LABELS[m];
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  MONTH_LABELS[m] = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return MONTH_LABELS[m];
};

const statusColor: Record<string, string> = {
  active:   'bg-green-50 text-green-700 border-green-200',
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
};

// ── Animated drag item for reorder mode ───────────────────────────────────────
const DraggableAdminCustomerItem = ({
  item, index, total, onMove,
}: {
  item: CustomerRow;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="relative"
      style={{ listStyle: 'none' }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{
        scale: 1.03,
        boxShadow: '0 16px 40px -8px rgba(0,0,0,0.18)',
        zIndex: 50,
        borderColor: 'rgb(99 102 241)',
      }}
    >
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3 py-3 select-none">
        {/* Position number */}
        <span className="w-6 text-center text-xs font-bold text-slate-400 shrink-0">{index + 1}</span>
        {/* Drag handle — only this initiates the drag */}
        <GripVertical
          className="w-5 h-5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={e => controls.start(e)}
        />
        {/* Avatar + Name */}
        <Avatar name={item.name} photo={item.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
          <PhoneLink phone={item.phone} className="text-xs text-slate-400" />
        </div>
        {/* Arrow buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onMove(index, Math.max(0, index - 1))}
            disabled={index === 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V4M4 8l4-4 4 4" /></svg>
          </button>
          <button
            onClick={() => onMove(index, Math.min(total - 1, index + 1))}
            disabled={index === total - 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v8M4 8l4 4 4-4" /></svg>
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
};

export const AdminCustomers = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers]   = useState<CustomerRow[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [actionId,  setActionId]    = useState<number | null>(null);
  const [search,    setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingRate, setEditingRate] = useState<CustomerRow | null>(null);
  const [rateValue, setRateValue]   = useState('');

  // Mobile modal
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);

  // Delete
  const [deleteTarget,  setDeleteTarget]  = useState<CustomerRow | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  // Rearrange mode
  const [reorderMode,    setReorderMode]    = useState(false);
  const [reorderedList,  setReorderedList]  = useState<CustomerRow[]>([]);
  const [savingOrder,    setSavingOrder]    = useState(false);

  // Pending customer registration detail modal
  const [pendingDetail, setPendingDetail] = useState<PendingDetail | null>(null);
  const [pendingDetailLoading, setPendingDetailLoading] = useState(false);

  const fetchPendingDetail = async (customer: CustomerRow) => {
    setPendingDetailLoading(true);
    try {
      const res = await api.get(`/admin/users/${customer.id}/profile`);
      const c = res.data.customer;
      setPendingDetail({
        id: c.id, name: c.name, phone: c.phone, status: c.status,
        created_at: c.created_at,
        address: c.address,
        savedAddresses: c.savedAddresses || [],
      });
    } catch {
      // fallback: show basic info from list
      setPendingDetail({ id: customer.id, name: customer.name, phone: customer.phone, status: customer.status, created_at: customer.created_at, address: null, savedAddresses: [] });
    } finally {
      setPendingDetailLoading(false);
    }
  };

  // Billing pending balances
  const [balances, setBalances] = useState<Record<number, BalanceInfo>>({});
  // Pay-later pending balances
  const [payLaterMap, setPayLaterMap] = useState<Record<number, number>>({});
  const [totalPayLater, setTotalPayLater] = useState(0);

  // Customer Groups
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<number | 'ungrouped' | null>(null);
  // Manage Groups modal
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', color: '#3B82F6', icon: '👥', description: '' });
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
  const [assigningGroup, setAssigningGroup] = useState<{ customerId: number; current: number | null } | null>(null);
  // Members panel (second view inside the modal)
  const [managingMembersOf, setManagingMembersOf] = useState<CustomerGroup | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const loadGroups = async () => {
    try {
      const { data } = await groupsApi.list();
      setGroups(data.groups);
    } catch { /* silent */ }
  };

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', password: '', jarRate: '50', address: '' });

  // Password reset
  const [resettingPwdId, setResettingPwdId] = useState<number | null>(null);
  const [tempPwdResult, setTempPwdResult] = useState<{ name: string; phone: string; pwd: string } | null>(null);

  const handleResetPassword = async (u: CustomerRow) => {
    setResettingPwdId(u.id);
    try {
      const { data } = await api.post(`/admin/users/${u.id}/reset-password`);
      setTempPwdResult({ name: u.name, phone: u.phone, pwd: data.tempPassword });
      setSelectedCustomer(null);
    } catch {
      toast('Failed to reset password', 'error');
    } finally {
      setResettingPwdId(null);
    }
  };

  // Place Order for customer modal
  const [orderForCustomer, setOrderForCustomer] = useState<CustomerRow | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ type: 'instant' as string, quantity: 1, deliveryDate: '', notes: '', address: '' });

  // Create Plan for customer modal
  const [planForCustomer, setPlanForCustomer] = useState<CustomerRow | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planSlots, setPlanSlots] = useState<Record<string, { time: string; quantity: number }>>({});
  const [planAddress, setPlanAddress] = useState('');
  const [planAutoRenew, setPlanAutoRenew] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, balRes, payLaterRes, orderRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/customer-balances'),
        pendingApi.adminSummary(),
        customerOrderApi.getAdmin().catch(() => ({ data: { ordered_ids: [] } })),
      ]);
      const rawCustomers = usersRes.data.users.filter((u: CustomerRow) => u.role === 'customer');
      const orderedCustomers = applyOrder(rawCustomers, orderRes.data.ordered_ids ?? []);
      setCustomers(orderedCustomers);
      setReorderedList(orderedCustomers);
      setBalances(balRes.data.balances || {});
      const map: Record<number, number> = {};
      for (const row of payLaterRes.data.customers) {
        map[row.id] = row.pending_balance;
      }
      setPayLaterMap(map);
      setTotalPayLater(payLaterRes.data.total_pending || 0);
    } catch { toast('Failed to load customers', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); loadGroups(); }, []);

  const handleStatus = async (id: number, status: string) => {
    setActionId(id);
    try {
      await api.patch(`/admin/users/${id}/status`, { status });
      toast(status === 'active' ? 'Customer approved' : 'Customer rejected',
            status === 'active' ? 'success' : 'warning');
      setSelectedCustomer(null);
      await load();
    } catch { toast('Action failed', 'error'); }
    finally { setActionId(null); }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`);
      toast(`${deleteTarget.name} deleted. All records preserved.`, 'success');
      setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
      setReorderedList(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSelectedCustomer(null);
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to delete', 'error');
    } finally { setDeleting(false); }
  };

  // ── Reorder helpers ─────────────────────────────────────────────────────────
  const moveItem = useCallback((from: number, to: number) => {
    if (from === to) return;
    setReorderedList(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await customerOrderApi.saveAdmin(reorderedList.map(c => c.id));
      setCustomers(reorderedList);
      setReorderMode(false);
      toast('Customer order saved!', 'success');
    } catch { toast('Failed to save order', 'error'); }
    finally { setSavingOrder(false); }
  };

  const cancelReorder = () => {
    setReorderedList([...customers]);
    setReorderMode(false);
  };

  /** Jump a customer to a given 1-based position */
  const setCustomerPosition = useCallback((customerId: number, pos1based: number) => {
    setReorderedList(prev => {
      const arr = [...prev];
      const from = arr.findIndex(c => c.id === customerId);
      if (from === -1) return prev;
      const to = Math.max(0, Math.min(arr.length - 1, pos1based - 1));
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);


  const handleJarRate = async () => {
    if (!editingRate) return;
    const rate = Number(rateValue);
    if (!rate || rate <= 0) { toast('Enter a valid jar rate', 'error'); return; }
    try {
      await api.patch(`/admin/users/${editingRate.id}/jar-rate`, { jarRate: rate });
      toast(`Jar rate set to ₹${rate}`, 'success');
      setEditingRate(null);
      await load();
    } catch { toast('Failed to update jar rate', 'error'); }
  };

  const handleAddCustomer = async () => {
    const { name, phone, password, jarRate, address } = newCustomer;
    if (!name.trim() || !phone.trim() || !password) { toast('Name, phone and password are required', 'error'); return; }
    if (password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    setAddingCustomer(true);
    try {
      await api.post('/admin/customer', { name: name.trim(), phone: phone.trim(), password, jarRate: Number(jarRate) || 50, address: address.trim() || undefined });
      toast('Customer created successfully!', 'success');
      setShowAddCustomer(false);
      setNewCustomer({ name: '', phone: '', password: '', jarRate: '50', address: '' });
      await load();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to create customer', 'error');
    } finally { setAddingCustomer(false); }
  };

  const handlePlaceOrder = async () => {
    if (!orderForCustomer) return;
    if (orderForm.quantity < 1) { toast('Quantity must be at least 1', 'error'); return; }
    if (orderForm.type === 'preorder' && !orderForm.deliveryDate) { toast('Select delivery date for preorder', 'error'); return; }
    setPlacingOrder(true);
    try {
      await api.post('/admin/orders', {
        customerId: orderForCustomer.id,
        type: orderForm.type,
        quantity: orderForm.quantity,
        deliveryDate: orderForm.type === 'preorder' ? orderForm.deliveryDate : undefined,
        notes: orderForm.notes || undefined,
        address: orderForm.address || undefined,
      });
      toast(`Order placed for ${orderForCustomer.name}!`, 'success');
      setOrderForCustomer(null);
      setOrderForm({ type: 'instant', quantity: 1, deliveryDate: '', notes: '', address: '' });
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to place order', 'error');
    } finally { setPlacingOrder(false); }
  };

  // ── Plan helpers ────────────────────────────────────────────────────────
  const PLAN_SLOTS = [
    { label: 'Morning',   time: '08:00', icon: <Sun className="w-4 h-4" />,      gradient: 'from-amber-400 to-orange-500' },
    { label: 'Afternoon', time: '13:00', icon: <CloudSun className="w-4 h-4" />, gradient: 'from-sky-400 to-blue-500' },
    { label: 'Evening',   time: '17:00', icon: <Sunset className="w-4 h-4" />,   gradient: 'from-purple-400 to-indigo-500' },
  ];

  const togglePlanSlot = (label: string, time: string) => {
    setPlanSlots(prev => {
      if (prev[label]) { const { [label]: _, ...rest } = prev; return rest; }
      return { ...prev, [label]: { time, quantity: 1 } };
    });
  };

  const setPlanSlotQty = (label: string, delta: number) => {
    setPlanSlots(prev => {
      if (!prev[label]) return prev;
      const q = Math.max(1, prev[label].quantity + delta);
      return { ...prev, [label]: { ...prev[label], quantity: q } };
    });
  };

  const handleCreatePlan = async () => {
    if (!planForCustomer) return;
    const slots = Object.entries(planSlots).map(([label, s]) => ({ label, time: s.time, quantity: s.quantity }));
    if (slots.length === 0) { toast('Select at least one slot', 'error'); return; }
    setCreatingPlan(true);
    try {
      await subscriptionApi.adminCreate({ customerId: planForCustomer.id, slots, address: planAddress || undefined, autoRenew: planAutoRenew });
      toast(`Monthly plan created for ${planForCustomer.name}! 🎉`, 'success');
      setPlanForCustomer(null);
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to create plan', 'error');
    } finally { setCreatingPlan(false); }
  };

  const filtered = customers.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search);
    // Group filter
    if (groupFilter === 'ungrouped' && u.group_id) return false;
    if (typeof groupFilter === 'number' && u.group_id !== groupFilter) return false;
    if (statusFilter === 'low_balance') {
      return matchSearch
        && u.status === 'active'
        && u.advance_access === 'approved'
        && Number(u.prepaid_balance ?? 0) <= LOW_BAL_THRESHOLD;
    }
    if (statusFilter === 'pay_later') {
      return matchSearch && (payLaterMap[u.id] ?? 0) > 0;
    }
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const lowBalCount = customers.filter(u =>
    u.status === 'active' &&
    u.advance_access === 'approved' &&
    Number(u.prepaid_balance ?? 0) <= LOW_BAL_THRESHOLD
  ).length;

  const counts: Record<string, number> = {
    all:          customers.length,
    low_balance:  lowBalCount,
    pay_later:    customers.filter(u => (payLaterMap[u.id] ?? 0) > 0).length,
    active:       customers.filter(u => u.status === 'active').length,
    pending:      customers.filter(u => u.status === 'pending').length,
    rejected:     customers.filter(u => u.status === 'rejected').length,
  };

  // Selected customer's balance (for modal)
  const selBal      = selectedCustomer ? balances[selectedCustomer.id]       : null;
  const selPayLater = selectedCustomer ? (payLaterMap[selectedCustomer.id] ?? 0) : 0;

  return (
    <div className="max-w-4xl space-y-5">

      {/* Reorder mode banner */}
      <AnimatePresence>
        {reorderMode && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between bg-brand-600 text-white rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 opacity-70" />
              <p className="text-sm font-semibold">Drag cards to reorder • Changes save when you click Save</p>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelReorder}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={saveOrder} disabled={savingOrder}
                className="px-3 py-1.5 bg-white text-brand-700 text-xs font-bold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-60">
                {savingOrder ? 'Saving…' : 'Save Order'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action bar */}
      <div className="flex items-center gap-2">

        {/* ── Add Customer — left side, never shrinks ── */}
        <Button
          size="sm"
          icon={<UserPlus className="w-3.5 h-3.5" />}
          className="shrink-0 whitespace-nowrap"
          onClick={() => setShowAddCustomer(true)}>
          Add Customer
        </Button>

        {/* ── Secondary actions — right side, scrolls on small screens ── */}
        <div className="flex items-center justify-end gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => { setEditingGroup(null); setGroupForm({ name: '', color: '#3B82F6', icon: '👥', description: '' }); setShowManageGroups(true); }}
            title="Manage Groups"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50 active:scale-95 transition-all text-xs font-semibold shadow-sm">
            <Tag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Groups</span>
          </button>

          <button
            onClick={() => { if (reorderMode) { cancelReorder(); } else { setReorderedList([...customers]); setReorderMode(true); } }}
            title={reorderMode ? 'Cancel reorder' : 'Reorder customers'}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 shadow-sm
              ${reorderMode
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                : 'bg-white text-slate-600 border-slate-200 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50'}`}>
            <ListOrdered className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{reorderMode ? 'Cancel' : 'Reorder'}</span>
          </button>

          <button
            onClick={load}
            title="Refresh"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50 active:scale-95 transition-all text-xs font-semibold shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

      </div>

      {/* ─── REORDER MODE: Framer Motion animated drag list ─── */}
      {reorderMode && (
        <div className="space-y-2">
          <Reorder.Group
            axis="y"
            values={reorderedList}
            onReorder={setReorderedList}
            className="space-y-2 outline-none"
          >
            {reorderedList.map((u, i) => (
              <DraggableAdminCustomerItem
                key={u.id}
                item={u}
                index={i}
                total={reorderedList.length}
                onMove={moveItem}
              />
            ))}
          </Reorder.Group>
          {/* Save bar at bottom */}
          <div className="flex gap-2 pt-2">
            <button onClick={cancelReorder}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-2xl transition-colors">
              Cancel
            </button>
            <button onClick={saveOrder} disabled={savingOrder}
              className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-2xl transition-colors disabled:opacity-60">
              {savingOrder ? 'Saving…' : '💾 Save Order'}
            </button>
          </div>
        </div>
      )}

      {/* ─── NORMAL MODE: Filters + Search + Table ─── */}
      {!reorderMode && (
        <>
      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all capitalize
              ${statusFilter === s
                ? s === 'low_balance'
                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                  : s === 'pay_later'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-brand-600 text-white border-brand-600 shadow-brand'
                : s === 'low_balance'
                  ? 'bg-orange-50 text-orange-600 border-orange-200 hover:border-orange-400'
                  : s === 'pay_later'
                    ? 'bg-amber-50 text-amber-600 border-amber-200 hover:border-amber-400'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-brand-300'}`}>
            {s === 'all' ? 'All'
              : s === 'low_balance' ? '⚠️ Low Balance'
              : s === 'pay_later'   ? '⏳ Pay-Later'
              : s}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
              ${statusFilter === s ? 'bg-white/20 text-white'
                : s === 'low_balance' ? 'bg-orange-100 text-orange-600'
                : s === 'pay_later'   ? 'bg-amber-100 text-amber-600'
                : 'bg-slate-100 text-slate-500'}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Group filter pills ── */}
      {groups.length > 0 && (
        <div className="space-y-2">
          {/* Pills row */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group:</span>
            <button
              onClick={() => setGroupFilter(null)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all
                ${groupFilter === null ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              All
            </button>
            <button
              onClick={() => setGroupFilter(groupFilter === 'ungrouped' ? null : 'ungrouped')}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all
                ${groupFilter === 'ungrouped' ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}>
              No Group
            </button>
            {groups.map(g => {
              const count = customers.filter(c => c.group_id === g.id).length;
              const isActive = groupFilter === g.id;
              return (
                <button key={g.id}
                  onClick={() => setGroupFilter(isActive ? null : g.id)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all"
                  style={isActive
                    ? { backgroundColor: g.color, color: '#fff', borderColor: g.color }
                    : { backgroundColor: g.color + '15', color: g.color, borderColor: g.color + '40' }}>
                  {g.icon} {g.name}
                  <span className="text-[10px] opacity-75">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Contextual bar — appears when a specific group is active */}
          <AnimatePresence>
            {typeof groupFilter === 'number' && (() => {
              const activeGroup = groups.find(g => g.id === groupFilter);
              if (!activeGroup) return null;
              const count = customers.filter(c => c.group_id === activeGroup.id).length;
              return (
                <motion.div
                  key={`manage-bar-${activeGroup.id}`}
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-between rounded-2xl px-4 py-2.5 border"
                  style={{ backgroundColor: activeGroup.color + '12', borderColor: activeGroup.color + '35' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{activeGroup.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: activeGroup.color }}>
                        {activeGroup.name}
                      </p>
                      <p className="text-[10px] text-slate-400">{count} member{count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setManagingMembersOf(activeGroup); setMemberSearch(''); setShowManageGroups(true); }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 ml-3 transition-all hover:scale-105 active:scale-95"
                    style={{ color: activeGroup.color, borderColor: activeGroup.color, backgroundColor: activeGroup.color + '15' }}>
                    <User className="w-3 h-3" />
                    Manage Members
                  </button>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-card focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
      </div>

      {/* Table — desktop */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Customer', 'Phone', 'Jar Rate', 'Bill Pending', 'Pay Later', 'Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [0,1,2,3].map(i => (
                  <tr key={i}>{[0,1,2,3,4].map(j => (
                    <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-20" /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-sm">No customers found</td></tr>
              ) : filtered.map((u, i) => {
                const bal = balances[u.id];
                const payLater = payLaterMap[u.id] || 0;
                return (
                  <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} photo={u.profile_photo} size="xs" className="w-8 h-8" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{u.name}</p>
                          {u.group_name && u.group_color && u.group_icon && (
                            <GroupBadge name={u.group_name} color={u.group_color} icon={u.group_icon} small />
                          )}
                          {u.status === 'active' && u.advance_access === 'approved' && Number(u.prepaid_balance ?? 0) <= LOW_BAL_THRESHOLD && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full mt-0.5">
                              ⚠️ Low Advance ₹{Number(u.prepaid_balance ?? 0)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      <PhoneLink phone={u.phone} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => { setEditingRate(u); setRateValue(String(u.jar_rate || 50)); }}
                        className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                        ₹{u.jar_rate || 50}
                        <Pencil className="w-3 h-3 text-slate-400" />
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      {bal && bal.total > 0 ? (
                        <span className="text-sm font-bold text-red-500">₹{bal.total.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-sm text-green-500 font-medium">Clear</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {payLater > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                          ⏳ ₹{payLater.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {u.status === 'pending' ? (
                          <Button variant="ghost" size="sm"
                            icon={<Eye className="w-3.5 h-3.5 text-amber-500" />}
                            onClick={() => fetchPendingDetail(u)}
                            className="text-amber-600 hover:bg-amber-50">
                            View Details
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm"
                            icon={<Eye className="w-3.5 h-3.5 text-brand-500" />}
                            onClick={() => navigate(`/admin/customers/${u.id}`)}
                            className="text-brand-600 hover:bg-brand-50">
                            View
                          </Button>
                        )}
                        {u.status !== 'active' && (
                          <Button variant="ghost" size="sm" loading={actionId === u.id}
                            icon={<CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                            onClick={() => handleStatus(u.id, 'active')}
                            className="text-green-600 hover:bg-green-50">
                            Approve
                          </Button>
                        )}
                        {u.status !== 'rejected' && (
                          <Button variant="ghost" size="sm" loading={actionId === u.id}
                            icon={<XCircle className="w-3.5 h-3.5 text-red-400" />}
                            onClick={() => handleStatus(u.id, 'rejected')}
                            className="text-red-500 hover:bg-red-50">
                            Reject
                          </Button>
                        )}
                        <Button variant="ghost" size="sm"
                          icon={<KeyRound className="w-3.5 h-3.5 text-amber-500" />}
                          loading={resettingPwdId === u.id}
                          onClick={() => handleResetPassword(u)}
                          className="text-amber-600 hover:bg-amber-50">
                          Reset Pwd
                        </Button>
                        <Button variant="ghost" size="sm"
                          icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                          onClick={() => setDeleteTarget(u)}
                          className="text-red-600 hover:bg-red-50">
                          Delete
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ─── Mobile: tappable cards ─── */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            [0,1,2,3].map(i => (
              <div key={i} className="p-4 flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No customers found</div>
          ) : filtered.map(u => {
            const bal = balances[u.id];
            const hasPending = bal && bal.total > 0;
            return (
              <motion.button
                key={u.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => u.status === 'pending' ? fetchPendingDetail(u) : setSelectedCustomer(u)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 transition-colors">

                {/* Avatar */}
                <Avatar name={u.name} photo={u.profile_photo} size="sm" className="w-10 h-10" />

                {/* Name + phone */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{u.name}</p>
                  <PhoneLink phone={u.phone} className="text-[11px] text-slate-400 mt-0.5" />
                  {u.group_name && u.group_color && u.group_icon && (
                    <GroupBadge name={u.group_name} color={u.group_color} icon={u.group_icon} small />
                  )}
                  {u.status === 'active' && u.advance_access === 'approved' && Number(u.prepaid_balance ?? 0) <= LOW_BAL_THRESHOLD && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full mt-1">
                      ⚠️ Low Advance ₹{Number(u.prepaid_balance ?? 0)}
                    </span>
                  )}
                </div>

                {/* Right: balance pill + status + arrow */}
                <div className="flex items-center gap-2 shrink-0">
                  {hasPending ? (
                    <span className="bg-red-50 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full border border-red-100">
                      ₹{bal.total.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${statusColor[u.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {u.status}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
        </>
      )}

      {/* ─── Mobile Customer Detail Modal (bottom sheet) ─── */}
      <AnimatePresence>
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center md:hidden"
            onClick={() => setSelectedCustomer(null)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 pb-6">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={selectedCustomer.name} photo={selectedCustomer.profile_photo} size="md" className="w-12 h-12" />
                      <label
                        htmlFor="admin-customer-photo"
                        className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md cursor-pointer border border-slate-100 hover:bg-brand-50 transition-colors"
                        title="Upload photo"
                      >
                        <Camera className="w-2.5 h-2.5 text-brand-600" />
                      </label>
                      <input
                        id="admin-customer-photo"
                        type="file" accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const fd = new FormData();
                          fd.append('photo', file);
                          try {
                            await api.post(`/admin/users/${selectedCustomer.id}/photo`, fd, {
                              headers: { 'Content-Type': 'multipart/form-data' },
                            });
                            toast('Photo updated!', 'success');
                            setCustomers(prev => prev.map(c =>
                              c.id === selectedCustomer.id
                                ? { ...c, profile_photo: URL.createObjectURL(file) }
                                : c
                            ));
                          } catch { toast('Failed to upload photo', 'error'); }
                          e.target.value = '';
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{selectedCustomer.name}</h3>
                      <PhoneLink phone={selectedCustomer.phone} className="text-xs text-slate-400" />
                    </div>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-5 pt-4 space-y-4">

                  {/* Status + details grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Status</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize ${statusColor[selectedCustomer.status] || ''}`}>
                        {selectedCustomer.status}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Jar Rate</p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-brand-600">₹{selectedCustomer.jar_rate || 50}/jar</p>
                        <button onClick={() => { setEditingRate(selectedCustomer); setRateValue(String(selectedCustomer.jar_rate || 50)); setSelectedCustomer(null); }}
                          className="ml-0.5">
                          <Pencil className="w-3 h-3 text-slate-400" />
                        </button>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3 col-span-2">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Joined</p>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-700">
                          {new Date(selectedCustomer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Billing pending balance */}
                  {selBal && selBal.total > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-red-100">
                        <div className="flex items-center gap-2">
                          <IndianRupee className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-xs font-bold text-red-700">Bill Pending</span>
                        </div>
                        <span className="text-base font-extrabold text-red-600">₹{selBal.total.toLocaleString('en-IN')}</span>
                      </div>
                      {selBal.months.length > 0 && (
                        <div className="divide-y divide-red-100">
                          {selBal.months.map(bill => (
                            <div key={bill.month} className="flex items-center justify-between px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3 h-3 text-red-400" />
                                <span className="text-xs font-semibold text-red-700">{getMonthLabel(bill.month)}</span>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full
                                  ${bill.status === 'unpaid' ? 'bg-red-200 text-red-700' : 'bg-amber-200 text-amber-700'}`}>
                                  {bill.status}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-red-600">₹{bill.pending.toLocaleString('en-IN')}</p>
                                {bill.paid_amount > 0 && (
                                  <p className="text-[10px] text-red-400">of ₹{bill.total_amount.toLocaleString('en-IN')}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pay-later outstanding */}
                  {selPayLater > 0 && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">⏳</span>
                        <span className="text-xs font-bold text-amber-700">Pay-Later Outstanding</span>
                      </div>
                      <span className="text-base font-extrabold text-amber-600">₹{selPayLater.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {/* All clear — only when both are zero */}
                  {(!selBal || selBal.total === 0) && selPayLater === 0 && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-semibold text-green-700">No pending balance — All clear!</span>
                    </div>
                  )}

                  {/* Group assignment (inline) */}
                  {groups.length > 0 && (
                    <div className="bg-slate-50 rounded-2xl px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-600">Group</span>
                        </div>
                        {selectedCustomer.group_name && selectedCustomer.group_color && selectedCustomer.group_icon && (
                          <GroupBadge name={selectedCustomer.group_name} color={selectedCustomer.group_color} icon={selectedCustomer.group_icon} />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCustomer.group_id && (
                          <button
                            disabled={!!assigningGroup}
                            onClick={async () => {
                              setAssigningGroup({ customerId: selectedCustomer.id, current: selectedCustomer.group_id ?? null });
                              try {
                                await groupsApi.assignCustomer(selectedCustomer.id, null);
                                setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, group_id: null, group_name: null, group_color: null, group_icon: null } : c));
                                setSelectedCustomer(s => s ? { ...s, group_id: null, group_name: null, group_color: null, group_icon: null } : s);
                                await loadGroups();
                                toast('Removed from group', 'success');
                              } catch { toast('Failed', 'error'); }
                              finally { setAssigningGroup(null); }
                            }}
                            className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                            ✕ Remove from group
                          </button>
                        )}
                        {groups.map(g => (
                          <button key={g.id}
                            disabled={!!assigningGroup || selectedCustomer.group_id === g.id}
                            onClick={async () => {
                              setAssigningGroup({ customerId: selectedCustomer.id, current: selectedCustomer.group_id ?? null });
                              try {
                                await groupsApi.assignCustomer(selectedCustomer.id, g.id);
                                setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, group_id: g.id, group_name: g.name, group_color: g.color, group_icon: g.icon } : c));
                                setSelectedCustomer(s => s ? { ...s, group_id: g.id, group_name: g.name, group_color: g.color, group_icon: g.icon } : s);
                                await loadGroups();
                                toast(`Moved to "${g.name}"`, 'success');
                              } catch { toast('Failed', 'error'); }
                              finally { setAssigningGroup(null); }
                            }}
                            className="text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-50"
                            style={selectedCustomer.group_id === g.id
                              ? { backgroundColor: g.color, color: '#fff', borderColor: g.color }
                              : { backgroundColor: g.color + '12', color: g.color, borderColor: g.color + '40' }}>
                            {g.icon} {g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="space-y-2 pt-1">
                    <button
                      onClick={() => { setSelectedCustomer(null); navigate(`/admin/customers/${selectedCustomer.id}`); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white text-sm font-semibold rounded-2xl hover:bg-brand-700 transition-colors shadow-brand">
                      <User className="w-4 h-4" /> View Full Profile
                    </button>
                    {selectedCustomer.status === 'active' && (
                      <>
                        <button
                          onClick={() => { setSelectedCustomer(null); setOrderForCustomer(selectedCustomer); setOrderForm({ type: 'instant', quantity: 1, deliveryDate: '', notes: '', address: '' }); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-aqua-500/10 text-aqua-600 text-sm font-semibold rounded-2xl border border-aqua-500/20 hover:bg-aqua-500/20 transition-colors">
                          <Package className="w-4 h-4" /> Place Order
                        </button>
                        <button
                          onClick={() => { setSelectedCustomer(null); setPlanSlots({}); setPlanAddress(''); setPlanAutoRenew(true); setPlanForCustomer(selectedCustomer); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 text-purple-600 text-sm font-semibold rounded-2xl border border-purple-200 hover:bg-purple-100 transition-colors">
                          <Droplets className="w-4 h-4" /> Create Monthly Plan
                        </button>
                      </>
                    )}
                    {selectedCustomer.status !== 'active' && (
                      <button
                        onClick={() => handleStatus(selectedCustomer.id, 'active')}
                        disabled={actionId === selectedCustomer.id}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-700 text-sm font-semibold rounded-2xl border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50">
                        <CheckCircle className="w-4 h-4" /> Approve Customer
                      </button>
                    )}
                    {selectedCustomer.status !== 'rejected' && (
                      <button
                        onClick={() => handleStatus(selectedCustomer.id, 'rejected')}
                        disabled={actionId === selectedCustomer.id}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 text-sm font-semibold rounded-2xl border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50">
                        <XCircle className="w-4 h-4" /> Reject Customer
                      </button>
                    )}
                    {/* Reset Password */}
                    <button
                      onClick={() => handleResetPassword(selectedCustomer)}
                      disabled={resettingPwdId === selectedCustomer.id}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 text-amber-700 text-sm font-semibold rounded-2xl border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50">
                      <KeyRound className="w-4 h-4" /> {resettingPwdId === selectedCustomer.id ? 'Resetting…' : 'Reset Password'}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => { setDeleteTarget(selectedCustomer); setSelectedCustomer(null); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white text-sm font-semibold rounded-2xl hover:bg-red-700 transition-colors">
                      <Trash2 className="w-4 h-4" /> Delete Customer
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* -- Temp Password Result Modal -- */}
      <AnimatePresence>
        {tempPwdResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setTempPwdResult(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Password Reset Done!</h3>
                  <p className="text-xs text-slate-400">Share this with the customer verbally</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 space-y-3">
                <div>
                  <p className="text-[11px] text-amber-600 font-bold uppercase tracking-wide mb-1">Customer</p>
                  <p className="text-sm font-semibold text-slate-800">{tempPwdResult.name} &mdash; {tempPwdResult.phone}</p>
                </div>
                <div>
                  <p className="text-[11px] text-amber-600 font-bold uppercase tracking-wide mb-1">Temporary Password</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-extrabold text-slate-900 tracking-widest font-mono">{tempPwdResult.pwd}</span>
                    <button onClick={() => navigator.clipboard.writeText(tempPwdResult!.pwd).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-amber-100 transition-colors">
                      <Copy className="w-4 h-4 text-amber-600" />
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-5 text-center leading-relaxed">
                Tell the customer to log in with this password, then change it from their profile settings.
              </p>
              <Button variant="primary" size="md" className="w-full" onClick={() => setTempPwdResult(null)}>
                Done
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Customer Confirmation ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteTarget(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Customer</h3>
                  <p className="text-xs text-slate-400">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-5">
                <strong>{deleteTarget.name}</strong>'s login will be disabled. All orders, bills and delivery records are preserved.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="md" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="danger" size="md" className="flex-1" loading={deleting} onClick={handleDeleteCustomer}>Delete</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pending Customer Registration Detail Modal ── */}
      <AnimatePresence>
        {(pendingDetail || pendingDetailLoading) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPendingDetail(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

              {/* Header — Blue */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Registration Request</span>
                  <button onClick={() => setPendingDetail(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {pendingDetailLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-white/20 rounded-lg animate-pulse" />
                      <div className="h-3 w-24 bg-white/20 rounded-lg animate-pulse" />
                    </div>
                  </div>
                ) : pendingDetail && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/25 flex items-center justify-center text-white font-extrabold text-xl">
                      {pendingDetail.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-white">{pendingDetail.name}</h3>
                      <a href={`tel:${pendingDetail.phone}`}
                        className="text-white/75 text-sm hover:text-white transition-colors">
                        +91 {pendingDetail.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {pendingDetail && !pendingDetailLoading && (
                <div className="px-6 py-5 space-y-4">

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Phone with copy button */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                      <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-1">Phone</p>
                      <div className="flex items-center justify-between gap-1">
                        <a href={`tel:${pendingDetail.phone}`}
                          className="text-sm font-bold text-slate-800 hover:text-brand-600 hover:underline transition-colors">
                          {pendingDetail.phone}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(pendingDetail.phone);
                            toast('Phone number copied!', 'success');
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-lg bg-blue-200 hover:bg-blue-300 transition-colors shrink-0"
                          title="Copy phone number">
                          <Copy className="w-3 h-3 text-blue-700" />
                        </button>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Registered On</p>
                      <p className="text-sm font-bold text-slate-800">
                        {new Date(pendingDetail.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* Delivery addresses */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Delivery Address</p>
                    </div>
                    {pendingDetail.savedAddresses.length > 0 ? (
                      <div className="space-y-2">
                        {pendingDetail.savedAddresses.map((addr, i) => (
                          <div key={i} className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                            <div className="w-6 h-6 rounded-lg bg-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                              <MapPin className="w-3 h-3 text-blue-700" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-blue-500 uppercase mb-0.5">{addr.label}{addr.is_default ? ' · Default' : ''}</p>
                              <p className="text-sm font-semibold text-slate-800 leading-snug">{addr.address}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : pendingDetail.address ? (
                      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                        <div className="w-6 h-6 rounded-lg bg-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                          <MapPin className="w-3 h-3 text-blue-700" />
                        </div>
                        <p className="text-sm font-semibold text-slate-800 leading-snug">{pendingDetail.address}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                        <MapPin className="w-3.5 h-3.5 text-slate-300" />
                        <p className="text-sm text-slate-400 italic">No delivery address provided</p>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={async () => { await handleStatus(pendingDetail.id, 'active'); setPendingDetail(null); }}
                      disabled={actionId === pendingDetail.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white text-sm font-bold rounded-2xl hover:bg-green-600 transition-colors shadow-sm disabled:opacity-50">
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={async () => { await handleStatus(pendingDetail.id, 'rejected'); setPendingDetail(null); }}
                      disabled={actionId === pendingDetail.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 text-white text-sm font-bold rounded-2xl hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50">
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jar Rate Edit Modal */}
      <AnimatePresence>
        {editingRate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setEditingRate(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-xs shadow-2xl overflow-hidden">

              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Set Jar Rate</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{editingRate.name} — {editingRate.phone}</p>
                </div>
                <button onClick={() => setEditingRate(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Price per Jar (₹)</label>
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                    <IndianRupee className="w-4 h-4 text-slate-400" />
                    <input
                      type="number" min={1} step="0.01"
                      value={rateValue}
                      onChange={e => setRateValue(e.target.value)}
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
                      autoFocus />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="md" className="flex-1"
                    onClick={() => setEditingRate(null)}>
                    Cancel
                  </Button>
                  <Button size="md" className="flex-1" onClick={handleJarRate}
                    icon={<CheckCircle className="w-4 h-4" />}>
                    Save Rate
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add Customer Modal ─── */}
      <AnimatePresence>
        {showAddCustomer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddCustomer(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Customer</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Create a new customer account</p>
                </div>
                <button onClick={() => setShowAddCustomer(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Full Name *</label>
                  <input value={newCustomer.name} onChange={e => setNewCustomer(f => ({ ...f, name: e.target.value }))}
                    placeholder="Customer name"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Phone Number *</label>
                  <input value={newCustomer.phone} onChange={e => setNewCustomer(f => ({ ...f, phone: e.target.value }))}
                    placeholder="10-digit phone"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Password *</label>
                  <input type="password" value={newCustomer.password} onChange={e => setNewCustomer(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Jar Rate (₹)</label>
                    <input type="number" min={1} value={newCustomer.jarRate} onChange={e => setNewCustomer(f => ({ ...f, jarRate: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all font-semibold" />
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="text-[10px] text-slate-400 mb-1">Default: ₹50/jar</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Address (optional)</label>
                  <textarea value={newCustomer.address} onChange={e => setNewCustomer(f => ({ ...f, address: e.target.value }))}
                    placeholder="Delivery address…" rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none" />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" size="md" className="flex-1"
                    onClick={() => setShowAddCustomer(false)}>
                    Cancel
                  </Button>
                  <Button size="md" className="flex-1" loading={addingCustomer} onClick={handleAddCustomer}
                    icon={<UserPlus className="w-4 h-4" />}>
                    Create
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Place Order for Customer Modal ─── */}
      <AnimatePresence>
        {orderForCustomer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setOrderForCustomer(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Place Order</h3>
                  <p className="text-xs text-slate-400 mt-0.5">For {orderForCustomer.name} · ₹{orderForCustomer.jar_rate || 50}/jar</p>
                </div>
                <button onClick={() => setOrderForCustomer(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Order type */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Order Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['instant', 'preorder', 'monthly', 'bulk'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setOrderForm(f => ({ ...f, type: t }))}
                        className={`py-2.5 rounded-xl text-xs font-semibold border transition-all capitalize
                          ${orderForm.type === t
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
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Quantity</label>
                    <input type="number" min={1} value={orderForm.quantity}
                      onChange={e => setOrderForm(f => ({ ...f, quantity: Math.max(1, Number(e.target.value)) }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all font-semibold" />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="bg-gradient-to-br from-brand-50 to-aqua-400/10 border border-brand-100 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-brand-500 font-medium">Total</p>
                      <p className="text-lg font-bold text-brand-700">₹{orderForm.quantity * (orderForCustomer.jar_rate || 50)}</p>
                    </div>
                  </div>
                </div>

                {/* Delivery date (preorder only) */}
                {orderForm.type === 'preorder' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Delivery Date & Time</label>
                    <input type="datetime-local" value={orderForm.deliveryDate}
                      onChange={e => setOrderForm(f => ({ ...f, deliveryDate: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                  </div>
                )}

                {/* Address */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Address (optional)</label>
                  <textarea value={orderForm.address} onChange={e => setOrderForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Delivery address…" rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none" />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                  <input value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any instructions…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" size="md" className="flex-1"
                    onClick={() => setOrderForCustomer(null)}>
                    Cancel
                  </Button>
                  <Button size="md" className="flex-1" loading={placingOrder} onClick={handlePlaceOrder}
                    icon={<Package className="w-4 h-4" />}>
                    Place Order
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Monthly Plan Modal ── */}
      <AnimatePresence>
        {planForCustomer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
            onClick={() => setPlanForCustomer(null)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl max-h-[90vh] flex flex-col">

              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create Monthly Plan</h3>
                  <p className="text-xs text-slate-400">for {planForCustomer.name}</p>
                </div>
                <button onClick={() => setPlanForCustomer(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

                {/* Slot cards */}
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Delivery Slots</p>
                  {PLAN_SLOTS.map(slot => {
                    const isActive = !!planSlots[slot.label];
                    return (
                      <div key={slot.label}
                        className={`rounded-2xl border-2 overflow-hidden transition-all
                          ${isActive ? 'border-purple-400 shadow-md' : 'border-slate-200'}`}>
                        <button onClick={() => togglePlanSlot(slot.label, slot.time)}
                          className={`w-full flex items-center gap-3 p-3.5 transition-all
                            ${isActive ? 'bg-gradient-to-r ' + slot.gradient + ' text-white' : 'bg-slate-50'}`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                            ${isActive ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                            <span className={isActive ? 'text-white' : 'text-slate-500'}>{slot.icon}</span>
                          </div>
                          <div className="flex-1 text-left">
                            <p className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-800'}`}>{slot.label}</p>
                            <p className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`}>{slot.time}</p>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                            ${isActive ? 'border-white bg-white/20' : 'border-slate-300'}`}>
                            {isActive && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </button>
                        {isActive && (
                          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-500">Jars per delivery</p>
                            <div className="flex items-center gap-3">
                              <button onClick={() => setPlanSlotQty(slot.label, -1)}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-base font-bold text-slate-800 w-5 text-center">
                                {planSlots[slot.label]?.quantity || 1}
                              </span>
                              <button onClick={() => setPlanSlotQty(slot.label, 1)}
                                className="w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-700 flex items-center justify-center text-white">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                {Object.keys(planSlots).length > 0 && (
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-purple-500 font-semibold">Daily Total</p>
                      <p className="text-lg font-extrabold text-purple-700">
                        {Object.values(planSlots).reduce((s, v) => s + v.quantity, 0)} jars
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-500 font-semibold">~Monthly</p>
                      <p className="text-base font-bold text-purple-600">
                        ₹{(Object.values(planSlots).reduce((s, v) => s + v.quantity, 0) * (planForCustomer.jar_rate || 50) * 30).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Address */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Delivery Address</label>
                  <textarea value={planAddress} onChange={e => setPlanAddress(e.target.value)}
                    placeholder="Customer delivery address…" rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10 transition-all resize-none" />
                </div>

                {/* Auto-renew */}
                <button onClick={() => setPlanAutoRenew(!planAutoRenew)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all
                    ${planAutoRenew ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <RotateCcw className={`w-3.5 h-3.5 ${planAutoRenew ? 'text-purple-600' : 'text-slate-400'}`} />
                    <span className="text-sm font-semibold text-slate-700">Auto-renew</span>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-all relative ${planAutoRenew ? 'bg-purple-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${planAutoRenew ? 'left-5' : 'left-1'}`} />
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                <Button variant="secondary" size="md" className="flex-1" onClick={() => setPlanForCustomer(null)}>Cancel</Button>
                <Button size="md" className="flex-1 !bg-purple-600 hover:!bg-purple-700" loading={creatingPlan} onClick={handleCreatePlan}
                  disabled={Object.keys(planSlots).length === 0}
                  icon={<Droplets className="w-4 h-4" />}>
                  Create Plan
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ─── Manage Groups Modal ─── */}
      <AnimatePresence>
        {showManageGroups && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setShowManageGroups(false); setManagingMembersOf(null); setMemberSearch(''); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              <AnimatePresence mode="wait">

                {/* ─── Panel 1: Groups list + form ─── */}
                {!managingMembersOf && (
                  <motion.div key="groups-panel" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }} className="flex flex-col flex-1 min-h-0">

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                      <div className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-brand-600" />
                        <h2 className="text-base font-bold text-slate-900">Manage Groups</h2>
                      </div>
                      <button onClick={() => { setShowManageGroups(false); setEditingGroup(null); }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

                      {/* Create / Edit Form */}
                      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {editingGroup ? 'Edit Group' : 'New Group'}
                        </p>
                        <input
                          value={groupForm.name}
                          onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Group name (e.g. Daily Orders)"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 mb-1.5">Color</p>
                          <div className="flex flex-wrap gap-2">
                            {GROUP_COLORS.map(c => (
                              <button key={c} onClick={() => setGroupForm(f => ({ ...f, color: c }))}
                                className={`w-7 h-7 rounded-full border-2 transition-all ${groupForm.color === c ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'}`}
                                style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 mb-1.5">Icon</p>
                          <div className="flex flex-wrap gap-1.5">
                            {GROUP_ICONS.map(ico => (
                              <button key={ico} onClick={() => setGroupForm(f => ({ ...f, icon: ico }))}
                                className={`w-8 h-8 flex items-center justify-center rounded-xl text-base border-2 transition-all ${groupForm.icon === ico ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:border-slate-200 bg-white'}`}>
                                {ico}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          value={groupForm.description}
                          onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Description (optional)"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                        <div className="flex items-center gap-2 pt-1">
                          {groupForm.name && <GroupBadge name={groupForm.name} color={groupForm.color} icon={groupForm.icon} />}
                          <div className="flex gap-2 ml-auto">
                            {editingGroup && (
                              <button onClick={() => { setEditingGroup(null); setGroupForm({ name: '', color: '#3B82F6', icon: '👥', description: '' }); }}
                                className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-300 transition-colors">
                                Cancel
                              </button>
                            )}
                            <button
                              disabled={!groupForm.name.trim() || savingGroup}
                              onClick={async () => {
                                if (!groupForm.name.trim()) return;
                                setSavingGroup(true);
                                try {
                                  if (editingGroup) {
                                    await groupsApi.update(editingGroup.id, groupForm);
                                    toast(`Group "${groupForm.name}" updated`, 'success');
                                    setEditingGroup(null);
                                  } else {
                                    await groupsApi.create(groupForm);
                                    toast(`Group "${groupForm.name}" created! 🎉`, 'success');
                                  }
                                  setGroupForm({ name: '', color: '#3B82F6', icon: '👥', description: '' });
                                  await loadGroups();
                                } catch { toast('Failed to save group', 'error'); }
                                finally { setSavingGroup(false); }
                              }}
                              className="px-4 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                              {savingGroup ? 'Saving…' : editingGroup ? '✓ Update' : '+ Create'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Existing groups */}
                      {groups.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          No groups yet. Create your first group above.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Groups</p>
                          {groups.map(g => {
                            const memberCount = customers.filter(c => c.group_id === g.id).length;
                            return (
                              <div key={g.id}
                                className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-3 hover:border-slate-200 transition-colors">
                                {/* Icon */}
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                                  style={{ backgroundColor: g.color + '20' }}>
                                  {g.icon}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-800 truncate">{g.name}</p>
                                  <p className="text-[10px] text-slate-400">
                                    {memberCount} member{memberCount !== 1 ? 's' : ''}
                                    {g.description ? ` · ${g.description}` : ''}
                                  </p>
                                </div>
                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Members button — opens members panel */}
                                  <button
                                    onClick={() => { setManagingMembersOf(g); setMemberSearch(''); }}
                                    title="Manage members"
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all hover:scale-105"
                                    style={{ color: g.color, borderColor: g.color + '40', backgroundColor: g.color + '12' }}>
                                    <User className="w-3 h-3" />
                                    Members
                                  </button>
                                  <button
                                    onClick={() => { setEditingGroup(g); setGroupForm({ name: g.name, color: g.color, icon: g.icon, description: g.description || '' }); }}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    disabled={deletingGroupId === g.id}
                                    onClick={async () => {
                                      if (!window.confirm(`Delete "${g.name}"? Customers in this group will become ungrouped.`)) return;
                                      setDeletingGroupId(g.id);
                                      try {
                                        await groupsApi.delete(g.id);
                                        setCustomers(prev => prev.map(c => c.group_id === g.id ? { ...c, group_id: null, group_name: null, group_color: null, group_icon: null } : c));
                                        toast(`Group "${g.name}" deleted`, 'success');
                                        await loadGroups();
                                      } catch { toast('Failed to delete group', 'error'); }
                                      finally { setDeletingGroupId(null); }
                                    }}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400 transition-colors disabled:opacity-50">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ─── Panel 2: Manage Members ─── */}
                {managingMembersOf && (() => {
                  const g = managingMembersOf;
                  const members    = customers.filter(c => c.group_id === g.id);
                  const nonMembers = customers.filter(c => c.group_id !== g.id);
                  const lc = memberSearch.toLowerCase();
                  const filtMembers    = lc ? members.filter(c => c.name.toLowerCase().includes(lc) || c.phone.includes(lc)) : members;
                  const filtNonMembers = lc ? nonMembers.filter(c => c.name.toLowerCase().includes(lc) || c.phone.includes(lc)) : nonMembers;

                  const doAssign = async (customerId: number, targetGroupId: number | null, isAdd: boolean) => {
                    setAssigningGroup({ customerId, current: isAdd ? null : g.id });
                    try {
                      await groupsApi.assignCustomer(customerId, targetGroupId);
                      if (isAdd) {
                        setCustomers(prev => prev.map(c => c.id === customerId
                          ? { ...c, group_id: g.id, group_name: g.name, group_color: g.color, group_icon: g.icon }
                          : c));
                      } else {
                        setCustomers(prev => prev.map(c => c.id === customerId
                          ? { ...c, group_id: null, group_name: null, group_color: null, group_icon: null }
                          : c));
                      }
                      // Sync the modal group's member count
                      await loadGroups();
                    } catch { toast('Failed to update', 'error'); }
                    finally { setAssigningGroup(null); }
                  };

                  return (
                    <motion.div key="members-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.18 }} className="flex flex-col flex-1 min-h-0">

                      {/* Header */}
                      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                        <button onClick={() => { setManagingMembersOf(null); setMemberSearch(''); }}
                          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
                          <ChevronRight className="w-4 h-4 rotate-180" />
                        </button>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: g.color + '20' }}>
                          {g.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-sm font-bold text-slate-900 truncate">{g.name}</h2>
                          <p className="text-[10px] text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                        </div>
                        <button onClick={() => { setShowManageGroups(false); setManagingMembersOf(null); }}
                          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Search */}
                      <div className="px-5 pt-3 pb-2 shrink-0">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-brand-400 transition-all">
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                            placeholder="Search customers…"
                            className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none" />
                          {memberSearch && (
                            <button onClick={() => setMemberSearch('')} className="text-slate-400 hover:text-slate-600">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lists */}
                      <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-4">

                        {/* Current Members */}
                        <div>
                          <div className="flex items-center justify-between mb-2 pt-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              In this group ({filtMembers.length})
                            </p>
                            {members.length > 0 && (
                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ color: g.color, backgroundColor: g.color + '15' }}>
                                {g.icon} {g.name}
                              </span>
                            )}
                          </div>
                          {filtMembers.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-3">
                              {memberSearch ? 'No matches in this group' : 'No members yet — add from below'}
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {filtMembers.map(c => (
                                <div key={c.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-3 py-2.5 hover:border-slate-200 transition-colors">
                                  <Avatar name={c.name} photo={c.profile_photo} size="xs" className="w-8 h-8 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                                    <p className="text-[10px] text-slate-400">{c.phone}</p>
                                  </div>
                                  <button
                                    disabled={assigningGroup?.customerId === c.id}
                                    onClick={() => doAssign(c.id, null, false)}
                                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50">
                                    {assigningGroup?.customerId === c.id ? '…' : '✕ Remove'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Other Customers to add */}
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Add customers ({filtNonMembers.length})
                          </p>
                          {filtNonMembers.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-3">
                              {memberSearch ? 'No matches' : 'All customers are already in this group'}
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {filtNonMembers.map(c => (
                                <div key={c.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2.5 hover:border-slate-200 transition-colors">
                                  <Avatar name={c.name} photo={c.profile_photo} size="xs" className="w-8 h-8 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 truncate">{c.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <p className="text-[10px] text-slate-400">{c.phone}</p>
                                      {c.group_name && c.group_color && c.group_icon && (
                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border"
                                          style={{ color: c.group_color, borderColor: c.group_color + '40', backgroundColor: c.group_color + '12' }}>
                                          {c.group_icon} {c.group_name}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    disabled={assigningGroup?.customerId === c.id}
                                    onClick={() => doAssign(c.id, g.id, true)}
                                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all disabled:opacity-50"
                                    style={{ color: g.color, borderColor: g.color + '40', backgroundColor: g.color + '12' }}>
                                    {assigningGroup?.customerId === c.id ? '…' : '+ Add'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </motion.div>
                  );
                })()}

              </AnimatePresence>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

