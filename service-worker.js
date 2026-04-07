const OFFLINE_CACHE_PREFIX = "obg-offline-pack-";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function toAbsoluteUrl(rawUrl) {
  return new URL(rawUrl, self.registration.scope).toString();
}

async function getOfflineCacheNames() {
  const names = await caches.keys();
  return names.filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX)).sort().reverse();
}

async function matchOfflineCache(request) {
  const cacheNames = await getOfflineCacheNames();
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const match = await cache.match(request, { ignoreSearch: true });
    if (match) return match;
  }
  return null;
}

async function downloadOfflinePack(version, urls) {
  const cacheName = `${OFFLINE_CACHE_PREFIX}${String(version || "v1").trim() || "v1"}`;
  const cache = await caches.open(cacheName);
  const resolved = [...new Set((Array.isArray(urls) ? urls : []).map((url) => toAbsoluteUrl(url)).filter(Boolean))];
  await cache.addAll(resolved);
  const existing = await caches.keys();
  await Promise.all(
    existing
      .filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX) && name !== cacheName)
      .map((name) => caches.delete(name))
  );
  return resolved.length;
}

async function purgeOfflinePacks() {
  const names = await getOfflineCacheNames();
  await Promise.all(names.map((name) => caches.delete(name)));
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  const replyPort = event.ports && event.ports[0];
  const respond = (payload) => {
    if (replyPort) replyPort.postMessage(payload);
  };

  if (message.type === "DOWNLOAD_OFFLINE_PACK") {
    event.waitUntil(
      downloadOfflinePack(message.version, message.urls)
        .then((cached) => respond({ ok: true, cached }))
        .catch((error) => respond({ ok: false, error: error.message || "Failed to cache offline pack." }))
    );
    return;
  }

  if (message.type === "PURGE_OFFLINE_PACK") {
    event.waitUntil(
      purgeOfflinePacks()
        .then(() => respond({ ok: true }))
        .catch((error) => respond({ ok: false, error: error.message || "Failed to purge offline caches." }))
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data/site-config.json")) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cached = await matchOfflineCache(request);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cached = await matchOfflineCache(new Request(toAbsoluteUrl("./index.html")));
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await matchOfflineCache(request);
    if (cached) return cached;
    return fetch(request);
  })());
});
