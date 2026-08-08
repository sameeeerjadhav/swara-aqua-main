import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronRight, X, Search, Phone, Droplets } from 'lucide-react';
import { groupsApi, CustomerGroup } from '../../api/groups';
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

// ── Group Members Sheet ────────────────────────────────────────────────────────
const GroupMembersSheet = ({
  group,
  onClose,
}: {
  group: CustomerGroup;
  onClose: () => void;
}) => {
  const [members, setMembers]   = useState<GroupMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');

  useEffect(() => {
    api.get<{ customers: GroupMember[] }>('/admin/customers-list')
      .then(({ data }) => {
        // Filter to members of this group
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
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{group.icon}</span>
            <div>
              <h2 className="font-bold text-slate-800 text-base">{group.name}</h2>
              <p className="text-xs text-slate-400">{group.member_count} member{group.member_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 bg-slate-100 rounded-2xl px-3 py-2.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search members..."
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
            />
          </div>
        </div>

        {/* Members list */}
        <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                {search ? 'No members match your search' : 'No members in this group'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(m => (
                <div key={m.id}
                  className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
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
                    <p className="text-[11px] text-slate-400 mt-0.5">₹{m.jar_rate}/jar</p>
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

// ── Main Staff Groups Page ─────────────────────────────────────────────────────
export const StaffGroups = () => {
  const [groups,  setGroups]  = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
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
        <p className="text-sm text-slate-400 mt-0.5">Groups created by admin — tap to see members</p>
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
          <p className="text-slate-400 text-sm mt-1">Admin hasn't created any customer groups</p>
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
              {/* Icon badge */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                style={{ background: group.color + '22', border: `1.5px solid ${group.color}44` }}
              >
                {group.icon}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">{group.name}</p>
                {group.description && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{group.description}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: group.color }}
                  />
                  <span className="text-xs text-slate-500 font-medium">
                    {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Arrow */}
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
