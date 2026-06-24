/**
 * Firebase SDK Initialization for Frontend
 * 
 * This module initializes the Firebase app and provides
 * FCM (Firebase Cloud Messaging) utilities for push notifications.
 * 
 * Gracefully handles missing config — the app works without Firebase.
 */

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Check if Firebase is properly configured
const isFirebaseConfigured = () => {
  return (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== 'your-api-key-here' &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'your-project-id' &&
    vapidKey &&
    vapidKey !== 'your-vapid-key-here'
  );
};

let app = null;
let messaging = null;

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    console.log('[Firebase] ✅ Initialized successfully');
  } catch (err) {
    console.warn('[Firebase] ⚠️ Failed to initialize:', err.message);
  }
} else {
  console.log('[Firebase] ℹ️ Not configured — using fallback notifications.');
  console.log('[Firebase] Set VITE_FIREBASE_* env vars to enable push notifications.');
}

/**
 * Request notification permission and get an FCM token.
 * 
 * @returns {Promise<string|null>} FCM token, or null if unavailable
 */
export async function requestFCMToken() {
  if (!messaging) {
    console.log('[FCM] Firebase not initialized, falling back to native notifications.');
    return null;
  }

  try {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.warn('[FCM] Service workers not supported');
      return null;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Notification permission denied');
      return null;
    }

    // Register the service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });

    console.log('[FCM] Service worker registered:', registration.scope);

    // Get the FCM token
    const token = await getToken(messaging, {
      vapidKey: vapidKey,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log('[FCM] ✅ Token received:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.warn('[FCM] No registration token available');
      return null;
    }
  } catch (err) {
    console.error('[FCM] ❌ Error getting token:', err);
    return null;
  }
}

/**
 * Listen for foreground FCM messages.
 * 
 * @param {function} callback - Called with { title, body, data } when a message arrives
 * @returns {function|null} Unsubscribe function, or null
 */
export function onFCMMessage(callback) {
  if (!messaging) return null;

  return onMessage(messaging, (payload) => {
    console.log('[FCM] 📩 Foreground message received:', payload);

    const title = payload.notification?.title || 'BioFarm Notification';
    const body = payload.notification?.body || '';
    const data = payload.data || {};

    callback({ title, body, data });
  });
}

/**
 * Check if Firebase/FCM is available.
 */
export function isFCMAvailable() {
  return messaging !== null;
}

export { app, messaging };
