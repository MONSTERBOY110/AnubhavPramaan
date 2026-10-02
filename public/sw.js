// AnubhavPramaan service worker (TRD M8): keeps the app shell, fonts and the pages the assessor has
// opened available with the network off. API calls are never cached: assessment data goes through
// the IndexedDB outbox, which syncs when the network returns.

const VERSION = "ap-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_TEXT = "Offline, and this page has not been opened on this device before.";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(["/fonts/noto-sans-latin.woff2", "/fonts/noto-sans-devanagari.woff2"])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  // Versioned build assets, fonts and evidence examples never change at a given URL: cache first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/evidence/")
  ) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages (and their React payloads): the network first, then the last copy this device saw.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(PAGES).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(
        async () =>
          (await caches.match(req)) ??
          new Response(OFFLINE_TEXT, {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }),
      ),
  );
});
