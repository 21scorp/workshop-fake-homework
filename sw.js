/**
 * sw.js — offline shell.
 *
 * Cache-first for the app shell (it's a handful of small text files and never
 * changes between deploys within a version), network-first for everything else.
 * Bump CACHE to invalidate.
 */

const CACHE = 'astrafall-v0.9.0';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/base.css',
  './styles/ui.css',
  './styles/screens.css',
  './src/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      // Stale-while-revalidate: instant load, fresh next time.
      return cached || network;
    }),
  );
});
