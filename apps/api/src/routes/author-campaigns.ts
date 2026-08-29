import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { throwAuthorContentWorkflowError } from '../authoring/workflow-api-error.js';
import {
  AuthorCampaignNotFoundError,
  InvalidAuthorCampaignError,
  type AuthorCampaignService,
} from '../campaigns/author-campaign-service.js';
import { ApiError } from '../errors/api-error.js';

interface Options {
  service: AuthorCampaignService;
}

interface CampaignParams {
  campaignId: string;
}

interface CampaignBody {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  eventIds: string[];
  trailIds: string[];
}

interface UpdateCampaignBody extends CampaignBody {
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

const statuses = [
  'draft',
  'in_review',
  'approved',
  'published',
  'retired',
] as const;

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

const lifecycleProperties = {
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
} as const;

const campaignSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'campaignId',
    'title',
    'description',
    'status',
    'startsAt',
    'endsAt',
    ...Object.keys(lifecycleProperties),
    'publishedAt',
    'retiredAt',
    'createdAt',
    'updatedAt',
    'events',
    'trails',
  ],
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: statuses },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    ...lifecycleProperties,
    publishedAt: { type: 'string', format: 'date-time', nullable: true },
    retiredAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['eventId', 'title', 'authoringStatus', 'startsAt', 'endsAt'],
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          authoringStatus: { type: 'string', enum: statuses },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    trails: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trailId', 'title', 'status'],
        properties: {
          trailId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          status: {
            type: 'string',
            enum: ['draft', 'published', 'retired'],
          },
        },
      },
    },
  },
} as const;

const campaignBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'startsAt', 'endsAt', 'eventIds', 'trailIds'],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1, nullable: true },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    eventIds: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
    trailIds: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
  },
} as const;

const updateCampaignBodySchema = {
  ...campaignBodySchema,
  required: [...campaignBodySchema.required, 'expectedVersion'],
  properties: {
    ...campaignBodySchema.properties,
    expectedVersion: { type: 'integer', minimum: 0 },
  },
} as const;

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['campaignId'],
  properties: { campaignId: { type: 'string', format: 'uuid' } },
} as const;

const lifecycleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    note: { type: 'string', minLength: 1, maxLength: 1000 },
  },
} as const;

const returnBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'reason'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    reason: { type: 'string', minLength: 1, maxLength: 1000 },
  },
} as const;

const campaignResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['campaign', 'requestId'],
  properties: {
    campaign: campaignSchema,
    requestId: { type: 'string' },
  },
} as const;

const lifecycleResponses = {
  200: campaignResponseSchema,
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
} as const;

export const authorCampaignRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service },
) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get(
    '/author/campaigns',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorCampaigns',
        summary: 'List campaign content and schedules',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['campaigns', 'requestId'],
            properties: {
              campaigns: { type: 'array', items: campaignSchema },
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      campaigns: await service.listCampaigns(),
      requestId: request.id,
    }),
  );

  app.post<{ Body: CampaignBody }>(
    '/author/campaigns',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'createAuthorCampaign',
        summary: 'Create a campaign draft',
        description:
          'Creates a bounded campaign draft. Empty drafts are allowed, but approval requires at least one valid member.',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        body: campaignBodySchema,
        response: {
          201: campaignResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const author = requireAuthor(request);
      try {
        const campaign = await service.createCampaign({
          actorPlayerId: author.id,
          ...request.body,
        });
        return reply.code(201).send({ campaign, requestId: request.id });
      } catch (error) {
        throwAuthorCampaignError(error);
      }
    },
  );

  app.put<{ Params: CampaignParams; Body: UpdateCampaignBody }>(
    '/author/campaigns/:campaignId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'updateAuthorCampaign',
        summary: 'Update a campaign draft',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        params: paramsSchema,
        body: updateCampaignBodySchema,
        response: lifecycleResponses,
      },
    },
    async (request) => {
      const author = requireAuthor(request);
      try {
        return {
          campaign: await service.updateCampaign({
            actorPlayerId: author.id,
            campaignId: request.params.campaignId,
            ...request.body,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorCampaignError(error);
      }
    },
  );

  for (const action of ['submit', 'approve', 'publish', 'retire'] as const) {
    app.post<{ Params: CampaignParams; Body: LifecycleBody }>(
      `/author/campaigns/:campaignId/${action}`,
      {
        onRequest: authorGuards,
        schema: {
          operationId: `${action}AuthorCampaign`,
          summary: `${titleCase(action)} a campaign`,
          description:
            action === 'approve' || action === 'publish'
              ? 'Validates campaign members, timing, and schedule conflicts before advancing the lifecycle.'
              : undefined,
          tags: ['Authoring'],
          security: [{ bearerAuth: [] }],
          params: paramsSchema,
          body: lifecycleBodySchema,
          response: lifecycleResponses,
        },
      },
      async (request) => {
        const author = requireAuthor(request);
        try {
          const transition = {
            submit: service.submitCampaign,
            approve: service.approveCampaign,
            publish: service.publishCampaign,
            retire: service.retireCampaign,
          }[action];
          return {
            campaign: await transition({
              actorPlayerId: author.id,
              campaignId: request.params.campaignId,
              expectedVersion: request.body.expectedVersion,
              note: request.body.note,
            }),
            requestId: request.id,
          };
        } catch (error) {
          throwAuthorCampaignError(error);
        }
      },
    );
  }

  app.post<{ Params: CampaignParams; Body: ReturnBody }>(
    '/author/campaigns/:campaignId/return',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'returnAuthorCampaign',
        summary: 'Return a campaign to draft',
        tags: ['Authoring'],
        security: [{ bearerAuth: [] }],
        params: paramsSchema,
        body: returnBodySchema,
        response: lifecycleResponses,
      },
    },
    async (request) => {
      const author = requireAuthor(request);
      try {
        return {
          campaign: await service.returnCampaign({
            actorPlayerId: author.id,
            campaignId: request.params.campaignId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.reason,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorCampaignError(error);
      }
    },
  );
};

function requireAuthor(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player) {
    throw new Error('Author request has no active player context.');
  }
  return request.player;
}

function throwAuthorCampaignError(error: unknown): never {
  throwAuthorContentWorkflowError(error);
  if (error instanceof InvalidAuthorCampaignError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_CAMPAIGN',
      title: 'Invalid campaign',
      detail: error.message,
    });
  }
  if (error instanceof AuthorCampaignNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'CAMPAIGN_NOT_FOUND',
      title: 'Campaign not found',
      detail: 'The requested campaign was not found.',
    });
  }
  throw error;
}

function titleCase(value: string): string {
  return value[0]!.toUpperCase() + value.slice(1);
}
