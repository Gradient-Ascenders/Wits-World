import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { AuthorContentEntityType } from '../authoring/content-workflow.js';
import type { AuthorContentReadService } from '../authoring/content-read-service.js';
import { throwAuthorContentWorkflowError } from '../authoring/workflow-api-error.js';

interface Options {
  service: AuthorContentReadService;
}
interface PageQuery {
  entityType?: AuthorContentEntityType;
  page?: number;
  pageSize?: number;
}
interface HistoryParams {
  entityType: AuthorContentEntityType;
  entityId: string;
}
interface HistoryQuery {
  page?: number;
  pageSize?: number;
}

const entityTypes = [
  'event',
  'challenge',
  'question',
  'card',
  'campaign',
] as const;
const statuses = [
  'draft',
  'in_review',
  'approved',
  'published',
  'retired',
] as const;
const actions = [
  'create',
  'edit',
  'submit',
  'approve',
  'return',
  'publish',
  'retire',
] as const;
const bearerSecurity = [{ bearerAuth: [] }] as const;
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
const paginationProperties = {
  page: { type: 'integer', minimum: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  totalItems: { type: 'integer', minimum: 0 },
  totalPages: { type: 'integer', minimum: 0 },
} as const;

export const authorContentRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service },
) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get<{ Querystring: PageQuery }>(
    '/author/review-queue',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorReviewQueue',
        summary: 'List submitted Author content',
        description:
          'Returns safe summaries only; private answers and full content bodies are excluded.',
        tags: ['Authoring'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            entityType: { type: 'string', enum: entityTypes },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'items',
              'page',
              'pageSize',
              'totalItems',
              'totalPages',
              'requestId',
            ],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'entityType',
                    'entityId',
                    'eventId',
                    'challengeId',
                    'label',
                    'status',
                    'version',
                    'submittedBy',
                    'submittedByName',
                    'submittedAt',
                    'canReview',
                  ],
                  properties: {
                    entityType: { type: 'string', enum: entityTypes },
                    entityId: { type: 'string', format: 'uuid' },
                    eventId: {
                      type: 'string',
                      format: 'uuid',
                      nullable: true,
                    },
                    challengeId: {
                      type: 'string',
                      format: 'uuid',
                      nullable: true,
                    },
                    label: { type: 'string' },
                    status: { type: 'string', enum: ['in_review'] },
                    version: { type: 'integer', minimum: 0 },
                    submittedBy: { type: 'string', format: 'uuid' },
                    submittedByName: { type: 'string' },
                    submittedAt: { type: 'string', format: 'date-time' },
                    canReview: { type: 'boolean' },
                  },
                },
              },
              ...paginationProperties,
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const author = requireAuthor(request);
      const result = await service.listReviewQueue({
        actorPlayerId: author.id,
        entityType: request.query.entityType,
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 20,
      });
      return { ...result, requestId: request.id };
    },
  );

  app.get<{ Params: HistoryParams; Querystring: HistoryQuery }>(
    '/author/content/:entityType/:entityId/history',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'getAuthorContentHistory',
        summary: 'Read Author content audit history',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['entityType', 'entityId'],
          properties: {
            entityType: { type: 'string', enum: entityTypes },
            entityId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'items',
              'page',
              'pageSize',
              'totalItems',
              'totalPages',
              'requestId',
            ],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'auditId',
                    'action',
                    'fromStatus',
                    'toStatus',
                    'resultingVersion',
                    'note',
                    'actorPlayerId',
                    'actorPlayerName',
                    'occurredAt',
                  ],
                  properties: {
                    auditId: { type: 'string', format: 'uuid' },
                    action: { type: 'string', enum: actions },
                    fromStatus: {
                      type: 'string',
                      enum: statuses,
                      nullable: true,
                    },
                    toStatus: { type: 'string', enum: statuses },
                    resultingVersion: { type: 'integer', minimum: 0 },
                    note: { type: 'string', nullable: true },
                    actorPlayerId: { type: 'string', format: 'uuid' },
                    actorPlayerName: { type: 'string' },
                    occurredAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              ...paginationProperties,
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const result = await service.getHistory({
          ...request.params,
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 20,
        });
        return { ...result, requestId: request.id };
      } catch (error) {
        throwAuthorContentWorkflowError(error);
        throw error;
      }
    },
  );
};

function requireAuthor(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player)
    throw new Error('Author request has no active player context.');
  return request.player;
}
