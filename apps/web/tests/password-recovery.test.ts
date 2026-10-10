import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PasswordRecoveryError,
  requestPasswordReset,
} from '../src/api/password-recovery';
import type { AuthConfig } from '../src/config/environment';

const authConfig: AuthConfig = {
  audience: 'https://api.example.test',
  clientId: 'spa-client-id',
  domain: 'tenant.example.test',
};

function abortAwareFetch(
  onSignal: (signal: AbortSignal) => void = () => undefined,
) {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('Missing abort signal'));
          return;
        }

        onSignal(signal);
        const rejectOnAbort = () => reject(signal.reason);
        if (signal.aborted) {
          rejectOnAbort();
        } else {
          signal.addEventListener('abort', rejectOnAbort, { once: true });
        }
      }),
  );
}

describe('password recovery request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('posts only the public client, configured connection, and trimmed email', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);

    await requestPasswordReset({
      authConfig: { ...authConfig, databaseConnection: 'Campus-Users' },
      email: '  player@example.test  ',
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tenant.example.test/dbconnections/change_password',
      {
        body: JSON.stringify({
          client_id: 'spa-client-id',
          connection: 'Campus-Users',
          email: 'player@example.test',
        }),
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: expect.any(AbortSignal),
      },
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(options.credentials).toBe('omit');
  });

  it('uses the default database connection when none is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);

    await requestPasswordReset({
      authConfig,
      email: 'player@example.test',
      signal: new AbortController().signal,
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      client_id: 'spa-client-id',
      connection: 'Username-Password-Authentication',
      email: 'player@example.test',
    });
  });

  it.each([200, 404])(
    'resolves the same way for provider status %s',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );

      await expect(
        requestPasswordReset({
          authConfig,
          email: 'player@example.test',
          signal: new AbortController().signal,
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.each([400, 500])(
    'sanitizes provider status %s as unavailable',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('sensitive provider detail', { status }),
          ),
      );

      await expect(
        requestPasswordReset({
          authConfig,
          email: 'player@example.test',
          signal: new AbortController().signal,
        }),
      ).rejects.toEqual(new PasswordRecoveryError('unavailable'));
    },
  );

  it('preserves the rate-limited failure for HTTP 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('provider detail', { status: 429 })),
    );

    await expect(
      requestPasswordReset({
        authConfig,
        email: 'player@example.test',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(new PasswordRecoveryError('rate-limited'));
  });

  it('sanitizes network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('private network detail')),
    );

    await expect(
      requestPasswordReset({
        authConfig,
        email: 'player@example.test',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(new PasswordRecoveryError('unavailable'));
  });

  it('propagates caller abort and cancels the fetch request', async () => {
    vi.useFakeTimers();
    let fetchSignal!: AbortSignal;
    const fetchMock = abortAwareFetch((signal) => {
      fetchSignal = signal;
    });
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const request = requestPasswordReset({
      authConfig,
      email: 'player@example.test',
      signal: caller.signal,
    });

    caller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an already-aborted call without starting a request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    const reason = new DOMException('Already cancelled', 'AbortError');
    caller.abort(reason);

    await expect(
      requestPasswordReset({
        authConfig,
        email: 'player@example.test',
        signal: caller.signal,
      }),
    ).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and sanitizes a fetch that exceeds the 15-second timeout', async () => {
    vi.useFakeTimers();
    let fetchSignal!: AbortSignal;
    const fetchMock = abortAwareFetch((signal) => {
      fetchSignal = signal;
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = requestPasswordReset({
      authConfig,
      email: 'player@example.test',
      signal: new AbortController().signal,
    });

    const rejection = expect(request).rejects.toEqual(
      new PasswordRecoveryError('unavailable'),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(fetchSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timeout and caller abort listener after completion', async () => {
    vi.useFakeTimers();
    const callerSignal = new AbortController().signal;
    const addListener = vi.spyOn(callerSignal, 'addEventListener');
    const removeListener = vi.spyOn(callerSignal, 'removeEventListener');

    await requestPasswordReset({
      authConfig,
      email: 'player@example.test',
      signal: callerSignal,
    });

    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), {
      once: true,
    });
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0]?.[1],
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
