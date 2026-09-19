import type { FastifyPluginAsync } from 'fastify';
import { TrustActivityRestrictedError } from '../trust/trust-restrictions.js';
import type { OfflineChallengeService } from '../challenges/offline-challenges.js';
import {
  OfflineRejection,
  type OfflineSubmission,
} from '../challenges/offline-policy.js';
import { ApiError } from '../errors/api-error.js';
import { apiErrorSchema } from '../openapi/battle-schemas.js';
import {
  completedAttemptResponseSchema,
  completedOrderingAttemptResponseSchema,
} from './challenge-attempts.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const location = {
  type: 'object',
  additionalProperties: false,
  required: ['latitude', 'longitude', 'accuracyMetres', 'acquiredAt'],
  properties: {
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    accuracyMetres: { type: 'number', minimum: 0 },
    acquiredAt: timestamp,
  },
} as const;
const headers = {
  type: 'object',
  required: ['x-wits-offline-contract-version'],
  properties: {
    'x-wits-offline-contract-version': { type: 'string', const: '1' },
  },
} as const;

const syncResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['attempt', 'requestId'],
  properties: {
    requestId: { type: 'string' },
    attempt: {
      oneOf: [
        completedAttemptResponseSchema,
        completedOrderingAttemptResponseSchema,
      ].map((schema) => ({
        ...schema,
        required: schema.required.filter((key) => key !== 'requestId'),
      })),
    },
  },
};
const packSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'packId',
    'playerId',
    'issuedAt',
    'validFrom',
    'validUntil',
    'event',
    'challengeId',
    'challengeVersion',
    'format',
    'timeLimitSeconds',
    'questions',
  ],
  properties: {
    version: { type: 'integer', const: 1 },
    packId: uuid,
    playerId: uuid,
    issuedAt: timestamp,
    validFrom: timestamp,
    validUntil: timestamp,
    challengeId: uuid,
    challengeVersion: { type: 'integer' },
    format: { type: 'string', enum: ['multiple_choice', 'ordering'] },
    timeLimitSeconds: { type: 'integer', enum: [90, 120, 150] },
    event: {
      type: 'object',
      additionalProperties: false,
      required: [
        'eventId',
        'version',
        'title',
        'description',
        'latitude',
        'longitude',
        'radiusMetres',
      ],
      properties: {
        eventId: uuid,
        version: { type: 'integer' },
        title: { type: 'string' },
        description: { type: ['string', 'null'] },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radiusMetres: { type: 'number' },
      },
    },
    questions: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'version', 'prompt', 'difficulty', 'options'],
        properties: {
          id: uuid,
          version: { type: 'integer' },
          prompt: { type: 'string' },
          difficulty: { type: 'integer', enum: [1, 2, 3] },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'text'],
              properties: { id: uuid, text: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

export const offlineChallengeRoutes: FastifyPluginAsync<{
  service: OfflineChallengeService;
}> = async (app, { service }) => {
  app.addHook('onRequest', async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    await app.requireActivePlayer(request, reply);
    if (reply.sent) return;
    if (request.headers['x-wits-offline-contract-version'] !== '1') {
      throw new ApiError({
        statusCode: 409,
        code: 'OFFLINE_CLIENT_UPGRADE_REQUIRED',
        title: 'Refresh required',
        detail: 'Refresh Wits World before preparing new offline challenges.',
      });
    }
  });
  app.post<{ Body: { eventIds: string[] } }>(
    '/offline-challenge-packs',
    {
      bodyLimit: 4096,
      schema: {
        operationId: 'prepareOfflineChallenges',
        tags: ['Challenges'],
        headers,
        summary:
          'Prepare player-bound challenge packs without creating attempts',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['packs', 'requestId'],
            properties: {
              requestId: { type: 'string' },
              packs: {
                type: 'array',
                maxItems: 10,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['pack', 'packToken'],
                  properties: {
                    pack: packSchema,
                    packToken: { type: 'string' },
                  },
                },
              },
            },
          },
          403: apiErrorSchema,
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['eventIds'],
          properties: {
            eventIds: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              uniqueItems: true,
              items: uuid,
            },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return {
          packs: await service.packs(request.player!.id, request.body.eventIds),
          requestId: request.id,
        };
      } catch (error) {
        if (error instanceof TrustActivityRestrictedError) {
          throw new ApiError({
            statusCode: 403,
            code: error.code,
            title: 'Activity temporarily unavailable',
            detail: error.message,
          });
        }
        throw error;
      }
    },
  );
  app.post<{ Body: OfflineSubmission }>(
    '/offline-challenge-attempts',
    {
      bodyLimit: 160_000,
      schema: {
        operationId: 'syncOfflineChallenge',
        tags: ['Challenges'],
        headers,
        summary: 'Validate, mark, and complete an offline attempt atomically',
        response: { 200: syncResponse, 201: syncResponse },
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'clientAttemptId',
            'packToken',
            'startedAt',
            'finishedAt',
            'answers',
            'startLocation',
            'finishLocation',
          ],
          properties: {
            clientAttemptId: uuid,
            packToken: { type: 'string', minLength: 1, maxLength: 128_000 },
            startedAt: timestamp,
            finishedAt: timestamp,
            startLocation: location,
            finishLocation: location,
            answers: {
              type: 'array',
              maxItems: 5,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['questionId', 'answeredAt', 'optionIds'],
                properties: {
                  questionId: uuid,
                  answeredAt: timestamp,
                  optionIds: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 4,
                    uniqueItems: true,
                    items: uuid,
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        const result = await service.submit(request.player!.id, request.body);
        return reply
          .code(result.created ? 201 : 200)
          .send({ attempt: result.attempt, requestId: request.id });
      } catch (error) {
        if (error instanceof OfflineRejection) {
          throw new ApiError({
            statusCode: error.statusCode,
            code: error.code,
            title: 'Offline attempt unavailable',
            detail: error.message,
          });
        }
        throw error;
      }
    },
  );
};
