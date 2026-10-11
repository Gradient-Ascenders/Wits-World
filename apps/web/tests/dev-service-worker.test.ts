import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { retireDevelopmentServiceWorker } from '../dev-service-worker';

const script = readFileSync(
  new NodeURL('../worker/retire-dev-worker.js', import.meta.url),
  'utf8',
);

function retirementWorker(paths: string[]) {
  const origin = 'http://localhost:5173';
  const clients = paths.map((path) => ({
    url: new URL(path, origin).href,
    navigate: vi.fn().mockResolvedValue(undefined),
  }));
  const handlers = new Map<string, (event: unknown) => void>();
  const unregister = vi.fn().mockResolvedValue(true);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const cacheDelete = vi.fn();
  runInNewContext(script, {
    self: {
      location: { origin },
      registration: { unregister },
      clients: { matchAll: vi.fn().mockResolvedValue(clients) },
      skipWaiting,
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
    },
    URL,
    caches: { delete: cacheDelete },
  });
  async function dispatch(type: string) {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)?.({
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);
  }
  return { clients, dispatch, unregister, skipWaiting, cacheDelete, handlers };
}

describe('retiring a production service worker on the development origin', () => {
  it('unregisters and returns the public homepage to Vite without deleting saved data', async () => {
    const worker = retirementWorker(['/?source=logout#home', '/about']);
    await worker.dispatch('install');
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
    await worker.dispatch('activate');
    expect(worker.unregister).toHaveBeenCalledOnce();
    for (const client of worker.clients) {
      expect(client.navigate).toHaveBeenCalledWith(client.url);
      expect(worker.unregister.mock.invocationCallOrder[0]!).toBeLessThan(
        client.navigate.mock.invocationCallOrder[0]!,
      );
    }
    expect(worker.cacheDelete).not.toHaveBeenCalled();
    expect(worker.handlers.has('fetch')).toBe(false);
  });

  it('preserves challenge, authoring and exploration documents', async () => {
    const worker = retirementWorker([
      '/offline-attempts/active',
      '/challenge-attempts/active',
      '/author/events/new',
      '/explore?search=Great+Hall',
      'https://other.example/',
    ]);
    await worker.dispatch('activate');
    expect(worker.unregister).toHaveBeenCalledOnce();
    worker.clients.forEach((client) =>
      expect(client.navigate).not.toHaveBeenCalled(),
    );
  });

  it('continues restoring Home if another public tab closes during activation', async () => {
    const worker = retirementWorker(['/', '/about']);
    worker.clients[0]!.navigate.mockRejectedValue(new Error('Tab closed'));
    await expect(worker.dispatch('activate')).resolves.toBeUndefined();
    expect(worker.clients[1]!.navigate).toHaveBeenCalledOnce();
  });

  it('serves the retirement worker only from Vite development middleware', () => {
    const plugin = retireDevelopmentServiceWorker();
    expect(plugin.apply).toBe('serve');
    const use = vi.fn();
    const configure = plugin.configureServer;
    if (typeof configure !== 'function')
      throw new Error('Expected server hook');
    configure.call({} as never, { middlewares: { use } } as never);
    const middleware = use.mock.calls[0]![0];
    const response = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ method: 'GET', url: '/sw.js' }, response, next);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/javascript',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.end).toHaveBeenCalledWith(script);
    expect(next).not.toHaveBeenCalled();
    middleware({ method: 'GET', url: '/src/main.tsx' }, response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
