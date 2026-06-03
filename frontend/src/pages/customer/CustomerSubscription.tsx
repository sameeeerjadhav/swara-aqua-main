import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock, Droplets, Plus, Minus, Pause, Play, RotateCcw,
  X, Check, Sun, Sunset, CloudSun, Package, Pencil, Clock,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { subscriptionApi, Subscription } from '../../api/subscription';
import { addressApi, UserAddress } from '../../api/address';

// ── Preset slots ───────────────────────────────────────────────────────────────
const PRESET_SLOTS = [
  { label: 'Morning',   time: '08:00', icon: <Sun className="w-5 h-5" />,      color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-400' },
  { label: 'Afternoon', time: '13:00', icon: <CloudSun className="w-5 h-5" />, color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-400'   },
  { label: 'Evening',   time: '17:00', icon: <Sunset className="w-5 h-5" />,   color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-400' },
];

type SlotMap = Record<string, { time: string; quantity: number }>;

type FormMode = 'none' | 'setup' | 'edit';

export const CustomerSubscription = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const jarRate = user?.jar_rate || 50;

  const [sub,     setSub]     = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [mode,    setMode]    = useState<FormMode>('none');

  // Shared form state (setup + edit)
  const [selectedSlots, setSelectedSlots] = useState<SlotMap>({});
  const [address,       setAddress]       = useState('');
  const [autoRenew,     setAutoRenew]     = useState(true);
  const [addresses,     setAddresses]     = useState<UserAddress[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await subscriptionApi.getMy();
      setSub(data.subscription);
    } catch { toast('Failed to load subscription', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Load saved addresses whenever the form opens
  useEffect(() => {
    if (mode !== 'none') {
      addressApi.list().then(({ data }) => {
        setAddresses(data.addresses);
        if (mode === 'setup') {
          const def = data.addresses.find(a => a.is_default) || data.addresses[0];
          if (def && !address) setAddress(def.address);
        }
      }).catch(() => {});
    }
  }, [mode]);

  // ── Open edit — pre-fill from subscription ─────────────────────────────────
  const openEdit = () => {
    if (!sub) return;
    const prefill: SlotMap = {};
    for (const s of sub.slots || []) {
      prefill[s.slot_label] = { time: s.delivery_time, quantity: s.quantity };
    }
    setSelectedSlots(prefill);
    setAddress(sub.address || '');
    setAutoRenew(sub.auto_renew);
    setMode('edit');
  };

  const openSetup = () => {
    setSelectedSlots({});
    setAddress('');
    setAutoRenew(true);
    setMode('setup');
  };

  const closeForm = () => setMode('none');

  // ── Slot helpers ───────────────────────────────────────────────────────────
  const toggleSlot = (label: string, time: string) => {
    setSelectedSlots(prev => {
      if (prev[label]) { const { [label]: _, ...rest } = prev; return rest; }
      return { ...prev, [label]: { time, quantity: 1 } };
    });
  };

  const setSlotQty = (label: string, delta: number) => {
    setSelectedSlots(prev => {
      if (!prev[label]) return prev;
      const newQty = Math.max(1, prev[label].quantity + delta);
      return { ...prev, [label]: { ...prev[label], quantity: newQty } };
    });
  };

  const totalDaily        = Object.values(selectedSlots).reduce((s, sl) => s + sl.quantity, 0);
  const estimatedMonthly  = totalDaily * jarRate * 30;

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const slots = Object.entries(selectedSlots).map(([label, s]) => ({ label, time: s.time, quantity: s.quantity }));
    if (slots.length === 0) { toast('Select at least one delivery slot', 'error'); return; }
    if (!address.trim())    { toast('Select a delivery address', 'error'); return; }
    setSaving(true);
    try {
      await subscriptionApi.create({ slots, address, autoRenew });
      toast('Subscription created! 🎉', 'success');
      closeForm();
      await load();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to create subscription', 'error');
    } finally { setSaving(false); }
  };

  // ── Update ─────────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!sub) return;
    const slots = Object.entries(selectedSlots).map(([label, s]) => ({ label, time: s.time, quantity: s.quantity }));
    if (slots.length === 0) { toast('Select at least one delivery slot', 'error'); return; }
    if (!address.trim())    { toast('Select a delivery address', 'error'); return; }
    setSaving(true);
    try {
      await subscriptionApi.update(sub.id, { slots, address, autoRenew });
      toast('Plan updated — changes take effect from tomorrow ✅', 'success');
      closeForm();
      await load();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to update plan', 'error');
    } finally { setSaving(false); }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handlePause  = async () => { if (!sub) return; try { await subscriptionApi.pause(sub.id);  toast('Subscription paused — takes effect tomorrow', 'success'); await load(); } catch { toast('Failed to pause', 'error'); } };
  const handleResume = async () => { if (!sub) return; try { await subscriptionApi.resume(sub.id); toast('Subscription resumed!', 'success'); await load(); } catch { toast('Failed to resume', 'error'); } };
  const handleRenew  = async () => { if (!sub) return; try { await subscriptionApi.renew(sub.id);  toast('Subscription renewed for next month! 🎉', 'success'); await load(); } catch { toast('Failed to renew', 'error'); } };
  const handleCancel = async () => {
    if (!sub) return;
    if (!confirm('Are you sure you want to cancel your subscription?')) return;
    try { await subscriptionApi.cancel(sub.id); toast('Subscription cancelled', 'warning'); await load(); }
    catch { toast('Failed to cancel', 'error'); }
  };

  const daysUntilExpiry = sub ? Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999;
  const isExpiringSoon  = sub?.status === 'active' && daysUntilExpiry <= 5 && !sub.auto_renew;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-lg space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  // ── No subscription — landing ──────────────────────────────────────────────
  if (!sub && mode === 'none') {
    return (
      <div className="max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-slate-100 shadow-card overflow-hidden">
          <div className="bg-brand-600 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
              <Droplets className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-extrabold text-white mb-1">Daily Water Plan</h2>
            <p className="text-sm text-white/70">Get water delivered daily without placing orders!</p>
          </div>
          <div className="p-6 space-y-4">
            {[
              { icon: <CalendarClock className="w-4 h-4 text-brand-600" />, bg: 'bg-brand-50', text: 'Choose your delivery slots — morning, afternoon, or evening' },
              { icon: <Package className="w-4 h-4 text-emerald-600" />,     bg: 'bg-emerald-50', text: 'Set jars per slot — orders are auto-placed daily' },
              { icon: <RotateCcw className="w-4 h-4 text-purple-600" />,    bg: 'bg-purple-50', text: 'Renew at month end — or cancel anytime' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className={`w-8 h-8 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>{item.icon}</div>
                <p className="text-slate-600">{item.text}</p>
              </div>
            ))}
            <Button size="lg" className="w-full !py-4" onClick={openSetup} icon={<Plus className="w-4 h-4" />}>
              Setup My Plan
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Setup / Edit form ──────────────────────────────────────────────────────
  if (mode === 'setup' || mode === 'edit') {
    const isEdit = mode === 'edit';
    return (
      <div className="max-w-lg space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Your Plan' : 'Setup Your Plan'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? 'Changes take effect from tomorrow' : 'Choose delivery slots & quantities'}
            </p>
          </div>
          <button onClick={closeForm}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slot cards — no gradients */}
        <div className="space-y-3">
          {PRESET_SLOTS.map(slot => {
            const isActive = !!selectedSlots[slot.label];
            return (
              <motion.div key={slot.label} layout
                className={`rounded-2xl border-2 overflow-hidden transition-all ${isActive ? slot.border : 'border-slate-200'}`}>

                {/* Header row */}
                <button onClick={() => toggleSlot(slot.label, slot.time)}
                  className={`w-full flex items-center gap-3 p-4 transition-all ${isActive ? slot.bg : 'bg-slate-50'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-white' : 'bg-white shadow-sm'}`}>
                    <span className={isActive ? slot.color : 'text-slate-400'}>{slot.icon}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-bold ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>{slot.label}</p>
                    <p className="text-xs text-slate-400">{slot.time}</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                    ${isActive ? `border-current ${slot.color} bg-white` : 'border-slate-300'}`}>
                    {isActive && <Check className={`w-3.5 h-3.5 ${slot.color}`} />}
                  </div>
                </button>

                {/* Quantity stepper */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500">Jars per delivery</p>
                        <div className="flex items-center gap-3">
                          <button onClick={() => setSlotQty(slot.label, -1)}
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-lg font-bold text-slate-800 w-6 text-center">
                            {selectedSlots[slot.label]?.quantity || 1}
                          </span>
                          <button onClick={() => setSlotQty(slot.label, 1)}
                            className="w-8 h-8 rounded-xl bg-brand-600 hover:bg-brand-700 flex items-center justify-center text-white transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Summary row */}
        {totalDaily > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <div>
              <p className="text-xs text-slate-500 font-semibold">Daily Total</p>
              <p className="text-2xl font-extrabold text-slate-900">{totalDaily} jars</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-semibold">~Monthly Cost</p>
              <p className="text-xl font-bold text-brand-600">₹{estimatedMonthly.toLocaleString('en-IN')}</p>
            </div>
          </motion.div>
        )}

        {/* Address */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Delivery Address</label>
          {addresses.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {addresses.map(a => (
                <button key={a.id} type="button" onClick={() => setAddress(a.address)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all
                    ${address === a.address ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                  {a.label}
                  {address === a.address && <Check className="w-3 h-3 ml-1 inline" />}
                </button>
              ))}
            </div>
          )}
          <textarea value={address} onChange={e => setAddress(e.target.value)}
            placeholder="Full delivery address…" rows={2}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 transition-all resize-none" />
        </div>

        {/* Auto-renew toggle */}
        <button onClick={() => setAutoRenew(!autoRenew)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all
            ${autoRenew ? 'bg-brand-50 border-brand-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <RotateCcw className={`w-4 h-4 ${autoRenew ? 'text-brand-600' : 'text-slate-400'}`} />
            <span className="text-sm font-semibold text-slate-700">Auto-renew next month</span>
          </div>
          <div className={`w-10 h-6 rounded-full transition-all relative ${autoRenew ? 'bg-brand-600' : 'bg-slate-300'}`}>
            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${autoRenew ? 'left-5' : 'left-1'}`} />
          </div>
        </button>

        {/* Submit */}
        <div className="sticky bottom-0 pt-2 pb-1 bg-white/90 backdrop-blur-sm -mx-1 px-1">
          <Button size="lg" className="w-full !py-4" loading={saving}
            onClick={isEdit ? handleUpdate : handleCreate}
            icon={isEdit ? <Check className="w-4 h-4" /> : <Droplets className="w-4 h-4" />}
            disabled={totalDaily === 0 || !address.trim()}>
            {isEdit
              ? `Save Changes — ${totalDaily} jars/day`
              : `Start My Plan — ${totalDaily} jars/day`}
          </Button>
        </div>
      </div>
    );
  }

  // ── Active subscription dashboard ──────────────────────────────────────────
  return (
    <div className="max-w-lg space-y-4">

      {/* Expiry banner */}
      {isExpiringSoon && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Plan expires in {daysUntilExpiry} days</p>
            <p className="text-xs text-white/70">Renew to continue daily deliveries</p>
          </div>
          <Button size="sm" onClick={handleRenew} className="!bg-white !text-amber-600 !border-0 shrink-0">Renew</Button>
        </motion.div>
      )}

      {/* ── Status card — flat, no gradient ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-brand-600" />
            <span className="text-sm font-bold text-slate-800">My Water Plan</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider
              ${sub!.status === 'active'  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                sub!.status === 'paused'  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                            'bg-slate-100 text-slate-500 border border-slate-200'}`}>
              {sub!.status}
            </span>
            {/* Edit button */}
            {(sub!.status === 'active' || sub!.status === 'paused') && (
              <button onClick={openEdit}
                className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 flex items-center justify-center text-slate-500 transition-all"
                title="Edit plan">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Date range */}
        <div className="px-5 py-2.5 text-xs text-slate-400 font-medium border-b border-slate-100">
          {new Date(sub!.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {' – '}
          {new Date(sub!.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          {sub!.auto_renew && <span className="ml-2 text-brand-500">· Auto-renew ON</span>}
        </div>

        {/* Slots list */}
        <div className="p-5 space-y-3">
          {sub!.slots?.map(slot => {
            const preset = PRESET_SLOTS.find(p => p.label === slot.slot_label);
            return (
              <div key={slot.id} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${preset?.bg || 'bg-slate-100'}`}>
                  <span className={preset?.color || 'text-slate-400'}>
                    {preset?.icon || <Clock className="w-5 h-5" />}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{slot.slot_label}</p>
                  <p className="text-xs text-slate-400">{slot.delivery_time}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <span className="text-sm font-bold text-brand-600">{slot.quantity}</span>
                  <span className="text-xs text-slate-400 ml-0.5">jar{slot.quantity > 1 ? 's' : ''}</span>
                </div>
              </div>
            );
          })}

          {/* Daily total */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500">Daily Total</span>
            <span className="text-base font-extrabold text-brand-700">
              {sub!.slots?.reduce((s, sl) => s + sl.quantity, 0)} jars
              {' · '}
              ₹{(sub!.slots?.reduce((s, sl) => s + sl.quantity, 0) || 0) * jarRate}/day
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Action buttons ── */}
      <div className="grid grid-cols-2 gap-3">
        {sub!.status === 'active' ? (
          <Button variant="secondary" size="md" className="w-full" onClick={handlePause}
            icon={<Pause className="w-4 h-4" />}>Pause Plan</Button>
        ) : sub!.status === 'paused' ? (
          <Button size="md" className="w-full" onClick={handleResume}
            icon={<Play className="w-4 h-4" />}>Resume Plan</Button>
        ) : null}

        <Button variant="secondary" size="md" className="w-full" onClick={handleRenew}
          icon={<RotateCcw className="w-4 h-4" />}>Renew</Button>
      </div>

      {/* Edit plan — prominent call-to-action on its own row */}
      {(sub!.status === 'active' || sub!.status === 'paused') && (
        <button onClick={openEdit}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-brand-200 bg-brand-50 text-brand-700 text-sm font-bold hover:bg-brand-100 hover:border-brand-400 active:scale-[0.98] transition-all">
          <Pencil className="w-4 h-4" />
          Edit Plan (slots, quantity, address)
        </button>
      )}

      <Button variant="danger" size="sm" className="w-full" onClick={handleCancel}>
        Cancel Subscription
      </Button>
    </div>
  );
};
