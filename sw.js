// Service worker Kawal ERP.
// - Fail app (same-origin): RANGKAIAN DULU (sentiasa versi terkini bila online, elak fail lama
//   bercampur dengan fail baru), simpan salinan untuk kegunaan offline.
// - CDN (Tailwind, font, html2pdf): cache dulu, kemas kini di latar belakang.
// Data app ada dalam localStorage peranti, jadi semua modul berfungsi offline.

const VERSION = 'v1';
const APP_CACHE = `kawal-app-${VERSION}`;
const CDN_CACHE = `kawal-cdn-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  ...[
    'app', 'audit', 'auth', 'billing', 'cash', 'charts', 'customers', 'db', 'fraud', 'jobs',
    'metrics', 'products', 'sales', 'search', 'session', 'settings', 'share', 'stock', 'ui',
    'views-alerts', 'views-billing', 'views-crm', 'views-jobs', 'views-sales', 'views-stock',
  ].map((f) => `./js/${f}.js`),
];

const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(APP_CACHE)
      // Satu fail gagal tidak patut gagalkan pemasangan
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![APP_CACHE, CDN_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    // no-cache: semak dengan server, abaikan cache HTTP lama GitHub Pages
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
