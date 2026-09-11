/* Minimal service worker — exists mainly to satisfy PWA/TWA installability requirements
   (a fetch handler + a manifest are what tools like PWABuilder/Lighthouse check for).
   Strategy is deliberately "network-first, cache as fallback" for the static app shell only,
   so it never risks serving stale Firebase data — Realtime Database traffic goes over its own
   WebSocket connection and isn't touched by this file at all. */

const CACHE_NAME = 'warehouse-audit-shell-v2';
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

  const url = new URL(event.request.url);

  // Only handle plain same-origin static files. Firebase Authentication relies on its own
  // cross-origin requests (a helper iframe loaded from Google's servers) plus reserved
  // same-origin paths under /__/ (Firebase Hosting's auth handler) to manage sign-in — if a
  // service worker intercepts those, sign-in silently breaks. So we explicitly leave both alone
  // and only ever cache our own app shell.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__/')) return;

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
