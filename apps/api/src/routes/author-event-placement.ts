import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  PlacementConflictError,
  type PlacementService,
} from '../placement/placement-service.js';

interface Options {
  service: PlacementService;
}
interface MutationBody {
  expectedVersion: number;
  reason: string;
}
interface OverrideBody extends MutationBody {
  kind: 'pin' | 'site_exclusion' | 'automation_pause';
  eventId?: string;
  siteId?: string;
  durationHours: number;
  idempotencyKey: string;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const reason = {
  type: 'string',
  minLength: 1,
  maxLength: 1000,
  pattern: '\\S',
} as const;
const endReason = { ...reason, maxLength: 500 } as const;
const mutation = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'reason'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    reason,
  },
} as const;
const param = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
} as const;
const requestId = { type: 'string' } as const;
const stateResultSchema = {
  type: 'object',
  additionalProperties: true,
  required: [
    'policyVersion',
    'rotationBucket',
    'stateVersion',
    'metrics',
    'zones',
    'sites',
    'assignments',
    'overrides',
    'requestId',
  ],
  properties: {
    policyVersion: { type: 'string' },
    rotationBucket: { type: 'string', format: 'date' },
    stateVersion: { type: 'integer' },
    currentPlanId: { anyOf: [uuid, { type: 'null' }] },
    nextRotationBoundary: { type: 'string', format: 'date-time' },
    metrics: {
      type: 'object',
      additionalProperties: false,
      required: [
        'targetAssignmentCount',
        'activeAssignmentCount',
        'activeZoneCount',
        'servedZoneCount',
        'unservedZoneCount',
        'lastAppliedAt',
        'lastFailureAt',
        'lastFailureCode',
      ],
      properties: {
        targetAssignmentCount: { type: 'integer' },
        activeAssignmentCount: { type: 'integer' },
        activeZoneCount: { type: 'integer' },
        servedZoneCount: { type: 'integer' },
        unservedZoneCount: { type: 'integer' },
        lastAppliedAt: {
          anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
        },
        lastFailureAt: {
          anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
        },
        lastFailureCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    },
    zones: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    sites: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    assignments: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    overrides: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    requestId,
  },
} as const;
const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'planId',
    'policyVersion',
    'rotationBucket',
    'stateVersion',
    'validUntil',
    'status',
    'entries',
    'zoneCounts',
    'exceptions',
  ],
  properties: {
    planId: uuid,
    policyVersion: { type: 'string' },
    rotationBucket: { type: 'string', format: 'date' },
    stateVersion: { type: 'integer' },
    validUntil: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['valid', 'degraded', 'unserved'] },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['eventId', 'siteId', 'zoneId', 'origin', 'preserved'],
        properties: {
          eventId: uuid,
          siteId: uuid,
          zoneId: uuid,
          origin: { type: 'string', enum: ['automatic', 'pin', 'rollback'] },
          preserved: { type: 'boolean' },
          startedAt: { type: 'string', format: 'date-time' },
          cooldownException: { type: 'boolean' },
        },
      },
    },
    zoneCounts: { type: 'object', additionalProperties: { type: 'integer' } },
    exceptions: { type: 'array', items: { type: 'string' } },
  },
} as const;
const planResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'requestId'],
  properties: { plan: planSchema, requestId },
} as const;
const historyResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['plans', 'requestId'],
  properties: {
    plans: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'planId',
          'policyVersion',
          'rotationBucket',
          'status',
          'trigger',
          'assignmentCount',
          'createdAt',
        ],
        properties: {
          planId: uuid,
          policyVersion: { type: 'string' },
          rotationBucket: { type: 'string', format: 'date' },
          status: { type: 'string' },
          trigger: { type: 'string' },
          failureCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          assignmentCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    requestId,
  },
} as const;
const versionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stateVersion', 'requestId'],
  properties: { stateVersion: { type: 'integer' }, requestId },
} as const;
const overrideResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['overrideId', 'replayed', 'requestId'],
  properties: { overrideId: uuid, replayed: { type: 'boolean' }, requestId },
} as const;

export const authorEventPlacementRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service },
) => {
  const guards = [app.authenticate, app.requireActivePlayer, app.requireAuthor];
  const common = {
    onRequest: guards,
    schema: {
      tags: ['Authoring'],
      security: [{ bearerAuth: [] }],
      response: { 200: stateResultSchema },
    },
  };

  app.get(
    '/author/event-placement',
    {
      ...common,
      schema: { ...common.schema, operationId: 'getAuthorEventPlacement' },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return { ...(await service.state()), requestId: request.id };
    },
  );

  app.get(
    '/author/event-placement/history',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'getAuthorEventPlacementHistory',
        response: { 200: historyResultSchema },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return { plans: await service.history(), requestId: request.id };
    },
  );

  app.post(
    '/author/event-placement/previews',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'previewAuthorEventPlacement',
        response: { 200: planResultSchema },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        plan: await service.preview(request.player!.id),
        requestId: request.id,
      };
    },
  );

  app.post<{ Body: MutationBody & { planId: string } }>(
    '/author/event-placement/apply',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'applyAuthorEventPlacement',
        response: { 200: planResultSchema },
        body: {
          ...mutation,
          required: [...mutation.required, 'planId'],
          properties: { ...mutation.properties, planId: uuid },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return {
          plan: await service.apply(
            request.player!.id,
            request.body.planId,
            request.body.expectedVersion,
            request.body.reason.trim(),
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwPlacementError(error);
      }
    },
  );

  app.post<{ Body: OverrideBody }>(
    '/author/event-placement/overrides',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'createAuthorEventPlacementOverride',
        response: { 200: overrideResultSchema },
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'kind',
            'expectedVersion',
            'reason',
            'durationHours',
            'idempotencyKey',
          ],
          properties: {
            ...mutation.properties,
            kind: {
              type: 'string',
              enum: ['pin', 'site_exclusion', 'automation_pause'],
            },
            eventId: uuid,
            siteId: uuid,
            idempotencyKey: uuid,
            durationHours: { type: 'integer', minimum: 1 },
          },
          oneOf: [
            {
              properties: { kind: { const: 'pin' } },
              required: ['eventId', 'siteId'],
            },
            {
              properties: { kind: { const: 'site_exclusion' } },
              required: ['siteId'],
              not: { required: ['eventId'] },
            },
            {
              properties: { kind: { const: 'automation_pause' } },
              not: {
                anyOf: [{ required: ['eventId'] }, { required: ['siteId'] }],
              },
            },
          ],
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return {
          ...(await service.override({
            ...request.body,
            actorId: request.player!.id,
            reason: request.body.reason.trim(),
          })),
          requestId: request.id,
        };
      } catch (error) {
        throwPlacementError(error);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: MutationBody }>(
    '/author/event-placement/overrides/:id/end',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'endAuthorEventPlacementOverride',
        response: { 200: versionResultSchema },
        params: param,
        body: {
          ...mutation,
          properties: { ...mutation.properties, reason: endReason },
        },
      },
    },
    async (request) => {
      try {
        return {
          ...(await service.endOverride(
            request.player!.id,
            request.params.id,
            request.body.expectedVersion,
            request.body.reason.trim(),
          )),
          requestId: request.id,
        };
      } catch (error) {
        throwPlacementError(error);
      }
    },
  );

  for (const entity of ['sites', 'zones'] as const) {
    app.post<{
      Params: { id: string };
      Body: MutationBody & {
        status: 'active' | 'suspended' | 'retired';
      };
    }>(
      `/author/event-placement/${entity}/:id/status`,
      {
        ...common,
        schema: {
          ...common.schema,
          operationId:
            entity === 'sites'
              ? 'changeAuthorPlacementSiteStatus'
              : 'changeAuthorPlacementZoneStatus',
          response: { 200: versionResultSchema },
          params: param,
          body: {
            ...mutation,
            required: [...mutation.required, 'status'],
            properties: {
              ...mutation.properties,
              status: {
                type: 'string',
                enum: ['active', 'suspended', 'retired'],
              },
            },
          },
        },
      },
      async (request) => {
        try {
          const action =
            entity === 'sites' ? service.changeSite : service.changeZone;
          return {
            ...(await action(
              request.player!.id,
              request.params.id,
              request.body.status,
              request.body.expectedVersion,
              request.body.reason.trim(),
            )),
            requestId: request.id,
          };
        } catch (error) {
          throwPlacementError(error);
        }
      },
    );
  }

  app.post<{
    Params: { id: string };
    Body: MutationBody & {
      action: 'approve' | 'withdraw';
    };
  }>(
    '/author/event-placement/events/:id/portability',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'reviewAuthorEventPortability',
        response: { 200: versionResultSchema },
        params: param,
        body: {
          ...mutation,
          required: [...mutation.required, 'action'],
          properties: {
            ...mutation.properties,
            reason: endReason,
            action: { type: 'string', enum: ['approve', 'withdraw'] },
          },
        },
      },
    },
    async (request) => {
      try {
        const action =
          request.body.action === 'approve'
            ? service.approvePortability
            : service.endPortability;
        return {
          ...(await action(
            request.player!.id,
            request.params.id,
            request.body.expectedVersion,
            request.body.reason.trim(),
          )),
          requestId: request.id,
        };
      } catch (error) {
        throwPlacementError(error);
      }
    },
  );

  app.post<{ Body: MutationBody & { sourcePlanId: string } }>(
    '/author/event-placement/rollback',
    {
      ...common,
      schema: {
        ...common.schema,
        operationId: 'rollbackAuthorEventPlacement',
        response: { 200: planResultSchema },
        body: {
          ...mutation,
          required: [...mutation.required, 'sourcePlanId'],
          properties: { ...mutation.properties, sourcePlanId: uuid },
        },
      },
    },
    async (request) => {
      try {
        return {
          plan: await service.rollback(
            request.player!.id,
            request.body.sourcePlanId,
            request.body.expectedVersion,
            request.body.reason.trim(),
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwPlacementError(error);
      }
    },
  );
};

function throwPlacementError(error: unknown): never {
  if (error instanceof PlacementConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: error.code,
      title: 'Placement operation unavailable',
      detail:
        'The placement state or requested operation has changed. Refresh and retry.',
    });
  }
  throw error;
}
