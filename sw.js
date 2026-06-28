/* Service worker — maakt de app offline beschikbaar.
   - App-shell (eigen bestanden + Leaflet) wordt vooraf gecachet.
   - Kaarttegels (OSM) worden runtime gecachet: gebieden die je online bekeek,
     blijven offline beschikbaar. (Een heel gebied vooraf downloaden zit niet in
     deze prototype-versie — zie README.) */

const SHELL = 'wandelapp-shell-v10';
const TILES = 'wandelapp-tiles-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './api.js',
  './sync.js',
  './events.js',
  './profile.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) =>
      // individueel toevoegen zodat één mislukte CDN-fetch de install niet breekt
      Promise.all(SHELL_ASSETS.map((u) =>
        c.add(u).catch((err) => console.warn('cache mislukt:', u, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // API-verzoeken nooit cachen (altijd live data van de server).
  if (url.pathname.startsWith('/api/')) return;
  // Server-thumbnails: laat de browser/HTTP-cache dit afhandelen.
  if (url.pathname.startsWith('/uploads/')) return;

  // Kaarttegels: cache-first, vul aan tijdens gebruik
  if (/tile\.openstreetmap\.org/.test(url.hostname)) {
    e.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // App-shell + overige: cache-first met netwerk-fallback
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
