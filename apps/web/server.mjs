import console from 'node:console';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const serverFilePath = fileURLToPath(import.meta.url);
const defaultRootDirectory = dirname(serverFilePath);

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
]);

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.svg',
  '.webmanifest',
]);

export function createStaticServer({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const root = resolve(rootDirectory);
  const compressionCache = new Map();

  return createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, {
          Allow: 'GET, HEAD',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Method not allowed.');
        return;
      }

      const requestedUrl = new URL(request.url ?? '/', 'http://localhost');
      const resolvedRequest = await resolveRequest(root, requestedUrl.pathname);

      if (!resolvedRequest) {
        response.writeHead(404, {
          'Cache-Control': 'no-cache',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Not found.');
        return;
      }

      const { filePath, pathname } = resolvedRequest;
      const fileStats = await stat(filePath);
      const extension = extname(filePath).toLowerCase();
      const source = await readFile(filePath);
      const contentEncoding = selectContentEncoding(
        request.headers['accept-encoding'],
        extension,
        source.length,
      );
      const body = contentEncoding
        ? await compress(
            compressionCache,
            filePath,
            fileStats.mtimeMs,
            contentEncoding,
            source,
          )
        : source;
      const etag = `W/"${fileStats.size.toString(16)}-${Math.trunc(fileStats.mtimeMs).toString(16)}-${contentEncoding ?? 'identity'}"`;
      const headers = {
        'Cache-Control': cacheControlFor(pathname),
        'Content-Length': String(body.length),
        'Content-Type': MIME_TYPES.get(extension) ?? 'application/octet-stream',
        ETag: etag,
        'Last-Modified': fileStats.mtime.toUTCString(),
        Vary: 'Accept-Encoding',
        ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
      };

      if (request.headers['if-none-match'] === etag) {
        response.writeHead(304, headers);
        response.end();
        return;
      }

      response.writeHead(200, headers);
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('The web application could not serve this request.');
    }
  });
}

async function resolveRequest(root, encodedPathname) {
  let pathname;

  try {
    pathname = decodeURIComponent(encodedPathname);
  } catch {
    return undefined;
  }

  if (pathname.includes('\0')) {
    return undefined;
  }

  const candidate = resolve(root, `.${pathname}`);

  if (
    !isWithinRoot(root, candidate) ||
    candidate === resolve(root, 'server.mjs')
  ) {
    return undefined;
  }

  const directFile = await readableFile(candidate);

  if (directFile) {
    return { filePath: directFile, pathname };
  }

  if (pathname.startsWith('/assets/') || extname(pathname)) {
    return undefined;
  }

  const indexPath = resolve(root, 'index.html');
  const indexFile = await readableFile(indexPath);

  return indexFile
    ? { filePath: indexFile, pathname: '/index.html' }
    : undefined;
}

async function readableFile(candidate) {
  try {
    const candidateStats = await stat(candidate);

    if (candidateStats.isFile()) {
      return candidate;
    }

    if (candidateStats.isDirectory()) {
      const indexPath = resolve(candidate, 'index.html');
      const indexStats = await stat(indexPath);
      return indexStats.isFile() ? indexPath : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isWithinRoot(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..')
  );
}

function cacheControlFor(pathname) {
  return pathname.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

function selectContentEncoding(acceptEncoding, extension, sourceLength) {
  if (
    typeof acceptEncoding !== 'string' ||
    sourceLength < 1_024 ||
    !COMPRESSIBLE_EXTENSIONS.has(extension)
  ) {
    return undefined;
  }

  const qualities = new Map();

  for (const part of acceptEncoding.toLowerCase().split(',')) {
    const [name, ...parameters] = part.trim().split(';');
    const qualityParameter = parameters.find((parameter) =>
      parameter.trim().startsWith('q='),
    );
    const quality = qualityParameter
      ? Number.parseFloat(qualityParameter.trim().slice(2))
      : 1;
    qualities.set(name, Number.isFinite(quality) ? quality : 0);
  }

  const wildcardQuality = qualities.get('*') ?? 0;
  const brotliQuality = qualities.get('br') ?? wildcardQuality;
  const gzipQuality = qualities.get('gzip') ?? wildcardQuality;

  if (brotliQuality <= 0 && gzipQuality <= 0) {
    return undefined;
  }

  return brotliQuality >= gzipQuality ? 'br' : 'gzip';
}

async function compress(cache, filePath, modifiedAt, encoding, source) {
  const key = `${filePath}:${modifiedAt}:${encoding}`;
  let pending = cache.get(key);

  if (!pending) {
    pending =
      encoding === 'br'
        ? compressBrotli(source, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
            },
          })
        : compressGzip(source, { level: 6 });
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }

  return pending;
}

if (process.argv[1] && resolve(process.argv[1]) === serverFilePath) {
  const port = Number.parseInt(process.env.PORT ?? '8080', 10);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const server = createStaticServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Wits World web server listening on port ${port}.`);
  });

  const close = () => {
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
  };

  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
