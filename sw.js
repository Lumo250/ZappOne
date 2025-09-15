const CACHE_NAME = 'ZappZen-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
const OFFLINE_URL = '/index.html';

// Installazione: cache dei file statici
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Attivazione: pulizia vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

// Intercetta fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      // Se trovato in cache, restituisci cache
      if (cached) return cached;

      // Altrimenti prova la rete, fallback offline se non raggiungibile
      return fetch(event.request).catch(() => caches.match(OFFLINE_URL));
    })
  );
});
