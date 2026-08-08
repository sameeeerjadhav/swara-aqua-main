import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  Users, ChevronRight, X, Search, Phone, Droplets,
  GripVertical, Check, Plus, Minus, Banknote, Smartphone, Clock,
} from 'lucide-react';
import { groupsApi, CustomerGroup } from '../../api/groups';
import { applyOrder, customerOrderApi } from '../../api/customerOrder';
import { ordersApi } from '../../api/orders';
import { useToast } from '../../components/ui/Toast';
import api from '../../api/axios';

interface GroupMember {
  id: number;
  name: string;
  phone: string;
  jar_rate: number;
  today_jars: number;
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp  = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.28 } } };

type PayMode = 'cash' | 'online' | 'advance' | 'pay_later';
const PAY_MODES: { value: PayMode; label: string; icon: React.ReactNode }[] = [
  { value: 'cash',      label: 'Cash',   icon: <Banknote   className="w-3.5 h-3.5" /> },
  { value: 'online',    label: 'Online', icon: <Smartphone className="w-3.5 h-3.5" /> },
  { value: 'pay_later', label: 'Later',  icon: <Clock      className="w-3.5 h-3.5" /> },
];

// Inline Delivery Form for a single member
const DeliveryForm = ({
  member, groupColor, onDone, onCancel,
}: {
  member: GroupMember;
  groupColor: string;
  onDone: (addedJars: number) => void;
  onCancel: () => void;
}) => {
  const { toast } = useToast();
  const [jars,    setJars]    = useState(1);
  const [mode,    setMode]    = useState<PayMode>('cash');
  const [amount,  setAmount]  = useState(member.jar_rate);
  const [saving,  setSaving]  = useState(false);

  // Auto-recalc amount when jars change (unless pay_later)
  useEffect(() => {
    if (mode !== 'pay_later') setAmount(jars * member.jar_rate);
  }, [jars, member.jar_rate, mode]);

  const handleDeliver = async () => {
    if (jars < 1) { toast('Jars must be at least 1', 'error'); return; }
    setSaving(true);
    try {
      await ordersApi.staffDirectDelivery({
        customerId: member.id,
        quantity: jars,
        paymentMode: mode,
        collectedAmount: mode === 'pay_later' ? 0 : amount,
      });
      toast(`Delivered ${jars} jar${jars !== 1 ? 's' : ''} to ${member.name}`, 'success');
      onDone(jars);
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Delivery failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden"
    >
      <div
        className="mx-1 mb-2 rounded-2xl p-3 space-y-3 border"
        style={{ background: groupColor + '08', borderColor: groupColor + '30' }}
      >
        {/* Jar count */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Jars to deliver</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setJars(j => Math.max(1, j - 1))}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700 font-bold">
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="number" min={1} value={jars}
              onChange={e => setJars(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 text-center bg-white border border-slate-200 rounded-xl py-2 text-lg font-extrabold text-slate-800 outline-none focus:border-brand-400"
            />
            <button
              onClick={() => setJars(j => j + 1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700 font-bold">
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-slate-400 ml-1">x Rs.{member.jar_rate} = Rs.{jars * member.jar_rate}</span>
          </div>
        </div>

        {/* Payment mode */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Payment</p>
          <div className="flex gap-1.5">
            {PAY_MODES.map(pm => (
              <button key={pm.value} onClick={() => setMode(pm.value)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  mode === pm.value
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
                style={mode === pm.value ? { background: groupColor, borderColor: groupColor } : {}}>
                {pm.icon} {pm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount (hidden for pay_later) */}
        {mode !== 'pay_later' && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Amount (Rs.)</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">Rs.</span>
              <input
                type="number" min={0} value={amount}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-brand-400"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleDeliver} disabled={saving}
            className="flex-1 py-2 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
            style={{ background: saving ? '#94a3b8' : groupColor }}>
            {saving
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Droplets className="w-4 h-4" />}
            {saving ? 'Delivering...' : `Deliver ${jars} jar${jars !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// Draggable member row for reorder mode
const DraggableMemberRow = ({
  item, index, total, color, onMove,
}: {
  item: GroupMember; index: number; total: number; color: string;
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
      whileDrag={{ scale: 1.03, boxShadow: '0 12px 32px -6px rgba(0,0,0,0.16)', zIndex: 50 }}
    >
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3 py-3 select-none">
        <span className="w-5 text-center text-xs font-bold text-slate-400 shrink-0">{index + 1}</span>
        <GripVertical
          className="w-5 h-5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={e => controls.start(e)}
        />
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: color }}>
          {item.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
          <p className="text-xs text-slate-400">{item.phone}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onMove(index, Math.max(0, index - 1))} disabled={index === 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V4M4 8l4-4 4 4" /></svg>
          </button>
          <button
            onClick={() => onMove(index, Math.min(total - 1, index + 1))} disabled={index === total - 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v8M4 8l4 4 4-4" /></svg>
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
};

// Group Members Sheet
const GroupMembersSheet = ({
  group, onClose,
}: {
  group: CustomerGroup;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const [members,       setMembers]       = useState<GroupMember[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [deliveryFor,   setDeliveryFor]   = useState<number | null>(null); // member id whose form is open
  const [reorderMode,   setReorderMode]   = useState(false);
  const [reorderedList, setReorderedList] = useState<GroupMember[]>([]);
  const [savingOrder,   setSavingOrder]   = useState(false);

  useEffect(() => {
    api.get<{ customers: GroupMember[] }>('/admin/customers-list')
      .then(({ data }) => {
        const all = (data as any).customers as (GroupMember & { group_id?: number | null })[];
        setMembers(all.filter(c => c.group_id === group.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [group.id]);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search)
  );

  const handleDelivered = (memberId: number, addedJars: number) => {
    // Update today_jars locally without refetch
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, today_jars: m.today_jars + addedJars } : m
    ));
    setDeliveryFor(null);
  };

  const enterReorderMode = async () => {
    try {
      const { data } = await groupsApi.getGroupOrder(group.id);
      setReorderedList(applyOrder(members, data.ordered_ids ?? []));
    } catch {
      setReorderedList([...members]);
    }
    setReorderMode(true);
  };

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
      await groupsApi.saveGroupOrder(group.id, reorderedList.map(m => m.id));
      toast('Group order saved!', 'success');
      setReorderMode(false);
    } catch { toast('Failed to save order', 'error'); }
    finally { setSavingOrder(false); }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onPointerDown={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />

      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 shrink-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
            style={{ background: group.color + '22' }}>
            {group.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 text-base truncate">{group.name}</h2>
            <p className="text-xs text-slate-400">{group.member_count} member{group.member_count !== 1 ? 's' : ''}</p>
          </div>
          {/* Reorder toggle */}
          {!loading && members.length >= 2 && (
            !reorderMode ? (
              <button
                onClick={enterReorderMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-all shrink-0">
                <GripVertical className="w-3.5 h-3.5" /> Reorder
              </button>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setReorderMode(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <X className="w-4 h-4" />
                </button>
                <button onClick={saveOrder} disabled={savingOrder}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-60">
                  {savingOrder
                    ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            )
          )}
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reorder hint */}
        <AnimatePresence>
          {reorderMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="bg-brand-50 border-y border-brand-100 px-4 py-2 flex items-center gap-2 shrink-0">
              <GripVertical className="w-4 h-4 text-brand-400 shrink-0" />
              <p className="text-xs font-semibold text-brand-700">Drag or tap arrows to set delivery order</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search (normal mode only) */}
        {!reorderMode && (
          <div className="px-4 pt-2 pb-1 shrink-0">
            <div className="flex items-center gap-2 bg-slate-100 rounded-2xl px-3 py-2.5">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search members..."
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : reorderMode ? (
            <Reorder.Group axis="y" values={reorderedList} onReorder={setReorderedList} className="space-y-2">
              {reorderedList.map((m, i) => (
                <DraggableMemberRow
                  key={m.id} item={m} index={i} total={reorderedList.length}
                  color={group.color} onMove={moveItem}
                />
              ))}
            </Reorder.Group>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                {search ? 'No members match' : 'No members in this group'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((m, i) => (
                <div key={m.id}>
                  {/* Member row — tap to expand/collapse delivery form */}
                  <button
                    onClick={() => setDeliveryFor(deliveryFor === m.id ? null : m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-left ${
                      deliveryFor === m.id
                        ? 'bg-slate-100 rounded-b-none border border-slate-200 border-b-0'
                        : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                    }`}>
                    <span className="w-5 text-center text-[10px] font-bold text-slate-400 shrink-0">{i + 1}</span>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: group.color }}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800 truncate">{m.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <p className="text-xs text-slate-400">{m.phone}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <Droplets className="w-3 h-3 text-blue-400" />
                        <span className="font-semibold">{m.today_jars}</span>
                        <span className="text-slate-400">today</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-end gap-1">
                        <Plus className={`w-3 h-3 transition-transform ${deliveryFor === m.id ? 'rotate-45 text-red-400' : 'text-brand-500'}`} />
                        <span className={`text-[10px] font-bold ${deliveryFor === m.id ? 'text-red-400' : 'text-brand-500'}`}>
                          {deliveryFor === m.id ? 'Close' : 'Deliver'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Inline delivery form */}
                  <AnimatePresence>
                    {deliveryFor === m.id && (
                      <DeliveryForm
                        member={m}
                        groupColor={group.color}
                        onDone={(jars) => handleDelivered(m.id, jars)}
                        onCancel={() => setDeliveryFor(null)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

// Main Staff Groups Page
export const StaffGroups = () => {
  const [groups,   setGroups]   = useState<CustomerGroup[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<CustomerGroup | null>(null);

  useEffect(() => {
    groupsApi.list()
      .then(({ data }) => setGroups(data.groups))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">Customer Groups</h1>
        <p className="text-sm text-slate-400 mt-0.5">Tap a group to deliver jars or set order</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-3xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-slate-500 font-semibold">No groups yet</p>
          <p className="text-slate-400 text-sm mt-1">Admin has not created any customer groups</p>
        </motion.div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {groups.map(group => (
            <motion.button
              key={group.id}
              variants={fadeUp}
              onClick={() => setSelected(group)}
              className="w-full text-left bg-white rounded-3xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4 active:scale-[0.98] transition-transform hover:shadow-md">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                style={{ background: group.color + '22', border: `1.5px solid ${group.color}44` }}>
                {group.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">{group.name}</p>
                {group.description && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{group.description}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color }} />
                  <span className="text-xs text-slate-500 font-medium">
                    {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </motion.button>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {selected && (
          <GroupMembersSheet
            group={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
