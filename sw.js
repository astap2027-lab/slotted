// Offline support: the app comes from the network when it can (so updates arrive straight away) and from the cache when offline.
const CACHE = 'slotted-v38';
const SHELL = ['./', './index.html', './styles.css', './js/app.js', './js/scheduler.js', './js/progress.js', './js/stats.js', './js/exercises.js', './js/units.js', './js/tracking.js', './js/ical.js', './js/timetable.js', './js/adjust.js', './js/freshness.js', './js/anatomy.js', './js/workout.js', './js/readiness.js', './js/coach.js', './js/store.js', './privacy', './js/sync.js', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

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

// The app itself (pages, scripts, styles) comes from the network first, so a new version shows up on the next
// load; the saved copy is used when offline or when the network is too slow. Icons and images come from the cache.
const APP_FILE = /\.(?:js|css|html|webmanifest)$/;
const SLOW_MS = 4000;
const save = (req, res) => {
  if (res && res.ok && new URL(req.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

function networkFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(plain(res)); } };
    const fromCache = () => caches.match(req).then((c) => c || (req.mode === 'navigate' ? caches.match('./') : null));
    const timer = setTimeout(() => fromCache().then(finish), SLOW_MS);
    fetch(req, { cache: 'no-cache' })
      .then((res) => { clearTimeout(timer); finish(save(req, res)); })
      .catch(() => { clearTimeout(timer); fromCache().then((c) => (c ? finish(c) : finish(Response.error()))); });
  });
}

function cacheFirst(req) {
  return caches.match(req).then((cached) => cached ? plain(cached) : fetch(req).then((res) => plain(save(req, res))));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never cache sign-in, sync, Strava or coach requests.
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== location.origin) return;
  const appFile = e.request.mode === 'navigate' || url.pathname.endsWith('/') || APP_FILE.test(url.pathname) || url.pathname === '/privacy';
  e.respondWith(appFile ? networkFirst(e.request) : cacheFirst(e.request));
});
