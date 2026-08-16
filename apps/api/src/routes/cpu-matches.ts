import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  CpuMatchActionError,
  CpuMatchAlreadyActiveError,
  CpuMatchCompletedError,
  CpuMatchDeckError,
  CpuMatchNotFoundError,
  CpuMatchVersionConflictError,
  type CpuMatchService,
  type SubmitCpuMatchActionInput,
} from '../matches/cpu-match-service.js';
import type { BattleAction } from '@wits-world/game-rules';

interface CpuMatchRoutesOptions {
  service: CpuMatchService;
}

interface MatchParams {
  matchId: string;
}

interface CreateMatchBody {
  deckId: string;
}

interface SubmitActionBody {
  submissionId: string;
  expectedVersion: number;
  action: Exclude<BattleAction, { type: 'timeout' }>;
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

const matchParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['matchId'],
  properties: {
    matchId: { type: 'string', format: 'uuid' },
  },
} as const;

const emptyQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const createMatchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['deckId'],
  properties: {
    deckId: { type: 'string', format: 'uuid' },
  },
} as const;

const actionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['submissionId', 'expectedVersion', 'action'],
  properties: {
    submissionId: { type: 'string', format: 'uuid' },
    expectedVersion: { type: 'integer', minimum: 0 },
    action: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'creatureId'],
          properties: {
            type: { const: 'select_initial_creature' },
            creatureId: { type: 'string', format: 'uuid' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'creatureId'],
          properties: {
            type: { const: 'select_replacement' },
            creatureId: { type: 'string', format: 'uuid' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'moveId'],
          properties: {
            type: { const: 'use_move' },
            moveId: { type: 'string', format: 'uuid' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'powerCardId'],
          properties: {
            type: { const: 'use_power_card' },
            powerCardId: { type: 'string', format: 'uuid' },
          },
        },
      ],
    },
  },
} as const;

const battleActionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'side',
    'action',
    'effects',
    'defeatedCreatureId',
    'winner',
    'turnEnded',
  ],
  properties: {
    side: { type: 'string', enum: ['player', 'cpu'] },
    action: { type: 'object', additionalProperties: true },
    effects: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    defeatedCreatureId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    winner: {
      anyOf: [{ type: 'string', enum: ['player', 'cpu'] }, { type: 'null' }],
    },
    turnEnded: { type: 'boolean' },
  },
} as const;

const matchResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'matchId',
    'status',
    'version',
    'winner',
    'startedAt',
    'completedAt',
    'state',
    'lastAction',
    'requestId',
  ],
  properties: {
    matchId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['active', 'completed'] },
    version: { type: 'integer', minimum: 0 },
    winner: {
      anyOf: [{ type: 'string', enum: ['player', 'cpu'] }, { type: 'null' }],
    },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    state: { type: 'object', additionalProperties: true },
    lastAction: { anyOf: [battleActionResultSchema, { type: 'null' }] },
    requestId: { type: 'string' },
  },
} as const;

const historyResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['matches', 'requestId'],
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: [
          'matchId',
          'status',
          'winner',
          'startedAt',
          'completedAt',
          'rounds',
        ],
        properties: {
          matchId: { type: 'string', format: 'uuid' },
          status: { const: 'completed' },
          winner: { type: 'string', enum: ['player', 'cpu'] },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          rounds: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    requestId: { type: 'string' },
  },
} as const;

export const cpuMatchRoutes: FastifyPluginAsync<CpuMatchRoutesOptions> = async (
  app,
  { service },
) => {
  app.post<{ Body: CreateMatchBody }>(
    '/matches/cpu',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'createCpuMatch',
        summary: 'Create a server-authoritative CPU match',
        description:
          'Creates a CPU match from the authenticated player selected deck and snapshots the authoritative card data.',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        querystring: emptyQuerySchema,
        body: createMatchBodySchema,
        response: {
          201: matchResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);

      try {
        const match = await service.createMatch({
          playerId: player.id,
          deckId: request.body.deckId,
        });

        return reply.status(201).send({
          ...match,
          requestId: request.id,
        });
      } catch (error) {
        throw mapMatchError(error);
      }
    },
  );

  app.get<{ Params: MatchParams }>(
    '/matches/:matchId',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'getCpuMatch',
        summary: 'Read the authenticated player CPU match',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        params: matchParamsSchema,
        querystring: emptyQuerySchema,
        response: {
          200: matchResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);

      try {
        const match = await service.getMatch(player.id, request.params.matchId);
        return reply.status(200).send({
          ...match,
          requestId: request.id,
        });
      } catch (error) {
        throw mapMatchError(error);
      }
    },
  );

  app.post<{
    Params: MatchParams;
    Body: SubmitActionBody;
  }>(
    '/matches/:matchId/actions',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'submitCpuMatchAction',
        summary: 'Submit one intended CPU match action',
        description:
          'The server validates and applies the intended action, then performs any CPU action using server-side randomness.',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        params: matchParamsSchema,
        querystring: emptyQuerySchema,
        body: actionBodySchema,
        response: {
          200: matchResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);
      const input: SubmitCpuMatchActionInput = {
        playerId: player.id,
        matchId: request.params.matchId,
        submissionId: request.body.submissionId,
        expectedVersion: request.body.expectedVersion,
        action: request.body.action,
      };

      try {
        const match = await service.submitAction(input);
        return reply.status(200).send({
          ...match,
          requestId: request.id,
        });
      } catch (error) {
        throw mapMatchError(error);
      }
    },
  );

  app.get(
    '/matches/history',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listCpuMatchHistory',
        summary: 'List completed CPU matches for the current player',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        querystring: emptyQuerySchema,
        response: {
          200: historyResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);
      const matches = await service.listHistory(player.id);

      return reply.status(200).send({
        matches,
        requestId: request.id,
      });
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

function mapMatchError(error: unknown): Error {
  if (error instanceof CpuMatchNotFoundError) {
    return new ApiError({
      statusCode: 404,
      code: 'CPU_MATCH_NOT_FOUND',
      title: 'CPU match not found',
      detail: 'The requested CPU match was not found.',
    });
  }

  if (error instanceof CpuMatchDeckError) {
    return new ApiError({
      statusCode: 400,
      code: 'INVALID_MATCH_DECK',
      title: 'Invalid match deck',
      detail: error.message,
    });
  }

  if (error instanceof CpuMatchAlreadyActiveError) {
    return new ApiError({
      statusCode: 409,
      code: 'CPU_MATCH_ALREADY_ACTIVE',
      title: 'Active CPU match already exists',
      detail: error.message,
    });
  }

  if (error instanceof CpuMatchCompletedError) {
    return new ApiError({
      statusCode: 409,
      code: 'CPU_MATCH_COMPLETED',
      title: 'CPU match is completed',
      detail: error.message,
    });
  }

  if (error instanceof CpuMatchVersionConflictError) {
    return new ApiError({
      statusCode: 409,
      code: 'CPU_MATCH_STALE_ACTION',
      title: 'CPU match state is stale',
      detail: error.message,
    });
  }

  if (error instanceof CpuMatchActionError) {
    return new ApiError({
      statusCode: 400,
      code: 'ILLEGAL_CPU_MATCH_ACTION',
      title: 'Illegal CPU match action',
      detail: error.message,
    });
  }

  return error instanceof Error
    ? error
    : new Error('CPU match operation failed unexpectedly.');
}
