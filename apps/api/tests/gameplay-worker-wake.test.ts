import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';

let app: FastifyInstance;
const readRoutes = [
  '/api/v1/ranked/queue',
  '/api/v1/ranked/seasons/current',
  '/api/v1/ranked/me',
  '/api/v1/ranked/standings',
  '/api/v1/ranked/seasons/:seasonId/standings',
  '/api/v1/ranked/matches/:matchId/settlement',
  '/api/v1/matches/live/:matchId',
  '/api/v1/territory/zones',
  '/api/v1/territory/zones/:zoneId',
  '/api/v1/territory/zones/:zoneId/standings',
  '/api/v1/territory/zones/:zoneId/history',
];

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
      const preHandler = [child.authenticate, child.requireActivePlayer];
      for (const path of readRoutes) {
        child.get(path, { preHandler }, async () => ({ state: 'current' }));
      }
      for (const path of [
        '/api/v1/ranked/queue',
        '/api/v1/ranked/queue/heartbeat',
        '/api/v1/ranked/proposals/:proposalId/accept',
        '/api/v1/ranked/proposals/:proposalId/decline',
        '/api/v1/matches/live/:matchId/connection-tickets',
        '/api/v1/ranked/unknown-write',
      ]) {
        child.post(path, { preHandler }, async (request, reply) =>
          reply
            .code(Number(request.headers['x-test-status'] ?? 201))
            .send({ committed: true }),
        );
      }
      child.delete('/api/v1/ranked/queue', { preHandler }, async () => ({
        committed: true,
      }));
    });
    return workers;
  }

  it.each([
    ['/api/v1/ranked/queue', 0, 1],
    ['/api/v1/ranked/queue/heartbeat', 0, 1],
    ['/api/v1/ranked/proposals/test/accept', 1, 1],
    ['/api/v1/ranked/proposals/test/decline', 0, 1],
    ['/api/v1/matches/live/test/connection-tickets', 1, 0],
  ])(
    'wakes the correct workers after a successful authenticated POST to %s',
    async (url, live, ranked) => {
      const workers = await setup();
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(response.statusCode).toBe(201);
      expect(workers.live.wake).toHaveBeenCalledTimes(live);
      expect(workers.ranked.wake).toHaveBeenCalledTimes(ranked);
    },
  );

  it('wakes only ranked after cancelling a queue entry', async () => {
    const workers = await setup();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/ranked/queue',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(workers.ranked.wake).toHaveBeenCalledOnce();
    expect(workers.live.wake).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'] as const)(
    'does not wake either worker for concurrent authenticated %s page reads',
    async (method) => {
      const workers = await setup();
      const responses = await Promise.all(
        readRoutes.map((path) =>
          app.inject({
            method,
            url: path.replace(/:(?:seasonId|matchId|zoneId)/gu, 'test'),
            headers: { authorization: 'Bearer test-token' },
          }),
        ),
      );
      expect(responses.every((response) => response.statusCode === 200)).toBe(
        true,
      );
      expect(workers.live.wake).not.toHaveBeenCalled();
      expect(workers.ranked.wake).not.toHaveBeenCalled();
    },
  );

  it.each([400, 403, 404, 409, 429, 500, 503])(
    'does not wake workers after an authenticated mutation fails with %s',
    async (status) => {
      const workers = await setup();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ranked/proposals/test/accept',
        headers: {
          authorization: 'Bearer test-token',
          'x-test-status': String(status),
        },
      });
      expect(response.statusCode).toBe(status);
      expect(workers.live.wake).not.toHaveBeenCalled();
      expect(workers.ranked.wake).not.toHaveBeenCalled();
    },
  );

  it('does not wake workers for an unrecognized mutation route', async () => {
    const workers = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/unknown-write',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(response.statusCode).toBe(201);
    expect(workers.live.wake).not.toHaveBeenCalled();
    expect(workers.ranked.wake).not.toHaveBeenCalled();
  });

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
