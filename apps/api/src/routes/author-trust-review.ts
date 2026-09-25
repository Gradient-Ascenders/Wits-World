import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { throwTrustReviewApiError } from '../trust/trust-review-api-error.js';
import type { TrustReviewBand } from '../trust/trust-policy.js';
import type {
  TrustCaseStatusFilter,
  TrustRestrictionScope,
  TrustReviewAction,
  TrustReviewService,
} from '../trust/trust-review-service.js';

interface Options {
  service: TrustReviewService;
}

interface QueueQuery {
  band?: TrustReviewBand;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: TrustCaseStatusFilter;
}

interface CaseParams {
  caseId: string;
}

interface DecisionBody {
  action: TrustReviewAction;
  durationHours?: number;
  evidenceIds?: string[];
  expectedVersion: number;
  reasonNote: string;
  restrictionScopes?: TrustRestrictionScope[];
}

const bearerSecurity = [{ bearerAuth: [] }] as const;
const caseStatuses = ['open', 'under_review', 'resolved'] as const;
const reviewBands = [
  'normal',
  'observe',
  'review_required',
  'urgent_review',
] as const;
const restrictionScopes = [
  'online_verification_required',
  'location_reward_challenge_hold',
  'new_competitive_match_hold',
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
const queueItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'caseId',
    'playerId',
    'playerName',
    'status',
    'version',
    'score',
    'band',
    'policyVersion',
    'openedAt',
    'updatedAt',
    'activeRestrictionCount',
    'latestRestrictionExpiry',
    'canReview',
  ],
  properties: {
    caseId: { type: 'string', format: 'uuid' },
    playerId: { type: 'string', format: 'uuid' },
    playerName: { type: 'string' },
    status: { type: 'string', enum: caseStatuses },
    version: { type: 'integer', minimum: 1 },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    band: { type: 'string', enum: reviewBands },
    policyVersion: { type: 'string' },
    openedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    activeRestrictionCount: { type: 'integer', minimum: 0 },
    latestRestrictionExpiry: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    canReview: { type: 'boolean' },
  },
} as const;
const restrictionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'restrictionId',
    'decisionId',
    'scope',
    'startsAt',
    'originalExpiresAt',
    'effectiveExpiresAt',
    'active',
  ],
  properties: {
    restrictionId: { type: 'string', format: 'uuid' },
    decisionId: { type: 'string', format: 'uuid' },
    scope: { type: 'string', enum: restrictionScopes },
    startsAt: { type: 'string', format: 'date-time' },
    originalExpiresAt: { type: 'string', format: 'date-time' },
    effectiveExpiresAt: { type: 'string', format: 'date-time' },
    active: { type: 'boolean' },
  },
} as const;
const caseDetailSchema = {
  ...queueItemSchema,
  required: [
    ...queueItemSchema.required,
    'scoreExplanation',
    'evidence',
    'history',
  ],
  properties: {
    ...queueItemSchema.properties,
    scoreExplanation: {
      type: 'object',
      additionalProperties: false,
      required: [
        'snapshotId',
        'evaluatedAt',
        'movementPoints',
        'submissionConflictPoints',
        'opponentPatternPoints',
        'finalScore',
        'reviewBand',
        'sourceSignalCount',
      ],
      properties: {
        snapshotId: { type: 'string', format: 'uuid' },
        evaluatedAt: { type: 'string', format: 'date-time' },
        movementPoints: { type: 'integer', minimum: 0, maximum: 50 },
        submissionConflictPoints: {
          type: 'integer',
          minimum: 0,
          maximum: 30,
        },
        opponentPatternPoints: { type: 'integer', minimum: 0, maximum: 30 },
        finalScore: { type: 'integer', minimum: 0, maximum: 100 },
        reviewBand: { type: 'string', enum: reviewBands },
        sourceSignalCount: { type: 'integer', minimum: 0 },
      },
    },
    evidence: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'evidenceId',
          'signalType',
          'severity',
          'basePoints',
          'effectivePoints',
          'observedAt',
          'expiresAt',
          'state',
          'safeSourceType',
          'policyVersion',
        ],
        properties: {
          evidenceId: { type: 'string', format: 'uuid' },
          signalType: {
            type: 'string',
            enum: [
              'impossible_movement',
              'idempotency_payload_conflict',
              'submission_conflict_pattern',
              'opponent_concentration',
              'one_sided_outcome_pattern',
            ],
          },
          severity: { type: 'string' },
          basePoints: { type: 'integer', minimum: 1, maximum: 25 },
          effectivePoints: { type: 'integer', minimum: 0, maximum: 25 },
          observedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          state: {
            type: 'string',
            enum: ['active', 'adjusted_false_positive', 'expired'],
          },
          safeSourceType: { type: 'string' },
          policyVersion: { type: 'string' },
        },
      },
    },
    history: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'decisionId',
          'actorType',
          'actorPlayerId',
          'actorPlayerName',
          'policyVersion',
          'caseVersionBefore',
          'caseVersionAfter',
          'decisionType',
          'previousStatus',
          'resultingStatus',
          'reasonCode',
          'reasonNote',
          'evidenceIds',
          'restrictions',
          'occurredAt',
        ],
        properties: {
          decisionId: { type: 'string', format: 'uuid' },
          actorType: { type: 'string', enum: ['author', 'system'] },
          actorPlayerId: { type: 'string', format: 'uuid', nullable: true },
          actorPlayerName: { type: 'string', nullable: true },
          policyVersion: { type: 'string' },
          caseVersionBefore: { type: 'integer', minimum: 0 },
          caseVersionAfter: { type: 'integer', minimum: 1 },
          decisionType: { type: 'string' },
          previousStatus: {
            type: 'string',
            enum: [...caseStatuses, null],
            nullable: true,
          },
          resultingStatus: { type: 'string', enum: caseStatuses },
          reasonCode: { type: 'string' },
          reasonNote: { type: 'string', nullable: true },
          evidenceIds: {
            type: 'array',
            maxItems: 100,
            items: { type: 'string', format: 'uuid' },
          },
          restrictions: {
            type: 'array',
            maxItems: 4,
            items: restrictionSchema,
          },
          occurredAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
} as const;

export const authorTrustReviewRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service },
) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get<{ Querystring: QueueQuery }>(
    '/author/trust-cases',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorTrustCases',
        summary: 'List privacy-safe trust review cases',
        description:
          'Returns Author-only review priority and safe derived evidence metadata. It never exposes precise location, Auth0 identity, submitted answers, detector thresholds, or raw source payloads.',
        tags: ['Trust review'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            search: { type: 'string', minLength: 1, maxLength: 100 },
            status: {
              type: 'string',
              enum: ['active', 'all', ...caseStatuses],
              default: 'active',
            },
            band: { type: 'string', enum: reviewBands },
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
              items: { type: 'array', items: queueItemSchema },
              page: { type: 'integer', minimum: 1 },
              pageSize: { type: 'integer', minimum: 1, maximum: 100 },
              totalItems: { type: 'integer', minimum: 0 },
              totalPages: { type: 'integer', minimum: 0 },
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          ...(await service.listCases({
            actorPlayerId: requireAuthor(request).id,
            ...request.query,
            page: request.query.page ?? 1,
            pageSize: request.query.pageSize ?? 20,
          })),
          requestId: request.id,
        };
      } catch (error) {
        throwTrustReviewApiError(error);
        throw error;
      }
    },
  );

  app.get<{ Params: CaseParams }>(
    '/author/trust-cases/:caseId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'getAuthorTrustCase',
        summary: 'Inspect one privacy-safe trust case',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['caseId'],
          properties: { caseId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['case', 'requestId'],
            properties: {
              case: caseDetailSchema,
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
        return {
          case: await service.getCase(
            requireAuthor(request).id,
            request.params.caseId,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwTrustReviewApiError(error);
        throw error;
      }
    },
  );

  app.post<{ Body: DecisionBody; Params: CaseParams }>(
    '/author/trust-cases/:caseId/decisions',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'recordAuthorTrustDecision',
        summary: 'Record a versioned human trust-review decision',
        description:
          'Atomically records the active Author, database time, reason, evidence, resulting case version, and any bounded restriction. Scores and decision outcomes remain server-authoritative.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['caseId'],
          properties: { caseId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'expectedVersion', 'reasonNote'],
          properties: {
            action: {
              type: 'string',
              enum: [
                'continue_monitoring',
                'dismiss',
                'mark_false_positive',
                'restrict',
              ],
            },
            expectedVersion: { type: 'integer', minimum: 1 },
            reasonNote: { type: 'string', minLength: 1, maxLength: 1000 },
            evidenceIds: {
              type: 'array',
              maxItems: 100,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
            restrictionScopes: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              uniqueItems: true,
              items: { type: 'string', enum: restrictionScopes },
            },
            durationHours: { type: 'integer', minimum: 1, maximum: 168 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['case', 'requestId'],
            properties: {
              case: caseDetailSchema,
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          case: await service.recordDecision({
            actorPlayerId: requireAuthor(request).id,
            caseId: request.params.caseId,
            ...request.body,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwTrustReviewApiError(error);
        throw error;
      }
    },
  );
};

function requireAuthor(request: FastifyRequest) {
  const author = request.player;
  if (!author || author.role !== 'author') {
    throw new Error('Author guard did not establish an Author request.');
  }
  return author;
}
