import Fastify, { type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { offlineChallengeRoutes } from '../src/routes/offline-challenges.js';
import type { OfflineChallengeService } from '../src/challenges/offline-challenges.js';
import { OfflineRejection } from '../src/challenges/offline-policy.js';

describe('offline HTTP boundary', () => {
  it('requires authentication and the contract before issuing packs, bounds input and disables caching', async () => {
    const playerId = randomUUID(),
      eventId = randomUUID();
    const packs = vi
      .fn<OfflineChallengeService['packs']>()
      .mockResolvedValue([]);
    const submit = vi.fn<OfflineChallengeService['submit']>();
    const app = Fastify();
    app.decorate('authenticate', async (request: FastifyRequest) => {
      if (request.headers.authorization !== 'Bearer fixture')
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      Object.assign(request, { player: { id: playerId } });
    });
    app.decorate('requireActivePlayer', async () => {});
    await app.register(offlineChallengeRoutes, { service: { packs, submit } });
    try {
      const headers = {
        authorization: 'Bearer fixture',
        'x-wits-offline-contract-version': '1',
      };
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/offline-challenge-packs',
            payload: { eventIds: [eventId] },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/offline-challenge-packs',
            headers: { authorization: 'Bearer fixture' },
            payload: { eventIds: [eventId] },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/offline-challenge-packs',
            headers,
            payload: {
              eventIds: Array.from({ length: 11 }, () => randomUUID()),
            },
          })
        ).statusCode,
      ).toBe(400);
      expect(packs).not.toHaveBeenCalled();
      const response = await app.inject({
        method: 'POST',
        url: '/offline-challenge-packs',
        headers,
        payload: { eventIds: [eventId] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(packs).toHaveBeenCalledWith(playerId, [eventId]);
      submit.mockRejectedValue(new OfflineRejection('OFFLINE_INVALID_PACK'));
      const location = {
        latitude: 0,
        longitude: 0,
        accuracyMetres: 10,
        acquiredAt: new Date().toISOString(),
      };
      const rejected = await app.inject({
        method: 'POST',
        url: '/offline-challenge-attempts',
        headers,
        payload: {
          clientAttemptId: randomUUID(),
          packToken: 'invalid',
          startedAt: location.acquiredAt,
          finishedAt: location.acquiredAt,
          startLocation: location,
          finishLocation: location,
          answers: [],
        },
      });
      expect(rejected.statusCode).toBe(422);
      expect(rejected.body).not.toContain('packToken');
    } finally {
      await app.close();
    }
  });
});
