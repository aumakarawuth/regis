// sw.js — Service Worker for the admin dashboard PWA.
//
// Its job here isn't offline caching (admin.html is a live dashboard —
// caching stale student data would be actively wrong) — it exists so
// the page (a) qualifies as an installable PWA and (b) can receive Web
// Push messages and show a notification even when no admin.html tab is
// open. See js/admin.js's _enablePushNotifications() for the subscribe
// side and supabase/functions/notify-new-application for the send side.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// Network-first passthrough — no offline cache, just satisfies the
// "has a fetch handler" installability check some browsers still apply.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON payload, ignore */ }
  const title = data.title || '📝 มีใบสมัครใหม่';
  const options = {
    body: data.body || '',
    icon: 'assets/mascot-icon.png',
    badge: 'assets/mascot-icon.png',
    data: { url: data.url || '/admin.html' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        if (c.url.includes('admin.html') && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
