import { createStaticServer } from '../server.mjs';
import { createServer } from 'node:http';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';

// Local fixture server only. Reuse production compression/cache headers and
// record bytes actually sent, including worker requests invisible to page timing.
const roots = {
  before: process.env.PRECACHE_BEFORE_DIRECTORY,
  after: process.env.PRECACHE_AFTER_DIRECTORY,
};
if (!roots.before || !roots.after)
  throw new Error('Both fixture builds are required');
const handlers = Object.fromEntries(
  Object.entries(roots).map(([version, rootDirectory]) => {
    const app = createStaticServer({ rootDirectory });
    return [version, app.listeners('request')[0]];
  }),
);
let version = process.env.PRECACHE_INITIAL_VERSION ?? 'after';
let fail = '';
let requests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname.startsWith('/__audit__/')) {
    if (request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body || '{}');
      if (pathname === '/__audit__/reset') requests = [];
      if (pathname === '/__audit__/failure') fail = input.prefix ?? '';
      if (
        pathname === '/__audit__/version' &&
        ['before', 'after'].includes(input.version)
      )
        version = input.version;
    }
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({ version, requests }));
    return;
  }
  const start = performance.now();
  let bodyBytes = 0;
  const end = response.end;
  response.end = function (chunk, ...args) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk))
      bodyBytes += Buffer.byteLength(chunk);
    return end.call(this, chunk, ...args);
  };
  response.on('finish', () =>
    requests.push({
      pathname,
      status: response.statusCode,
      bodyBytes,
      headerBytes: Buffer.byteLength(response._header ?? ''),
      startMs: start,
      durationMs: performance.now() - start,
    }),
  );
  if (fail && pathname.startsWith(fail)) {
    response.writeHead(503, { 'Cache-Control': 'no-store' });
    response.end('Controlled unavailable fixture');
    return;
  }
  handlers[version](request, response);
});
server.listen(5193, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => server.close(() => process.exit(0)));
