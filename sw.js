// Offline support: serve the app shell from cache, update in the background.
const CACHE = 'slotted-v18';
const SHELL = ['./', './index.html', './styles.css', './js/app.js', './js/scheduler.js', './js/progress.js', './js/stats.js', './js/exercises.js', './js/units.js', './js/tracking.js', './js/freshness.js', './js/anatomy.js', './js/workout.js', './js/readiness.js', './js/coach.js', './js/store.js', './privacy.html', './js/sync.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Never cache sign-in, sync, Strava or coach requests.
  if (new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fresh = fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
