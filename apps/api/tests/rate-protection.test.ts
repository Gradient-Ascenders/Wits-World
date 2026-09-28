import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import { createAuthenticatedRateProtection } from '../e2e/fake-rate-protection.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('authenticated API rate protection', () => {
  it('limits each server-resolved player independently and resets deterministically', async () => {
    let now = 10_000;
    const resolve = vi.fn(async (identity: { subject: string }) => ({
      id:
        identity.subject === 'second'
          ? '00000000-0000-4000-8000-000000000002'
          : '00000000-0000-4000-8000-000000000001',
      role: 'player' as const,
      lifecycleStatus: 'active' as const,
      playerName: identity.subject,
    }));

    app = await buildApp({
      authConfig,
      accessTokenVerifier: {
        async verify(token) {
          return {
            connectionStrategy: 'auth0',
            issuer: authConfig.issuer,
            playerName: token,
            subject: token,
            tokenIssuedAt: new Date(0),
          };
        },
      },
      playerIdentityService: { resolve },
      rateProtection: createAuthenticatedRateProtection({
        maxRequests: 2,
        windowMs: 10_000,
        clock: () => now,
      }),
      logger: false,
    });

    expect((await currentPlayer('first')).statusCode).toBe(200);
    const second = await currentPlayer('first');
    expect(second.statusCode).toBe(200);
    expect(second.headers['ratelimit-remaining']).toBe('0');

    const limited = await currentPlayer('first');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('10');
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED', status: 429 });

    expect((await currentPlayer('second')).statusCode).toBe(200);

    now += 9_000;
    expect((await currentPlayer('first')).statusCode).toBe(429);
    now += 1_000;
    expect((await currentPlayer('first')).statusCode).toBe(200);
  }, 15_000);

  it('does not rate-limit health probes or trust a browser player identifier', async () => {
    app = await buildApp({
      authConfig,
      accessTokenVerifier: {
        async verify() {
          return {
            connectionStrategy: 'auth0',
            issuer: authConfig.issuer,
            playerName: 'real-subject',
            subject: 'real-subject',
            tokenIssuedAt: new Date(0),
          };
        },
      },
      playerIdentityService: {
        async resolve() {
          return {
            id: '00000000-0000-4000-8000-000000000001',
            playerName: 'real-subject',
            role: 'player',
            lifecycleStatus: 'active',
          };
        },
      },
      rateProtection: createAuthenticatedRateProtection({
        maxRequests: 1,
        windowMs: 60_000,
      }),
      logger: false,
    });

    expect(
      (await app.inject({ method: 'GET', url: '/health' })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/health' })).statusCode,
    ).toBe(200);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me?playerId=browser-chosen',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
    });
  }, 15_000);

  it('documents the verified-player 429 response body and headers on protected routes', async () => {
    app = await buildApp({
      authConfig,
      accessTokenVerifier: {
        async verify() {
          return {
            connectionStrategy: 'auth0',
            issuer: authConfig.issuer,
            playerName: 'documented-subject',
            subject: 'documented-subject',
            tokenIssuedAt: new Date(0),
          };
        },
      },
      playerIdentityService: {
        async resolve() {
          return {
            id: '00000000-0000-4000-8000-000000000001',
            playerName: 'documented-subject',
            role: 'player',
            lifecycleStatus: 'active',
          };
        },
      },
      logger: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const document = response.json<{
      paths: Record<
        string,
        {
          get?: {
            responses?: Record<string, unknown>;
          };
        }
      >;
    }>();

    expect(response.statusCode).toBe(200);
    expect(
      document.paths['/api/v1/auth/me']?.get?.responses?.['429'],
    ).toMatchObject({
      description: expect.stringContaining('verified local player'),
      headers: {
        'RateLimit-Limit': expect.any(Object),
        'RateLimit-Remaining': expect.any(Object),
        'Retry-After': expect.any(Object),
      },
      content: {
        'application/json': {
          schema: {
            properties: {
              code: { enum: ['RATE_LIMITED'] },
              status: { enum: [429] },
            },
          },
        },
      },
    });
    expect(document.paths['/health']?.get?.responses?.['429']).toBeUndefined();
  }, 15_000);
});

async function currentPlayer(token: string) {
  if (!app) throw new Error('Test app is not ready.');

  return app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
}
