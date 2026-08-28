import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  PROGRESSION_MONTH_PATTERN,
  PROGRESSION_STANDINGS_MAX_PAGE,
  PROGRESSION_STANDINGS_MAX_PAGE_SIZE,
  ProgressionProfileUnavailableError,
  type ProgressionReadService,
  type StandingsPeriod,
} from '../progression/progression-read-service.js';

interface ProgressionRoutesOptions {
  service: ProgressionReadService;
}

interface StandingsQuery {
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

const achievementSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'title', 'description', 'earned', 'progress', 'target'],
  properties: {
    code: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
    title: { type: 'string' },
    description: { type: 'string' },
    earned: { type: 'boolean' },
    progress: { type: 'integer', minimum: 0 },
    target: { type: 'integer', minimum: 1 },
  },
} as const;

const standingsEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'playerName',
    'points',
    'rank',
    'currentStreak',
    'longestStreak',
    'isCurrentPlayer',
  ],
  properties: {
    playerName: { type: ['string', 'null'] },
    points: { type: 'integer', minimum: 0 },
    rank: { type: 'integer', minimum: 1 },
    currentStreak: { type: 'integer', minimum: 0 },
    longestStreak: { type: 'integer', minimum: 0 },
    isCurrentPlayer: { type: 'boolean' },
  },
} as const;

const profileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'playerName',
    'points',
    'rank',
    'currentStreak',
    'longestStreak',
    'achievements',
    'requestId',
  ],
  properties: {
    playerName: { type: 'string' },
    points: { type: 'integer', minimum: 0 },
    rank: { type: 'integer', minimum: 1 },
    currentStreak: { type: 'integer', minimum: 0 },
    longestStreak: { type: 'integer', minimum: 0 },
    achievements: { type: 'array', items: achievementSchema },
    requestId: { type: 'string' },
  },
  examples: [
    {
      playerName: 'campus-explorer',
      points: 75,
      rank: 4,
      currentStreak: 2,
      longestStreak: 3,
      achievements: [
        {
          code: 'first_quiz',
          title: 'First Quiz',
          description: 'Complete your first event quiz.',
          earned: true,
          progress: 2,
          target: 1,
        },
      ],
      requestId: 'server-generated-request-id',
    },
  ],
} as const;

const standingsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'period',
    'month',
    'entries',
    'currentPlayer',
    'pagination',
    'requestId',
  ],
  properties: {
    period: { type: 'string', enum: ['all_time', 'monthly'] },
    month: {
      anyOf: [
        { type: 'string', pattern: PROGRESSION_MONTH_PATTERN },
        { type: 'null' },
      ],
    },
    entries: { type: 'array', items: standingsEntrySchema },
    currentPlayer: standingsEntrySchema,
    pagination: {
      type: 'object',
      additionalProperties: false,
      required: ['page', 'pageSize', 'totalPlayers', 'totalPages'],
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
          maximum: PROGRESSION_STANDINGS_MAX_PAGE,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: PROGRESSION_STANDINGS_MAX_PAGE_SIZE,
        },
        totalPlayers: { type: 'integer', minimum: 0 },
        totalPages: { type: 'integer', minimum: 0 },
      },
    },
    requestId: { type: 'string' },
  },
} as const;

const standingsQuerySchema = {
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
} as const;

export const progressionRoutes: FastifyPluginAsync<
  ProgressionRoutesOptions
> = async (app, { service }) => {
  app.get(
    '/progression/me',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'getCurrentProgressionProfile',
        summary: 'Get the current player progression profile',
        description:
          'Returns the authenticated player authoritative points, all-time rank, streaks, and achievement progress without gameplay history or identity-provider data.',
        tags: ['Progression'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
        },
        response: {
          200: profileResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);

      try {
        const profile = await service.getCurrentProfile(player.id);
        return reply.status(200).send({
          ...profile,
          requestId: request.id,
        });
      } catch (error) {
        throw mapProgressionError(error);
      }
    },
  );

  app.get<{ Querystring: StandingsQuery }>(
    '/progression/standings',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listProgressionStandings',
        summary: 'List privacy-safe progression standings',
        description:
          'Returns one deterministic page of active-player all-time or Johannesburg-calendar-month standings and always includes the authenticated player rank outside that page.',
        tags: ['Progression'],
        security: [{ bearerAuth: [] }],
        querystring: standingsQuerySchema,
        response: {
          200: standingsResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);
      const period = request.query.period ?? 'all_time';

      try {
        const standings = await service.listStandings({
          playerId: player.id,
          period,
          ...(request.query.month === undefined
            ? {}
            : { month: request.query.month }),
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 20,
        });

        return reply.status(200).send({
          ...standings,
          requestId: request.id,
        });
      } catch (error) {
        throw mapProgressionError(error);
      }
    },
  );
};

function requirePlayer(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player) {
    throw new Error(
      'Active player context was not set by the authorisation pre-handler.',
    );
  }

  return request.player;
}

function mapProgressionError(error: unknown): Error {
  if (error instanceof ProgressionProfileUnavailableError) {
    return new ApiError({
      statusCode: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      title: 'Account unavailable',
      detail: 'This account cannot perform application operations.',
    });
  }

  return error instanceof Error
    ? error
    : new Error('Progression request failed unexpectedly.');
}
