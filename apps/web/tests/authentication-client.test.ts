import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPlayer } from '../src/api/authentication';

afterEach(() => vi.restoreAllMocks());

describe('current-player connection recovery', () => {
  it.each([
    new TypeError('Failed to fetch'),
    new Error('Token connection unavailable'),
    Object.assign(new Error('Token request timed out'), { error: 'timeout' }),
  ])(
    'treats token acquisition failure as unavailable, not sign-in required: %s',
    async (failure) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      await expect(
        getCurrentPlayer({
          apiBaseUrl: 'https://api.example.test/api/v1',
          getAccessToken: vi.fn().mockRejectedValue(failure),
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ failure: 'unavailable' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    'login_required',
    'consent_required',
    'interaction_required',
    'missing_refresh_token',
    'invalid_grant',
    'access_denied',
  ])(
    'retains sign-in recovery for an explicit SDK authentication failure: %s',
    async (error) => {
      await expect(
        getCurrentPlayer({
          apiBaseUrl: 'https://api.example.test/api/v1',
          getAccessToken: vi.fn().mockRejectedValue({ error }),
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ failure: 'authorization' });
    },
  );

  it('preserves cancellation during token acquisition', async () => {
    const controller = new AbortController();
    const failure = new DOMException('Cancelled', 'AbortError');
    controller.abort();
    await expect(
      getCurrentPlayer({
        apiBaseUrl: 'https://api.example.test/api/v1',
        getAccessToken: vi.fn().mockRejectedValue(failure),
        signal: controller.signal,
      }),
    ).rejects.toBe(failure);
  });
});
