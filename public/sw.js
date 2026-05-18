const CACHE_NAME = "t2p-v1";
const PRECACHE = ["/"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Network-first for API and Supabase calls
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Cache-first for static assets
  if (e.request.destination === "image" || e.request.destination === "font" || e.request.destination === "style" || e.request.destination === "script") {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetched = fetch(e.request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return resp;
        });
        return cached || fetched;
      })
    );
    return;
  }
  // Network-first for HTML/navigation
  e.respondWith(
    fetch(e.request).then((resp) => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
