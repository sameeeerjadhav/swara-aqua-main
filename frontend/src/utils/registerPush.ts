import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging } from '../config/firebase';
import api from '../api/axios';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
  || 'BNutSNz9HosmoEOeGzgz2TibmCtwPBKpgJaq0ty57b0zL1PUHbKSX4bNOKlrvHW16Ej8n5TSdkjiOpVnDvj5eMk';

const SW_URL = '/firebase-messaging-sw.js';

/** Ensure the FCM service worker is active (required for background push when app is closed). */
export const ensureMessagingServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;

  let registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration?.active) {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  }
  await navigator.serviceWorker.ready;
  return registration;
};

/**
 * Request permission, obtain FCM token, and save it on the server.
 * Call after login and on app load so background notifications work.
 */
export const registerPushNotifications = async (
  requestPermission = true
): Promise<{ ok: boolean; token?: string; permission: NotificationPermission | 'unsupported'; reason?: string }> => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, permission: 'unsupported', reason: 'This browser does not support push notifications. Try Chrome or Edge.' };
  }

  try {
    let permission = Notification.permission;
    if (requestPermission && permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission === 'denied') {
      return { ok: false, permission, reason: 'Notifications are blocked. Tap the lock icon in the address bar and allow notifications, then try again.' };
    }
    if (permission !== 'granted') {
      return { ok: false, permission, reason: 'Notification permission was not granted.' };
    }

    const registration = await ensureMessagingServiceWorker();
    if (!registration) return { ok: false, permission, reason: 'Service worker could not be registered. Try refreshing the page.' };

    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      const hasCfg = !!(
        import.meta.env.VITE_FIREBASE_PROJECT_ID &&
        import.meta.env.VITE_FIREBASE_API_KEY
      );
      return {
        ok: false, permission,
        reason: hasCfg
          ? 'Push messaging is not supported in this browser. Try Chrome or Edge on Android/desktop.'
          : 'Firebase is not configured on this server. Contact the admin to set VITE_FIREBASE_* environment variables.',
      };
    }

    let token: string;
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
    } catch (tokenErr: any) {
      const msg = tokenErr?.message || '';
      if (msg.includes('permission') || msg.includes('denied')) {
        return { ok: false, permission, reason: 'Notifications blocked. Allow them in browser settings and reload.' };
      }
      console.error('[FCM] getToken failed:', tokenErr);
      return { ok: false, permission, reason: 'Could not get push token. Make sure you are on HTTPS and try refreshing.' };
    }

    if (!token) {
      console.warn('[FCM] No token — check VAPID key and Firebase console');
      return { ok: false, permission, reason: 'No push token received. Check Firebase console VAPID key configuration.' };
    }

    // Always sync token to server (user may have re-logged in on same device)
    await api.post('/notifications/register-token', { token, platform: 'web' });
    localStorage.setItem('fcm_token', token);
    console.log('[FCM] Token registered for background push');

    return { ok: true, token, permission };
  } catch (err: any) {
    console.error('[FCM] registerPushNotifications failed:', err);
    return { ok: false, permission: Notification.permission, reason: err?.message || 'Unexpected error enabling notifications.' };
  }
};
