import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import {
  DeckNotFoundError,
  DeckOwnedCardNotFoundError,
  InvalidDeckNameError,
  type DeckService,
} from '../cards/deck-service.js';
import { DeckRuleViolationError } from '../cards/deck-rules.js';
import { ApiError } from '../errors/api-error.js';

interface DeckRoutesOptions {
  service: DeckService;
}

interface DeckParams {
  deckId: string;
}

interface DeckBody {
  name: string;
  ownedCardIds: string[];
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

const deckParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['deckId'],
  properties: {
    deckId: {
      type: 'string',
      format: 'uuid',
    },
  },
} as const;

const emptyQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const deckBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'ownedCardIds'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
    },
    ownedCardIds: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'string',
        format: 'uuid',
      },
    },
  },
} as const;

const deckCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'position',
    'ownedCardId',
    'cardDefinitionId',
    'name',
    'category',
    'affinity',
    'rarity',
  ],
  properties: {
    position: {
      type: 'integer',
      minimum: 1,
      maximum: 5,
    },
    ownedCardId: {
      type: 'string',
      format: 'uuid',
    },
    cardDefinitionId: {
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
      anyOf: [
        {
          type: 'string',
          enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
        },
        { type: 'null' },
      ],
    },
    rarity: {
      type: 'string',
      enum: ['common', 'rare', 'epic', 'legendary'],
    },
  },
} as const;

const savedDeckSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'deckId',
    'name',
    'isSelected',
    'totalPoints',
    'createdAt',
    'updatedAt',
    'cards',
  ],
  properties: {
    deckId: {
      type: 'string',
      format: 'uuid',
    },
    name: {
      type: 'string',
    },
    isSelected: {
      type: 'boolean',
    },
    totalPoints: {
      type: 'integer',
      minimum: 5,
      maximum: 10,
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    cards: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: deckCardSchema,
    },
  },
} as const;

const deckResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...savedDeckSchema.required, 'requestId'],
  properties: {
    ...savedDeckSchema.properties,
    requestId: {
      type: 'string',
    },
  },
} as const;

const deckListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decks', 'requestId'],
  properties: {
    decks: {
      type: 'array',
      items: savedDeckSchema,
    },
    requestId: {
      type: 'string',
    },
  },
} as const;

export const deckRoutes: FastifyPluginAsync<DeckRoutesOptions> = async (
  app,
  { service },
) => {
  app.get(
    '/decks',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listSavedDecks',
        summary: 'List the current player saved decks',
        description:
          'Returns every saved deck owned by the authenticated player and identifies the currently selected deck.',
        tags: ['Decks'],
        security: [{ bearerAuth: [] }],
        querystring: emptyQuerySchema,
        response: {
          200: deckListResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request.player);

      const decks = await service.listDecks(player.id);

      return reply.status(200).send({
        decks,
        requestId: request.id,
      });
    },
  );

  app.post<{ Body: DeckBody }>(
    '/decks',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'createSavedDeck',
        summary: 'Create a saved deck',
        description:
          'Creates a five-card Basic deck from owned card-copy IDs. Composition, ownership, and rarity points are validated by the server.',
        tags: ['Decks'],
        security: [{ bearerAuth: [] }],
        querystring: emptyQuerySchema,
        body: deckBodySchema,
        response: {
          201: deckResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request.player);

      try {
        const deck = await service.createDeck({
          playerId: player.id,
          name: request.body.name,
          ownedCardIds: request.body.ownedCardIds,
        });

        return reply.status(201).send({
          ...deck,
          requestId: request.id,
        });
      } catch (error) {
        throw mapDeckError(error);
      }
    },
  );

  app.put<{
    Params: DeckParams;
    Body: DeckBody;
  }>(
    '/decks/:deckId',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'updateSavedDeck',
        summary: 'Update a saved deck',
        description:
          'Replaces the authenticated player saved deck name and ordered owned-card copies after server-side validation.',
        tags: ['Decks'],
        security: [{ bearerAuth: [] }],
        params: deckParamsSchema,
        querystring: emptyQuerySchema,
        body: deckBodySchema,
        response: {
          200: deckResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request.player);

      try {
        const deck = await service.updateDeck({
          playerId: player.id,
          deckId: request.params.deckId,
          name: request.body.name,
          ownedCardIds: request.body.ownedCardIds,
        });

        return reply.status(200).send({
          ...deck,
          requestId: request.id,
        });
      } catch (error) {
        throw mapDeckError(error);
      }
    },
  );

  app.delete<{ Params: DeckParams }>(
    '/decks/:deckId',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'deleteSavedDeck',
        summary: 'Delete a saved deck',
        description:
          'Deletes a saved deck owned by the authenticated player without deleting any owned card copies.',
        tags: ['Decks'],
        security: [{ bearerAuth: [] }],
        params: deckParamsSchema,
        querystring: emptyQuerySchema,
        response: {
          204: {
            type: 'null',
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request.player);

      try {
        await service.deleteDeck(player.id, request.params.deckId);

        return reply.status(204).send();
      } catch (error) {
        throw mapDeckError(error);
      }
    },
  );

  app.put<{ Params: DeckParams }>(
    '/decks/:deckId/selection',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'selectSavedDeck',
        summary: 'Select a saved deck',
        description:
          'Makes one valid saved deck the authenticated player active selection after revalidating its authoritative card state.',
        tags: ['Decks'],
        security: [{ bearerAuth: [] }],
        params: deckParamsSchema,
        querystring: emptyQuerySchema,
        response: {
          200: deckResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = requirePlayer(request.player);

      try {
        const deck = await service.selectDeck(player.id, request.params.deckId);

        return reply.status(200).send({
          ...deck,
          requestId: request.id,
        });
      } catch (error) {
        throw mapDeckError(error);
      }
    },
  );
};

function requirePlayer(
  player: FastifyRequest['player'],
): NonNullable<FastifyRequest['player']> {
  if (!player) {
    throw new Error(
      'Active player context was not set by the authorisation pre-handler.',
    );
  }

  return player;
}

function mapDeckError(error: unknown): Error {
  if (error instanceof DeckNotFoundError) {
    return new ApiError({
      statusCode: 404,
      code: 'DECK_NOT_FOUND',
      title: 'Saved deck not found',
      detail: 'The requested saved deck was not found.',
    });
  }

  if (error instanceof DeckOwnedCardNotFoundError) {
    return new ApiError({
      statusCode: 400,
      code: 'INVALID_DECK_CARDS',
      title: 'Invalid deck cards',
      detail: 'One or more selected card copies are unavailable.',
    });
  }

  if (error instanceof InvalidDeckNameError) {
    return new ApiError({
      statusCode: 400,
      code: 'INVALID_DECK_NAME',
      title: 'Invalid deck name',
      detail: error.message,
    });
  }

  if (error instanceof DeckRuleViolationError) {
    return new ApiError({
      statusCode: 400,
      code: error.code,
      title: 'Invalid deck',
      detail: error.message,
    });
  }

  return error instanceof Error
    ? error
    : new Error('Saved deck operation failed unexpectedly.');
}
