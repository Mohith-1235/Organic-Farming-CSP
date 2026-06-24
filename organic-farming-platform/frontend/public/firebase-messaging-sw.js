/**
 * Firebase Messaging Service Worker
 * 
 * Handles background push notifications from Firebase Cloud Messaging.
 * This file MUST be in the public/ folder and served from the root of the domain.
 */

/* eslint-disable no-undef */

// Import Firebase scripts (compat versions for service worker)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Firebase config — must match your frontend config
// These values are safe to expose (they are not secrets)
const firebaseConfig = {
  apiKey: self.__FIREBASE_CONFIG__?.apiKey || '',
  authDomain: self.__FIREBASE_CONFIG__?.authDomain || '',
  projectId: self.__FIREBASE_CONFIG__?.projectId || '',
  storageBucket: self.__FIREBASE_CONFIG__?.storageBucket || '',
  messagingSenderId: self.__FIREBASE_CONFIG__?.messagingSenderId || '',
  appId: self.__FIREBASE_CONFIG__?.appId || '',
};

// Only initialize if we have valid config
let messagingInitialized = false;

try {
  // Check if config looks valid
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    firebase.initializeApp(firebaseConfig);
    messagingInitialized = true;
  }
} catch (err) {
  console.log('[SW] Firebase init skipped:', err.message);
}

if (messagingInitialized) {
  const messaging = firebase.messaging();

  // Handle background messages
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] 📩 Background message received:', payload);

    const notificationTitle = payload.notification?.title || 'BioFarm Alert 🌾';
    const notificationOptions = {
      body: payload.notification?.body || 'You have a new notification',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200],
      tag: 'biofarm-notification-' + Date.now(),
      requireInteraction: false,
      data: {
        url: payload.data?.click_action || '/',
        ...payload.data
      },
      actions: [
        {
          action: 'open',
          title: '🌾 Open BioFarm',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        }
      ]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already a BioFarm tab open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new tab
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle service worker install
self.addEventListener('install', (event) => {
  console.log('[SW] Firebase Messaging SW installed');
  self.skipWaiting();
});

// Handle service worker activate
self.addEventListener('activate', (event) => {
  console.log('[SW] Firebase Messaging SW activated');
  event.waitUntil(clients.claim());
});
