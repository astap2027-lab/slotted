// Offline support: serve the app shell from cache, update in the background.
const CACHE = 'slotted-v28';
const SHELL = ['./', './index.html', './styles.css', './js/app.js', './js/scheduler.js', './js/progress.js', './js/stats.js', './js/exercises.js', './js/units.js', './js/tracking.js', './js/timetable.js', './js/adjust.js', './js/freshness.js', './js/anatomy.js', './js/workout.js', './js/readiness.js', './js/coach.js', './js/store.js', './privacy', './js/sync.js', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Cloudflare Pages redirects /privacy.html to /privacy (and /index.html to /). Browsers refuse a
// redirected response for a page load, so hand back a plain copy instead.
const plain = (res) => (res && res.redirected
  ? res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }))
  : res);

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
        return plain(res);
      }).catch(() => plain(cached));
      return cached ? plain(cached) : fresh;
    })
  );
});
