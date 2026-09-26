import type { FastifyPluginAsync } from 'fastify';
import type { CardCollectionService } from '../cards/card-collection.js';
import {
  EvolutionCopiesDeckLockedError,
  EvolutionCopiesTradeReservedError,
  EvolutionNotAvailableError,
  EvolutionPlayerUnavailableError,
  EvolutionReplayConflictError,
  InsufficientEvolutionCopiesError,
  type CardEvolutionService,
} from '../cards/card-evolution.js';

import { ApiError } from '../errors/api-error.js';
import {
  StarterAffinityNotAllowedError,
  StarterAlreadyClaimedError,
  StarterCatalogueUnavailableError,
  type StarterGrantService,
} from '../cards/starter-grant.js';
import {
  cardAffinities,
  starterAffinities,
  type CardAffinity,
} from '../cards/card-types.js';

interface CardRoutesOptions {
  starterGrantService: StarterGrantService;
  collectionService: CardCollectionService;
  evolutionService?: CardEvolutionService;
}

interface StarterBody {
  affinity: CardAffinity;
}

interface EvolutionPreviewParams {
  sourceCardDefinitionId: string;
}

interface EvolutionBody {
  submissionId: string;
  sourceCardDefinitionId: string;
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
    rulesText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
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
    rulesText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;

const starterPreviewMoveSchema = {
  type: 'object',
  additionalProperties: false,
  required: moveSchema.required.filter((property) => property !== 'id'),
  properties: {
    position: moveSchema.properties.position,
    name: moveSchema.properties.name,
    moveType: moveSchema.properties.moveType,
    effectType: moveSchema.properties.effectType,
    effectValue: moveSchema.properties.effectValue,
    modifierStat: moveSchema.properties.modifierStat,
    modifierOperation: moveSchema.properties.modifierOperation,
    modifierDurationTurns: moveSchema.properties.modifierDurationTurns,
    powerCost: moveSchema.properties.powerCost,
    rulesText: moveSchema.properties.rulesText,
  },
} as const;

const starterPreviewEffectSchema = {
  type: 'object',
  additionalProperties: false,
  required: effectSchema.required.filter((property) => property !== 'id'),
  properties: {
    position: effectSchema.properties.position,
    effectType: effectSchema.properties.effectType,
    effectValue: effectSchema.properties.effectValue,
    modifierStat: effectSchema.properties.modifierStat,
    modifierOperation: effectSchema.properties.modifierOperation,
    modifierDurationTurns: effectSchema.properties.modifierDurationTurns,
    rulesText: effectSchema.properties.rulesText,
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
      nullable: true,
    },
    rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
    hp: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    power: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    imageUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    imageAlt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    isActive: { type: 'boolean' },
    moves: { type: 'array', items: moveSchema },
    effects: { type: 'array', items: effectSchema },
    acquisitionKind: {
      type: 'string',
      enum: ['event_reward', 'starter', 'evolution', 'trade'],
    },
    acquiredAt: { type: 'string', format: 'date-time' },
  },
} as const;

const tradingDefinitionSchema = {
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
    'isActive',
    'moves',
    'effects',
  ],
  properties: {
    cardDefinitionId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category: { type: 'string', enum: ['creature', 'power'] },
    affinity: {
      anyOf: [
        {
          type: 'string',
          enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
        },
        { type: 'null' },
      ],
    },
    rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
    hp: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    power: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    imageUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    imageAlt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    isActive: { type: 'boolean' },
    moves: { type: 'array', items: moveSchema },
    effects: { type: 'array', items: effectSchema },
  },
} as const;

const tradingCatalogueResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['definitions', 'requestId'],
  properties: {
    definitions: { type: 'array', items: tradingDefinitionSchema },
    requestId: { type: 'string' },
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
      enum: cardAffinities,
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

const starterOptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'affinity',
    'title',
    'description',
    'highlights',
    'composition',
    'creatures',
    'powerCards',
  ],
  properties: {
    affinity: { type: 'string', enum: starterAffinities },
    title: { type: 'string' },
    description: { type: 'string' },
    highlights: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string' },
    },
    composition: {
      type: 'object',
      additionalProperties: false,
      required: ['creatureCount', 'powerCardCount'],
      properties: {
        creatureCount: { type: 'integer', const: 3 },
        powerCardCount: { type: 'integer', const: 2 },
      },
    },
    creatures: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'hp', 'power', 'moves'],
        properties: {
          name: { type: 'string' },
          hp: { type: 'integer', minimum: 1 },
          power: { type: 'integer', minimum: 0 },
          moves: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: starterPreviewMoveSchema,
          },
        },
      },
    },
    powerCards: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'effects'],
        properties: {
          name: { type: 'string' },
          effects: {
            type: 'array',
            minItems: 1,
            items: starterPreviewEffectSchema,
          },
        },
      },
    },
  },
} as const;

const starterOptionsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['options', 'requestId'],
  properties: {
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: starterOptionSchema,
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

const evolutionDefinitionSchema = {
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
    'isActive',
    'moves',
    'effects',
    'deckPointCost',
  ],
  properties: {
    cardDefinitionId: ownedCardSchema.properties.cardDefinitionId,
    name: ownedCardSchema.properties.name,
    category: ownedCardSchema.properties.category,
    affinity: ownedCardSchema.properties.affinity,
    rarity: ownedCardSchema.properties.rarity,
    hp: ownedCardSchema.properties.hp,
    power: ownedCardSchema.properties.power,
    description: ownedCardSchema.properties.description,
    imageUrl: ownedCardSchema.properties.imageUrl,
    imageAlt: ownedCardSchema.properties.imageAlt,
    isActive: ownedCardSchema.properties.isActive,
    moves: ownedCardSchema.properties.moves,
    effects: ownedCardSchema.properties.effects,
    deckPointCost: { type: 'integer', minimum: 1, maximum: 4 },
  },
} as const;

const evolutionCopySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ownedCardId',
    'acquiredAt',
    'acquisitionKind',
    'eligible',
    'lockReason',
  ],
  properties: {
    ownedCardId: { type: 'string', format: 'uuid' },
    acquiredAt: { type: 'string', format: 'date-time' },
    acquisitionKind: ownedCardSchema.properties.acquisitionKind,
    eligible: { type: 'boolean' },
    lockReason: {
      anyOf: [
        { type: 'string', enum: ['saved_deck', 'trade_reservation'] },
        { type: 'null' },
      ],
    },
  },
} as const;

const evolutionPreviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'source',
    'target',
    'copiesRequired',
    'ownedCopyCount',
    'eligibleCopyCount',
    'deckLockedCopyCount',
    'tradeReservedCopyCount',
    'copies',
    'canEvolve',
    'unavailableReason',
    'requestId',
  ],
  properties: {
    source: evolutionDefinitionSchema,
    target: evolutionDefinitionSchema,
    copiesRequired: { type: 'integer', const: 3 },
    ownedCopyCount: { type: 'integer', minimum: 0 },
    eligibleCopyCount: { type: 'integer', minimum: 0 },
    deckLockedCopyCount: { type: 'integer', minimum: 0 },
    tradeReservedCopyCount: { type: 'integer', minimum: 0 },
    copies: { type: 'array', items: evolutionCopySchema },
    canEvolve: { type: 'boolean' },
    unavailableReason: {
      anyOf: [
        {
          type: 'string',
          enum: ['insufficient_copies', 'saved_deck_lock', 'trade_reservation'],
        },
        { type: 'null' },
      ],
    },
    requestId: { type: 'string' },
  },
} as const;

const evolvedOwnedCardSchema = {
  ...ownedCardSchema,
  properties: {
    ...ownedCardSchema.properties,
    acquisitionKind: { type: 'string', const: 'evolution' },
  },
} as const;

const evolutionResultResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'evolutionId',
    'submissionId',
    'sourceCardDefinitionId',
    'target',
    'consumedOwnedCardIds',
    'newCard',
    'completedAt',
    'replayed',
    'requestId',
  ],
  properties: {
    evolutionId: { type: 'string', format: 'uuid' },
    submissionId: { type: 'string', format: 'uuid' },
    sourceCardDefinitionId: { type: 'string', format: 'uuid' },
    target: evolutionDefinitionSchema,
    consumedOwnedCardIds: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
    newCard: evolvedOwnedCardSchema,
    completedAt: { type: 'string', format: 'date-time' },
    replayed: { type: 'boolean' },
    requestId: { type: 'string' },
  },
} as const;

export const cardRoutes: FastifyPluginAsync<CardRoutesOptions> = async (
  app,
  { starterGrantService, collectionService, evolutionService },
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

  app.get(
    '/cards/trading-catalogue',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listTradingCardDefinitions',
        summary: 'List card definitions that may be requested in a trade',
        description:
          'Returns active player-safe card definitions without exposing any player ownership information.',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        response: {
          200: tradingCatalogueResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.player) {
        throw new Error(
          'Active player context was not set by the authorisation pre-handler.',
        );
      }

      return reply.status(200).send({
        definitions: await collectionService.listTradingCatalogue(),
        requestId: request.id,
      });
    },
  );

  app.get(
    '/cards/starter-options',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listStarterOptions',
        summary: 'List the currently eligible starter packages',
        description:
          'Returns the approved canonical three-Common-Creature and two-Common-Power-card packages available to the authenticated player for comparison.',
        tags: ['Cards'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
        response: {
          200: starterOptionsResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.player) {
        throw new Error(
          'Active player context was not set by the authorisation pre-handler.',
        );
      }

      try {
        const options = await starterGrantService.listStarterOptions();

        return reply.status(200).send({
          options,
          requestId: request.id,
        });
      } catch (error) {
        if (error instanceof StarterCatalogueUnavailableError) {
          throw new ApiError({
            statusCode: 409,
            code: 'STARTER_CATALOGUE_UNAVAILABLE',
            title: 'Starter cards unavailable',
            detail: 'Starter packages are not currently available.',
          });
        }

        throw error;
      }
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
          'Grants the approved canonical set of three Common Creature cards and two Common Power cards for the selected affinity.',
        tags: ['Cards'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['affinity'],
          properties: {
            affinity: {
              type: 'string',
              enum: cardAffinities,
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

  if (evolutionService) {
    app.get<{ Params: EvolutionPreviewParams }>(
      '/cards/evolutions/:sourceCardDefinitionId/preview',
      {
        preHandler: [app.authenticate, app.requireActivePlayer],
        schema: {
          operationId: 'previewCardEvolution',
          summary: 'Preview a fixed card evolution',
          description:
            'Returns the server-authored target and the current player copy eligibility without reserving or consuming cards.',
          tags: ['Cards'],
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            additionalProperties: false,
            required: ['sourceCardDefinitionId'],
            properties: {
              sourceCardDefinitionId: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: evolutionPreviewResponseSchema,
            401: apiErrorSchema,
            403: apiErrorSchema,
            404: apiErrorSchema,
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
          const preview = await evolutionService.previewEvolution(
            player.id,
            request.params.sourceCardDefinitionId,
          );

          return reply.status(200).send({
            ...preview,
            requestId: request.id,
          });
        } catch (error) {
          throw mapEvolutionError(error);
        }
      },
    );

    app.post<{ Body: EvolutionBody }>(
      '/cards/evolutions',
      {
        preHandler: [app.authenticate, app.requireActivePlayer],
        schema: {
          operationId: 'evolveCards',
          summary: 'Evolve three eligible duplicate cards',
          description:
            'Atomically consumes three server-selected, non-deck copies of one source definition and grants its fixed evolved definition.',
          tags: ['Cards'],
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['submissionId', 'sourceCardDefinitionId'],
            properties: {
              submissionId: { type: 'string', format: 'uuid' },
              sourceCardDefinitionId: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: evolutionResultResponseSchema,
            201: evolutionResultResponseSchema,
            400: apiErrorSchema,
            401: apiErrorSchema,
            403: apiErrorSchema,
            404: apiErrorSchema,
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
          const result = await evolutionService.evolveCards({
            playerId: player.id,
            submissionId: request.body.submissionId,
            sourceCardDefinitionId: request.body.sourceCardDefinitionId,
          });

          return reply.status(result.replayed ? 200 : 201).send({
            ...result,
            requestId: request.id,
          });
        } catch (error) {
          throw mapEvolutionError(error);
        }
      },
    );
  }
};

function mapEvolutionError(error: unknown): Error {
  if (error instanceof EvolutionNotAvailableError) {
    return new ApiError({
      statusCode: 404,
      code: 'EVOLUTION_NOT_AVAILABLE',
      title: 'Evolution unavailable',
      detail: 'The selected card does not have an available evolution.',
    });
  }

  if (error instanceof InsufficientEvolutionCopiesError) {
    return new ApiError({
      statusCode: 409,
      code: 'EVOLUTION_COPIES_INSUFFICIENT',
      title: 'Not enough copies',
      detail: 'Three eligible copies are required for this evolution.',
    });
  }

  if (error instanceof EvolutionCopiesDeckLockedError) {
    return new ApiError({
      statusCode: 409,
      code: 'EVOLUTION_COPIES_DECK_LOCKED',
      title: 'Copies used by saved decks',
      detail: 'Remove the required copies from saved decks before evolving.',
    });
  }

  if (error instanceof EvolutionCopiesTradeReservedError) {
    return new ApiError({
      statusCode: 409,
      code: 'EVOLUTION_COPIES_TRADE_RESERVED',
      title: 'Copies reserved by a trade',
      detail: 'The required copies are reserved by an unfinished trade.',
    });
  }

  if (error instanceof EvolutionReplayConflictError) {
    return new ApiError({
      statusCode: 409,
      code: 'EVOLUTION_REPLAY_CONFLICT',
      title: 'Submission already used',
      detail: 'Use a new submission identifier for a different evolution.',
    });
  }

  if (error instanceof EvolutionPlayerUnavailableError) {
    return new ApiError({
      statusCode: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      title: 'Account unavailable',
      detail: 'This account cannot evolve cards.',
    });
  }

  return error instanceof Error ? error : new Error('Card evolution failed.');
}
