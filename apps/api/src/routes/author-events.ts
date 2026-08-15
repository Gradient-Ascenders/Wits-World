import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  AuthorEventNotFoundError,
  InvalidAuthorEventError,
  type AuthorEventService,
} from '../events/author-event-service.js';

interface AuthorEventRoutesOptions {
  service: AuthorEventService;
}

interface AuthorEventParams {
  eventId: string;
}

interface AuthorEventBody {
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
}

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

const authorEventSchema = {
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
    'isPublished',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    eventId: {
      type: 'string',
      format: 'uuid',
    },
    title: {
      type: 'string',
    },
    description: {
      anyOf: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
    },
    latitude: {
      type: 'number',
      minimum: -90,
      maximum: 90,
    },
    longitude: {
      type: 'number',
      minimum: -180,
      maximum: 180,
    },
    radiusMetres: {
      type: 'integer',
      minimum: 1,
    },
    startsAt: {
      type: 'string',
      format: 'date-time',
    },
    endsAt: {
      type: 'string',
      format: 'date-time',
    },
    isPublished: {
      type: 'boolean',
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

const authorEventBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'latitude',
    'longitude',
    'radiusMetres',
    'startsAt',
    'endsAt',
  ],
  properties: {
    title: {
      type: 'string',
      minLength: 1,
    },
    description: {
      anyOf: [
        {
          type: 'string',
          minLength: 1,
        },
        {
          type: 'null',
        },
      ],
    },
    latitude: {
      type: 'number',
      minimum: -90,
      maximum: 90,
    },
    longitude: {
      type: 'number',
      minimum: -180,
      maximum: 180,
    },
    radiusMetres: {
      type: 'integer',
      minimum: 1,
    },
    startsAt: {
      type: 'string',
      format: 'date-time',
    },
    endsAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

const authorEventParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId'],
  properties: {
    eventId: {
      type: 'string',
      format: 'uuid',
    },
  },
} as const;

export const authorEventRoutes: FastifyPluginAsync<
  AuthorEventRoutesOptions
> = async (app, { service }) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get(
    '/author/events',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorEvents',
        summary: 'List events for Authors',
        description:
          'Returns draft and published event definitions for protected Basic content management.',
        tags: ['Authoring'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['events', 'requestId'],
            properties: {
              events: {
                type: 'array',
                items: authorEventSchema,
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
    async (request) => {
      const events = await service.listEvents();

      return {
        events,
        requestId: request.id,
      };
    },
  );

  app.post<{
    Body: AuthorEventBody;
  }>(
    '/author/events',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'createAuthorEvent',
        summary: 'Create an event draft',
        description:
          'Creates an unpublished event definition and records the acting Author in the audit trail.',
        tags: ['Authoring'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        body: authorEventBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['event', 'requestId'],
            properties: {
              event: authorEventSchema,
              requestId: {
                type: 'string',
              },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const author = requireResolvedAuthor(request);

      try {
        const event = await service.createEvent({
          actorPlayerId: author.id,
          title: request.body.title,
          description: request.body.description,
          latitude: request.body.latitude,
          longitude: request.body.longitude,
          radiusMetres: request.body.radiusMetres,
          startsAt: request.body.startsAt,
          endsAt: request.body.endsAt,
        });

        return reply.code(201).send({
          event,
          requestId: request.id,
        });
      } catch (error) {
        throwAuthorEventError(error);
      }
    },
  );

  app.put<{
    Params: AuthorEventParams;
    Body: AuthorEventBody;
  }>(
    '/author/events/:eventId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'updateAuthorEvent',
        summary: 'Update an event definition',
        description:
          'Updates an existing event definition and records the acting Author in the audit trail.',
        tags: ['Authoring'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        params: authorEventParamsSchema,
        body: authorEventBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['event', 'requestId'],
            properties: {
              event: authorEventSchema,
              requestId: {
                type: 'string',
              },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        const event = await service.updateEvent({
          actorPlayerId: author.id,
          eventId: request.params.eventId,
          title: request.body.title,
          description: request.body.description,
          latitude: request.body.latitude,
          longitude: request.body.longitude,
          radiusMetres: request.body.radiusMetres,
          startsAt: request.body.startsAt,
          endsAt: request.body.endsAt,
        });

        return {
          event,
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorEventError(error);
      }
    },
  );
};

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

function throwAuthorEventError(error: unknown): never {
  if (error instanceof InvalidAuthorEventError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_EVENT',
      title: 'Invalid event',
      detail: error.message,
    });
  }

  if (error instanceof AuthorEventNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
      title: 'Event not found',
      detail: 'The requested event was not found.',
    });
  }

  throw error;
}
