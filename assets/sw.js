/** OTTM3's build step replaces this token in dist/sw.js. */
const BUILD = "__OTTM3_BUILD__";
const CACHE_PREFIX = "ottm3-shell-";
const CACHE = `${CACHE_PREFIX}${BUILD}`;
const APP_SHELL = "./";
const PRECACHE_MANIFEST = "./precache-manifest.json";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(PRECACHE_MANIFEST, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`OTTM3 precache manifest failed: ${response.status}`);
      }

      const manifest = await response.json();
      const urls = Array.isArray(manifest.urls)
        ? [...new Set(manifest.urls.filter((url) => typeof url === "string" && url.startsWith("./")))]
        : [];
      if (manifest.build !== BUILD || urls.length === 0) {
        throw new Error("OTTM3 precache manifest does not match this build");
      }

      const cache = await caches.open(CACHE);
      try {
        // addAll rejects as a unit; deleting on failure also protects against
        // a partial cache left behind by an interrupted browser process.
        await cache.addAll(urls);
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (
    request.method !== "GET" ||
    url.origin !== scope.origin ||
    !url.pathname.startsWith(scope.pathname)
  ) {
    return;
  }

  // Navigations are network-first so a new Pages deployment lands promptly.
  // The complete, revisioned app shell is the deterministic offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(APP_SHELL, response.clone());
          return response;
        } catch {
          const cached = await cache.match(request, {
            ignoreSearch: true,
            ignoreVary: true,
          });
          return cached ?? (await cache.match(APP_SHELL, { ignoreVary: true })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed scripts plus images/audio/shaders are cache-first and may fill the
  // current OTTM3 cache at runtime. Other apps' origin caches are never read.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Module scripts can arrive with an Origin header that was absent from
      // the worker's install-time request. Inside this isolated revision cache,
      // URL identity is authoritative and avoids a false miss on Vary: Origin.
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })(),
  );
});
