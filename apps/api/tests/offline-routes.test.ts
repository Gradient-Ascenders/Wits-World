import Fastify, { type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { offlineChallengeRoutes } from '../src/routes/offline-challenges.js';
import type { OfflineChallengeService } from '../src/challenges/offline-challenges.js';
import { OfflineRejection } from '../src/challenges/offline-policy.js';
import { TrustActivityRestrictedError } from '../src/trust/trust-restrictions.js';
import { registerErrorHandlers } from '../src/errors/error-handler.js';
import type {
  CompletedChallengeAttempt,
  CompletedOrderingChallengeAttempt,
} from '../src/challenges/challenge-attempt-reader.js';

describe('offline HTTP boundary', () => {
  it.each(['multiple_choice', 'ordering'] as const)(
    'returns a typeless Power reward for initial and replayed %s sync',
    async (format) => {
      const playerId = randomUUID();
      const completed:
        CompletedChallengeAttempt | CompletedOrderingChallengeAttempt = {
        attemptId: randomUUID(),
        eventId: randomUUID(),
        format: 'multiple_choice',
        status: 'completed',
        completedAt: '2026-10-20T10:00:00.000Z',
        completionReason: 'answered',
        totalQuestions: 5,
        scoreCorrect: 5,
        reward: {
          cards: [
            {
              ownedCardId: randomUUID(),
              cardDefinitionId: randomUUID(),
              name: 'Power reward',
              category: 'power',
              affinity: null,
              rarity: 'common',
            },
          ],
        },
        review: Array.from({ length: 5 }, (_, index) => {
          const choice = { choiceId: randomUUID(), text: 'Correct answer' };
          return {
            attemptQuestionId: randomUUID(),
            position: index + 1,
            prompt: 'Question',
            selectedChoice: choice,
            correctChoice: choice,
            isCorrect: true,
          };
        }),
      };
      const attempt:
        CompletedChallengeAttempt | CompletedOrderingChallengeAttempt =
        format === 'ordering'
          ? {
              ...completed,
              format,
              review: completed.review.map((question) => {
                const items = Array.from({ length: 4 }, () => ({
                  itemId: randomUUID(),
                  text: 'Item',
                }));
                return {
                  attemptQuestionId: question.attemptQuestionId,
                  position: question.position,
                  prompt: question.prompt,
                  selectedItems: items,
                  correctItems: items,
                  explanation: 'Explanation',
                  isCorrect: true,
                };
              }),
            }
          : completed;
      const submit = vi.fn<OfflineChallengeService['submit']>();
      const app = Fastify();
      registerErrorHandlers(app);
      app.decorate('authenticate', async (request: FastifyRequest) => {
        Object.assign(request, { player: { id: playerId } });
      });
      app.decorate('requireActivePlayer', async () => {});
      await app.register(offlineChallengeRoutes, {
        service: { packs: vi.fn(), submit },
      });
      const acquiredAt = '2026-10-20T09:59:00.000Z';
      const payload = {
        clientAttemptId: randomUUID(),
        packToken: 'fixture-pack',
        startedAt: acquiredAt,
        finishedAt: attempt.completedAt,
        startLocation: {
          latitude: 0,
          longitude: 0,
          accuracyMetres: 10,
          acquiredAt,
        },
        answers: [],
      };
      try {
        for (const created of [true, false]) {
          submit.mockResolvedValue({ created, attempt });
          const response = await app.inject({
            method: 'POST',
            url: '/offline-challenge-attempts',
            headers: {
              authorization: 'Bearer fixture',
              'x-wits-offline-contract-version': '1',
            },
            payload,
          });
          expect(response.statusCode).toBe(created ? 201 : 200);
          expect(response.json()).toEqual({
            attempt,
            requestId: expect.any(String),
          });
        }
        expect(submit).toHaveBeenCalledTimes(2);
        expect(submit).toHaveBeenCalledWith(playerId, payload);
      } finally {
        await app.close();
      }
    },
  );

  it('maps trust restrictions to a neutral offline-pack response', async () => {
    const playerId = randomUUID();
    const eventId = randomUUID();
    const packs = vi.fn<OfflineChallengeService['packs']>().mockRejectedValue(
      new TrustActivityRestrictedError({
        scope: 'online_verification_required',
        startsAt: new Date('2026-09-19T00:00:00.000Z'),
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      }),
    );
    const app = Fastify();
    registerErrorHandlers(app);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      Object.assign(request, { player: { id: playerId } });
    });
    app.decorate('requireActivePlayer', async () => {});
    await app.register(offlineChallengeRoutes, {
      service: { packs, submit: vi.fn<OfflineChallengeService['submit']>() },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/offline-challenge-packs',
        headers: {
          authorization: 'Bearer fixture',
          'x-wits-offline-contract-version': '1',
        },
        payload: { eventIds: [eventId] },
      });
      const body = response.json<{ code: string; detail: string }>();

      expect(response.statusCode).toBe(403);
      expect(body.code).toBe('ACTIVITY_REVIEW_RESTRICTION');
      expect(body.detail.toLowerCase()).not.toMatch(
        /score|signal|threshold|cheat|fraud|reviewer|opponent/u,
      );
    } finally {
      await app.close();
    }
  });

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
      const prepared = {
        packToken: 'signed-arrival-policy',
        pack: {
          version: 1 as const,
          packId: randomUUID(),
          playerId,
          issuedAt: new Date().toISOString(),
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 3600_000).toISOString(),
          locationPolicy: 'arrival-v1' as const,
          challengeId: randomUUID(),
          challengeVersion: 1,
          format: 'multiple_choice' as const,
          timeLimitSeconds: 90 as const,
          event: {
            eventId,
            version: 1,
            title: 'Downloaded event',
            description: null,
            latitude: 0,
            longitude: 0,
            radiusMetres: 75,
          },
          questions: Array.from({ length: 5 }, () => ({
            id: randomUUID(),
            version: 1,
            prompt: 'Question',
            difficulty: 1 as const,
            options: Array.from({ length: 4 }, () => ({
              id: randomUUID(),
              text: 'Option',
            })),
          })),
        },
      };
      packs.mockResolvedValue([prepared]);
      const response = await app.inject({
        method: 'POST',
        url: '/offline-challenge-packs',
        headers,
        payload: { eventIds: [eventId] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(packs).toHaveBeenCalledWith(playerId, [eventId]);
      expect(response.json().packs[0].pack.locationPolicy).toBe('arrival-v1');
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
          answers: [],
        },
      });
      expect(rejected.statusCode).toBe(422);
      expect(rejected.body).not.toContain('packToken');
      expect(submit.mock.calls[0]?.[1]).not.toHaveProperty('finishLocation');
    } finally {
      await app.close();
    }
  });
});
