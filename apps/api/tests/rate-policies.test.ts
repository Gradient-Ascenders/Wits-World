import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import {
  createLocalRateProtection,
  type RateLimitPolicyConfigMap,
} from '../src/security/rate-protection.js';
import type {
  RateProtection,
  RateLimitPolicy,
} from '../src/security/rate-protection.js';
import { createRateProtection } from '../e2e/fake-rate-protection.js';

const playerId = '00000000-0000-4000-8000-000000000001';
const keyId = '00000000-0000-4000-8000-000000000002';
const matchId = '00000000-0000-4000-8000-000000000003';
const authConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(protection: RateProtection, withOverrides = false) {
  const app = await buildApp({
    authConfig,
    logger: false,
    accessTokenVerifier: {
      async verify(token) {
        if (token === 'invalid') throw new Error('invalid token');
        return {
          connectionStrategy: 'auth0',
          issuer: authConfig.issuer,
          subject: token,
          playerName: token,
          tokenIssuedAt: new Date(0),
        };
      },
    },
    playerIdentityService: {
      async resolve(identity) {
        return {
          id: identity.subject === 'second' ? keyId : playerId,
          role: 'author',
          lifecycleStatus: 'active',
          playerName: identity.subject,
        };
      },
    },
    rateProtection: protection,
    developerApi: {
      keyService: {
        authenticate: vi.fn(async (key: string) =>
          key === 'invalid'
            ? null
            : {
                id: key === 'second-key' ? matchId : keyId,
                ownerPlayerId: playerId,
              },
        ),
        revokeForPlayer: vi.fn(async () => ({
          id: keyId,
          name: 'Compromised key',
          keyPrefix: 'ww_api_example_…',
          createdAt: '2026-09-01T00:00:00.000Z',
          lastUsedAt: null,
          revokedAt: '2026-09-28T00:00:00.000Z',
          status: 'revoked',
        })),
      } as never,
      publicDataService: { listCards: async () => [] } as never,
      rateProtection: protection,
    },
    ...(withOverrides
      ? {
          challengeAttemptServices: {
            start: {} as never,
            fetch: {} as never,
            answerSubmission: {} as never,
          },
          authorContentServices: { analytics: {} as never },
          livePvp: {
            service: {} as never,
            webSocketUrl: 'ws://example.test/api/v1/realtime/live',
            gateway: {
              register: async () => undefined,
              closeAll: async () => undefined,
            } as never,
          },
        }
      : {}),
  });
  apps.push(app);
  return app;
}

function bearer(token = 'first') {
  return { authorization: `Bearer ${token}` };
}

describe('named HTTP rate-limit policies', () => {
  it('runs the explicit local backend without Upstash credentials', async () => {
    let now = 10_000;
    const policies = Object.fromEntries(
      [
        'player-general',
        'developer-api',
        'critical-write',
        'credential-revoke',
        'gameplay-write',
        'author-expensive',
        'live-ticket',
      ].map((name) => [name, { maxRequests: 1, windowMs: 60_000 }]),
    ) as RateLimitPolicyConfigMap;
    const app = await makeApp(createLocalRateProtection(policies, () => now));
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer(),
        })
      ).statusCode,
    ).toBe(429);
    now += 60_000;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer(),
        })
      ).statusCode,
    ).toBe(200);
  });

  it('uses one selected policy per request after validated identity', async () => {
    const calls: Array<{ id: string; policy: RateLimitPolicy }> = [];
    const protection: RateProtection = {
      async consume(id, policy) {
        calls.push({ id, policy });
        return { allowed: false, limit: 1, remaining: 0, retryAfterSeconds: 4 };
      },
    };
    const app = await makeApp(protection, true);
    const requests = [
      {
        method: 'GET' as const,
        url: '/api/v1/auth/me',
        headers: bearer(),
        expected: 'player-general',
      },
      {
        method: 'POST' as const,
        url: '/api/v1/developer/keys',
        headers: bearer(),
        payload: { name: 'test' },
        expected: 'critical-write',
      },
      {
        method: 'DELETE' as const,
        url: `/api/v1/developer/keys/${keyId}`,
        headers: bearer(),
        expected: 'credential-revoke',
      },
      {
        method: 'POST' as const,
        url: `/api/v1/events/${matchId}/challenge-attempts`,
        headers: bearer(),
        payload: {},
        expected: 'gameplay-write',
      },
      {
        method: 'GET' as const,
        url: '/api/v1/author/analytics/questions',
        headers: bearer(),
        expected: 'author-expensive',
      },
      {
        method: 'POST' as const,
        url: `/api/v1/matches/live/${matchId}/connection-tickets`,
        headers: bearer(),
        payload: { role: 'participant' },
        expected: 'live-ticket',
      },
      {
        method: 'GET' as const,
        url: '/api/v1/developer/cards',
        headers: { 'x-api-key': 'secret-key' },
        expected: 'developer-api',
      },
    ];
    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, request.url).toBe(429);
      expect(response.json()).toMatchObject({
        code: 'RATE_LIMITED',
        status: 429,
      });
      expect(response.headers['ratelimit-limit']).toBe('1');
      expect(response.headers['retry-after']).toBe('4');
    }
    expect(calls.map((call) => call.policy)).toEqual(
      requests.map((request) => request.expected),
    );
    expect(calls.map((call) => call.id)).toEqual([
      playerId,
      playerId,
      playerId,
      playerId,
      playerId,
      playerId,
      keyId,
    ]);
    expect(JSON.stringify(calls)).not.toContain('secret-key');
    expect(JSON.stringify(calls)).not.toContain('Bearer');
  });

  it('shares effective player and developer counters between app instances', async () => {
    const protection = createRateProtection({
      maxRequests: 1,
      windowMs: 60_000,
    });
    const first = await makeApp(protection);
    const second = await makeApp(protection);
    expect(
      (
        await first.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await second.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer(),
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await second.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer('second'),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await first.inject({
          method: 'GET',
          url: '/api/v1/developer/cards',
          headers: { 'x-api-key': 'first-key' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await second.inject({
          method: 'GET',
          url: '/api/v1/developer/cards',
          headers: { 'x-api-key': 'first-key' },
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await second.inject({
          method: 'GET',
          url: '/api/v1/developer/cards',
          headers: { 'x-api-key': 'second-key' },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('keeps health independent and rejects invalid credentials before consumption', async () => {
    const consume = vi.fn<RateProtection['consume']>();
    const app = await makeApp({ consume });
    expect(
      (await app.inject({ method: 'GET', url: '/health' })).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: bearer('invalid'),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/developer/cards',
          headers: { 'x-api-key': 'invalid' },
        })
      ).statusCode,
    ).toBe(401);
    expect(consume).not.toHaveBeenCalled();
  });

  it('fails open or closed according to the selected policy without returning a false 429', async () => {
    const app = await makeApp(
      {
        async consume() {
          throw new Error('private Redis credential');
        },
      },
      true,
    );
    const open = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(),
    });
    expect(open.statusCode).toBe(200);
    const developerOpen = await app.inject({
      method: 'GET',
      url: '/api/v1/developer/cards',
      headers: { 'x-api-key': 'secret-key' },
    });
    expect(developerOpen.statusCode).toBe(200);
    const closed = await app.inject({
      method: 'POST',
      url: '/api/v1/developer/keys',
      headers: bearer(),
      payload: { name: 'test' },
    });
    expect(closed.statusCode).toBe(503);
    expect(closed.json()).toMatchObject({
      code: 'RATE_LIMIT_UNAVAILABLE',
      status: 503,
    });
    expect(closed.body).not.toContain('private Redis credential');
    expect(closed.headers['retry-after']).toBeUndefined();
    const revocation = await app.inject({
      method: 'DELETE',
      url: `/api/v1/developer/keys/${keyId}`,
      headers: bearer(),
    });
    expect(revocation.statusCode).toBe(200);
    expect(revocation.json()).toMatchObject({
      key: { id: keyId, status: 'revoked' },
    });
    expect(revocation.headers['retry-after']).toBeUndefined();
    const ticketClosed = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/live/${matchId}/connection-tickets`,
      headers: bearer(),
      payload: { role: 'participant' },
    });
    expect(ticketClosed.statusCode).toBe(503);
    expect(ticketClosed.json()).toMatchObject({
      code: 'RATE_LIMIT_UNAVAILABLE',
    });
  });
});
