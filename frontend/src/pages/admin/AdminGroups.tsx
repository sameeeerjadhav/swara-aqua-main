import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { Search, X, Tag, User, Pencil, Trash2, ChevronRight, Users, GripVertical, Check } from "lucide-react";
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
}

const GROUP_COLORS = [
  "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];
const GROUP_ICONS = ["U+1F465", "U+1F3E0", "U+2B50", "U+1F680", "U+1F48E", "U+1F535", "U+1F7E2", "U+1F7E1", "U+1F7E0", "U+1F534"];
const EMPTY_FORM = { name: "", color: "#3B82F6", icon: "#1F465", description: "" };

const GroupBadge = ({ name, color, icon }: { name: string; color: string; icon: string }) => (
  <span
    className="inline-flex items-center gap-1 font-semibold rounded-full border text-[10px] px-2 py-0.5"
    style={{ color, borderColor: color + "40", backgroundColor: color + "12" }}
  >
    <span>{icon}</span>{name}
  </span>
);

// Draggable member row for reorder mode
const DraggableMemberItem = ({
  item, index, total, onMove,
}: {
  item: CustomerRow; index: number; total: number;
  onMove: (from: number, to: number) => void;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="relative"
      style={{ listStyle: "none" }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{ scale: 1.03, boxShadow: "0 16px 40px -8px rgba(0,0,0,0.18)", zIndex: 50 }}
    >
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3 py-3 select-none">
        <span className="w-6 text-center text-xs font-bold text-slate-400 shrink-0">{index + 1}</span>
        <GripVertical
          className="w-5 h-5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={e => controls.start(e)}
        />
        <Avatar name={item.name} photo={item.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
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

export const AdminGroups = () => {
  const { toast } = useToast();

  const [groups,    setGroups]    = useState<CustomerGroup[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [groupForm,    setGroupForm]    = useState(EMPTY_FORM);
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  const [savingGroup,  setSavingGroup]  = useState(false);
  const [deletingId,   setDeletingId]   = useState<number | null>(null);

  const [managingGroup,  setManagingGroup]  = useState<CustomerGroup | null>(null);
  const [memberSearch,   setMemberSearch]   = useState("");
  const [assigningGroup, setAssigningGroup] = useState<{ customerId: number } | null>(null);

  // Reorder state
  const [reorderMode,   setReorderMode]   = useState(false);
  const [reorderedList, setReorderedList] = useState<CustomerRow[]>([]);
  const [savingOrder,   setSavingOrder]   = useState(false);

  const loadGroups = useCallback(async () => {
    try { const { data } = await groupsApi.list(); setGroups(data.groups); }
    catch { /* silent */ }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/users");
      setCustomers((data.users as any[]).filter((u: any) => u.role === "customer" && u.status === "active"));
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
      await loadGroups();
    } catch { toast("Failed to save group", "error"); }
    finally { setSavingGroup(false); }
  };

  const handleDeleteGroup = async (g: CustomerGroup) => {
    if (!window.confirm("Delete group? Customers will become ungrouped.")) return;
    setDeletingId(g.id);
    try {
      await groupsApi.delete(g.id);
      setCustomers(prev => prev.map(c => c.group_id === g.id
        ? { ...c, group_id: null, group_name: null, group_color: null, group_icon: null } : c));
      toast("Group deleted", "success");
      await loadGroups();
    } catch { toast("Failed to delete group", "error"); }
    finally { setDeletingId(null); }
  };

  const doAssign = async (customerId: number, targetGroupId: number | null, isAdd: boolean) => {
    const g = managingGroup!;
    setAssigningGroup({ customerId });
    try {
      await groupsApi.assignCustomer(customerId, targetGroupId);
      setCustomers(prev => prev.map(c => {
        if (c.id !== customerId) return c;
        return isAdd
          ? { ...c, group_id: g.id, group_name: g.name, group_color: g.color, group_icon: g.icon }
          : { ...c, group_id: null, group_name: null, group_color: null, group_icon: null };
      }));
      await loadGroups();
    } catch { toast("Failed to update", "error"); }
    finally { setAssigningGroup(null); }
  };

  const enterReorderMode = async (groupId: number, members: CustomerRow[]) => {
    try {
      const { data } = await groupsApi.getGroupOrder(groupId);
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
    if (!managingGroup) return;
    setSavingOrder(true);
    try {
      await groupsApi.saveGroupOrder(managingGroup.id, reorderedList.map(c => c.id));
      toast("Group order saved!", "success");
      setReorderMode(false);
    } catch { toast("Failed to save order", "error"); }
    finally { setSavingOrder(false); }
  };

  const memberCount = (gId: number) => customers.filter(c => c.group_id === gId).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
      </div>
    );
  }

  // Members Panel
  if (managingGroup) {
    const g = managingGroup;
    const members    = customers.filter(c => c.group_id === g.id);
    const nonMembers = customers.filter(c => c.group_id !== g.id);
    const lc = memberSearch.toLowerCase();
    const filtMembers    = lc ? members.filter(c    => c.name.toLowerCase().includes(lc) || c.phone.includes(lc)) : members;
    const filtNonMembers = lc ? nonMembers.filter(c => c.name.toLowerCase().includes(lc) || c.phone.includes(lc)) : nonMembers;

    return (
      <motion.div key="members-panel"
        initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="flex flex-col h-full max-w-2xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-1 py-3 border-b border-slate-100 bg-white shrink-0">
          <button onClick={() => { setManagingGroup(null); setMemberSearch(""); setReorderMode(false); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: g.color + "20" }}>{g.icon}</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">{g.name}</h2>
            <p className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          {!reorderMode ? (
            <button
              onClick={() => enterReorderMode(g.id, members)}
              disabled={members.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-all disabled:opacity-40"
              title="Set delivery order for this group">
              <GripVertical className="w-3.5 h-3.5" /> Reorder
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setReorderMode(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
              <button onClick={saveOrder} disabled={savingOrder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors disabled:opacity-60">
                {savingOrder
                  ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Check className="w-3.5 h-3.5" />}
                Save Order
              </button>
            </div>
          )}
        </div>

        {/* Reorder hint banner */}
        <AnimatePresence>
          {reorderMode && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="bg-brand-50 border-b border-brand-100 px-4 py-2 flex items-center gap-2 shrink-0"
            >
              <GripVertical className="w-4 h-4 text-brand-400" />
              <p className="text-xs font-semibold text-brand-700">
                Drag or tap arrows to set delivery order within this group
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          {reorderMode ? (
            <div className="px-2 py-4 space-y-2">
              <Reorder.Group axis="y" values={reorderedList} onReorder={setReorderedList} className="space-y-2">
                {reorderedList.map((item, i) => (
                  <DraggableMemberItem
                    key={item.id} item={item} index={i} total={reorderedList.length} onMove={moveItem}
                  />
                ))}
              </Reorder.Group>
            </div>
          ) : (
            <div className="px-1 py-4 space-y-5">
              {/* Search */}
              <div className="flex items-center gap-2 bg-slate-100 rounded-2xl px-3 py-2.5">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search customers..."
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
                {memberSearch && (
                  <button onClick={() => setMemberSearch("")}><X className="w-3.5 h-3.5 text-slate-400" /></button>
                )}
              </div>

              {/* Current members */}
              {filtMembers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                    Members ({filtMembers.length})
                  </p>
                  <div className="space-y-2">
                    {filtMembers.map(c => (
                      <div key={c.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-3 py-3">
                        <Avatar name={c.name} photo={c.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400">{c.phone}</p>
                        </div>
                        <button disabled={assigningGroup?.customerId === c.id}
                          onClick={() => doAssign(c.id, null, false)}
                          className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50">
                          {assigningGroup?.customerId === c.id ? "..." : "- Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Non-members */}
              {filtNonMembers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Add Customers</p>
                  <div className="space-y-2">
                    {filtNonMembers.map(c => (
                      <div key={c.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-3">
                        <Avatar name={c.name} photo={c.profile_photo} size="sm" className="w-9 h-9 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{c.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-slate-400">{c.phone}</p>
                            {c.group_name && c.group_color && c.group_icon && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border"
                                style={{ color: c.group_color, borderColor: c.group_color + "40", backgroundColor: c.group_color + "12" }}>
                                {c.group_icon} {c.group_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <button disabled={assigningGroup?.customerId === c.id}
                          onClick={() => doAssign(c.id, g.id, true)}
                          className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50"
                          style={{ color: g.color, borderColor: g.color + "40", backgroundColor: g.color + "12" }}>
                          {assigningGroup?.customerId === c.id ? "..." : "+ Add"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filtMembers.length === 0 && filtNonMembers.length === 0 && (
                <div className="py-12 text-center">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No customers match your search</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Groups list + form
  return (
    <AnimatePresence mode="wait">
      <motion.div key="groups-panel"
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18 }}
        className="max-w-2xl mx-auto px-4 pb-8 space-y-6"
      >
        {/* Create / Edit Form */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {editingGroup ? "Edit Group" : "+ New Group"}
          </p>
          <input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Group name (e.g. Daily Orders)"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
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
          <input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          <div className="flex items-center gap-3 pt-1">
            {groupForm.name && <GroupBadge name={groupForm.name} color={groupForm.color} icon={groupForm.icon} />}
            <div className="flex gap-2 ml-auto">
              {editingGroup && (
                <button onClick={() => { setEditingGroup(null); setGroupForm(EMPTY_FORM); }}
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

        {/* Groups list */}
        {groups.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-base font-semibold">No groups yet</p>
            <p className="text-sm mt-1">Create your first group above to organise your customers.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Your Groups ({groups.length})
            </p>
            {groups.map(g => {
              const count = memberCount(g.id);
              return (
                <motion.div key={g.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4 bg-white border border-slate-100 rounded-3xl px-5 py-4 hover:border-slate-200 shadow-sm transition-all"
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    style={{ backgroundColor: g.color + "20" }}>{g.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800">{g.name}</p>
                      <GroupBadge name={g.name} color={g.color} icon={g.icon} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {count} member{count !== 1 ? "s" : ""}
                      {g.description ? ` - ${g.description}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => { setManagingGroup(g); setMemberSearch(""); setReorderMode(false); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:scale-105"
                      style={{ color: g.color, borderColor: g.color + "40", backgroundColor: g.color + "12" }}>
                      <User className="w-3 h-3" /> Members
                    </button>
                    <button onClick={() => { setEditingGroup(g); setGroupForm({ name: g.name, color: g.color, icon: g.icon, description: g.description || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button disabled={deletingId === g.id} onClick={() => handleDeleteGroup(g)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-400 transition-colors disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
