import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ChevronRight, X, Search, Phone, MapPin,
  Package, Droplets, Navigation, GripVertical, Check,
} from 'lucide-react';
import { groupsApi, CustomerGroup } from '../../api/groups';
import { staffApi, CustomerForStaff } from '../../api/orders';
import { applyOrder } from '../../api/customerOrder';
import { Avatar } from '../../components/ui/Avatar';
import { useToast } from '../../components/ui/Toast';
import {
  ProfileSheet, DeliverySheet, SuccessCard, CalendarModal,
  openMaps,
} from './staffCustomerSheets';
import { Reorder, useDragControls } from 'framer-motion';

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const fadeUp  = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };

// Draggable member row for reorder mode
const DraggableRow = ({
  item, index, total, onMove,
}: {
  item: CustomerForStaff; index: number; total: number;
  onMove: (from: number, to: number) => void;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls}
      className="relative" style={{ listStyle: 'none' }}
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{ scale: 1.03, boxShadow: '0 12px 32px -6px rgba(0,0,0,0.15)', zIndex: 50 }}>
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3 py-3 select-none">
        <span className="w-5 text-center text-xs font-bold text-slate-400 shrink-0">{index + 1}</span>
        <GripVertical className="w-5 h-5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={e => controls.start(e)} />
        <Avatar name={item.name} photo={item.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
          <p className="text-xs text-slate-400">{item.phone}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onMove(index, Math.max(0, index - 1))} disabled={index === 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V4M4 8l4-4 4 4" /></svg>
          </button>
          <button onClick={() => onMove(index, Math.min(total - 1, index + 1))} disabled={index === total - 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v8M4 8l4 4 4-4" /></svg>
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
};

// Group member list page — same card style as StaffCustomers
const GroupMemberPage = ({
  group, onBack,
}: {
  group: CustomerGroup;
  onBack: () => void;
}) => {
  const { toast } = useToast();
  const [members,        setMembers]        = useState<CustomerForStaff[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [profiled,       setProfiled]       = useState<CustomerForStaff | null>(null);
  const [selected,       setSelected]       = useState<CustomerForStaff | null>(null);
  const [successData,    setSuccessData]    = useState<{ customer: string; quantity: number; amount: number; mode: string; orderId: number } | null>(null);
  const [calendarCustomer, setCalendarCustomer] = useState<CustomerForStaff | null>(null);
  const [reorderMode,    setReorderMode]    = useState(false);
  const [reorderedList,  setReorderedList]  = useState<CustomerForStaff[]>([]);
  const [savingOrder,    setSavingOrder]    = useState(false);

  useEffect(() => {
    staffApi.getCustomersList()
      .then(({ data }) => {
        const grouped = data.customers.filter(c => c.group_id === group.id);
        setMembers(grouped);
        setReorderedList(grouped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [group.id]);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search)
  );

  const handleSuccess = (data: typeof successData) => {
    setSelected(null);
    setProfiled(null);
    setSuccessData(data);
    // Refresh today_jars locally
    if (data) {
      setMembers(prev => prev.map(m =>
        m.name === data.customer ? { ...m, today_jars: (Number(m.today_jars) || 0) + data.quantity } : m
      ));
    }
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
    <motion.div
      key="member-page"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
          style={{ background: group.color + '22' }}>{group.icon}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-slate-800 truncate">{group.name}</h1>
          <p className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Reorder toggle */}
        {!loading && members.length >= 2 && (
          !reorderMode ? (
            <button onClick={enterReorderMode}
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
      </div>

      {/* Reorder hint */}
      <AnimatePresence>
        {reorderMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="bg-brand-50 border border-brand-100 rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-brand-400 shrink-0" />
            <p className="text-xs font-semibold text-brand-700">Drag or tap arrows to set delivery order for this group</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search (normal mode only) */}
      {!reorderMode && (
        <div className="flex items-center gap-2 bg-slate-100 rounded-2xl px-3 py-2.5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search members..." 
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
          {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-28 rounded-3xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : reorderMode ? (
        <Reorder.Group axis="y" values={reorderedList} onReorder={setReorderedList} className="space-y-2">
          {reorderedList.map((m, i) => (
            <DraggableRow key={m.id} item={m} index={i} total={reorderedList.length} onMove={moveItem} />
          ))}
        </Reorder.Group>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{search ? 'No members match' : 'No members in this group'}</p>
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {filtered.map(c => (
            <motion.div key={c.id} variants={fadeUp}
              onClick={() => setProfiled(c)}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm px-4 py-4 cursor-pointer hover:shadow-md hover:border-slate-200 active:scale-[0.99] transition-all">
              <div className="flex items-start gap-3">
                <Avatar name={c.name} photo={c.profile_photo} size="lg" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900 truncate">{c.name}</p>
                    {/* Group badge */}
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0"
                      style={{ color: group.color, borderColor: group.color + '40', backgroundColor: group.color + '12' }}>
                      {group.icon} {group.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </span>
                    {c.address && (
                      <span className="flex items-center gap-1 text-xs text-slate-400 truncate max-w-[130px]">
                        <MapPin className="w-3 h-3 shrink-0" /> {c.address_label || c.address}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                      <Package className="w-2.5 h-2.5" /> ₹{c.jar_rate}/jar
                    </span>
                    {Number(c.today_jars) > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                        <Droplets className="w-2.5 h-2.5" /> {Number(c.today_jars)} today
                      </span>
                    )}
                  </div>
                </div>
                {/* Right actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {c.address && (
                    <button
                      onClick={e => openMaps(c, e)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all"
                      title="Navigate">
                      <Navigation className="w-4 h-4" />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Profile sheet */}
      <AnimatePresence>
        {profiled && !selected && (
          <ProfileSheet
            key={`profile-${profiled.id}`}
            customer={profiled}
            onClose={() => setProfiled(null)}
            onDeliver={() => setSelected(profiled)}
            onCalendar={() => setCalendarCustomer(profiled)}
          />
        )}
      </AnimatePresence>

      {/* Delivery sheet */}
      <AnimatePresence>
        {selected && (
          <DeliverySheet
            key={`deliver-${selected.id}`}
            customer={selected}
            onClose={() => setSelected(null)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>

      {/* Success card */}
      <AnimatePresence>
        {successData && <SuccessCard data={successData} onClose={() => setSuccessData(null)} />}
      </AnimatePresence>

      {/* Calendar modal */}
      <AnimatePresence>
        {calendarCustomer && (
          <CalendarModal
            key={`cal-${calendarCustomer.id}`}
            customer={calendarCustomer}
            onClose={() => setCalendarCustomer(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
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
    <AnimatePresence mode="wait">
      {selected ? (
        <GroupMemberPage key={`group-${selected.id}`} group={selected} onBack={() => setSelected(null)} />
      ) : (
        <motion.div key="group-list"
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.18 }}
          className="space-y-5"
        >
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Customer Groups</h1>
            <p className="text-sm text-slate-400 mt-0.5">Tap a group to see members and deliver jars</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-3xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : groups.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
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
                <motion.button key={group.id} variants={fadeUp}
                  onClick={() => setSelected(group)}
                  className="w-full text-left bg-white rounded-3xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4 active:scale-[0.98] transition-transform hover:shadow-md">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-sm"
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
