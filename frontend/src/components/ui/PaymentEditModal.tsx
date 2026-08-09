import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { useToast } from './Toast';
import { calendarApi, DeliveryPaymentPayload } from '../../api/calendar';

export const PM_LABEL: Record<string, { label: string; icon: string; cls: string }> = {
  cash:      { label: 'Cash',      icon: '💵', cls: 'bg-green-50 text-green-700 border-green-200' },
  online:    { label: 'Online',    icon: '📱', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pay_later: { label: 'Pay Later', icon: '🕒', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  advance:   { label: 'Advance',   icon: '💰', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const PAYMENT_MODES: { value: 'cash' | 'online' | 'advance' | 'pay_later'; label: string; icon: string }[] = [
  { value: 'cash',      label: 'Cash',      icon: '💵' },
  { value: 'online',    label: 'Online',    icon: '📱' },
  { value: 'pay_later', label: 'Pay Later', icon: '🕒' },
  { value: 'advance',   label: 'Advance',   icon: '💰' },
];

export interface PaymentEditTarget {
  delivery_id: number;
  order_id?: number;
  customer_name?: string;
  quantity?: number;
  total_amount?: number;
  delivery_payment_mode?: string | null;
  delivery_collected_amount?: number | null;
}

interface Props {
  target: PaymentEditTarget;
  onSaved: () => void;
  onClose: () => void;
}

export const PaymentEditModal = ({ target, onSaved, onClose }: Props) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<'cash' | 'online' | 'advance' | 'pay_later'>(
    (target.delivery_payment_mode as any) || 'cash'
  );
  const [amount, setAmount] = useState(
    Number(target.delivery_collected_amount ?? target.total_amount ?? 0)
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: DeliveryPaymentPayload = {
        payment_mode: mode,
        collected_amount: mode === 'pay_later' ? 0 : amount,
      };
      await calendarApi.updateDeliveryPayment(target.delivery_id, payload);
      toast('Payment updated successfully', 'success');
      onSaved();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to update payment', 'error');
    } finally { setSaving(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">✏️ Correct Payment</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {target.customer_name && `${target.customer_name} · `}
              {target.quantity && `${target.quantity} jars · `}
              {target.total_amount != null && `₹${target.total_amount}`}
              {target.order_id && ` · #${target.order_id}`}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {target.delivery_payment_mode && PM_LABEL[target.delivery_payment_mode] && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Current:</span>
              <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full border ${PM_LABEL[target.delivery_payment_mode].cls}`}>
                {PM_LABEL[target.delivery_payment_mode].icon} {PM_LABEL[target.delivery_payment_mode].label}
              </span>
              <span>· ₹{target.delivery_collected_amount ?? 0} collected</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 block">Change To</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map(pm => (
                <button key={pm.value} onClick={() => setMode(pm.value)}
                  className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    mode === pm.value
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                  }`}>
                  <span>{pm.icon}</span> {pm.label}
                </button>
              ))}
            </div>
          </div>

          {mode !== 'pay_later' && (
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Amount Collected (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number" min={0} value={amount}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10" />
              </div>
            </div>
          )}

          {mode === 'pay_later' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
              ⚠️ Amount collected will be set to ₹0. Customer pending balance will increase by ₹{target.total_amount ?? 0}.
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl bg-brand-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-700 transition-colors disabled:opacity-60">
            {saving
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
