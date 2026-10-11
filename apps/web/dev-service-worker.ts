import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import type { Plugin } from 'vite';

// A production worker can outlive the preview server on this origin. Serve an
// update at its existing URL so it cannot keep returning the old cached shell
// when Vite is running. This middleware is never included in a production build.
export function retireDevelopmentServiceWorker(): Plugin {
  const script = readFileSync(
    new NodeURL('./worker/retire-dev-worker.js', import.meta.url),
    'utf8',
  );
  return {
    name: 'wits-world-retire-development-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          !['GET', 'HEAD'].includes(request.method ?? '') ||
          request.url?.split('?')[0] !== '/sw.js'
        ) {
          next();
          return;
        }
        response.setHeader('Content-Type', 'application/javascript');
        response.setHeader('Cache-Control', 'no-store');
        response.end(request.method === 'HEAD' ? undefined : script);
      });
    },
  };
}
