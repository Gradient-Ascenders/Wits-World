import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  InvalidTrustDecisionError,
  StaleTrustCaseVersionError,
  TRUST_REVIEW_DEFAULT_PAGE_SIZE,
  TRUST_REVIEW_MAX_NOTE_LENGTH,
  TRUST_REVIEW_MAX_PAGE_SIZE,
  TRUST_REVIEW_MAX_RESTRICTION_HOURS,
  TrustCaseNotFoundError,
  type TrustCaseStatus,
  type TrustDecisionAction,
  type TrustReviewService,
  type WritableTrustRestrictionScope,
} from '../trust/trust-review-service.js';
import type {
  TrustReviewBand,
  TrustSignalType,
} from '../trust/trust-policy.js';

interface Options {
  service: TrustReviewService;
}

interface QueueQuery {
  status?: TrustCaseStatus;
  band?: TrustReviewBand;
  restrictionState?: 'active' | 'none';
  signalType?: TrustSignalType;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  page?: number;
  pageSize?: number;
}

interface CaseParams {
  caseId: string;
}

interface HistoryQuery {
  page?: number;
  pageSize?: number;
}

interface DecisionBody {
  expectedVersion: number;
  action: TrustDecisionAction;
  reasonCode: string;
  note: string;
  evidenceIds?: string[];
  falsePositiveEvidenceIds?: string[];
  restrictionScopes?: WritableTrustRestrictionScope[];
  restrictionDurationHours?: number;
}

const statuses = ['open', 'under_review', 'resolved'] as const;
const bands = [
  'normal',
  'observe',
  'review_required',
  'urgent_review',
] as const;
const signalTypes = [
  'impossible_movement',
  'idempotency_payload_conflict',
  'submission_conflict_pattern',
  'opponent_concentration',
  'one_sided_outcome_pattern',
] as const;
const readableRestrictionScopes = [
  'online_verification_required',
  'location_reward_challenge_hold',
  'new_competitive_match_hold',
  'card_trade_hold',
] as const;
const writableRestrictionScopes = [
  'online_verification_required',
  'location_reward_challenge_hold',
  'new_competitive_match_hold',
] as const;
const appealStatuses = [
  'eligible',
  'submitted',
  'resolved',
  'expired',
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

const paginationProperties = {
  page: { type: 'integer', minimum: 1 },
  pageSize: {
    type: 'integer',
    minimum: 1,
    maximum: TRUST_REVIEW_MAX_PAGE_SIZE,
  },
  totalItems: { type: 'integer', minimum: 0 },
  totalPages: { type: 'integer', minimum: 0 },
} as const;

const caseParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['caseId'],
  properties: {
    caseId: { type: 'string', format: 'uuid' },
  },
} as const;

const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'evidenceId',
    'signalType',
    'severity',
    'basePoints',
    'effectivePoints',
    'observedAt',
    'decayState',
    'safeSourceType',
    'reviewedFalsePositive',
  ],
  properties: {
    evidenceId: { type: 'string', format: 'uuid' },
    signalType: { type: 'string', enum: signalTypes },
    severity: { type: 'string' },
    basePoints: { type: 'integer', minimum: 1, maximum: 25 },
    effectivePoints: { type: 'integer', minimum: 0, maximum: 25 },
    observedAt: { type: 'string', format: 'date-time' },
    decayState: {
      type: 'string',
      enum: ['active', 'expired', 'reviewed_false_positive'],
    },
    safeSourceType: { type: 'string' },
    reviewedFalsePositive: { type: 'boolean' },
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
    'appealStatus',
  ],
  properties: {
    restrictionId: { type: 'string', format: 'uuid' },
    decisionId: { type: 'string', format: 'uuid' },
    scope: { type: 'string', enum: readableRestrictionScopes },
    startsAt: { type: 'string', format: 'date-time' },
    originalExpiresAt: { type: 'string', format: 'date-time' },
    effectiveExpiresAt: { type: 'string', format: 'date-time' },
    active: { type: 'boolean' },
    appealStatus: { type: 'string', enum: appealStatuses },
  },
} as const;

const historyItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'decisionId',
    'actorType',
    'actorPlayerId',
    'actorPlayerName',
    'action',
    'previousStatus',
    'resultingStatus',
    'reasonCode',
    'reasonNote',
    'policyVersion',
    'versionBefore',
    'versionAfter',
    'evidenceIds',
    'falsePositiveEvidenceIds',
    'restrictions',
    'occurredAt',
  ],
  properties: {
    decisionId: { type: 'string', format: 'uuid' },
    actorType: { type: 'string', enum: ['system', 'author'] },
    actorPlayerId: {
      anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
    },
    actorPlayerName: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    action: { type: 'string' },
    previousStatus: {
      anyOf: [{ type: 'string', enum: statuses }, { type: 'null' }],
    },
    resultingStatus: { type: 'string', enum: statuses },
    reasonCode: { type: 'string' },
    reasonNote: {
      anyOf: [
        {
          type: 'string',
          minLength: 1,
          maxLength: TRUST_REVIEW_MAX_NOTE_LENGTH,
        },
        { type: 'null' },
      ],
    },
    policyVersion: { type: 'string' },
    versionBefore: { type: 'integer', minimum: 0 },
    versionAfter: { type: 'integer', minimum: 1 },
    evidenceIds: {
      type: 'array',
      maxItems: 100,
      items: { type: 'string', format: 'uuid' },
    },
    falsePositiveEvidenceIds: {
      type: 'array',
      maxItems: 100,
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
    restrictions: {
      type: 'array',
      maxItems: readableRestrictionScopes.length,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['scope', 'startsAt', 'expiresAt'],
        properties: {
          scope: { type: 'string', enum: readableRestrictionScopes },
          startsAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    occurredAt: { type: 'string', format: 'date-time' },
  },
} as const;

const detailSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'caseId',
    'playerId',
    'playerName',
    'status',
    'version',
    'currentScore',
    'currentBand',
    'policyVersion',
    'categoryTotals',
    'sourceSignalCount',
    'evidence',
    'restrictions',
    'recentHistory',
    'historyTruncated',
    'openedAt',
    'updatedAt',
    'resolvedAt',
    'resolutionReason',
    'requestId',
  ],
  properties: {
    caseId: { type: 'string', format: 'uuid' },
    playerId: { type: 'string', format: 'uuid' },
    playerName: { type: 'string' },
    status: { type: 'string', enum: statuses },
    version: { type: 'integer', minimum: 1 },
    currentScore: { type: 'integer', minimum: 0, maximum: 100 },
    currentBand: { type: 'string', enum: bands },
    policyVersion: { type: 'string' },
    categoryTotals: {
      type: 'object',
      additionalProperties: false,
      required: ['movement', 'submissionConflicts', 'opponentPatterns'],
      properties: {
        movement: { type: 'integer', minimum: 0, maximum: 50 },
        submissionConflicts: { type: 'integer', minimum: 0, maximum: 30 },
        opponentPatterns: { type: 'integer', minimum: 0, maximum: 30 },
      },
    },
    sourceSignalCount: { type: 'integer', minimum: 0 },
    evidence: { type: 'array', items: evidenceSchema },
    restrictions: { type: 'array', items: restrictionSchema },
    recentHistory: {
      type: 'array',
      maxItems: 20,
      items: historyItemSchema,
    },
    historyTruncated: { type: 'boolean' },
    openedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    resolvedAt: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    resolutionReason: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    requestId: { type: 'string' },
  },
} as const;

const pageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: {
      type: 'integer',
      minimum: 1,
      maximum: TRUST_REVIEW_MAX_PAGE_SIZE,
      default: TRUST_REVIEW_DEFAULT_PAGE_SIZE,
    },
  },
} as const;

const decisionCommonProperties = {
  expectedVersion: { type: 'integer', minimum: 1 },
  reasonCode: {
    type: 'string',
    minLength: 1,
    maxLength: 64,
    pattern: '^[a-z][a-z0-9_]{0,63}$',
  },
  note: {
    type: 'string',
    minLength: 1,
    maxLength: TRUST_REVIEW_MAX_NOTE_LENGTH,
    pattern: '^(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u001F\\u007F-\\u009F]+$',
    description:
      'Required reviewer note. It must be trimmed and contain no control characters.',
  },
  evidenceIds: {
    type: 'array',
    maxItems: 100,
    uniqueItems: true,
    description:
      'Safe evidence summaries referenced by the decision. Together with falsePositiveEvidenceIds, at most 100 distinct summaries may be referenced.',
    items: { type: 'string', format: 'uuid' },
  },
  falsePositiveEvidenceIds: {
    type: 'array',
    maxItems: 100,
    uniqueItems: true,
    description:
      'Referenced evidence explicitly reviewed as false-positive. Together with evidenceIds, at most 100 distinct summaries may be referenced.',
    items: { type: 'string', format: 'uuid' },
  },
} as const;

function decisionBodySchema(action: Exclude<TrustDecisionAction, 'restrict'>) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['expectedVersion', 'action', 'reasonCode', 'note'],
    properties: {
      ...decisionCommonProperties,
      action: { type: 'string', enum: [action] },
    },
  } as const;
}

const restrictDecisionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'expectedVersion',
    'action',
    'reasonCode',
    'note',
    'restrictionScopes',
    'restrictionDurationHours',
  ],
  properties: {
    ...decisionCommonProperties,
    action: { type: 'string', enum: ['restrict'] },
    restrictionScopes: {
      type: 'array',
      minItems: 1,
      maxItems: writableRestrictionScopes.length,
      uniqueItems: true,
      items: { type: 'string', enum: writableRestrictionScopes },
    },
    restrictionDurationHours: {
      type: 'integer',
      minimum: 1,
      maximum: TRUST_REVIEW_MAX_RESTRICTION_HOURS,
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
    '/author/trust/cases',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listSuspectPlayerCases',
        summary: 'List the protected suspect-player review queue',
        description:
          'Returns stable, privacy-limited case summaries for active Authors. Cases targeting the authenticated Author are excluded server-side.',
        tags: ['Trust review'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: statuses },
            band: { type: 'string', enum: bands },
            restrictionState: { type: 'string', enum: ['active', 'none'] },
            signalType: { type: 'string', enum: signalTypes },
            createdFrom: { type: 'string', format: 'date-time' },
            createdTo: { type: 'string', format: 'date-time' },
            updatedFrom: { type: 'string', format: 'date-time' },
            updatedTo: { type: 'string', format: 'date-time' },
            ...pageQuerySchema.properties,
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
                maxItems: TRUST_REVIEW_MAX_PAGE_SIZE,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'caseId',
                    'playerId',
                    'playerName',
                    'status',
                    'version',
                    'currentScore',
                    'currentBand',
                    'policyVersion',
                    'signalTypes',
                    'activeRestrictionScopes',
                    'openedAt',
                    'updatedAt',
                  ],
                  properties: {
                    caseId: { type: 'string', format: 'uuid' },
                    playerId: { type: 'string', format: 'uuid' },
                    playerName: { type: 'string' },
                    status: { type: 'string', enum: statuses },
                    version: { type: 'integer', minimum: 1 },
                    currentScore: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 100,
                    },
                    currentBand: { type: 'string', enum: bands },
                    policyVersion: { type: 'string' },
                    signalTypes: {
                      type: 'array',
                      uniqueItems: true,
                      items: { type: 'string', enum: signalTypes },
                    },
                    activeRestrictionScopes: {
                      type: 'array',
                      uniqueItems: true,
                      items: {
                        type: 'string',
                        enum: readableRestrictionScopes,
                      },
                    },
                    openedAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              ...paginationProperties,
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
      const author = requireAuthor(request);
      const result = await service.listCases({
        actorPlayerId: author.id,
        ...request.query,
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? TRUST_REVIEW_DEFAULT_PAGE_SIZE,
      });
      return { ...result, requestId: request.id };
    },
  );

  app.get<{ Params: CaseParams }>(
    '/author/trust/cases/:caseId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'getSuspectPlayerCase',
        summary: 'Read privacy-safe suspect-player case detail',
        description:
          'Returns derived evidence, score components, effective restrictions, and recent append-only history without precise location, provider identity, or raw private telemetry.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: caseParamsSchema,
        response: {
          200: detailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          ...(await service.getCase({
            actorPlayerId: requireAuthor(request).id,
            caseId: request.params.caseId,
          })),
          requestId: request.id,
        };
      } catch (error) {
        throw mapTrustReviewError(error);
      }
    },
  );

  app.get<{ Params: CaseParams; Querystring: HistoryQuery }>(
    '/author/trust/cases/:caseId/history',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listSuspectPlayerCaseHistory',
        summary: 'List append-only suspect-player audit history',
        description:
          'Returns policy-versioned case transitions with local reviewer identity, reason, linked safe evidence, and restriction scopes.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: caseParamsSchema,
        querystring: pageQuerySchema,
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
                maxItems: TRUST_REVIEW_MAX_PAGE_SIZE,
                items: historyItemSchema,
              },
              ...paginationProperties,
              requestId: { type: 'string' },
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
      try {
        return {
          ...(await service.listHistory({
            actorPlayerId: requireAuthor(request).id,
            caseId: request.params.caseId,
            page: request.query.page ?? 1,
            pageSize: request.query.pageSize ?? TRUST_REVIEW_DEFAULT_PAGE_SIZE,
          })),
          requestId: request.id,
        };
      } catch (error) {
        throw mapTrustReviewError(error);
      }
    },
  );

  app.post<{ Params: CaseParams; Body: DecisionBody }>(
    '/author/trust/cases/:caseId/decisions',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'decideSuspectPlayerCase',
        summary: 'Record an auditable suspect-player decision',
        description:
          'Atomically advances the expected case version, appends the authenticated Author decision, links at most 100 distinct reviewed evidence summaries, records false-positive adjustments, and applies only the three trust-v1 time-bounded restriction scopes. The readable trust-v2 card-trade hold requires a separate future case-creation workflow and is not writable here.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: caseParamsSchema,
        body: {
          oneOf: [
            decisionBodySchema('monitor'),
            decisionBodySchema('dismiss'),
            restrictDecisionBodySchema,
            decisionBodySchema('resolve'),
          ],
        },
        response: {
          200: detailSchema,
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
          ...(await service.decide({
            actorPlayerId: requireAuthor(request).id,
            caseId: request.params.caseId,
            expectedVersion: request.body.expectedVersion,
            action: request.body.action,
            reasonCode: request.body.reasonCode,
            note: request.body.note,
            evidenceIds: request.body.evidenceIds ?? [],
            falsePositiveEvidenceIds:
              request.body.falsePositiveEvidenceIds ?? [],
            restrictionScopes: request.body.restrictionScopes ?? [],
            ...(request.body.restrictionDurationHours === undefined
              ? {}
              : {
                  restrictionDurationHours:
                    request.body.restrictionDurationHours,
                }),
          })),
          requestId: request.id,
        };
      } catch (error) {
        throw mapTrustReviewError(error);
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

function mapTrustReviewError(error: unknown): Error {
  if (error instanceof TrustCaseNotFoundError) {
    return new ApiError({
      statusCode: 404,
      code: 'TRUST_CASE_NOT_FOUND',
      title: 'Trust case not found',
      detail: 'The requested trust case was not found.',
    });
  }
  if (error instanceof StaleTrustCaseVersionError) {
    return new ApiError({
      statusCode: 409,
      code: 'TRUST_CASE_VERSION_CONFLICT',
      title: 'Trust case changed',
      detail:
        'The trust case changed before this decision was applied. Refresh it and review the latest state.',
    });
  }
  if (error instanceof InvalidTrustDecisionError) {
    return new ApiError({
      statusCode: 409,
      code: 'INVALID_TRUST_DECISION',
      title: 'Trust decision rejected',
      detail: error.message,
    });
  }
  return error instanceof Error ? error : new Error('Unknown trust error.');
}
