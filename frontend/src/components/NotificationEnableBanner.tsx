import { Bell, BellOff, BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { useNotificationCenter } from '../context/NotificationContext';

const BANNER_KEY = 'notif-banner-dismissed-v2';

export const NotificationEnableBanner = () => {
  const { permission, pushEnabled, enablePush, sseConnected } = useNotificationCenter();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(BANNER_KEY) === '1'
  );
  const [enabling, setEnabling] = useState(false);

  // If permission is already granted and push works, permanently record it and hide
  if (permission === 'granted' && pushEnabled) {
    if (localStorage.getItem(BANNER_KEY) !== '1') {
      localStorage.setItem(BANNER_KEY, '1');
    }
    return null;
  }

  if (dismissed || permission === 'unsupported') return null;

  const handleEnable = async () => {
    setEnabling(true);
    const result = await enablePush();
    setEnabling(false);
    // Always dismiss after the user interacts — they made their choice
    localStorage.setItem(BANNER_KEY, '1');
    setDismissed(true);
    if (!result.ok && Notification.permission === 'denied') {
      // Permission denied — browser settings message shown in UI
    }
  };

  const dismiss = () => {
    localStorage.setItem(BANNER_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="mx-4 mt-3 mb-1 flex items-start gap-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-aqua-50 px-4 py-3 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
        <BellRing className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800">Enable real-time alerts</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          Get notified for new orders, deliveries, and updates even when the app is closed.
          {sseConnected ? ' Live updates are on.' : ''}
        </p>
        <button
          type="button"
          onClick={handleEnable}
          disabled={enabling}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          <Bell className="w-3.5 h-3.5" />
          {enabling ? 'Enabling…' : permission === 'denied' ? 'Open browser settings' : 'Turn on notifications'}
        </button>
        {permission === 'denied' && (
          <p className="text-[10px] text-amber-700 mt-1">
            Blocked in browser. Tap the lock icon in the address bar → allow notifications.
          </p>
        )}
      </div>
      <button type="button" onClick={dismiss} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
