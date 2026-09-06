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
        [...new Set(manifest.map((entry) => entry.url))].map(
          (url) => new Request(url, { cache: 'reload' }),
        ),
      );
    }),
  );
});
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    name.then(async (key) => {
      for (const existing of await caches.keys()) {
        if (existing.startsWith('wits-world-shell-') && existing !== key)
          await caches.delete(existing);
      }
      await self.clients.claim();
    }),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.search
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(await name);
        return (await cache.match('index.html')) || Response.error();
      }),
    );
  } else if (paths.has(url.pathname)) {
    event.respondWith(
      name.then(
        async (key) =>
          // Only immutable, build-allowlisted same-origin assets reach here.
          // Module requests carry Origin while precache requests do not.
          (await (
            await caches.open(key)
          ).match(event.request, { ignoreVary: true })) || fetch(event.request),
      ),
    );
  }
});
