/* T1P Cash Engine service worker.
   Goal: open instantly, and still open with the last synced book when there is
   no signal. Never caches Supabase traffic — stale policy data would be a lie. */
const VERSION = 'v1';
const SHELL = 't1p-shell-' + VERSION;
const RUNTIME = 't1p-runtime-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll fails the whole install if any single item 404s; be forgiving
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Hosts whose assets are safe to serve from cache when offline.
const CACHEABLE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept the database or auth. Let it fail honestly when offline so
  // the app falls back to its local mirror instead of showing stale rows.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Navigations: network first so a deploy shows up, cache as the safety net.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const cdn = CACHEABLE_HOSTS.includes(url.hostname);
  if (!sameOrigin && !cdn) return;

  // Everything else: serve from cache instantly, refresh in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(sameOrigin ? SHELL : RUNTIME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
