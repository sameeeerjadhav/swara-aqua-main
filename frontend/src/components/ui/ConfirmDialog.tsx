import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' = red confirm button (default), 'warning' = amber */
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const confirmStyles =
    variant === 'warning'
      ? 'bg-amber-500 hover:bg-amber-600 text-white'
      : 'bg-red-500 hover:bg-red-600 text-white';

  const iconBg =
    variant === 'warning' ? 'bg-amber-100' : 'bg-red-100';

  const iconColor =
    variant === 'warning' ? 'text-amber-600' : 'text-red-500';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5"
          >
            {/* Icon + close */}
            <div className="flex items-start justify-between">
              <div className={`w-12 h-12 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
                {variant === 'danger'
                  ? <Trash2 className={`w-6 h-6 ${iconColor}`} />
                  : <AlertTriangle className={`w-6 h-6 ${iconColor}`} />
                }
              </div>
              <button
                onClick={onCancel}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Text */}
            <div>
              <p className="text-base font-bold text-slate-900">{title}</p>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{message}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => { onConfirm(); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${confirmStyles}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
