// HDMS GIS High-Performance Map Tile & Offline Service Worker
const CACHE_NAME = 'hdms-gis-v2';
const TILE_CACHE_NAME = 'hdms-tiles-v2';
const MAX_TILE_ENTRIES = 800;

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event & clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== TILE_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch event: Cache-First for Map Tiles, Network-First for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Map Tiles (OpenStreetMap, Google Hybrid Satellite, Longdo Map)
  const isMapTile =
    url.hostname.includes('tile.openstreetmap.org') ||
    (url.hostname.includes('google.com') && url.pathname.includes('/vt')) ||
    url.hostname.includes('longdo.com');

  if (isMapTile) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const networkRes = await fetch(event.request, { mode: 'no-cors' });
          if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
            cache.put(event.request, networkRes.clone());
            trimCache(TILE_CACHE_NAME, MAX_TILE_ENTRIES);
          }
          return networkRes;
        } catch (e) {
          return cached || fetch(event.request);
        }
      })
    );
    return;
  }

  // 2. Default pass-through for other requests
});

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
    }
  } catch (e) {}
}
