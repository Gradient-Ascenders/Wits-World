import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerAutomaticUpdates,
  ServiceWorkerUpdate,
} from '../src/offline/ServiceWorkerUpdate';
import { readOfflineState } from '../src/offline/store';

vi.mock('../src/offline/store', () => ({ readOfflineState: vi.fn() }));

const emptyState = {
  session: undefined,
  packs: [],
  attempts: [],
  receipts: [],
};
let cleanup: (() => void) | undefined;
let container: EventTarget & { register: ReturnType<typeof vi.fn> };
let registration: EventTarget & {
  waiting: { postMessage: ReturnType<typeof vi.fn> } | null;
  installing: EventTarget | null;
};
let reload: ReturnType<typeof vi.fn<() => void>>;
const originalServiceWorker = Object.getOwnPropertyDescriptor(
  navigator,
  'serviceWorker',
);

beforeEach(() => {
  vi.useFakeTimers();
  reload = vi.fn();
  registration = Object.assign(new EventTarget(), {
    waiting: { postMessage: vi.fn() },
    installing: null,
  });
  container = Object.assign(new EventTarget(), {
    register: vi.fn().mockResolvedValue(registration),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });
  vi.mocked(readOfflineState).mockResolvedValue(emptyState);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.resetAllMocks();
  if (originalServiceWorker)
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
});

async function start() {
  cleanup = registerAutomaticUpdates(reload);
  await vi.advanceTimersByTimeAsync(0);
}

describe('automatic application updates', () => {
  it('renders no update banner or button', () => {
    expect(render(<ServiceWorkerUpdate />).container).toBeEmptyDOMElement();
  });

  it('activates a waiting update and reloads once after controller change', async () => {
    await start();
    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      updateViaCache: 'none',
    });
    expect(registration.waiting?.postMessage).toHaveBeenCalledWith(
      'ACTIVATE_UPDATE',
    );
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits for active attempts to finish, then applies the update automatically', async () => {
    vi.mocked(readOfflineState).mockResolvedValue({
      ...emptyState,
      attempts: [{ status: 'active' }] as Awaited<
        ReturnType<typeof readOfflineState>
      >['attempts'],
    });
    await start();
    expect(registration.waiting?.postMessage).not.toHaveBeenCalled();
    vi.mocked(readOfflineState).mockResolvedValue(emptyState);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(registration.waiting?.postMessage).toHaveBeenCalledTimes(1);
  });

  it('retries after a storage failure without reloading prematurely', async () => {
    vi.mocked(readOfflineState).mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );
    await start();
    expect(registration.waiting?.postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(registration.waiting?.postMessage).toHaveBeenCalledTimes(1);
  });

  it('observes updates installed after registration without reloading on first install', async () => {
    const worker = registration.waiting;
    registration.waiting = null;
    await start();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    const installing = new EventTarget();
    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = worker;
    installing.dispatchEvent(new Event('statechange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(worker?.postMessage).toHaveBeenCalledTimes(1);
  });

  it('cleans up pending retries and controller listeners on unmount', async () => {
    vi.mocked(readOfflineState).mockRejectedValue(
      new Error('Storage unavailable'),
    );
    await start();
    cleanup?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readOfflineState).toHaveBeenCalledTimes(1);
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('handles registration rejection quietly', async () => {
    container.register.mockRejectedValueOnce(new Error('Registration blocked'));
    await act(start);
    expect(readOfflineState).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
