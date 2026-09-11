/* Minimal service worker — exists mainly to satisfy PWA/TWA installability requirements
   (a fetch handler + a manifest are what tools like PWABuilder/Lighthouse check for).
   Strategy is deliberately "network-first, cache as fallback" for the static app shell only,
   so it never risks serving stale Firebase data — Realtime Database traffic goes over its own
   WebSocket connection and isn't touched by this file at all. */

const CACHE_NAME = 'warehouse-audit-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // never intercept writes/API calls
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
