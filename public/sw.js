/* ─── Startmine Service Worker ─── */
const CACHE_NAME = 'startmine-1774855684';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/inbox.html',
  '/manifest.json',
  '/css/base.css?v=1774855684',
  '/css/miro.css?v=1774855684',
  '/js/app.js?v=1774855684',
  '/js/miro-engine.js?v=1774855684',
  '/js/thumbnails.js?v=1774855684',
  '/js/outline.js?v=1774855684',
  '/js/alignment.js?v=1774855684',
];

// External CDN assets to cache
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js',
];

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all([
        cache.addAll(STATIC_ASSETS),
        // CDN assets: fetch and cache individually (cross-origin)
        ...CDN_ASSETS.map((url) =>
          fetch(url)
            .then((resp) => {
              if (resp.ok) return cache.put(url, resp);
            })
            .catch(() => {}) // Don't fail install if CDN unreachable
        ),
      ]);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (allow share target POST etc.)
  if (event.request.method !== 'GET') return;

  // Skip Firebase Realtime Database websocket / REST calls
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebasedatabase.app') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseinstallations.googleapis.com')) {
    return;
  }

  // Skip thumbnail/metadata APIs (jsonlink, wp.com mshots, thum.io, imgbb)
  if (url.hostname.includes('jsonlink.io') ||
      url.hostname.includes('wp.com') ||
      url.hostname.includes('thum.io') ||
      url.hostname.includes('imgbb.com')) {
    return;
  }

  // For Google Favicons: cache-first (they rarely change)
  if (url.hostname === 'www.google.com' && url.pathname.includes('/s2/favicons')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return resp;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // For Google Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return resp;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // For Firebase SDK (gstatic): cache-first
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return resp;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // For /inbox with query params (share target): network-first (must hit the page)
  if (url.origin === self.location.origin && url.pathname === '/inbox' && url.search) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/inbox.html'))
    );
    return;
  }

  // For local static assets: cache-first, fallback to network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return resp;
        }).catch(() => {
          // Fallback: if offline and requesting root, serve cached index
          if (url.pathname === '/') {
            return caches.match('/index.html');
          }
          if (url.pathname === '/inbox') {
            return caches.match('/inbox.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }
});
