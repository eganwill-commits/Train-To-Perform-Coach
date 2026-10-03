const CACHE_NAME = "t2p-v2";
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

/*
  Phone notifications (see lib/push.js and app/api/push/notify).
  The payload carries the athlete-app page to open and, for an exercise comment,
  the block id, so tapping the notification lands on the thing it is about.
*/
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Train To Perform", body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Train To Perform";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "t2p",
    renotify: true,
    data: { page: data.page || "my-program", refId: data.refId || null },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { page, refId } = e.notification.data || {};
  const url = "/?page=" + encodeURIComponent(page || "my-program") + (refId ? "&ref=" + encodeURIComponent(refId) : "");
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        c.postMessage({ type: "t2p-nav", page, refId });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
