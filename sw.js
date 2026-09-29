// Waha — service worker: enables "Add to Home Screen" / PWA install AND
// makes the app shell (this is a single-page app, so effectively the
// whole app) actually available offline, which the in-app copy promises
// ("fully offline" relief exercises). Previous version never called
// caches.put(), so caches.match() always missed and offline use failed
// completely despite the app-shell being tiny and fully cacheable.
const CACHE_NAME = "waha-cache-v2";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only GET requests are cacheable; POSTs (the chat API) always go
  // straight to the network with no offline fallback — there is no
  // sensible cached answer for a chat message.
  if (req.method !== "GET") return;

  // Network-first, falling back to the cached app shell when offline so
  // returning users on a flaky or absent connection still get the app
  // (and therefore the offline-capable relief exercises), while online
  // users always get the latest deployed version.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
  );
});
