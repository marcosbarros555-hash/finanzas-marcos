// Service worker — hace la app instalable y cachea el "shell" para que abra offline.
// Estrategia: network-first en archivos propios (siempre traés lo último online,
// y si no hay red, cae al cache). Lo de afuera (Supabase, esm.sh, APIs de precios)
// pasa directo sin tocar, para que los datos sean siempre en vivo.
const CACHE = 'finanzas-v2';
const CORE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase / esm.sh / precios: en vivo

  e.respondWith(
    fetch(request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
  );
});
