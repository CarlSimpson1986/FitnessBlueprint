// Fitness Blueprint service worker.
//
// Deliberately minimal for v1: network-first for everything, falling
// back to cache when offline. This is enough to let the coach cockpit
// keep showing the last-loaded roster if the gym WiFi drops mid-session.
// The harder problem — queueing writes (attendance, notes) made while
// offline and syncing them once back online — belongs in the booking/
// cockpit feature work itself (e.g. via IndexedDB + a background sync
// event), not here. Don't reach for a caching library like Workbox
// until this simple version stops being enough.

const CACHE_NAME = "fitness-blueprint-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Never intercept API calls — they need real network semantics
  // (auth, freshness), not a stale cached JSON response.
  if (event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
