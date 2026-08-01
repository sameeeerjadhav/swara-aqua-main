import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Tag, User, Pencil, Trash2, ChevronRight, Users } from "lucide-react";

import { useToast } from "../../components/ui/Toast";
import { Avatar } from "../../components/ui/Avatar";
import { groupsApi, type CustomerGroup } from "../../api/groups";
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
const GROUP_ICONS = ["??", "?", "??", "??", "???", "??", "??", "??", "??", "??"];
const EMPTY_FORM = { name: "", color: "#3B82F6", icon: "??", description: "" };

const GroupBadge = ({ name, color, icon }: { name: string; color: string; icon: string }) => (
  <span
    className="inline-flex items-center gap-1 font-semibold rounded-full border text-[10px] px-2 py-0.5"
    style={{ color, borderColor: color + "40", backgroundColor: color + "12" }}
  >
    <span>{icon}</span>{name}
  </span>
);

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
        toast(`Group "${groupForm.name}" updated`, "success");
        setEditingGroup(null);
      } else {
        await groupsApi.create(groupForm);
        toast(`Group "${groupForm.name}" created! ??`, "success");
      }
      setGroupForm(EMPTY_FORM);
      await loadGroups();
    } catch { toast("Failed to save group", "error"); }
    finally { setSavingGroup(false); }
  };

  const handleDeleteGroup = async (g: CustomerGroup) => {
    if (!window.confirm(`Delete "${g.name}"? Customers in this group will become ungrouped.`)) return;
    setDeletingId(g.id);
    try {
      await groupsApi.delete(g.id);
      setCustomers(prev => prev.map(c => c.group_id === g.id
        ? { ...c, group_id: null, group_name: null, group_color: null, group_icon: null } : c));
      toast(`Group "${g.name}" deleted`, "success");
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
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 bg-white shrink-0">
          <button onClick={() => { setManagingGroup(null); setMemberSearch(""); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: g.color + "20" }}>{g.icon}</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">{g.name}</h2>
            <p className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{ color: g.color, backgroundColor: g.color + "15" }}>{g.icon} {g.name}</span>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 bg-white shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 focus-within:border-brand-400 transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search customers…"
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
            {memberSearch && (
              <button onClick={() => setMemberSearch("")} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Lists */}
        <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-5">
          {/* Current Members */}
          <div>
            <div className="flex items-center justify-between mb-3 pt-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">In this group ({filtMembers.length})</p>
              {members.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: g.color, backgroundColor: g.color + "15" }}>{g.icon} {g.name}</span>
              )}
            </div>
            {filtMembers.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{memberSearch ? "No matches in this group" : "No members yet — add from below"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtMembers.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-3 hover:border-slate-200 transition-colors shadow-sm">
                    <Avatar name={c.name} photo={c.profile_photo} size="xs" className="w-9 h-9 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.phone}</p>
                    </div>
                    <button disabled={assigningGroup?.customerId === c.id}
                      onClick={() => doAssign(c.id, null, false)}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50">
                      {assigningGroup?.customerId === c.id ? "…" : "? Remove"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add customers */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Add customers ({filtNonMembers.length})</p>
            {filtNonMembers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                {memberSearch ? "No matches" : "All customers are already in this group"}
              </p>
            ) : (
              <div className="space-y-2">
                {filtNonMembers.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 hover:border-slate-200 transition-colors">
                    <Avatar name={c.name} photo={c.profile_photo} size="xs" className="w-9 h-9 shrink-0" />
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
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50"
                      style={{ color: g.color, borderColor: g.color + "40", backgroundColor: g.color + "12" }}>
                      {assigningGroup?.customerId === c.id ? "…" : "+ Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            {editingGroup ? "?? Edit Group" : "+ New Group"}
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
                {savingGroup ? "Saving…" : editingGroup ? "? Update" : "+ Create"}
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
                      {g.description ? ` · ${g.description}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => { setManagingGroup(g); setMemberSearch(""); }}
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
