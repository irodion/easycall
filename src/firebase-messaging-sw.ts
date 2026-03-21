/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare let self: ServiceWorkerGlobalScope;

// Activate immediately so installed PWAs pick up updates without closing all tabs.
// The client-side useServiceWorkerUpdate hook defers the page reload until calls end.
self.skipWaiting();
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const { callerName, callerPhoto, roomId } = payload.data ?? {};
  void self.registration.showNotification(`${callerName ?? 'Someone'} is calling!`, {
    body: 'Tap to answer',
    icon: callerPhoto || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'incoming-call',
    requireInteraction: true,
    data: { roomId },
  } as NotificationOptions);
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as Record<string, unknown> | undefined;
  const roomId = typeof data?.roomId === 'string' ? data.roomId : null;
  const url = roomId ? `/call-room/${roomId}` : '/elderly';
  event.waitUntil(self.clients.openWindow(url));
});

export type {};
