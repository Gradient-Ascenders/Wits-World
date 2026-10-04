import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redisOptions: vi.fn(),
  limiterOptions: vi.fn(),
  slidingWindow: vi.fn((max: number, window: string) => ({ max, window })),
  limit: vi.fn<(id: string) => Promise<unknown>>(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(options: unknown) {
      mocks.redisOptions(options);
    }
  },
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = mocks.slidingWindow;
    constructor(options: unknown) {
      mocks.limiterOptions(options);
    }
    limit(id: string) {
      return mocks.limit(id);
    }
  },
}));

import {
  createUpstashRateProtection,
  type RateLimitPolicyConfigMap,
} from '../src/security/rate-protection.js';
import { createPhaseTiming } from '../src/request-timing.js';

const policies: RateLimitPolicyConfigMap = {
  'player-general': { maxRequests: 120, windowMs: 60000 },
  'developer-api': { maxRequests: 120, windowMs: 60000 },
  'critical-write': { maxRequests: 10, windowMs: 60000 },
  'credential-revoke': { maxRequests: 10, windowMs: 60000 },
  'gameplay-write': { maxRequests: 30, windowMs: 60000 },
  'author-expensive': { maxRequests: 30, windowMs: 60000 },
  'live-ticket': { maxRequests: 30, windowMs: 60000 },
};

describe('Upstash rate-limit adapter', () => {
  it('builds separate sliding-window namespaces and maps reset to Retry-After', async () => {
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 120,
      remaining: 0,
      reset: 11_001,
    });
    const protection = createUpstashRateProtection({
      url: 'https://example.test',
      token: 'private-token',
      timeoutMs: 8_000,
      policies,
      clock: () => 10_000,
    });
    expect(mocks.slidingWindow).toHaveBeenCalledWith(120, '60000 ms');
    expect(
      mocks.limiterOptions.mock.calls.map(([options]) => options.prefix),
    ).toContain('ww:rl:v1:developer-api');
    expect(
      mocks.limiterOptions.mock.calls.every(
        ([options]) =>
          options.analytics === false &&
          options.ephemeralCache === false &&
          options.timeout === 8_000,
      ),
    ).toBe(true);
    expect(await protection.consume('internal-uuid', 'developer-api')).toEqual({
      allowed: false,
      limit: 120,
      remaining: 0,
      retryAfterSeconds: 2,
    });
    expect(mocks.limit).toHaveBeenCalledWith('internal-uuid');
    expect(JSON.stringify(mocks.limiterOptions.mock.calls)).not.toContain(
      'private-token',
    );
  });

  it('times out instead of accepting the SDK timeout default', async () => {
    mocks.limit.mockImplementationOnce(() => new Promise(() => undefined));
    const protection = createUpstashRateProtection({
      url: 'https://example.test',
      token: 'private-token',
      timeoutMs: 5,
      policies,
    });
    const timing = createPhaseTiming();
    await expect(
      protection.consume('internal-uuid', 'critical-write', timing),
    ).rejects.toThrow(/timed out/u);
    expect(timing.snapshot()).toEqual({
      upstash_client_ms: expect.any(Number),
    });
  });
  it('records only limiter elapsed time while retaining the decision and SDK call', async () => {
    mocks.limit.mockResolvedValueOnce({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60000,
    });
    const protection = createUpstashRateProtection({
      url: 'https://example.test',
      token: 'private-token',
      timeoutMs: 8000,
      policies,
    });
    const timing = createPhaseTiming();
    expect(
      (await protection.consume('internal-uuid', 'gameplay-write', timing))
        .allowed,
    ).toBe(true);
    expect(timing.snapshot()).toEqual({
      upstash_client_ms: expect.any(Number),
    });
    expect(JSON.stringify(timing.snapshot())).not.toMatch(
      /internal-uuid|private-token/,
    );
  });
});
