const CACHE = "emoji-id-media-v1";
const HOST = "id-emoji-api.kupulluyc1242.workers.dev";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.hostname !== HOST || url.pathname !== "/api/file") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") {
      const copy = response.clone();
      event.waitUntil((async () => {
        try {
          await cache.put(request, copy);
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - 400))) await cache.delete(key);
        } catch {}
      })());
    }
    return response;
  })());
});
