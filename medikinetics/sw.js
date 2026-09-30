// Medikinetics Service Worker v5
// VERSION drives the cache key AND the version label shown in index.html.
// Do not edit VERSION manually — .github/workflows/version-stamp.yml updates
// both this constant and the #version-label fallback in index.html on every
// push to main.
const VERSION = 'medikinetics-20260926.0015';
const CACHE = VERSION;

const APP_ROOT = self.registration.scope;
const APP_SHELL = new URL('index.html', APP_ROOT).href;
const PRECACHE_URLS = [
  new URL('fonts/dm-mono-400.woff2',        APP_ROOT).href,
  new URL('fonts/dm-mono-500.woff2',        APP_ROOT).href,
  new URL('fonts/space-grotesk-600.woff2',  APP_ROOT).href,
  new URL('manifest.webmanifest',           APP_ROOT).href,
  new URL('icons/icon.svg',                 APP_ROOT).href,
  new URL('icons/icon-192.png',             APP_ROOT).href,
  new URL('icons/icon-512.png',             APP_ROOT).href,
  new URL('icons/apple-touch-icon.png',     APP_ROOT).href,
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Medikinetics offline</title>
<style>
  html, body {
    margin: 0;
    height: 100%;
    background: #080d17;
    color: #dce8f5;
    font-family: system-ui, sans-serif;
  }
  body {
    display: grid;
    place-items: center;
    padding: 24px;
    text-align: center;
  }
  main {
    max-width: 320px;
  }
  h1 {
    font-size: 20px;
    margin-bottom: 8px;
  }
  p {
    color: #8ba3be;
    line-height: 1.45;
  }
</style>
</head>
<body>
<main>
  <h1>Medikinetics is offline</h1>
  <p>The app shell was not cached yet. Open Medikinetics once while online, then try again offline.</p>
</main>
</body>
</html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function putShell(response) {
  const cache = await caches.open(CACHE);
  await cache.put(APP_SHELL, response.clone());
  await cache.put(APP_ROOT, response.clone());
}

async function getCachedShell(request) {
  const cache = await caches.open(CACHE);

  return (
    await cache.match(request, { ignoreSearch: true }) ||
    await cache.match(APP_ROOT) ||
    await cache.match(APP_SHELL)
  );
}

async function fetchAndCacheShell(request) {
  const response = await fetch(request, { cache: 'reload' });

  if (!response || !response.ok) {
    throw new Error(`Shell fetch failed: ${response && response.status}`);
  }

  await putShell(response);
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(APP_SHELL, { cache: 'reload' });

    if (!response || !response.ok) {
      throw new Error(`Install shell fetch failed: ${response && response.status}`);
    }

    await putShell(response);

    const cache = await caches.open(CACHE);
    await Promise.all(
      PRECACHE_URLS.map(url =>
        fetch(url, { cache: 'reload' })
          .then(r => { if (r.ok) cache.put(url, r); })
          .catch(() => {})
      )
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== CACHE)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

    const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    all.forEach(c => c.postMessage({ type: 'VERSION', version: VERSION.replace(/^medikinetics-/, '') }));
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const cached = await getCachedShell(event.request);

        if (cached) {
          event.waitUntil(
            fetchAndCacheShell(event.request).catch(() => null)
          );

          return cached;
        }

        return await fetchAndCacheShell(event.request);
      } catch (error) {
        return offlineResponse();
      }
    })());

    return;
  }

  event.respondWith((async () => {
    try {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone()); // fire-and-forget
      }
      return response;
    } catch (error) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
