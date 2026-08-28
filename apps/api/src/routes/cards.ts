import type { FastifyPluginAsync } from 'fastify';
import type { CardCollectionService } from '../cards/card-collection.js';

import { ApiError } from '../errors/api-error.js';
import {
  StarterAffinityNotAllowedError,
  StarterAlreadyClaimedError,
  StarterCatalogueUnavailableError,
  type StarterGrantService,
} from '../cards/starter-grant.js';
import {
  starterAffinities,
  type StarterAffinity,
} from '../cards/card-types.js';

interface CardRoutesOptions {
  starterGrantService: StarterGrantService;
  collectionService: CardCollectionService;
}

interface StarterBody {
  affinity: StarterAffinity;
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

const moveSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'position',
    'name',
    'moveType',
    'effectType',
    'effectValue',
    'modifierStat',
    'modifierOperation',
    'modifierDurationTurns',
    'powerCost',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    position: { type: 'integer', minimum: 1 },
    name: { type: 'string' },
    moveType: {
      type: 'string',
      enum: ['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    effectType: {
      type: 'string',
      enum: ['damage', 'debuff', 'heal', 'buff'],
    },
    effectValue: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    modifierStat: {
      anyOf: [
        {
          type: 'string',
          enum: ['hp', 'power', 'damage_multiplier'],
        },
        { type: 'null' },
      ],
    },
    modifierOperation: {
      anyOf: [{ type: 'string', enum: ['add', 'multiply'] }, { type: 'null' }],
    },
    modifierDurationTurns: {
      anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
    },
    powerCost: { type: 'integer', minimum: 0 },
  },
} as const;

const effectSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'position',
    'effectType',
    'effectValue',
    'modifierStat',
    'modifierOperation',
    'modifierDurationTurns',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    position: { type: 'integer', minimum: 1 },
    effectType: {
      type: 'string',
      enum: ['damage', 'debuff', 'heal', 'buff'],
    },
    effectValue: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    modifierStat: {
      anyOf: [
        {
          type: 'string',
          enum: ['hp', 'power', 'damage_multiplier'],
        },
        { type: 'null' },
      ],
    },
    modifierOperation: {
      anyOf: [{ type: 'string', enum: ['add', 'multiply'] }, { type: 'null' }],
    },
    modifierDurationTurns: {
      anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
    },
  },
} as const;

const ownedCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ownedCardId',
    'cardDefinitionId',
    'name',
    'category',
    'affinity',
    'rarity',
    'hp',
    'power',
    'description',
    'imageUrl',
    'isActive',
    'moves',
    'effects',
    'acquisitionKind',
    'acquiredAt',
  ],
  properties: {
    ownedCardId: { type: 'string', format: 'uuid' },
    cardDefinitionId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category: { type: 'string', enum: ['creature', 'power'] },
    affinity: {
      type: 'string',
      enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
    hp: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    power: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    imageUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    isActive: { type: 'boolean' },
    moves: { type: 'array', items: moveSchema },
    effects: { type: 'array', items: effectSchema },
    acquisitionKind: {
      type: 'string',
      enum: ['event_reward', 'starter'],
    },
    acquiredAt: { type: 'string', format: 'date-time' },
  },
} as const;

const starterCardSchema = {
  ...ownedCardSchema,
  properties: {
    ...ownedCardSchema.properties,
    acquisitionKind: {
      type: 'string',
      const: 'starter',
    },
  },
} as const;

const starterResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['starterGrantId', 'affinity', 'grantedAt', 'cards', 'requestId'],
  properties: {
    starterGrantId: { type: 'string', format: 'uuid' },
    affinity: {
      type: 'string',
      enum: starterAffinities,
    },
    grantedAt: { type: 'string', format: 'date-time' },
    cards: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: starterCardSchema,
    },
    requestId: { type: 'string' },
  },
} as const;

const collectionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cards', 'requestId'],
  properties: {
    cards: {
      type: 'array',
      items: ownedCardSchema,
    },
    requestId: {
      type: 'string',
    },
  },
} as const;

export const cardRoutes: FastifyPluginAsync<CardRoutesOptions> = async (
  app,
  { starterGrantService, collectionService },
) => {
  app.get(
    '/cards/collection',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listOwnedCards',
        summary: 'List the current player card collection',
        description:
          'Returns every card copy owned by the authenticated player with player-safe catalogue and acquisition metadata.',
        tags: ['Cards'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        response: {
          200: collectionResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = request.player;

      if (!player) {
        throw new Error(
          'Active player context was not set by the authorisation pre-handler.',
        );
      }

      const cards = await collectionService.listOwnedCards(player.id);

      return reply.status(200).send({
        cards,
        requestId: request.id,
      });
    },
  );

  app.post<{ Body: StarterBody }>(
    '/cards/starter',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'selectStarterCards',
        summary: 'Select the current player starter affinity',
        description:
          'Grants one server-selected set of three Common Creature cards and two Common Power cards for the selected affinity.',
        tags: ['Cards'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['affinity'],
          properties: {
            affinity: {
              type: 'string',
              enum: starterAffinities,
            },
          },
        },
        response: {
          200: starterResponseSchema,
          201: starterResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = request.player;

      if (!player) {
        throw new Error(
          'Active player context was not set by the authorisation pre-handler.',
        );
      }

      try {
        const selection = await starterGrantService.selectStarter({
          playerId: player.id,
          affinity: request.body.affinity,
        });

        return reply.status(selection.created ? 201 : 200).send({
          ...selection.grant,
          requestId: request.id,
        });
      } catch (error) {
        if (error instanceof StarterAffinityNotAllowedError) {
          throw new ApiError({
            statusCode: 400,
            code: 'STARTER_AFFINITY_NOT_ALLOWED',
            title: 'Starter affinity not available',
            detail: 'Choose Spark, Grit, or Wit as your starter affinity.',
          });
        }

        if (error instanceof StarterAlreadyClaimedError) {
          throw new ApiError({
            statusCode: 409,
            code: 'STARTER_ALREADY_CLAIMED',
            title: 'Starter affinity already selected',
            detail: 'A player can select only one starter affinity.',
          });
        }

        if (error instanceof StarterCatalogueUnavailableError) {
          throw new ApiError({
            statusCode: 409,
            code: 'STARTER_CATALOGUE_UNAVAILABLE',
            title: 'Starter cards unavailable',
            detail: 'The selected starter affinity is not currently available.',
          });
        }

        throw error;
      }
    },
  );
};
