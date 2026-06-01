/* Verminord service worker — minimal install-shell cache */
const VERSION = 'v26-2026-06-01-fix';
const CACHE = 'verminord-' + VERSION;
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/martin/',
  '/martin/index.html',
  '/martin/manifest.webmanifest',
  '/martin/icon-192.png',
  '/martin/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache Supabase, fonts, or 3rd-party CDN
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('supabase.in') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('unpkg.com')) {
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && (req.destination === 'document' ||
                       url.pathname.endsWith('.webmanifest') ||
                       url.pathname.endsWith('.png'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('/index.html')))
    );
  }
});
