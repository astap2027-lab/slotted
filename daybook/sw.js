// Daybook offline support: keeps the app's files so it opens without internet.
// Pages and scripts come from the network first (so updates arrive straight away),
// falling back to the saved copy when offline. Your tasks are never stored here.
const CACHE = 'daybook-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'core.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('daybook-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await Promise.race([
        fetch(e.request, { cache: 'no-cache' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),
      ]);
      if (fresh.ok) cache.put(e.request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
    }
  })());
});

// A button on a reminder notification: tell the open app, or open it.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data?.id;
  const action = e.action || 'open';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => new URL(c.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (client) {
      client.postMessage({ type: 'notification', action, id });
      return client.focus();
    }
    if (id) return self.clients.openWindow(`./?act=${encodeURIComponent(action)}&id=${encodeURIComponent(id)}`);
    return self.clients.openWindow('./');
  })());
});
