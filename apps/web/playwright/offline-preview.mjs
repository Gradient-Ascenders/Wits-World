import { build } from 'vite';
import { createServer } from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import { createStaticServer } from '../server.mjs';
import process from 'node:process';

// Keep the build/preview in one process so Windows test cleanup does not leave
// nested npm preview processes holding the port open.
await build({
  mode: 'basic-e2e',
  build: { outDir: 'dist-e2e/before' },
  plugins: [
    {
      name: 'offline-update-fixture',
      transform(code, id) {
        if (id.endsWith('/src/pages/ExplorePage.tsx'))
          return `${code}\nwindow.dispatchEvent(new Event('offline-fixture-before'));`;
      },
    },
  ],
});
await build({ mode: 'basic-e2e', build: { outDir: 'dist-e2e/after' } });
const handlers = Object.fromEntries(
  [
    ['before', 'dist-e2e/before'],
    ['after', 'dist-e2e/after'],
  ].map(([version, directory]) => {
    const app = createStaticServer({
      rootDirectory: fileURLToPath(new URL(`../${directory}`, import.meta.url)),
    });
    return [version, app.listeners('request')[0]];
  }),
);
let version = 'after';
const server = createServer(async (request, response) => {
  if (
    request.method === 'POST' &&
    request.url === '/__offline_test__/release'
  ) {
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (input.version === 'before' || input.version === 'after')
      version = input.version;
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({ version }));
    return;
  }
  handlers[version](request, response);
});
server.listen(4180, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
