// Offline cache. Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'v2';
const CACHE = 'mozgalice-' + VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/common.css',
  'js/scores.js',
  'js/config.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'games/sudoku/',
  'games/sudoku/index.html',
  'games/sudoku/sudoku.css',
  'games/sudoku/sudoku.js',
  'games/sudoku/engine.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mozgalice-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive when online), cache as fallback (so it works offline).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
