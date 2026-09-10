import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { throwAuthorContentWorkflowError } from '../authoring/workflow-api-error.js';
import { ApiError } from '../errors/api-error.js';
import {
  AuthorEventNotFoundError,
  AuthorEventNotReadyError,
  AuthorEventStateConflictError,
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

interface UpdateAuthorEventBody extends AuthorEventBody {
  expectedVersion: number;
}

interface LifecycleBody {
  expectedVersion: number;
  note?: string;
}

interface ReturnBody {
  expectedVersion: number;
  reason: string;
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
    'sourceUrls',
    'startsAt',
    'endsAt',
    'isPublished',
    'createdAt',
    'updatedAt',
    'authoringStatus',
    'retiredAt',
    'version',
    'submittedBy',
    'submittedAt',
    'reviewedBy',
    'reviewedAt',
    'publicationProvenance',
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
      type: 'string',
      nullable: true,
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
    sourceUrls: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
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
    authoringStatus: {
      type: 'string',
      enum: ['draft', 'in_review', 'approved', 'published', 'retired'],
    },
    retiredAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    version: { type: 'integer', minimum: 0 },
    submittedBy: { type: 'string', format: 'uuid', nullable: true },
    submittedAt: { type: 'string', format: 'date-time', nullable: true },
    reviewedBy: { type: 'string', format: 'uuid', nullable: true },
    reviewedAt: { type: 'string', format: 'date-time', nullable: true },
    publicationProvenance: {
      type: 'string',
      enum: ['legacy', 'controlled_seed', 'reviewed', null],
      nullable: true,
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
      type: 'string',
      minLength: 1,
      nullable: true,
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

const updateAuthorEventBodySchema = {
  ...authorEventBodySchema,
  required: [...authorEventBodySchema.required, 'expectedVersion'],
  properties: {
    ...authorEventBodySchema.properties,
    expectedVersion: { type: 'integer', minimum: 0 },
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

const lifecycleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    note: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
  },
} as const;

const returnBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'reason'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    reason: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
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
          'Returns event definitions in every Author lifecycle state for protected Basic content management.',
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
    Body: UpdateAuthorEventBody;
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
        body: updateAuthorEventBodySchema,
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
          expectedVersion: request.body.expectedVersion,
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

  for (const action of ['submit', 'approve'] as const) {
    app.post<{ Params: AuthorEventParams; Body: LifecycleBody }>(
      `/author/events/:eventId/${action}`,
      {
        onRequest: authorGuards,
        schema: {
          operationId: `${action}AuthorEvent`,
          summary: `${action === 'submit' ? 'Submit' : 'Approve'} an event`,
          tags: ['Authoring'],
          security: [{ bearerAuth: [] }],
          params: authorEventParamsSchema,
          body: lifecycleBodySchema,
          response: lifecycleEventResponses(),
        },
      },
      async (request) => {
        const author = requireResolvedAuthor(request);
        try {
          const transition =
            action === 'submit' ? service.submitEvent : service.approveEvent;
          return {
            event: await transition({
              actorPlayerId: author.id,
              eventId: request.params.eventId,
              expectedVersion: request.body.expectedVersion,
              note: request.body.note,
            }),
            requestId: request.id,
          };
        } catch (error) {
          throwAuthorEventError(error);
        }
      },
    );
  }

  app.post<{ Params: AuthorEventParams; Body: ReturnBody }>(
    '/author/events/:eventId/return',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'returnAuthorEvent',
        summary: 'Return an event to draft',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        params: authorEventParamsSchema,
        body: returnBodySchema,
        response: lifecycleEventResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);
      try {
        return {
          event: await service.returnEvent({
            actorPlayerId: author.id,
            eventId: request.params.eventId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.reason,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorEventError(error);
      }
    },
  );

  app.post<{
    Params: AuthorEventParams;
    Body: LifecycleBody;
  }>(
    '/author/events/:eventId/publish',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'publishAuthorEvent',
        summary: 'Publish a ready event',
        description:
          'Publishes an approved event only after rechecking its Basic challenge and reward catalogue dependencies.',
        tags: ['Authoring'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        params: authorEventParamsSchema,
        body: lifecycleBodySchema,
        response: lifecycleEventResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          event: await service.publishEvent({
            actorPlayerId: author.id,
            eventId: request.params.eventId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.note,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorEventError(error);
      }
    },
  );

  app.post<{
    Params: AuthorEventParams;
    Body: LifecycleBody;
  }>(
    '/author/events/:eventId/retire',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'retireAuthorEvent',
        summary: 'Retire an event',
        description:
          'Removes an event from player publication while preserving its immutable authored record.',
        tags: ['Authoring'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        params: authorEventParamsSchema,
        body: lifecycleBodySchema,
        response: lifecycleEventResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          event: await service.retireEvent({
            actorPlayerId: author.id,
            eventId: request.params.eventId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.note,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorEventError(error);
      }
    },
  );
};

function lifecycleEventResponses() {
  return {
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

function throwAuthorEventError(error: unknown): never {
  throwAuthorContentWorkflowError(error);
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

  if (error instanceof AuthorEventStateConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONTENT_STATE_CONFLICT',
      title: 'Content state conflict',
      detail: error.message,
    });
  }

  if (error instanceof AuthorEventNotReadyError) {
    throw new ApiError({
      statusCode: 422,
      code: 'CONTENT_NOT_READY',
      title: 'Content not ready',
      detail: error.message,
    });
  }

  throw error;
}
