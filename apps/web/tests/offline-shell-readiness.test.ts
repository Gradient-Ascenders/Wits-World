import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineShellReady } from '../src/offline/shell-readiness';

let ports: {
  port1: {
    close: ReturnType<typeof vi.fn>;
    onmessage?: (event: { data: unknown }) => void;
  };
  port2: { close: ReturnType<typeof vi.fn> };
};
let postMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  ports = { port1: { close: vi.fn() }, port2: { close: vi.fn() } };
  postMessage = vi.fn();
  vi.stubGlobal('navigator', {
    serviceWorker: { controller: { postMessage } },
  });
  vi.stubGlobal(
    'MessageChannel',
    class {
      constructor() {
        return ports;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offline shell readiness', () => {
  it.each([{ ready: true }, { ready: false }, null])(
    'requires explicit worker confirmation: %j',
    async (data) => {
      const result = offlineShellReady();
      expect(postMessage).toHaveBeenCalledWith('CHECK_OFFLINE_SHELL', [
        ports.port2,
      ]);
      ports.port1.onmessage?.({ data });
      expect(await result).toBe(data?.ready === true);
      expect(ports.port1.close).toHaveBeenCalledOnce();
      expect(ports.port2.close).toHaveBeenCalledOnce();
    },
  );

  it('times out and closes both ports when an older worker does not answer', async () => {
    const result = offlineShellReady();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toBe(false);
    expect(ports.port1.close).toHaveBeenCalledOnce();
    expect(ports.port2.close).toHaveBeenCalledOnce();
  });

  it('handles a worker that rejects the message', async () => {
    postMessage.mockImplementation(() => {
      throw new Error('worker unavailable');
    });
    expect(await offlineShellReady()).toBe(false);
    expect(ports.port1.close).toHaveBeenCalledOnce();
  });

  it('does not claim readiness without a controlling worker or supported messaging', async () => {
    vi.stubGlobal('navigator', {});
    expect(await offlineShellReady()).toBe(false);
    vi.stubGlobal('navigator', { serviceWorker: { controller: null } });
    expect(await offlineShellReady()).toBe(false);
    vi.stubGlobal('MessageChannel', undefined);
    expect(await offlineShellReady()).toBe(false);
  });
});
