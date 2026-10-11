import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const origin = 'https://shell.example.test';
const script = readFileSync(resolve('worker/sw.js'), 'utf8');
const manifest = [
  { url: 'index.html', revision: 'index-version' },
  { url: 'assets/offline-abc.js', revision: null },
  { url: 'assets/offline-abc.js', revision: null },
  { url: 'assets/author-def.js', revision: null, precache: false },
];

function response(status = 200) {
  const value = new Response('module-content', { status });
  Object.defineProperty(value, 'type', { value: 'basic' });
  return value;
}

function worker({ failedInstall = false, failedPut = false } = {}) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const stored = new Map<string, Response>();
  const addAll = vi.fn(async (requests: Request[]) => {
    if (failedInstall) throw new Error('network unavailable');
    requests.forEach((request) => stored.set(request.url, response()));
  });
  const put = vi.fn(async (request: Request, value: Response) => {
    if (failedPut) throw new Error('quota unavailable');
    stored.set(request.url, value);
  });
  const previous = new Map<string, Response>([
    [`${origin}/index.html`, response()],
  ]);
  const older = new Map<string, Response>();
  const keys = [
    'wits-world-shell-older',
    'wits-world-shell-old',
    'unrelated-cache',
  ];
  const caches = {
    open: vi.fn(async (key: string) => ({
      addAll,
      put,
      match: vi.fn(async (request: Request | string) =>
        (key === 'wits-world-shell-old'
          ? previous
          : key === 'wits-world-shell-older'
            ? older
            : stored
        )
          .get(
            typeof request === 'string'
              ? new URL(request, origin).href
              : request.url,
          )
          ?.clone(),
      ),
    })),
    keys: vi.fn(async () => keys),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn(async () => response());
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => {});
  runInNewContext(script, {
    self: {
      __WB_MANIFEST: manifest,
      location: { origin },
      addEventListener: (
        name: string,
        handler: (event: Record<string, unknown>) => void,
      ) => handlers.set(name, handler),
      skipWaiting,
      clients: { claim },
    },
    crypto: webcrypto,
    TextEncoder,
    URL,
    Uint8Array,
    caches,
    fetch,
    Response,
    Request: class extends Request {
      constructor(input: string, init?: RequestInit) {
        super(new URL(input, origin), init);
      }
    },
  });
  async function dispatch(name: string, extra = {}) {
    const pending: Promise<unknown>[] = [];
    let result: Promise<Response> | undefined;
    handlers.get(name)?.({
      ...extra,
      waitUntil: (value: Promise<unknown>) => pending.push(value),
      respondWith: (value: Promise<Response>) => {
        result = value;
      },
    });
    const reply = await result;
    await Promise.all(pending);
    return reply;
  }
  return {
    dispatch,
    stored,
    previous,
    older,
    addAll,
    put,
    caches,
    fetch,
    skipWaiting,
    claim,
  };
}

describe('service worker shell cache', () => {
  it('reports readiness only when all essential files are present', async () => {
    const state = worker();
    const postMessage = vi.fn();
    await state.dispatch('message', {
      data: 'CHECK_OFFLINE_SHELL',
      ports: [{ postMessage }],
    });
    expect(postMessage).toHaveBeenLastCalledWith({ ready: false });
    await state.dispatch('install');
    await state.dispatch('message', {
      data: 'CHECK_OFFLINE_SHELL',
      ports: [{ postMessage }],
    });
    expect(postMessage).toHaveBeenLastCalledWith({ ready: true });
    state.stored.delete(`${origin}/assets/offline-abc.js`);
    await state.dispatch('message', {
      data: 'CHECK_OFFLINE_SHELL',
      ports: [{ postMessage }],
    });
    expect(postMessage).toHaveBeenLastCalledWith({ ready: false });
  });

  it('opens saved navigation immediately without waiting for the network', async () => {
    const state = worker();
    await state.dispatch('install');
    state.fetch.mockImplementation(() => new Promise(() => {}));
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: `${origin}/explore`,
    };
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('opens an event deep link with its selection query while offline', async () => {
    const state = worker();
    await state.dispatch('install');
    state.fetch.mockRejectedValue(new Error('offline'));
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: `${origin}/explore?event=saved-event`,
    };
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('serves an old page module from the retained previous build after activation', async () => {
    const state = worker();
    state.previous.set(`${origin}/assets/ExplorePage-previous.js`, response());
    await state.dispatch('install');
    await state.dispatch('activate');
    state.fetch.mockRejectedValue(new Error('offline'));
    const request = new Request(`${origin}/assets/ExplorePage-previous.js`);
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.put).not.toHaveBeenCalled();
    const unknown = new Request(`${origin}/assets/unknown.js`);
    await expect(state.dispatch('fetch', { request: unknown })).rejects.toThrow(
      'offline',
    );
  });

  it('installs only offline-essential assets and reuses immutable HTTP cache', async () => {
    const state = worker();
    await state.dispatch('install');
    const requests = state.addAll.mock.calls[0]![0];
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/index.html',
      '/assets/offline-abc.js',
    ]);
    expect(requests.map((request) => request.cache)).toEqual([
      'reload',
      'default',
    ]);
    expect(state.stored.has(`${origin}/assets/author-def.js`)).toBe(false);
  });

  it('caches requested deferred modules for warm/offline reuse', async () => {
    const state = worker();
    await state.dispatch('install');
    const request = new Request(`${origin}/assets/author-def.js`);
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
    state.fetch.mockRejectedValue(new Error('offline'));
    expect(await (await state.dispatch('fetch', { request }))?.text()).toBe(
      'module-content',
    );
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.put).toHaveBeenCalledOnce();
  });

  it('does not cache failed responses and recovers online without poisoning the cache', async () => {
    const state = worker();
    const request = new Request(`${origin}/assets/author-def.js`);
    state.fetch.mockResolvedValueOnce(response(503));
    expect((await state.dispatch('fetch', { request }))?.status).toBe(503);
    expect(state.put).not.toHaveBeenCalled();
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
    expect(state.put).toHaveBeenCalledOnce();
  });

  it('keeps successful navigation usable when runtime cache storage fails', async () => {
    const state = worker({ failedPut: true });
    const request = new Request(`${origin}/assets/author-def.js`);
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
  });

  it('excludes API, third-party, query-string and non-GET traffic', async () => {
    const state = worker();
    for (const request of [
      new Request(`${origin}/api/v1/auth/me`),
      new Request('https://auth.example.test/assets/author-def.js'),
      new Request(`${origin}/assets/author-def.js?token=fixture`),
      new Request(`${origin}/assets/author-def.js`, { method: 'POST' }),
    ])
      expect(await state.dispatch('fetch', { request })).toBeUndefined();
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.caches.open).not.toHaveBeenCalled();
  });

  it('rejects an interrupted installation without deleting the active shell', async () => {
    const state = worker({ failedInstall: true });
    await expect(state.dispatch('install')).rejects.toThrow(
      'network unavailable',
    );
    expect(state.caches.delete).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
  });

  it('waits for explicit update activation and cleans only obsolete shell caches', async () => {
    const state = worker();
    await state.dispatch('install');
    expect(state.skipWaiting).not.toHaveBeenCalled();
    await state.dispatch('message', { data: 'ACTIVATE_UPDATE' });
    expect(state.skipWaiting).toHaveBeenCalledOnce();
    await state.dispatch('activate');
    expect(state.caches.delete.mock.calls).toEqual([
      ['wits-world-shell-older'],
    ]);
    expect(state.claim).toHaveBeenCalledOnce();
    state.fetch.mockRejectedValue(new Error('offline'));
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: `${origin}/offline`,
    };
    expect((await state.dispatch('fetch', { request }))?.status).toBe(200);
  });
});
