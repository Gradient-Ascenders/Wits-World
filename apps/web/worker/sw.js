const manifest = self.__WB_MANIFEST;
const name = crypto.subtle
  .digest('SHA-256', new TextEncoder().encode(JSON.stringify(manifest)))
  .then(
    (hash) =>
      'wits-world-shell-' +
      Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
  );
const paths = new Set(
  manifest.map((entry) => new URL(entry.url, self.location.origin).pathname),
);
self.addEventListener('install', (event) => {
  event.waitUntil(
    name.then(async (key) => {
      const cache = await caches.open(key);
      await cache.addAll(
        [
          ...new Map(
            manifest
              .filter((entry) => entry.precache !== false)
              .map((entry) => [entry.url, entry]),
          ).values(),
        ].map(
          (entry) =>
            new Request(entry.url, {
              // Hashed assets are immutable. Reuse their HTTP cache on
              // installation/upgrade; revalidate revisioned public files.
              cache: entry.revision == null ? 'default' : 'reload',
            }),
        ),
      );
    }),
  );
});
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
  if (event.data === 'CHECK_OFFLINE_SHELL' && event.ports?.[0]) {
    event.waitUntil(
      name
        .then(async (key) => {
          const cache = await caches.open(key);
          const files = await Promise.all(
            manifest
              .filter((entry) => entry.precache !== false)
              .map((entry) => cache.match(entry.url, { ignoreVary: true })),
          );
          event.ports[0].postMessage({ ready: files.every(Boolean) });
        })
        .catch(() => event.ports[0].postMessage({ ready: false })),
    );
  }
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    name.then(async (key) => {
      const shells = (await caches.keys()).filter(
        (existing) =>
          existing.startsWith('wits-world-shell-') && existing !== key,
      );
      // A page may start navigating while the new worker takes control. Keep
      // one previous build so its already-loaded entry can resolve old chunks.
      let previous;
      for (const existing of [...shells].reverse()) {
        if (await (await caches.open(existing)).match('index.html')) {
          previous = existing;
          break;
        }
      }
      for (const existing of shells) {
        if (existing !== previous) await caches.delete(existing);
      }
      await self.clients.claim();
    }),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // The saved application must open even when a connected network stalls.
      // Assets are versioned and worker updates check for a newer shell.
      (async () => {
        const cache = await caches.open(await name);
        const shell = await cache.match('index.html');
        return shell || fetch(event.request);
      })(),
    );
  } else if (
    !url.search &&
    (paths.has(url.pathname) || url.pathname.startsWith('/assets/'))
  ) {
    event.respondWith(
      name.then(async (key) => {
        const cache = await caches.open(key);
        // Module requests carry Origin while installation requests do not.
        const cached = await cache.match(event.request, { ignoreVary: true });
        if (cached) return cached;
        for (const previous of await caches.keys()) {
          if (previous.startsWith('wits-world-shell-') && previous !== key) {
            const saved = await (
              await caches.open(previous)
            ).match(event.request, { ignoreVary: true });
            if (saved) return saved;
          }
        }
        // Unknown URLs can only read a previously allowlisted cached asset.
        if (!paths.has(url.pathname)) return fetch(event.request);
        // Only exact build-allowlisted, same-origin asset URLs reach here.
        // Retain successfully requested deferred modules for offline revisits.
        const response = await fetch(event.request);
        if (response.status === 200 && response.type === 'basic') {
          event.waitUntil(
            cache.put(event.request, response.clone()).catch(() => {}),
          );
        }
        return response;
      }),
    );
  }
});
