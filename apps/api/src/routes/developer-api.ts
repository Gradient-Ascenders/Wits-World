import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import {
  DEVELOPER_API_ACTIVE_KEY_LIMIT,
  DEVELOPER_API_KEY_NAME_MAX_LENGTH,
  DeveloperApiKeyAccountUnavailableError,
  DeveloperApiKeyLimitReachedError,
  DeveloperApiKeyNotFoundError,
  type DeveloperApiKeyService,
} from '../developer/developer-api-key-service.js';
import {
  DEVELOPER_EVENTS_MAX_PAGE,
  DEVELOPER_EVENTS_MAX_PAGE_SIZE,
  type DeveloperPublicDataService,
} from '../developer/developer-public-data-service.js';
import { ApiError } from '../errors/api-error.js';
import {
  PROGRESSION_MONTH_PATTERN,
  PROGRESSION_STANDINGS_MAX_PAGE,
  PROGRESSION_STANDINGS_MAX_PAGE_SIZE,
  type StandingsPeriod,
} from '../progression/progression-read-service.js';

interface DeveloperApiRoutesOptions {
  keyService: DeveloperApiKeyService;
  publicDataService: DeveloperPublicDataService;
}

interface CreateKeyBody {
  name: string;
}

interface KeyParams {
  keyId: string;
}

interface EventParams {
  eventId: string;
}

interface CardParams {
  cardDefinitionId: string;
}

interface EventListQuery {
  page?: number;
  pageSize?: number;
}

interface LeaderboardQuery {
  period?: StandingsPeriod;
  month?: string;
  page?: number;
  pageSize?: number;
}

const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    code: { type: 'string' },
    detail: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const;

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const keyMetadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'keyPrefix',
    'createdAt',
    'lastUsedAt',
    'revokedAt',
    'status',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: DEVELOPER_API_KEY_NAME_MAX_LENGTH,
    },
    keyPrefix: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    lastUsedAt: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    revokedAt: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    status: { type: 'string', enum: ['active', 'revoked'] },
  },
} as const;

const paginationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['page', 'pageSize', 'totalItems', 'totalPages'],
  properties: {
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1 },
    totalItems: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  },
} as const;

const eventSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'eventId',
    'title',
    'description',
    'latitude',
    'longitude',
    'radiusMetres',
    'startsAt',
    'endsAt',
    'availability',
  ],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: nullableStringSchema,
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    radiusMetres: { type: 'number', exclusiveMinimum: 0 },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    availability: { type: 'string', enum: ['active', 'upcoming', 'ended'] },
  },
} as const;

const cardMoveSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['position', 'name', 'moveType', 'powerCost', 'rulesText'],
  properties: {
    position: { type: 'integer', minimum: 1 },
    name: { type: 'string' },
    moveType: { type: 'string' },
    powerCost: { type: 'integer', minimum: 0 },
    rulesText: nullableStringSchema,
  },
} as const;

const cardEffectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['position', 'rulesText'],
  properties: {
    position: { type: 'integer', minimum: 1 },
    rulesText: nullableStringSchema,
  },
} as const;

const cardSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'cardDefinitionId',
    'name',
    'category',
    'affinity',
    'rarity',
    'hp',
    'power',
    'description',
    'imageUrl',
    'imageAlt',
    'deckPointCost',
    'evolvesFromCardDefinitionId',
    'evolutionCopiesRequired',
    'moves',
    'effects',
  ],
  properties: {
    cardDefinitionId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category: { type: 'string', enum: ['creature', 'power'] },
    affinity: {
      anyOf: [
        { type: 'string', enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'] },
        { type: 'null' },
      ],
    },
    rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
    hp: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    power: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    description: nullableStringSchema,
    imageUrl: nullableStringSchema,
    imageAlt: nullableStringSchema,
    deckPointCost: { type: 'integer', minimum: 1, maximum: 4 },
    evolvesFromCardDefinitionId: {
      anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
    },
    evolutionCopiesRequired: {
      anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
    },
    moves: { type: 'array', items: cardMoveSchema },
    effects: { type: 'array', items: cardEffectSchema },
  },
} as const;

const leaderboardEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['playerName', 'points', 'rank'],
  properties: {
    playerName: { type: 'string', minLength: 1 },
    points: { type: 'integer', minimum: 0 },
    rank: { type: 'integer', minimum: 1 },
  },
} as const;

export const developerApiRoutes: FastifyPluginAsync<
  DeveloperApiRoutesOptions
> = async (app, { keyService, publicDataService }) => {
  app.get(
    '/developer/keys',
    {
      onRequest: [app.authenticate, app.loadActivePlayer],
      schema: {
        operationId: 'listDeveloperApiKeys',
        summary: 'List developer API keys for the current account',
        tags: ['Developer API'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['keys', 'activeKeyLimit', 'requestId'],
            properties: {
              keys: { type: 'array', items: keyMetadataSchema },
              activeKeyLimit: {
                type: 'integer',
                const: DEVELOPER_API_ACTIVE_KEY_LIMIT,
              },
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);
      const keys = await keyService.listForPlayer(player.id);
      return reply.status(200).send({
        keys,
        activeKeyLimit: DEVELOPER_API_ACTIVE_KEY_LIMIT,
        requestId: request.id,
      });
    },
  );

  app.post<{ Body: CreateKeyBody }>(
    '/developer/keys',
    {
      onRequest: [app.authenticate, app.loadActivePlayer],
      schema: {
        operationId: 'createDeveloperApiKey',
        summary: 'Create a developer API key',
        description:
          'Returns the complete developer credential exactly once. Store it securely because later responses expose metadata only.',
        tags: ['Developer API'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: DEVELOPER_API_KEY_NAME_MAX_LENGTH,
              pattern: '.*\\S.*',
            },
          },
        },
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'apiKey', 'requestId'],
            properties: {
              key: keyMetadataSchema,
              apiKey: { type: 'string', pattern: '^ww_api_' },
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);
      try {
        const created = await keyService.createForPlayer(
          player.id,
          request.body.name,
        );
        reply.header('Cache-Control', 'no-store');
        return reply.status(201).send({ ...created, requestId: request.id });
      } catch (error) {
        throw mapKeyManagementError(error);
      }
    },
  );

  app.delete<{ Params: KeyParams }>(
    '/developer/keys/:keyId',
    {
      onRequest: [app.authenticate, app.loadActivePlayer],
      schema: {
        operationId: 'revokeDeveloperApiKey',
        summary: 'Revoke a developer API key',
        tags: ['Developer API'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['keyId'],
          properties: { keyId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'requestId'],
            properties: {
              key: keyMetadataSchema,
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);
      try {
        const key = await keyService.revokeForPlayer(
          player.id,
          request.params.keyId,
        );
        return reply.status(200).send({ key, requestId: request.id });
      } catch (error) {
        throw mapKeyManagementError(error);
      }
    },
  );

  app.get<{ Querystring: EventListQuery }>(
    '/developer/events',
    {
      onRequest: [app.authenticateDeveloperApiKey],
      schema: {
        operationId: 'listDeveloperEvents',
        summary: 'List published Wits Quest events',
        description:
          'Returns the deliberately public event projection. Challenge answers, placement internals and player activity are not exposed.',
        tags: ['Developer API'],
        security: [{ developerApiKey: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              maximum: DEVELOPER_EVENTS_MAX_PAGE,
              default: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: DEVELOPER_EVENTS_MAX_PAGE_SIZE,
              default: 50,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['events', 'pagination', 'requestId'],
            properties: {
              events: { type: 'array', items: eventSchema },
              pagination: paginationSchema,
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await publicDataService.listEvents({
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 50,
      });
      return reply.status(200).send({ ...result, requestId: request.id });
    },
  );

  app.get<{ Params: EventParams }>(
    '/developer/events/:eventId',
    {
      onRequest: [app.authenticateDeveloperApiKey],
      schema: {
        operationId: 'getDeveloperEvent',
        summary: 'Get one published Wits Quest event',
        tags: ['Developer API'],
        security: [{ developerApiKey: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['eventId'],
          properties: { eventId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['event', 'requestId'],
            properties: { event: eventSchema, requestId: { type: 'string' } },
          },
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const event = await publicDataService.getEvent(request.params.eventId);
      if (!event) throw developerResourceNotFound('event');
      return reply.status(200).send({ event, requestId: request.id });
    },
  );

  app.get(
    '/developer/cards',
    {
      onRequest: [app.authenticateDeveloperApiKey],
      schema: {
        operationId: 'listDeveloperCards',
        summary: 'List the public collectible-card catalogue',
        tags: ['Developer API'],
        security: [{ developerApiKey: [] }],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['cards', 'requestId'],
            properties: {
              cards: { type: 'array', items: cardSchema },
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const cards = await publicDataService.listCards();
      return reply.status(200).send({ cards, requestId: request.id });
    },
  );

  app.get<{ Params: CardParams }>(
    '/developer/cards/:cardDefinitionId',
    {
      onRequest: [app.authenticateDeveloperApiKey],
      schema: {
        operationId: 'getDeveloperCard',
        summary: 'Get one public card definition',
        tags: ['Developer API'],
        security: [{ developerApiKey: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['cardDefinitionId'],
          properties: { cardDefinitionId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['card', 'requestId'],
            properties: { card: cardSchema, requestId: { type: 'string' } },
          },
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const card = await publicDataService.getCard(
        request.params.cardDefinitionId,
      );
      if (!card) throw developerResourceNotFound('card');
      return reply.status(200).send({ card, requestId: request.id });
    },
  );

  app.get<{ Querystring: LeaderboardQuery }>(
    '/developer/leaderboard',
    {
      onRequest: [app.authenticateDeveloperApiKey],
      schema: {
        operationId: 'listDeveloperLeaderboard',
        summary: 'List the public progression leaderboard',
        description:
          'Returns public Player Names, points and ranks only. Private progression, account, moderation and trust data are not exposed.',
        tags: ['Developer API'],
        security: [{ developerApiKey: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            period: { type: 'string', enum: ['all_time', 'monthly'] },
            month: { type: 'string', pattern: PROGRESSION_MONTH_PATTERN },
            page: {
              type: 'integer',
              minimum: 1,
              maximum: PROGRESSION_STANDINGS_MAX_PAGE,
              default: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: PROGRESSION_STANDINGS_MAX_PAGE_SIZE,
              default: 20,
            },
          },
          oneOf: [
            {
              required: ['period', 'month'],
              properties: { period: { const: 'monthly' } },
            },
            {
              properties: { period: { const: 'all_time' } },
              not: { required: ['month'] },
            },
          ],
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['period', 'month', 'entries', 'pagination', 'requestId'],
            properties: {
              period: { type: 'string', enum: ['all_time', 'monthly'] },
              month: {
                anyOf: [
                  { type: 'string', pattern: PROGRESSION_MONTH_PATTERN },
                  { type: 'null' },
                ],
              },
              entries: { type: 'array', items: leaderboardEntrySchema },
              pagination: paginationSchema,
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const period = request.query.period ?? 'all_time';
      const result = await publicDataService.listLeaderboard({
        period,
        ...(request.query.month === undefined
          ? {}
          : { month: request.query.month }),
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 20,
      });
      return reply.status(200).send({ ...result, requestId: request.id });
    },
  );
};

function requirePlayer(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player) {
    throw new Error(
      'Active player context was not set before developer key management.',
    );
  }
  return request.player;
}

function mapKeyManagementError(error: unknown): Error {
  if (error instanceof DeveloperApiKeyLimitReachedError) {
    return new ApiError({
      statusCode: 409,
      code: 'DEVELOPER_API_KEY_LIMIT_REACHED',
      title: 'Developer API key limit reached',
      detail: `An account may have at most ${DEVELOPER_API_ACTIVE_KEY_LIMIT} active developer API keys. Revoke an existing key before creating another.`,
    });
  }
  if (error instanceof DeveloperApiKeyNotFoundError) {
    return developerResourceNotFound('developer API key');
  }
  if (error instanceof DeveloperApiKeyAccountUnavailableError) {
    return new ApiError({
      statusCode: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      title: 'Account unavailable',
      detail: 'This account cannot manage developer API keys.',
    });
  }
  return error instanceof Error
    ? error
    : new Error('Developer API key request failed unexpectedly.');
}

function developerResourceNotFound(resource: string): ApiError {
  return new ApiError({
    statusCode: 404,
    code: 'NOT_FOUND',
    title: 'Resource not found',
    detail: `The requested ${resource} was not found.`,
  });
}
