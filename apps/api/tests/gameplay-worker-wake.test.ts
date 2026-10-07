import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe('production gameplay worker wake hooks', () => {
  async function setup() {
    const workers = { live: { wake: vi.fn() }, ranked: { wake: vi.fn() } };
    const authConfig: AuthConfig = {
      domain: 'auth.example.test',
      issuer: 'https://auth.example.test/',
      audience: 'https://api.example.test',
      spaClientId: 'test-spa',
      jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
    };
    app = await buildApp({
      authConfig,
      logger: false,
      gameplayWorkers: workers,
      accessTokenVerifier: {
        verify: vi.fn().mockResolvedValue({
          issuer: authConfig.issuer,
          subject: 'auth0|test',
          connectionStrategy: 'auth0',
          playerName: 'tester',
        }),
      },
      playerIdentityService: {
        resolve: vi.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000001',
          role: 'player',
          playerName: 'tester',
          lifecycleStatus: 'active',
        }),
      },
    });
    await app.register(async (child) => {
      for (const path of [
        '/api/v1/ranked/queue',
        '/api/v1/matches/live/test/connection-tickets',
        '/api/v1/territory/zones',
      ]) {
        child.post(
          path,
          { preHandler: [child.authenticate, child.requireActivePlayer] },
          async () => ({ committed: true }),
        );
      }
    });
    return workers;
  }

  it.each([
    ['/api/v1/ranked/queue', 1, 1],
    ['/api/v1/matches/live/test/connection-tickets', 1, 0],
    ['/api/v1/territory/zones', 0, 1],
  ])(
    'wakes the correct workers after authenticated %s activity',
    async (url, live, ranked) => {
      const workers = await setup();
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(response.statusCode).toBe(200);
      expect(workers.live.wake).toHaveBeenCalledTimes(live);
      expect(workers.ranked.wake).toHaveBeenCalledTimes(ranked);
    },
  );

  it('does not let unauthenticated probes or health checks wake the database workers', async () => {
    const workers = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/queue',
    });
    expect(response.statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/health' })).statusCode,
    ).toBe(200);
    expect(workers.live.wake).not.toHaveBeenCalled();
    expect(workers.ranked.wake).not.toHaveBeenCalled();
  });
});
