import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  AuthorTrailNotFoundError,
  AuthorTrailNotReadyError,
  AuthorTrailStateConflictError,
  InvalidAuthorTrailError,
  type AuthorTrailService,
} from '../trails/author-trail-service.js';

interface AuthorTrailRoutesOptions {
  service: AuthorTrailService;
}

interface AuthorTrailParams {
  trailId: string;
}

interface AuthorTrailBody {
  title: string;
  description?: string | null;
  eventIds: string[];
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
    validation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'message'],
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
} as const;

const authorTrailSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'trailId',
    'title',
    'description',
    'status',
    'publishedAt',
    'retiredAt',
    'createdAt',
    'updatedAt',
    'steps',
  ],
  properties: {
    trailId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['draft', 'published', 'retired'] },
    publishedAt: { type: 'string', format: 'date-time', nullable: true },
    retiredAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['position', 'eventId', 'title', 'eventStatus'],
        properties: {
          position: { type: 'integer', minimum: 1, maximum: 50 },
          eventId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          eventStatus: {
            type: 'string',
            enum: ['draft', 'published', 'retired'],
          },
        },
      },
    },
  },
} as const;

const authorTrailBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'eventIds'],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1, nullable: true },
    eventIds: {
      type: 'array',
      maxItems: 50,
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
  },
} as const;

const authorTrailParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['trailId'],
  properties: {
    trailId: { type: 'string', format: 'uuid' },
  },
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
} as const;

export const authorTrailRoutes: FastifyPluginAsync<
  AuthorTrailRoutesOptions
> = async (app, { service }) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get(
    '/author/trails',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorTrails',
        summary: 'List trails for Authors',
        description:
          'Returns draft, published, and retired ordered trail definitions for protected content management.',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['trails', 'requestId'],
            properties: {
              trails: { type: 'array', items: authorTrailSchema },
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      trails: await service.listTrails(),
      requestId: request.id,
    }),
  );

  app.post<{ Body: AuthorTrailBody }>(
    '/author/trails',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'createAuthorTrail',
        summary: 'Create a trail draft',
        description:
          'Creates an editable draft with its ordered event membership and records the acting Author.',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        body: authorTrailBodySchema,
        response: {
          201: trailResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const author = requireResolvedAuthor(request);

      try {
        const trail = await service.createTrail({
          actorPlayerId: author.id,
          title: request.body.title,
          description: request.body.description,
          eventIds: request.body.eventIds,
        });

        return reply.code(201).send({ trail, requestId: request.id });
      } catch (error) {
        throwAuthorTrailError(error);
      }
    },
  );

  app.put<{ Params: AuthorTrailParams; Body: AuthorTrailBody }>(
    '/author/trails/:trailId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'updateAuthorTrail',
        summary: 'Update and reorder a trail draft',
        description:
          'Replaces the draft metadata and ordered event membership atomically.',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        params: authorTrailParamsSchema,
        body: authorTrailBodySchema,
        response: lifecycleTrailResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          trail: await service.updateTrail({
            actorPlayerId: author.id,
            trailId: request.params.trailId,
            title: request.body.title,
            description: request.body.description,
            eventIds: request.body.eventIds,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorTrailError(error);
      }
    },
  );

  app.post<{ Params: AuthorTrailParams; Body: Record<string, never> }>(
    '/author/trails/:trailId/publish',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'publishAuthorTrail',
        summary: 'Publish a ready trail',
        description:
          'Publishes a trail containing at least two ordered, published, non-retired events.',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        params: authorTrailParamsSchema,
        body: emptyBodySchema,
        response: lifecycleTrailResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          trail: await service.publishTrail(author.id, request.params.trailId),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorTrailError(error);
      }
    },
  );

  app.post<{ Params: AuthorTrailParams; Body: Record<string, never> }>(
    '/author/trails/:trailId/retire',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'retireAuthorTrail',
        summary: 'Retire a trail',
        description:
          'Removes the trail from active guidance while preserving progress for players who started it.',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        params: authorTrailParamsSchema,
        body: emptyBodySchema,
        response: lifecycleTrailResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          trail: await service.retireTrail(author.id, request.params.trailId),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorTrailError(error);
      }
    },
  );
};

const trailResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['trail', 'requestId'],
  properties: {
    trail: authorTrailSchema,
    requestId: { type: 'string' },
  },
} as const;

function lifecycleTrailResponses() {
  return {
    200: trailResponseSchema,
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

function throwAuthorTrailError(error: unknown): never {
  if (error instanceof InvalidAuthorTrailError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_TRAIL',
      title: 'Invalid trail',
      detail: error.message,
    });
  }

  if (error instanceof AuthorTrailNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'TRAIL_NOT_FOUND',
      title: 'Trail not found',
      detail: 'The requested trail was not found.',
    });
  }

  if (error instanceof AuthorTrailStateConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONTENT_STATE_CONFLICT',
      title: 'Content state conflict',
      detail: error.message,
    });
  }

  if (error instanceof AuthorTrailNotReadyError) {
    throw new ApiError({
      statusCode: 422,
      code: 'CONTENT_NOT_READY',
      title: 'Content not ready',
      detail: error.message,
    });
  }

  throw error;
}
