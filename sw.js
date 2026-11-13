/* ==================================================================
   DAS Studio service worker (ITEM 45)
   ==================================================================
   What it caches: the app shell only — index.html, style.css, config.js,
   script.js, the icons, and the Google Fonts CSS/font files that were actually
   requested. The tools themselves are separate sites and are not cached.

   Strategy
     navigation (HTML) : network first, cache as the offline fallback
     static assets     : stale-while-revalidate
     Firebase / gstatic / analytics : never cached, never intercepted

   IMPORTANT: bump CACHE_VERSION on every deploy. That is the only thing that
   evicts the old shell — otherwise an admin can be served yesterday's
   script.js and the panel silently disagrees with Firestore.
   ================================================================== */

var CACHE_VERSION = 'das-v1';
var SHELL = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './script.js',
  './ds.png'
];

/* third-party hosts this worker must stay out of the way of */
function isBypassed(url) {
  return /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google-analytics\.com|googletagmanager\.com|analytics\.google\.com)$/
    .test(url.hostname);
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      /* one missing file must not abort the whole install */
      .then(function (cache) {
        return Promise.all(SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE_VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin && isBypassed(url)) return;

  /* HTML: network first, so a deploy is picked up immediately; the cached copy
     is only the offline fallback. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put('./index.html', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (hit) {
            return hit || new Response('<h1>Offline</h1><p>DAS Studio is offline and no cached copy is available yet.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
          });
        })
    );
    return;
  }

  /* everything else: serve the cache, refresh it in the background */
  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
