import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { createStaticServer } from './server.mjs';

let baseUrl;
let rootDirectory;
let server;

before(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'wits-world-web-server-'));
  await mkdir(join(rootDirectory, 'assets'));
  await writeFile(
    join(rootDirectory, 'index.html'),
    '<!doctype html><title>Wits World</title><main>Application shell</main>',
  );
  await writeFile(
    join(rootDirectory, 'assets', 'main-12345678.js'),
    `console.log('compressed asset');\n${'const value = 1;\n'.repeat(200)}`,
  );
  await writeFile(
    join(rootDirectory, 'server.mjs'),
    'throw new Error("runtime source must not be public");',
  );

  server = createStaticServer({ rootDirectory });
  await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  await rm(rootDirectory, { recursive: true, force: true });
});

test('compresses and durably caches hashed production assets', async () => {
  const response = await get('/assets/main-12345678.js', {
    'Accept-Encoding': 'gzip',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-encoding'], 'gzip');
  assert.equal(
    response.headers['cache-control'],
    'public, max-age=31536000, immutable',
  );
  assert.match(gunzipSync(response.body).toString(), /compressed asset/);

  const cached = await get('/assets/main-12345678.js', {
    'Accept-Encoding': 'gzip',
    'If-None-Match': response.headers.etag,
  });
  assert.equal(cached.statusCode, 304);
});

test('serves uncached SPA navigation fallbacks', async () => {
  const response = await get('/explore');

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-cache');
  assert.match(response.body.toString(), /Application shell/);
});

test('does not turn missing assets or runtime source into SPA responses', async () => {
  assert.equal((await get('/assets/missing.js')).statusCode, 404);
  assert.equal((await get('/server.mjs')).statusCode, 404);
  assert.equal((await get('/%2Fserver.mjs')).statusCode, 404);
});

function get(pathname, headers = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const outgoing = request(
      `${baseUrl}${pathname}`,
      { headers },
      (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => {
          resolveRequest({
            body: Buffer.concat(chunks),
            headers: incoming.headers,
            statusCode: incoming.statusCode,
          });
        });
      },
    );
    outgoing.on('error', rejectRequest);
    outgoing.end();
  });
}
