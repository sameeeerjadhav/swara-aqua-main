import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { Users, ChevronRight, X, Search, Phone, Droplets, GripVertical, Check } from 'lucide-react';
import { groupsApi, CustomerGroup } from '../../api/groups';
import { applyOrder } from '../../api/customerOrder';
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
          style={{ background: color }}
        >
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

// Group Members Sheet with reorder support
const GroupMembersSheet = ({
  group, onClose,
}: {
  group: CustomerGroup;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const [members,      setMembers]      = useState<GroupMember[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [reorderMode,  setReorderMode]  = useState(false);
  const [reorderedList,setReorderedList]= useState<GroupMember[]>([]);
  const [savingOrder,  setSavingOrder]  = useState(false);

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
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onPointerDown={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-2xl">{group.icon}</span>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 text-base truncate">{group.name}</h2>
              <p className="text-xs text-slate-400">{group.member_count} member{group.member_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {/* Reorder / Save button */}
          {!loading && members.length >= 2 && (
            !reorderMode ? (
              <button
                onClick={enterReorderMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-all">
                <GripVertical className="w-3.5 h-3.5" /> Reorder
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
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
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reorder hint */}
        <AnimatePresence>
          {reorderMode && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="bg-brand-50 border-y border-brand-100 px-5 py-2 flex items-center gap-2"
            >
              <GripVertical className="w-4 h-4 text-brand-400 shrink-0" />
              <p className="text-xs font-semibold text-brand-700">Drag or tap arrows to set your delivery order</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search (only in normal mode) */}
        {!reorderMode && (
          <div className="px-5 pb-3">
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

        {/* Members list */}
        <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: 'calc(85vh - 200px)' }}>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : reorderMode ? (
            <Reorder.Group axis="y" values={reorderedList} onReorder={setReorderedList} className="space-y-2 pt-1">
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
                {search ? 'No members match your search' : 'No members in this group'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m, i) => (
                <div key={m.id}
                  className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <span className="w-5 text-center text-[10px] font-bold text-slate-400 shrink-0">{i + 1}</span>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: group.color }}
                  >
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
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Droplets className="w-3 h-3 text-blue-400" />
                      <span>{m.today_jars} today</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Rs.{m.jar_rate}/jar</p>
                  </div>
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
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">Customer Groups</h1>
        <p className="text-sm text-slate-400 mt-0.5">Tap a group to see members and set delivery order</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-20 rounded-3xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
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
              className="w-full text-left bg-white rounded-3xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4 active:scale-[0.98] transition-transform hover:shadow-md"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                style={{ background: group.color + '22', border: `1.5px solid ${group.color}44` }}
              >
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

      {/* Members sheet */}
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
