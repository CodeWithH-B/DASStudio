/* ==================================================================
   DAS Studio service worker
   ==================================================================
   Cache policy (rewritten after the cache-poisoning review):

     navigation (HTML)      network-first, cached per pathname, NEVER for
                            sensitive URLs (/admin*, ?admin=, ?ticket=)
     JS / CSS / HTML        network-first (code is never served stale-first)
     images / fonts         stale-while-revalidate (immutable by content hash)
     Firebase / GA / gstatic CSS+SDK  never intercepted at all
     any response with Cache-Control: no-store (or private)  never cached

   Why network-first for code: with stale-while-revalidate, one compromised
   script.js was cached in every browser and kept running until CACHE_VERSION
   was bumped by hand. Network-first means an attacker's copy only survives
   while the network is down, and a normal deploy is picked up immediately.

   CACHE_VERSION is stamped at build time (tools/stamp-sw.js) — do not edit it
   by hand. An unstamped file keeps the placeholder and says so in the console.
   ================================================================== */

var CACHE_VERSION = '__BUILD_ID__';     /* replaced by tools/stamp-sw.js */
var CACHE_PREFIX = 'das-';
var SHELL = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './script.js',
  './ds.png'
];

/* ---- URL classification ------------------------------------------------ */

/* third-party hosts this worker must stay out of the way of */
function isBypassed(url) {
  return /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google-analytics\.com|googletagmanager\.com|analytics\.google\.com)$/
    .test(url.hostname);
}

/* URLs that must never enter the cache: an admin surface, a ticket link, or a
   one-shot admin bypass token. A shared computer must not leave them on disk. */
function isSensitive(url) {
  if (/(^|\/)admin(\.html?)?(\/|$)/i.test(url.pathname)) return true;
  if (/(^|\/)__\/auth\//i.test(url.pathname)) return true;
  if (/[?&](ticket|admin|token|code|key)=/i.test(url.search)) return true;
  if (/\/(sw|firebase-messaging-sw)\.js$/i.test(url.pathname)) return true;
  return false;
}

/* content that is safe to serve from cache first */
function isImmutable(url) {
  if (url.hostname === 'fonts.gstatic.com') return true;
  if (url.hostname === 'fonts.googleapis.com') return true;   /* hashed css */
  return /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico|bmp|mp4|webm|mp3)$/i.test(url.pathname);
}

/* code and documents: always revalidate with the network first */
function isCode(url) {
  return /\.(js|css|html?|json|webmanifest)$/i.test(url.pathname) ||
         url.pathname === '/' || url.pathname === '';
}

function noStore(res) {
  var cc = (res.headers.get('cache-control') || '').toLowerCase();
  return cc.indexOf('no-store') > -1 || cc.indexOf('private') > -1;
}

/* one cache entry per page, not per query string: ?utm_source=… must not create
   a new copy of the shell every time a campaign link is opened. The response the
   visitor receives is still the real one, query and all. */
function navKey(url) {
  return url.origin + (url.pathname || '/');
}

function offlineResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline — DAS Studio</title>' +
    '<style>body{font:16px/1.6 system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#070b16;color:#e7ecf6}' +
    'div{max-width:34rem;padding:2rem;text-align:center}h1{font-size:1.4rem}p{color:#9aa6bf}</style>' +
    '<div><h1>You are offline</h1><p>DAS Studio has not been cached in this browser yet. ' +
    'Reconnect once, then it will open without a network.</p></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

/* G5: font files are the one unbounded cache — a Google Fonts CSS can pull a
   dozen woff2 files per weight, and a theme switch pulls more. Keep the 20 most
   recently used font responses and drop the rest. */
var FONT_CACHE_MAX = 20;
function evictFonts(cache) {
  return cache.keys().then(function (reqs) {
    var fonts = reqs.filter(function (r) {
      try { return /\.(woff2?|ttf|otf)$/i.test(new URL(r.url).pathname); } catch (e) { return false; }
    });
    if (fonts.length <= FONT_CACHE_MAX) return;
    return Promise.all(fonts.slice(0, fonts.length - FONT_CACHE_MAX).map(function (r) { return cache.delete(r); }));
  }).catch(function () {});
}

/* ---- install / activate ------------------------------------------------ */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      /* one missing file must not abort the whole install */
      .then(function (cache) {
        return Promise.all(SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          /* only caches this worker created are ours to delete */
          if (k === CACHE_VERSION) return null;
          if (k.indexOf(CACHE_PREFIX) !== 0 && k !== '__BUILD_ID__') return null;
          return caches.delete(k);
        }));
      })
      .then(function () {
        if (CACHE_VERSION === '__BUILD_ID__') {
          try {
            console.warn('[DAS Studio] sw.js was not stamped by tools/stamp-sw.js — ' +
              'the cache name is not versioned, so run the build step before deploying.');
          } catch (e) {}
        }
        return self.clients.claim();
      })
  );
});

/* ---- fetch ------------------------------------------------------------- */

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* never touch Firebase, Google Analytics or the gstatic SDK */
  if (isBypassed(url)) return;

  /* range requests (video/audio seeking) are not cacheable here */
  if (req.headers.has('range')) return;

  /* ---------- 1. navigations ---------- */
  if (req.mode === 'navigate') {
    event.respondWith(
      (function () {
        /* sensitive pages: straight to the network, never cached, and no cached
           copy is used as a fallback either */
        if (isSensitive(url)) {
          return fetch(req).catch(function () { return offlineResponse(); });
        }
        return fetch(req).then(function (res) {
          if (res && res.ok && !noStore(res)) {
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function (c) {
              /* keyed by the real request path, NOT a hardcoded './index.html' */
              c.put(navKey(url), copy).catch(function () {});
            }).catch(function () {});
          }
          return res;
        }).catch(function () {
          return caches.match(navKey(url))
            .then(function (hit) { return hit || caches.match('./index.html'); })
            .then(function (hit) { return hit || offlineResponse(); });
        });
      })()
    );
    return;
  }

  /* ---------- 2. sensitive non-navigation requests ---------- */
  if (isSensitive(url)) return;

  /* ---------- 3. immutable assets: stale-while-revalidate ---------- */
  if (isImmutable(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var network = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque') && !noStore(res)) {
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function (c) {
              /* G5: keep the font cache bounded (LRU, 20 files) */
              return c.put(req, copy).then(function () { return evictFonts(c); }).catch(function () {});
            }).catch(function () {});
          }
          return res;
        }).catch(function () { return hit; });
        return hit || network;
      })
    );
    return;
  }

  /* ---------- 4. code and everything else: network-first ---------- */
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && !noStore(res) && isCode(url)) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy).catch(function () {}); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (isCode(url)) return caches.match(req, { ignoreSearch: true });
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
