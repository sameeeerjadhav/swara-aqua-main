/**
 * EditProfileModal — reusable modal for editing name, phone (with login warning), and password.
 *
 * Props:
 *   open        – controls visibility
 *   onClose     – close callback
 *   initialName – prefilled name
 *   initialPhone– prefilled phone
 *   onSave      – called after successful save; receives { name, phone }
 *   apiEndpoint – PATCH endpoint (e.g. '/auth/profile' or '/admin/users/5/profile')
 *   isAdmin     – if true, also allows setting a new password without providing current (admin reset)
 *   showJarRate – optional: show jar rate field (for admin editing customers)
 *   initialJarRate – initial jar rate value
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Phone, Lock, KeyRound, Eye, EyeOff, AlertTriangle, X, Pencil } from 'lucide-react';
import { Button } from './Button';
import { useToast } from './Toast';
import api from '../../api/axios';

interface Props {
  open: boolean;
  onClose: () => void;
  initialName: string;
  initialPhone: string;
  onSave?: (updated: { name: string; phone: string; jar_rate?: number }) => void;
  apiEndpoint: string;
  isAdmin?: boolean;
  showJarRate?: boolean;
  initialJarRate?: number;
}

export const EditProfileModal = ({
  open, onClose, initialName, initialPhone, onSave,
  apiEndpoint, isAdmin = false, showJarRate = false, initialJarRate = 50,
}: Props) => {
  const { toast } = useToast();

  const [name,     setName]     = useState(initialName);
  const [phone,    setPhone]    = useState(initialPhone);
  const [jarRate,  setJarRate]  = useState(initialJarRate);

  // Phone warning state
  const [phoneWarningConfirmed, setPhoneWarningConfirmed] = useState(false);
  const phoneChanged = phone.replace(/\s/g, '') !== initialPhone.replace(/\s/g, '');

  // Password fields
  const [showPwSection, setShowPwSection] = useState(false);
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);

  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setName(initialName);
      setPhone(initialPhone);
      setJarRate(initialJarRate);
      setPhoneWarningConfirmed(false);
      setShowPwSection(false);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    }
  }, [open, initialName, initialPhone, initialJarRate]);

  const handleSave = async () => {
    if (!name.trim()) { toast('Name cannot be empty', 'error'); return; }
    if (phoneChanged && !phoneWarningConfirmed) {
      toast('Please confirm the phone number change warning', 'error'); return;
    }
    if (showPwSection) {
      if (!isAdmin && !currentPw) { toast('Enter your current password', 'error'); return; }
      if (newPw.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
      if (newPw !== confirmPw) { toast('Passwords do not match', 'error'); return; }
    }

    const payload: Record<string, any> = { name: name.trim() };
    if (phoneChanged) payload.phone = phone.trim();
    if (showJarRate)  payload.jar_rate = Number(jarRate);
    if (showPwSection && newPw) {
      if (isAdmin) {
        payload.newPassword = newPw;
      } else {
        payload.currentPassword = currentPw;
        payload.newPassword     = newPw;
      }
    }

    setSaving(true);
    try {
      await api.patch(apiEndpoint, payload);
      toast('Profile updated successfully', 'success');
      onSave?.({ name: name.trim(), phone: phoneChanged ? phone.trim() : initialPhone, jar_rate: showJarRate ? Number(jarRate) : undefined });
      onClose();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-aqua-500 rounded-xl flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Profile</h3>
                  <p className="text-xs text-slate-400">Update details below</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Full Name</label>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                  <User className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Phone Number</label>
                <div className={`flex items-center border rounded-2xl px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-brand-500/10
                  ${phoneChanged ? 'bg-amber-50 border-amber-300 focus-within:border-amber-400' : 'bg-slate-50 border-slate-200 focus-within:border-brand-400'}`}>
                  <Phone className={`w-4 h-4 mr-2 shrink-0 ${phoneChanged ? 'text-amber-500' : 'text-slate-400'}`} />
                  <input
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setPhoneWarningConfirmed(false); }}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder-slate-400"
                  />
                </div>

                {/* Warning when phone changes */}
                {phoneChanged && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-700">Login credential will change</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          You'll need to use <strong>{phone}</strong> to log in after this change.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPhoneWarningConfirmed(v => !v)}
                      className={`mt-2 flex items-center gap-2 text-xs font-semibold transition-colors ${phoneWarningConfirmed ? 'text-green-600' : 'text-amber-600'}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                        ${phoneWarningConfirmed ? 'bg-green-500 border-green-500' : 'border-amber-400'}`}>
                        {phoneWarningConfirmed && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      I understand, change my login number
                    </button>
                  </motion.div>
                )}
              </div>

              {/* Jar Rate (admin only, for customers) */}
              {showJarRate && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Jar Rate (₹/jar)</label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                    <span className="text-slate-400 mr-2 text-sm shrink-0">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={jarRate}
                      onChange={e => setJarRate(Number(e.target.value))}
                      className="flex-1 bg-transparent text-sm text-slate-800 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Password section toggle */}
              <div>
                <button
                  onClick={() => setShowPwSection(v => !v)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-semibold transition-all
                    ${showPwSection ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-brand-200'}`}
                >
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    {showPwSection ? 'Hide password change' : 'Change password'}
                  </div>
                  <span className="text-xs">{showPwSection ? '▲' : '▼'}</span>
                </button>
              </div>

              {/* Password fields */}
              <AnimatePresence>
                {showPwSection && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    {!isAdmin && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Current Password</label>
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                          <Lock className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                          <input type={showCurrent ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                            placeholder="Current password" className="flex-1 bg-transparent text-sm outline-none" />
                          <button type="button" onClick={() => setShowCurrent(v => !v)} className="ml-2 text-slate-400 hover:text-slate-600">
                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">New Password</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                        <KeyRound className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                        <input type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
                          placeholder="Min. 6 characters" className="flex-1 bg-transparent text-sm outline-none" />
                        <button type="button" onClick={() => setShowNew(v => !v)} className="ml-2 text-slate-400 hover:text-slate-600">
                          {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Confirm Password</label>
                      <div className={`flex items-center border rounded-2xl px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-brand-500/10
                        ${confirmPw && newPw !== confirmPw ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200 focus-within:border-brand-400'}`}>
                        <Lock className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                        <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                          placeholder="Re-enter new password" className="flex-1 bg-transparent text-sm outline-none" />
                      </div>
                      {confirmPw && newPw !== confirmPw && (
                        <p className="text-xs text-red-500 mt-1.5">Passwords do not match</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button size="md" className="flex-1" loading={saving} icon={<Pencil className="w-4 h-4" />} onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
