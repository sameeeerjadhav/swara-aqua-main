import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import {
  Search, X, Tag, Pencil, Trash2, ChevronRight, Users,
  GripVertical, Check, Plus, Phone, MapPin, Package,
  Droplets, Navigation, ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/ui/Toast";
import { Avatar } from "../../components/ui/Avatar";
import { groupsApi, type CustomerGroup } from "../../api/groups";
import { applyOrder } from "../../api/customerOrder";
import api from "../../api/axios";

interface CustomerRow {
  id: number; name: string; phone: string; status: string;
  group_id?: number | null; group_name?: string | null;
  group_color?: string | null; group_icon?: string | null;
  profile_photo?: string | null;
  jar_rate?: number; today_jars?: number;
  address?: string | null; address_label?: string | null;
}

const GROUP_COLORS = [
  "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];
const GROUP_ICONS = ["👥", "🏠", "⭐", "🚀", "💎", "🔵", "🟢", "🟡", "🟠", "🔴"];
const EMPTY_FORM = { name: "", color: "#3B82F6", icon: "👥", description: "" };

const GroupBadge = ({ name, color, icon }: { name: string; color: string; icon: string }) => (
  <span
    className="inline-flex items-center gap-1 font-semibold rounded-full border text-[10px] px-2 py-0.5"
    style={{ color, borderColor: color + "40", backgroundColor: color + "12" }}
  >
    <span>{icon}</span>{name}
  </span>
);

// Draggable member row for reorder mode
const DraggableRow = ({
  item, index, total, onMove,
}: {
  item: CustomerRow; index: number; total: number;
  onMove: (from: number, to: number) => void;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls}
      className="relative" style={{ listStyle: "none" }}
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{ scale: 1.03, boxShadow: "0 12px 32px -6px rgba(0,0,0,0.15)", zIndex: 50 }}>
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

// Group member list page — same card style as AdminCustomers
const GroupMemberPage = ({
  group, allCustomers, onBack, onGroupsChanged,
}: {
  group: CustomerGroup;
  allCustomers: CustomerRow[];
  onBack: () => void;
  onGroupsChanged: () => void;
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const members = allCustomers.filter(c => c.group_id === group.id);
  const [search,         setSearch]         = useState("");
  const [reorderMode,    setReorderMode]    = useState(false);
  const [reorderedList,  setReorderedList]  = useState<CustomerRow[]>(members);
  const [savingOrder,    setSavingOrder]    = useState(false);
  const [assigningId,    setAssigningId]    = useState<number | null>(null);

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const nonMembers = allCustomers.filter(c => c.group_id !== group.id);
  const lc = search.toLowerCase();
  const filtMembers    = lc ? members.filter(c => c.name.toLowerCase().includes(lc) || c.phone.includes(lc)) : members;
  const addLc = addSearch.toLowerCase();
  const filtNonMembers = addLc
    ? nonMembers.filter(c => c.name.toLowerCase().includes(addLc) || c.phone.includes(addLc))
    : nonMembers;

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
      toast("Group order saved!", "success");
      setReorderMode(false);
    } catch { toast("Failed to save order", "error"); }
    finally { setSavingOrder(false); }
  };

  const doAssign = async (customerId: number, targetGroupId: number | null) => {
    setAssigningId(customerId);
    try {
      await groupsApi.assignCustomer(customerId, targetGroupId);
      onGroupsChanged();
    } catch { toast("Failed to update", "error"); }
    finally { setAssigningId(null); }
  };

  return (
    <motion.div key="member-page"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
          style={{ background: group.color + "22" }}>{group.icon}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-slate-800 truncate">{group.name}</h1>
          <p className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        {!reorderMode && members.length >= 2 && (
          <button onClick={enterReorderMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-all shrink-0">
            <GripVertical className="w-3.5 h-3.5" /> Reorder
          </button>
        )}
        {reorderMode && (
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
        )}
      </div>

      {/* Reorder hint */}
      <AnimatePresence>
        {reorderMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
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
            placeholder="Search members or add from all customers..."
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
          {search && <button onClick={() => setSearch("")}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
        </div>
      )}

      {/* Reorder list */}
      {reorderMode ? (
        <Reorder.Group axis="y" values={reorderedList} onReorder={setReorderedList} className="space-y-2">
          {reorderedList.map((m, i) => (
            <DraggableRow key={m.id} item={m} index={i} total={reorderedList.length} onMove={moveItem} />
          ))}
        </Reorder.Group>
      ) : (
        <div className="space-y-4">

          {/* ── Add Members collapsible panel ── */}
          {!reorderMode && (
            <div className="rounded-2xl border border-dashed border-slate-200 overflow-hidden">
              {/* Toggle header */}
              <button
                onClick={() => { setShowAddPanel(o => !o); setAddSearch(''); }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <Plus className={`w-4 h-4 transition-transform ${showAddPanel ? 'rotate-45 text-red-400' : 'text-brand-600'}`} />
                  <span className="text-sm font-bold text-slate-700">
                    Add Members
                    {nonMembers.length > 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full">
                        {nonMembers.length} available
                      </span>
                    )}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showAddPanel ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showAddPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-dashed border-slate-200">

                    {/* Search within add panel */}
                    <div className="px-3 pt-3">
                      <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
                          placeholder="Search customers to add..."
                          className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
                        {addSearch && <button onClick={() => setAddSearch('')}><X className="w-3 h-3 text-slate-400" /></button>}
                      </div>
                    </div>

                    <div className="px-3 py-3 space-y-2 max-h-72 overflow-y-auto">
                      {filtNonMembers.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-400">
                          {addSearch ? 'No customers match' : 'All customers are already in this group'}
                        </div>
                      ) : filtNonMembers.map(c => (
                        <div key={c.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-3 py-2.5">
                          <Avatar name={c.name} photo={c.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">{c.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-slate-400">{c.phone}</p>
                              {c.group_name && c.group_color && c.group_icon && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border"
                                  style={{ color: c.group_color, borderColor: c.group_color + '40', backgroundColor: c.group_color + '12' }}>
                                  {c.group_icon} {c.group_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <button disabled={assigningId === c.id}
                            onClick={() => doAssign(c.id, group.id)}
                            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50"
                            style={{ color: group.color, borderColor: group.color + '40', backgroundColor: group.color + '12' }}>
                            {assigningId === c.id
                              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              : <Plus className="w-3 h-3" />}
                            {assigningId === c.id ? '' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {/* Current members */}
          {filtMembers.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Members ({filtMembers.length})
              </p>
              {filtMembers.map(c => (
                <motion.div key={c.id}
                  onClick={() => navigate(`/admin/customers/${c.id}`)}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm px-4 py-4 cursor-pointer hover:shadow-md hover:border-slate-200 active:scale-[0.99] transition-all">
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} photo={c.profile_photo} size="lg" className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 truncate">{c.name}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </span>
                        {c.address && (
                          <span className="flex items-center gap-1 text-xs text-slate-400 truncate max-w-[130px]">
                            <MapPin className="w-3 h-3 shrink-0" /> {c.address_label || c.address}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {c.jar_rate !== undefined && (
                          <span className="flex items-center gap-1 text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                            <Package className="w-2.5 h-2.5" /> ₹{c.jar_rate}/jar
                          </span>
                        )}
                        {Number(c.today_jars) > 0 && (
                          <span className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                            <Droplets className="w-2.5 h-2.5" /> {Number(c.today_jars)} today
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.address && (
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all"
                          title="Navigate">
                          <Navigation className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={e => { e.stopPropagation(); doAssign(c.id, null); }}
                        disabled={assigningId === c.id}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-100 transition-all disabled:opacity-50"
                        title="Remove from group">
                        {assigningId === c.id
                          ? <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                          : <X className="w-3.5 h-3.5" />}
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty members state */}
          {filtMembers.length === 0 && !search && (
            <div className="py-8 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No members yet. Use "+ Add Members" below to add customers.</p>
            </div>
          )}

          {search && filtMembers.length === 0 && (
            <div className="py-6 text-center">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No members match your search</p>
            </div>
          )}


        </div>
      )}
    </motion.div>
  );
};

// Main Admin Groups Page
export const AdminGroups = () => {
  const { toast } = useToast();

  const [groups,    setGroups]    = useState<CustomerGroup[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Collapsible "New Group" form — closed by default
  const [formOpen,     setFormOpen]     = useState(false);
  const [groupForm,    setGroupForm]    = useState(EMPTY_FORM);
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  const [savingGroup,  setSavingGroup]  = useState(false);
  const [deletingId,   setDeletingId]   = useState<number | null>(null);

  // Page within page
  const [managingGroup, setManagingGroup] = useState<CustomerGroup | null>(null);

  const loadGroups = useCallback(async () => {
    try { const { data } = await groupsApi.list(); setGroups(data.groups); }
    catch { /* silent */ }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/customers-list");
      setCustomers((data as any).customers as CustomerRow[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    Promise.all([loadGroups(), loadCustomers()]).finally(() => setLoading(false));
  }, [loadGroups, loadCustomers]);

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) return;
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await groupsApi.update(editingGroup.id, groupForm);
        toast("Group updated", "success");
        setEditingGroup(null);
      } else {
        await groupsApi.create(groupForm);
        toast("Group created!", "success");
      }
      setGroupForm(EMPTY_FORM);
      setFormOpen(false);
      await loadGroups();
    } catch { toast("Failed to save group", "error"); }
    finally { setSavingGroup(false); }
  };

  const handleDeleteGroup = async (g: CustomerGroup) => {
    if (!window.confirm("Delete group? Customers will become ungrouped.")) return;
    setDeletingId(g.id);
    try {
      await groupsApi.delete(g.id);
      toast("Group deleted", "success");
      await Promise.all([loadGroups(), loadCustomers()]);
    } catch { toast("Failed to delete group", "error"); }
    finally { setDeletingId(null); }
  };

  const startEdit = (g: CustomerGroup) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, color: g.color, icon: g.icon, description: g.description || "" });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGroupsChanged = useCallback(async () => {
    await Promise.all([loadGroups(), loadCustomers()]);
  }, [loadGroups, loadCustomers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {managingGroup ? (
        <GroupMemberPage
          key={`group-${managingGroup.id}`}
          group={managingGroup}
          allCustomers={customers}
          onBack={async () => { setManagingGroup(null); await handleGroupsChanged(); }}
          onGroupsChanged={handleGroupsChanged}
        />
      ) : (
        <motion.div key="groups-list"
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.18 }}
          className="max-w-2xl mx-auto space-y-5"
        >
          {/* Collapsible New Group / Edit form */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Toggle header */}
            <button
              onClick={() => {
                if (formOpen && editingGroup) { setEditingGroup(null); setGroupForm(EMPTY_FORM); }
                setFormOpen(o => !o);
              }}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <Plus className={`w-4 h-4 transition-transform ${formOpen ? "rotate-45 text-red-400" : "text-brand-600"}`} />
                <span className="text-sm font-bold text-slate-700">
                  {editingGroup ? `Edit "${editingGroup.name}"` : "New Group"}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${formOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Form body */}
            <AnimatePresence>
              {formOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
                    <div className="pt-4">
                      <input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Group name (e.g. Daily Orders)"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 mb-2">Color</p>
                      <div className="flex flex-wrap gap-2.5">
                        {GROUP_COLORS.map(c => (
                          <button key={c} onClick={() => setGroupForm(f => ({ ...f, color: c }))}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${groupForm.color === c ? "border-slate-800 scale-110" : "border-transparent hover:scale-105"}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 mb-2">Icon</p>
                      <div className="flex flex-wrap gap-2">
                        {GROUP_ICONS.map(ico => (
                          <button key={ico} onClick={() => setGroupForm(f => ({ ...f, icon: ico }))}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg border-2 transition-all ${groupForm.icon === ico ? "border-brand-500 bg-brand-50" : "border-transparent hover:border-slate-200 bg-slate-50"}`}>
                            {ico}
                          </button>
                        ))}
                      </div>
                    </div>

                    <input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Description (optional)"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />

                    <div className="flex items-center gap-3">
                      {groupForm.name && <GroupBadge name={groupForm.name} color={groupForm.color} icon={groupForm.icon} />}
                      <div className="flex gap-2 ml-auto">
                        {editingGroup && (
                          <button onClick={() => { setEditingGroup(null); setGroupForm(EMPTY_FORM); setFormOpen(false); }}
                            className="px-4 py-2 rounded-2xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors">
                            Cancel
                          </button>
                        )}
                        <button disabled={!groupForm.name.trim() || savingGroup} onClick={handleSaveGroup}
                          className="px-5 py-2 rounded-2xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          {savingGroup ? "Saving..." : editingGroup ? "Update" : "+ Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Groups list */}
          {groups.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-base font-semibold">No groups yet</p>
              <p className="text-sm mt-1">Expand the card above to create your first group.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                Your Groups ({groups.length})
              </p>
              {groups.map(g => {
                const count = customers.filter(c => c.group_id === g.id).length;
                return (
                  <motion.div key={g.id} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 bg-white border border-slate-100 rounded-3xl px-5 py-4 hover:border-slate-200 shadow-sm transition-all cursor-pointer"
                    onClick={() => setManagingGroup(g)}
                  >
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: g.color + "20" }}>{g.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800">{g.name}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {count} member{count !== 1 ? "s" : ""}
                        {g.description ? ` · ${g.description}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={e => { e.stopPropagation(); startEdit(g); }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button disabled={deletingId === g.id} onClick={e => { e.stopPropagation(); handleDeleteGroup(g); }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-400 transition-colors disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
