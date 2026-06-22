import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** True only when all required config values are present (env vars set on server). */
const isConfigValid = !!(
  firebaseConfig.projectId &&
  firebaseConfig.apiKey &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

const getApp = () => {
  if (!isConfigValid) return null;
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
};

export const getFirebaseMessaging = async () => {
  if (!isConfigValid) {
    console.warn('[Firebase] Missing config — push notifications disabled. Set VITE_FIREBASE_* env vars on the server.');
    return null;
  }
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const app = getApp();
    if (!app) return null;
    return getMessaging(app);
  } catch (err) {
    console.warn('[Firebase] getFirebaseMessaging failed:', err);
    return null;
  }
};

export default getApp() ?? null;
