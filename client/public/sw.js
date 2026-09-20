/* Lar service worker: makes the app installable and keeps the shell loading
   when the network is slow. Data always comes from the server. */
const VERSION = 'lar-v3';
const CORE = ['/', '/today', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        await cache.addAll(CORE);
        // Vite fingerprints the JS and CSS filenames. Discover and warm those
        // assets so the first installed launch also works without a connection.
        const shell = await cache.match('/');
        if (!shell) return;
        const html = await shell.text();
        const assets = [...new Set(html.match(/\/assets\/[A-Za-z0-9._-]+/g) ?? [])];
        await Promise.all(assets.map((asset) => cache.add(asset)));
      })
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp') || url.pathname.startsWith('/calendar/')) return;

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Everything else (the page shell, icons, manifest): network first, cached copy as fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic' && new URL(res.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req.mode === 'navigate' ? '/' : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req)),
  );
});
