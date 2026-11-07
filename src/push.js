// Browser push (works with the tab closed). Needs VITE_FIREBASE_VAPID_KEY.
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const config = {
  apiKey: 'AIzaSyDazYLIHI4kpcwHwLORXgb8UXtAeJAmO1Y',
  authDomain: 'dezartwash.firebaseapp.com',
  projectId: 'dezartwash',
  storageBucket: 'dezartwash.firebasestorage.app',
  messagingSenderId: '977338397705',
  appId: '1:977338397705:web:63d275c3256341ab9574d8',
};

export async function enablePush(sb, userId, onForeground) {
  try {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey || !(await isSupported()) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return;
    const app = initializeApp(config);
    const messaging = getMessaging(app);
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (token) {
      await sb.from('device_tokens').upsert({ token, user_id: userId, platform: 'web' }, { onConflict: 'token' });
    }
    onMessage(messaging, (p) => onForeground?.(p.notification));
  } catch (e) {
    console.warn('Push not enabled', e);
  }
}
