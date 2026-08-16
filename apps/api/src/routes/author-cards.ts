import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import {
  AuthorCardNotFoundError,
  AuthorCardNotReadyError,
  AuthorCardStateConflictError,
  type AuthorCardService,
} from '../cards/author-card-service.js';
import { InvalidCardDefinitionError } from '../cards/card-validation.js';
import { ApiError } from '../errors/api-error.js';

interface AuthorCardRoutesOptions {
  service: AuthorCardService;
}

interface CardParams {
  cardId: string;
}

interface CardMoveBody {
  position: number;
  name: string;
  moveType: 'basic' | 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  effectType: 'damage' | 'debuff' | 'heal' | 'buff';
  effectValue?: number | null;
  modifierStat?: 'hp' | 'power' | 'damage_multiplier' | null;
  modifierOperation?: 'add' | 'multiply' | null;
  modifierDurationTurns?: number | null;
  powerCost: number;
}

interface CardEffectBody {
  position: number;
  effectType: 'damage' | 'debuff' | 'heal' | 'buff';
  effectValue?: number | null;
  modifierStat?: 'hp' | 'power' | 'damage_multiplier' | null;
  modifierOperation?: 'add' | 'multiply' | null;
  modifierDurationTurns?: number | null;
}

interface CardBody {
  name: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  hp: number | null;
  power: number | null;
  description?: string | null;
  imageUrl?: string | null;
  moves?: CardMoveBody[];
  effects?: CardEffectBody[];
}

const bearerSecurity = [
  {
    bearerAuth: [],
  },
] as const;

const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: {
      type: 'string',
    },
    title: {
      type: 'string',
    },
    status: {
      type: 'integer',
    },
    code: {
      type: 'string',
    },
    detail: {
      type: 'string',
    },
    requestId: {
      type: 'string',
    },
    validation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'message'],
        properties: {
          field: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
        },
      },
    },
  },
} as const;

const cardParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cardId'],
  properties: {
    cardId: {
      type: 'string',
      format: 'uuid',
    },
  },
} as const;

const nullableNonNegativeIntegerSchema = {
  type: 'integer',
  minimum: 0,
  nullable: true,
} as const;

const nullablePositiveIntegerSchema = {
  type: 'integer',
  minimum: 1,
  nullable: true,
} as const;

const nullableModifierStatSchema = {
  type: 'string',
  enum: ['hp', 'power', 'damage_multiplier', null],
  nullable: true,
} as const;

const nullableModifierOperationSchema = {
  type: 'string',
  enum: ['add', 'multiply', null],
  nullable: true,
} as const;

const moveBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['position', 'name', 'moveType', 'effectType', 'powerCost'],
  properties: {
    position: {
      type: 'integer',
      minimum: 1,
    },
    name: {
      type: 'string',
      minLength: 1,
      pattern: '\\S',
    },
    moveType: {
      type: 'string',
      enum: ['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    effectType: {
      type: 'string',
      enum: ['damage', 'debuff', 'heal', 'buff'],
    },
    effectValue: nullableNonNegativeIntegerSchema,
    modifierStat: nullableModifierStatSchema,
    modifierOperation: nullableModifierOperationSchema,
    modifierDurationTurns: nullablePositiveIntegerSchema,
    powerCost: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

const effectBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['position', 'effectType'],
  properties: {
    position: {
      type: 'integer',
      minimum: 1,
    },
    effectType: {
      type: 'string',
      enum: ['damage', 'debuff', 'heal', 'buff'],
    },
    effectValue: nullableNonNegativeIntegerSchema,
    modifierStat: nullableModifierStatSchema,
    modifierOperation: nullableModifierOperationSchema,
    modifierDurationTurns: nullablePositiveIntegerSchema,
  },
} as const;

const nullIntegerSchema = {
  type: 'integer',
  enum: [null],
  nullable: true,
} as const;

const cardBodyCommonProperties = {
  name: {
    type: 'string',
    minLength: 1,
    pattern: '\\S',
  },
  affinity: {
    type: 'string',
    enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
  },
  rarity: {
    type: 'string',
    enum: ['common', 'rare', 'epic', 'legendary'],
  },
  description: {
    type: 'string',
    minLength: 1,
    pattern: '\\S',
    nullable: true,
  },
  imageUrl: {
    type: 'string',
    minLength: 1,
    pattern: '\\S',
    nullable: true,
  },
} as const;

const creatureCardBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'category', 'affinity', 'rarity', 'hp', 'power', 'moves'],
  properties: {
    ...cardBodyCommonProperties,
    category: {
      type: 'string',
      enum: ['creature'],
    },
    hp: {
      type: 'integer',
      minimum: 1,
    },
    power: {
      type: 'integer',
      minimum: 0,
    },
    moves: {
      type: 'array',
      minItems: 1,
      items: moveBodySchema,
      description:
        'Creature cards require at least one move. Move positions must be unique.',
    },
    effects: {
      type: 'array',
      maxItems: 0,
      items: effectBodySchema,
      description: 'Creature cards cannot define Power-card effects.',
    },
  },
} as const;

const powerCardBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'category',
    'affinity',
    'rarity',
    'hp',
    'power',
    'effects',
  ],
  properties: {
    ...cardBodyCommonProperties,
    category: {
      type: 'string',
      enum: ['power'],
    },
    hp: nullIntegerSchema,
    power: nullIntegerSchema,
    moves: {
      type: 'array',
      maxItems: 0,
      items: moveBodySchema,
      description: 'Power cards cannot define Creature moves.',
    },
    effects: {
      type: 'array',
      minItems: 1,
      items: effectBodySchema,
      description:
        'Power cards require at least one effect. Effect positions must be unique.',
    },
  },
} as const;

const cardBodySchema = {
  oneOf: [creatureCardBodySchema, powerCardBodySchema],
} as const;

const cardMoveSchema = {
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
    id: {
      type: 'string',
      format: 'uuid',
    },
    position: {
      type: 'integer',
    },
    name: {
      type: 'string',
    },
    moveType: {
      type: 'string',
      enum: ['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    effectType: {
      type: 'string',
      enum: ['damage', 'debuff', 'heal', 'buff'],
    },
    effectValue: nullableNonNegativeIntegerSchema,
    modifierStat: nullableModifierStatSchema,
    modifierOperation: nullableModifierOperationSchema,
    modifierDurationTurns: nullablePositiveIntegerSchema,
    powerCost: {
      type: 'integer',
    },
  },
} as const;

const cardEffectSchema = {
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
    id: {
      type: 'string',
      format: 'uuid',
    },
    position: {
      type: 'integer',
    },
    effectType: {
      type: 'string',
      enum: ['damage', 'debuff', 'heal', 'buff'],
    },
    effectValue: nullableNonNegativeIntegerSchema,
    modifierStat: nullableModifierStatSchema,
    modifierOperation: nullableModifierOperationSchema,
    modifierDurationTurns: nullablePositiveIntegerSchema,
  },
} as const;

const authorCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
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
    'authoringStatus',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
    },
    name: {
      type: 'string',
    },
    category: {
      type: 'string',
      enum: ['creature', 'power'],
    },
    affinity: {
      type: 'string',
      enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    rarity: {
      type: 'string',
      enum: ['common', 'rare', 'epic', 'legendary'],
    },
    hp: nullableNonNegativeIntegerSchema,
    power: nullableNonNegativeIntegerSchema,
    description: {
      type: 'string',
      nullable: true,
    },
    imageUrl: {
      type: 'string',
      nullable: true,
    },
    isActive: {
      type: 'boolean',
    },
    moves: {
      type: 'array',
      items: cardMoveSchema,
    },
    effects: {
      type: 'array',
      items: cardEffectSchema,
    },
    authoringStatus: {
      type: 'string',
      enum: ['draft', 'published', 'retired'],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
} as const;

export const authorCardRoutes: FastifyPluginAsync<
  AuthorCardRoutesOptions
> = async (app, { service }) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get(
    '/author/cards',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorCards',
        summary: 'List card definitions for Authors',
        tags: ['Authoring'],
        security: bearerSecurity,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['cards', 'requestId'],
            properties: {
              cards: {
                type: 'array',
                items: authorCardSchema,
              },
              requestId: {
                type: 'string',
              },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      cards: await service.listCards(),
      requestId: request.id,
    }),
  );

  app.post<{ Body: CardBody }>(
    '/author/cards',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'createAuthorCard',
        summary: 'Create a draft card definition',
        description:
          'Creates an inactive draft. Publication is a separate Author-only operation.',
        tags: ['Authoring'],
        security: bearerSecurity,
        body: cardBodySchema,
        response: {
          201: cardEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const author = requireResolvedAuthor(request);

      try {
        const card = await service.createCard({
          actorPlayerId: author.id,
          ...request.body,
        });

        return reply.code(201).send({
          card,
          requestId: request.id,
        });
      } catch (error) {
        throwAuthorCardError(error);
      }
    },
  );

  app.put<{
    Params: CardParams;
    Body: CardBody;
  }>(
    '/author/cards/:cardId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'updateAuthorCard',
        summary: 'Edit a draft card definition',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: cardParamsSchema,
        body: cardBodySchema,
        response: {
          200: cardEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          card: await service.updateCard({
            actorPlayerId: author.id,
            cardId: request.params.cardId,
            ...request.body,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorCardError(error);
      }
    },
  );

  app.post<{
    Params: CardParams;
    Body: Record<string, never>;
  }>(
    '/author/cards/:cardId/publish',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'publishAuthorCard',
        summary: 'Publish a ready card definition',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: cardParamsSchema,
        body: emptyBodySchema,
        response: lifecycleResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          card: await service.publishCard(author.id, request.params.cardId),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorCardError(error);
      }
    },
  );

  app.post<{
    Params: CardParams;
    Body: Record<string, never>;
  }>(
    '/author/cards/:cardId/retire',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'retireAuthorCard',
        summary: 'Retire a card definition',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: cardParamsSchema,
        body: emptyBodySchema,
        response: lifecycleResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          card: await service.retireCard(author.id, request.params.cardId),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorCardError(error);
      }
    },
  );
};

function cardEnvelopeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['card', 'requestId'],
    properties: {
      card: authorCardSchema,
      requestId: {
        type: 'string',
      },
    },
  } as const;
}

function lifecycleResponses() {
  return {
    200: cardEnvelopeSchema(),
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
    422: apiErrorSchema,
  } as const;
}

function requireResolvedAuthor(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player) {
    throw new Error(
      'Author request reached its handler without an active player context.',
    );
  }

  return request.player;
}

function throwAuthorCardError(error: unknown): never {
  if (error instanceof InvalidCardDefinitionError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_CARD',
      title: 'Invalid card',
      detail: error.message,
    });
  }

  if (error instanceof AuthorCardNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'CARD_NOT_FOUND',
      title: 'Card not found',
      detail: 'The requested card definition was not found.',
    });
  }

  if (error instanceof AuthorCardStateConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONTENT_STATE_CONFLICT',
      title: 'Content state conflict',
      detail: error.message,
    });
  }

  if (error instanceof AuthorCardNotReadyError) {
    throw new ApiError({
      statusCode: 422,
      code: 'CONTENT_NOT_READY',
      title: 'Content not ready',
      detail: error.message,
    });
  }

  throw error;
}
