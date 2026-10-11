// Vite serves this at the production worker's URL during development only.
// Leave saved gameplay data and caches intact; the development page has no PWA.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      await Promise.allSettled(
        clients.map((client) => {
          const url = new URL(client.url);
          // Return public Home to Vite immediately. Other pages may contain
          // answers, drafts or map state, so leave their documents running.
          if (
            url.origin === self.location.origin &&
            ['/', '/about'].includes(url.pathname)
          ) {
            return client.navigate(client.url);
          }
        }),
      );
    })(),
  );
});
