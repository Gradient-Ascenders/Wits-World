import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  acceptsBattleSwaps,
  CPU_SWAP_MEDIA_TYPE,
  cpuHistoryForClient,
  cpuMatchForClient,
} from '../matches/battle-projection-capability.js';
import {
  CpuMatchActionError,
  CpuMatchAlreadyActiveError,
  CpuMatchCompletedError,
  CpuMatchDeckError,
  CpuMatchNotFoundError,
  CpuMatchSubmissionConflictError,
  CpuMatchVersionConflictError,
  type CpuMatchService,
  type ForfeitCpuMatchInput,
  type SubmitCpuMatchActionInput,
} from '../matches/cpu-match-service.js';
import type { BattleAction } from '@wits-world/game-rules';
import { apiErrorSchema } from '../openapi/battle-schemas.js';

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

interface ForfeitMatchBody {
  expectedVersion: number;
}

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
          required: ['type', 'creatureId'],
          properties: {
            type: { const: 'swap_creature' },
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

const forfeitBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
  },
} as const;

const battleActionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'side',
    'action',
    'effects',
    'expiredEffects',
    'defeatedCreatureId',
    'winner',
    'turnEnded',
  ],
  properties: {
    side: { type: 'string', enum: ['player', 'cpu'] },
    action: { type: 'object', additionalProperties: true },
    effects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'effectId',
          'effectType',
          'targetSide',
          'targetCreatureId',
          'amount',
          'damageMultiplier',
        ],
        properties: {
          effectId: { type: 'string' },
          effectType: {
            type: 'string',
            enum: ['buff', 'damage', 'debuff', 'heal'],
          },
          targetSide: { type: 'string', enum: ['player', 'cpu'] },
          targetCreatureId: { type: 'string' },
          amount: { type: 'number' },
          damageMultiplier: {
            anyOf: [{ type: 'number' }, { type: 'null' }],
          },
          modifier: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['stat', 'operation'],
                properties: {
                  stat: {
                    type: 'string',
                    enum: ['hp', 'power', 'damage_multiplier'],
                  },
                  operation: {
                    type: 'string',
                    enum: ['add', 'multiply'],
                  },
                  durationTurns: {
                    anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
                  },
                },
              },
              { type: 'null' },
            ],
          },
        },
      },
    },
    expiredEffects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'effectId',
          'targetSide',
          'targetCreatureId',
          'damageMultiplier',
        ],
        properties: {
          effectId: { type: 'string' },
          targetSide: { type: 'string', enum: ['player', 'cpu'] },
          targetCreatureId: { type: 'string' },
          damageMultiplier: {
            anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
          },
        },
      },
    },
    defeatedCreatureId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    winner: {
      anyOf: [{ type: 'string', enum: ['player', 'cpu'] }, { type: 'null' }],
    },
    turnEnded: { type: 'boolean' },
  },
} as const;

const battleLogGroupSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'turnNumber', 'events'],
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    turnNumber: { type: 'integer', minimum: 0 },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'sequence', 'side', 'kind', 'message'],
        properties: {
          id: { type: 'string' },
          sequence: { type: 'integer', minimum: 1 },
          side: {
            anyOf: [
              { type: 'string', enum: ['player', 'cpu'] },
              { type: 'null' },
            ],
          },
          kind: {
            type: 'string',
            enum: [
              'action',
              'defeat',
              'effect',
              'effect_expired',
              'result',
              'turn',
            ],
          },
          message: { type: 'string' },
          creatureId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
} as const;

const publicEffectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['damageMultiplier', 'effectType', 'effectValue', 'modifier'],
  properties: {
    damageMultiplier: {
      anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
    },
    effectType: {
      type: 'string',
      enum: ['buff', 'damage', 'debuff', 'heal'],
    },
    effectValue: {
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    },
    modifier:
      battleActionResultSchema.properties.effects.items.properties.modifier,
  },
} as const;

const publicMoveSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'moveType', 'powerCost', 'effectiveness'],
  properties: {
    effectiveness: {
      anyOf: [
        { type: 'string', enum: ['effective', 'neutral', 'resisted'] },
        { type: 'null' },
      ],
    },
    id: { type: 'string' },
    name: { type: 'string' },
    moveType: {
      type: 'string',
      enum: ['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    powerCost: { type: 'integer', minimum: 0 },
    effects: { type: 'array', items: publicEffectSchema },
  },
} as const;

const publicCreatureSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'affinity',
    'rarity',
    'maxHp',
    'maxPower',
    'currentHp',
    'remainingPower',
    'defeated',
    'moves',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    affinity: {
      type: 'string',
      enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    rarity: {
      type: 'string',
      enum: ['common', 'rare', 'epic', 'legendary'],
    },
    maxHp: { type: 'integer', minimum: 0 },
    maxPower: { type: 'integer', minimum: 0 },
    currentHp: { type: 'integer', minimum: 0 },
    remainingPower: { type: 'integer', minimum: 0 },
    defeated: { type: 'boolean' },
    moves: { type: 'array', items: publicMoveSchema },
    activeModifiers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'stat',
          'operation',
          'value',
          'percentage',
          'remainingTurns',
          'remainingCharges',
        ],
        properties: {
          stat: {
            enum: [
              'hp',
              'power',
              'damage_multiplier',
              'incoming_damage_multiplier',
              'poison',
              'stun',
              'dodge',
              'reflect',
              'lifesteal',
            ],
          },
          operation: { enum: ['add', 'multiply'] },
          value: { type: 'number', minimum: 0 },
          percentage: {
            anyOf: [{ type: 'integer' }, { type: 'null' }],
          },
          remainingTurns: {
            anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
          },
          remainingCharges: {
            anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
          },
        },
      },
    },
  },
} as const;

const publicActionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'creatureId'],
      properties: {
        type: { const: 'select_initial_creature' },
        creatureId: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'creatureId'],
      properties: {
        type: { const: 'select_replacement' },
        creatureId: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'creatureId'],
      properties: {
        type: { const: 'swap_creature' },
        creatureId: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'moveId'],
      properties: {
        type: { const: 'use_move' },
        moveId: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'powerCardId'],
      properties: {
        type: { const: 'use_power_card' },
        powerCardId: { type: 'string' },
      },
    },
  ],
} as const;

const matchStateSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'phase',
    'turnNumber',
    'currentSide',
    'replacementSide',
    'firstSide',
    'selections',
    'player',
    'cpu',
    'legalActions',
    'turnDeadline',
  ],
  properties: {
    phase: {
      type: 'string',
      enum: ['initial_selection', 'active', 'replacement', 'completed'],
    },
    turnNumber: { type: 'integer', minimum: 0 },
    currentSide: {
      anyOf: [{ type: 'string', enum: ['player', 'cpu'] }, { type: 'null' }],
    },
    replacementSide: {
      anyOf: [{ type: 'string', enum: ['player', 'cpu'] }, { type: 'null' }],
    },
    firstSide: {
      anyOf: [{ type: 'string', enum: ['player', 'cpu'] }, { type: 'null' }],
    },
    selections: {
      type: 'object',
      additionalProperties: false,
      required: ['player', 'cpu'],
      properties: {
        player: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        cpu: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    },
    player: {
      type: 'object',
      additionalProperties: false,
      required: [
        'creatures',
        'powerCards',
        'usedPowerCardIds',
        'activeCreatureId',
      ],
      properties: {
        creatures: { type: 'array', items: publicCreatureSchema },
        powerCards: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'affinity', 'available'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              affinity: {
                anyOf: [
                  {
                    type: 'string',
                    enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
                  },
                  { type: 'null' },
                ],
              },
              effects: { type: 'array', items: publicEffectSchema },
              available: { type: 'boolean' },
            },
          },
        },
        usedPowerCardIds: { type: 'array', items: { type: 'string' } },
        activeCreatureId: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
      },
    },
    cpu: {
      type: 'object',
      additionalProperties: false,
      required: [
        'activeCreature',
        'defeatedCreatures',
        'remainingCreatureCount',
        'usedPowerCardIds',
        'remainingPowerCardCount',
      ],
      properties: {
        activeCreature: {
          anyOf: [publicCreatureSchema, { type: 'null' }],
        },
        defeatedCreatures: { type: 'array', items: publicCreatureSchema },
        remainingCreatureCount: { type: 'integer', minimum: 0 },
        usedPowerCardIds: { type: 'array', items: { type: 'string' } },
        remainingPowerCardCount: { type: 'integer', minimum: 0 },
      },
    },
    legalActions: { type: 'array', items: publicActionSchema },
    turnDeadline: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
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
    'battleLog',
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
    state: matchStateSchema,
    lastAction: { anyOf: [battleActionResultSchema, { type: 'null' }] },
    battleLog: { type: 'array', items: battleLogGroupSchema },
    requestId: { type: 'string' },
  },
} as const;

const activeMatchResponseSchema = {
  ...matchResponseSchema,
  properties: {
    ...matchResponseSchema.properties,
    status: { const: 'active' },
    winner: { type: 'null' },
    completedAt: { type: 'null' },
  },
} as const;

const activeMatchEntryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['matchId', 'status', 'startedAt', 'state', 'requestId'],
  properties: {
    matchId: { type: 'string', format: 'uuid' },
    status: { const: 'active' },
    startedAt: { type: 'string', format: 'date-time' },
    state: {
      type: 'object',
      additionalProperties: false,
      required: ['phase', 'turnNumber', 'currentSide'],
      properties: {
        phase: {
          type: 'string',
          enum: ['active', 'completed', 'initial_selection', 'replacement'],
        },
        turnNumber: { type: 'integer', minimum: 0 },
        currentSide: {
          anyOf: [
            { type: 'string', enum: ['player', 'cpu'] },
            { type: 'null' },
          ],
        },
      },
    },
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
      config: { rateLimitPolicy: 'gameplay-write' },
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
          ...cpuMatchForClient(
            match,
            acceptsBattleSwaps(request, CPU_SWAP_MEDIA_TYPE),
          ),
          requestId: request.id,
        });
      } catch (error) {
        throw mapMatchError(error);
      }
    },
  );

  app.get(
    '/matches/cpu/entry',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'getActiveCpuMatchEntry',
        summary: 'Read the current active CPU match dashboard entry',
        description:
          "Returns only the authenticated player's unfinished CPU match fields needed by the battle-mode dashboard.",
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        querystring: emptyQuerySchema,
        response: {
          200: activeMatchEntryResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);

      try {
        const entry = await service.getActiveMatchEntry(player.id);
        return reply.status(200).send({
          ...entry,
          requestId: request.id,
        });
      } catch (error) {
        throw mapMatchError(error);
      }
    },
  );

  app.get(
    '/matches/cpu',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'getActiveCpuMatch',
        summary: 'Read the current active CPU match',
        description:
          "Returns the authenticated player's current unfinished CPU match without creating or advancing it. Returns CPU_MATCH_NOT_FOUND when none exists.",
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        querystring: emptyQuerySchema,
        response: {
          200: activeMatchResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request);

      try {
        const match = await service.getActiveMatch(player.id);
        return reply.status(200).send({
          ...cpuMatchForClient(
            match,
            acceptsBattleSwaps(request, CPU_SWAP_MEDIA_TYPE),
          ),
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
        description: `Include ${CPU_SWAP_MEDIA_TYPE} in Accept to receive voluntary swap actions and Creature IDs in battle-log events. Without it, the response retains the previous battle projection.`,
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
          ...cpuMatchForClient(
            match,
            acceptsBattleSwaps(request, CPU_SWAP_MEDIA_TYPE),
          ),
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
          ...cpuMatchForClient(
            match,
            acceptsBattleSwaps(request, CPU_SWAP_MEDIA_TYPE),
          ),
          requestId: request.id,
        });
      } catch (error) {
        throw mapMatchError(error);
      }
    },
  );

  app.post<{
    Params: MatchParams;
    Body: ForfeitMatchBody;
  }>(
    '/matches/:matchId/forfeit',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'forfeitCpuMatch',
        summary: 'Forfeit an active CPU match',
        description:
          'Records an authoritative CPU victory and completes the current match without applying another battle action.',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        params: matchParamsSchema,
        querystring: emptyQuerySchema,
        body: forfeitBodySchema,
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
      const input: ForfeitCpuMatchInput = {
        playerId: player.id,
        matchId: request.params.matchId,
        expectedVersion: request.body.expectedVersion,
      };

      try {
        const match = await service.forfeitMatch(input);
        return reply.status(200).send({
          ...cpuMatchForClient(
            match,
            acceptsBattleSwaps(request, CPU_SWAP_MEDIA_TYPE),
          ),
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
        description: `Include ${CPU_SWAP_MEDIA_TYPE} in Accept to receive swap actions in completed battle history. Without it, swap entries are omitted for older clients.`,
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
        matches: cpuHistoryForClient(
          matches,
          acceptsBattleSwaps(request, CPU_SWAP_MEDIA_TYPE),
        ),
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

  if (error instanceof CpuMatchSubmissionConflictError) {
    return new ApiError({
      statusCode: 409,
      code: 'CPU_MATCH_IDEMPOTENCY_CONFLICT',
      title: 'CPU match submission conflict',
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
