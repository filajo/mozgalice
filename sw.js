// Offline cache. Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'v16';
const CACHE = 'mozgalice-' + VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/common.css',
  'js/scores.js',
  'js/config.js',
  'js/hub.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'games/sudoku/',
  'games/sudoku/index.html',
  'games/sudoku/sudoku.css',
  'games/sudoku/sudoku.js',
  'games/sudoku/engine.js',
  'games/krizaljka/',
  'games/krizaljka/index.html',
  'games/krizaljka/krizaljka.css',
  'games/krizaljka/krizaljka.js',
  'games/krizaljka/engine.js',
  'games/krizaljka/words.js',
  'games/cesta/',
  'games/cesta/index.html',
  'games/cesta/cesta.css',
  'games/cesta/cesta.js',
  'games/cesta/engine.js',
  'games/cesta/questions.js'
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
    // no-cache: always revalidate with the server, so a new version is not hidden behind the browser's HTTP cache.
    fetch(e.request, { cache: 'no-cache' })
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
