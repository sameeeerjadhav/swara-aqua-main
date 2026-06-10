import { useState, useEffect, useRef } from 'react';
import { Send, Users, User, Search, AlertCircle, ChevronDown, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import api from '../../api/axios';

type Mode = 'user' | 'broadcast';
type NotifType = 'order' | 'payment' | 'delivery' | 'approval' | 'stock' | 'general';

interface CustomerOption {
  id: number;
  name: string;
  phone: string;
  status: string;
  pending_amount?: number;
}

const PRESETS: { label: string; title: string; body: string; type: NotifType; role?: string }[] = [
  { label: '📦 Order Delivered',  title: 'Order Delivered',       body: 'Your water order has been delivered!',         type: 'order' },
  { label: '💳 Payment Reminder', title: 'Payment Pending',       body: 'You have a pending payment. Please clear it.', type: 'payment' },
  { label: '🚚 New Delivery',     title: 'New Delivery Assigned', body: 'A new delivery has been assigned to you.',     type: 'delivery', role: 'staff' },
  { label: '✅ New Customer',     title: 'New Customer Request',  body: 'A new customer is waiting for approval.',      type: 'approval', role: 'admin' },
  { label: '⚠️ Low Stock',        title: 'Low Jar Stock Alert',   body: 'Jar stock is running low. Please restock.',    type: 'stock',    role: 'admin' },
  { label: '💰 Submit Cash',      title: 'Submit Collected Cash', body: "Please submit today's collected cash.",        type: 'general',  role: 'staff' },
];

export const AdminNotifications = () => {
  const { toast } = useToast();
  const [mode,    setMode]    = useState<Mode>('broadcast');
  const [role,    setRole]    = useState('customer');
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [type,    setType]    = useState<NotifType>('general');
  const [loading, setLoading] = useState(false);

  // Customer picker state
  const [customers,        setCustomers]        = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [search,           setSearch]           = useState('');
  const [dropdownOpen,     setDropdownOpen]      = useState(false);
  const [customersLoading, setCustomersLoading]  = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load customers + balances once
  useEffect(() => {
    const loadCustomers = async () => {
      setCustomersLoading(true);
      try {
        const [usersRes, balancesRes] = await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/customer-balances'),
        ]);
        const allUsers: any[] = usersRes.data.users || [];
        const balances: Record<number, { total: number }> = balancesRes.data.balances || {};

        const customers: CustomerOption[] = allUsers
          .filter(u => u.role === 'customer' && u.status === 'active')
          .map(u => ({
            id:   u.id,
            name: u.name,
            phone: u.phone,
            status: u.status,
            pending_amount: balances[u.id]?.total || 0,
          }));

        // Customers with dues come first, then alphabetical
        customers.sort((a, b) => {
          if ((b.pending_amount || 0) !== (a.pending_amount || 0))
            return (b.pending_amount || 0) - (a.pending_amount || 0);
          return a.name.localeCompare(b.name);
        });

        setCustomers(customers);
      } catch { /* silent */ }
      finally { setCustomersLoading(false); }
    };
    loadCustomers();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const handleSelectCustomer = (c: CustomerOption) => {
    setSelectedCustomer(c);
    setDropdownOpen(false);
    setSearch('');
    // Auto-fill if customer has dues
    if (c.pending_amount && c.pending_amount > 0) {
      setType('payment');
      setTitle('💳 Payment Due Reminder');
      setBody(`Dear ${c.name}, you have ₹${c.pending_amount.toLocaleString('en-IN')} in pending dues. Please clear your bill at the earliest. Thank you!`);
    }
  };

  const applyPreset = (p: typeof PRESETS[0]) => {
    setTitle(p.title);
    setBody(p.body);
    setType(p.type);
    if (p.role) { setMode('broadcast'); setRole(p.role); }
  };

  const handleSend = async () => {
    if (!title || !body) { toast('Title and body are required', 'error'); return; }
    setLoading(true);
    try {
      if (mode === 'user') {
        if (!selectedCustomer) { toast('Please select a customer', 'error'); setLoading(false); return; }
        await api.post('/notifications/send', { userId: selectedCustomer.id, title, body, type });
        toast(`Notification sent to ${selectedCustomer.name}`, 'success');
        setSelectedCustomer(null);
      } else {
        await api.post('/notifications/broadcast', { role, title, body, type });
        toast(`Broadcast sent to all ${role}s`, 'success');
      }
      setTitle(''); setBody('');
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to send', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Send Notifications</h2>
        <p className="text-xs text-slate-400 mt-0.5">Push real-time notifications via FCM</p>
      </div>

      {/* Presets */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Presets</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className="text-left px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition-all shadow-card">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">

        {/* Mode toggle */}
        <div className="flex gap-2">
          {(['broadcast', 'user'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-brand-600 text-white shadow-brand' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {m === 'broadcast' ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
              {m === 'broadcast' ? 'Broadcast' : 'Single User'}
            </button>
          ))}
        </div>

        {/* Target selector */}
        {mode === 'broadcast' ? (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Target Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all">
              <option value="customer">Customers</option>
              <option value="staff">Staff</option>
              <option value="admin">Admins</option>
            </select>
          </div>
        ) : (
          /* ── Customer Picker ── */
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Select Customer
              {customers.filter(c => (c.pending_amount || 0) > 0).length > 0 && (
                <span className="ml-2 text-red-500 font-semibold">
                  · {customers.filter(c => (c.pending_amount || 0) > 0).length} with dues
                </span>
              )}
            </label>

            <div ref={dropdownRef} className="relative">
              {/* Selected customer chip */}
              {selectedCustomer ? (
                <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-sm ${
                  (selectedCustomer.pending_amount || 0) > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-brand-50 border-brand-200'
                }`}>
                  <div>
                    <p className="font-semibold text-slate-800">{selectedCustomer.name}</p>
                    <p className="text-xs text-slate-500">{selectedCustomer.phone}
                      {(selectedCustomer.pending_amount || 0) > 0 && (
                        <span className="ml-2 text-red-600 font-bold">
                          · ₹{selectedCustomer.pending_amount?.toLocaleString('en-IN')} due
                        </span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setTitle(''); setBody(''); }}
                    className="w-7 h-7 rounded-xl hover:bg-white/70 flex items-center justify-center text-slate-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Search input */
                <div
                  onClick={() => setDropdownOpen(true)}
                  className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 cursor-pointer focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
                    placeholder="Search customer by name or phone…"
                    className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                  />
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              )}

              {/* Dropdown */}
              {dropdownOpen && !selectedCustomer && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-64 overflow-y-auto">
                  {customersLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">Loading customers…</div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">No customers found</div>
                  ) : filteredCustomers.map(c => (
                    <button key={c.id} type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                          {(c.pending_amount || 0) > 0 && (
                            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                              <AlertCircle className="w-2.5 h-2.5" />
                              Due
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{c.phone}</p>
                      </div>
                      {(c.pending_amount || 0) > 0 && (
                        <span className="shrink-0 text-xs font-bold text-red-600 ml-2">
                          ₹{c.pending_amount?.toLocaleString('en-IN')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Notification title"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all" />
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="Notification body message..."
            rows={3}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none" />
        </div>

        {/* Type */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Type</label>
          <select value={type} onChange={e => setType(e.target.value as NotifType)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all">
            {['order','payment','delivery','approval','stock','general'].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        <Button onClick={handleSend} loading={loading} size="lg" className="w-full" icon={<Send className="w-4 h-4" />}>
          Send Notification
        </Button>
      </div>
    </div>
  );
};
