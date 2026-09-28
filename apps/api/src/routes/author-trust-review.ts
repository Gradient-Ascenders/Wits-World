import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  InvalidTrustDecisionError,
  StaleTrustCaseVersionError,
  TRUST_REVIEW_DEFAULT_PAGE_SIZE,
  TRUST_REVIEW_DETAIL_PREVIEW_SIZE,
  TRUST_REVIEW_EXPORT_PAGE_SIZE,
  TRUST_REVIEW_MAX_SEARCH_LENGTH,
  TRUST_REVIEW_MAX_NOTE_LENGTH,
  TRUST_REVIEW_MAX_PAGE_SIZE,
  TRUST_REVIEW_MAX_RESTRICTION_HOURS,
  TrustCaseNotFoundError,
  type TrustCaseQueueStatus,
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
  status?: TrustCaseQueueStatus;
  search?: string;
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

interface PageQuery {
  page?: number;
  pageSize?: number;
}

interface DecisionBody {
  expectedVersion: number;
  action: TrustDecisionAction;
  reasonNote: string;
  evidenceIds?: string[];
  restrictionScopes?: WritableTrustRestrictionScope[];
  durationHours?: number;
}

const statuses = ['open', 'under_review', 'resolved'] as const;
const queueStatuses = ['all', 'active', ...statuses] as const;
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

const opponentPatternSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'availability',
        'kind',
        'evaluationWindowStart',
        'evaluationWindowEnd',
        'completedMatchCount',
        'repeatedOpponentMatchCount',
        'opponentConcentrationRatio',
      ],
      properties: {
        availability: { type: 'string', enum: ['available'] },
        kind: { type: 'string', enum: ['opponent_concentration'] },
        evaluationWindowStart: { type: 'string', format: 'date-time' },
        evaluationWindowEnd: { type: 'string', format: 'date-time' },
        completedMatchCount: { type: 'integer', minimum: 0 },
        repeatedOpponentMatchCount: { type: 'integer', minimum: 0 },
        opponentConcentrationRatio: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'availability',
        'kind',
        'evaluationWindowStart',
        'evaluationWindowEnd',
        'qualifyingForfeitCount',
      ],
      properties: {
        availability: { type: 'string', enum: ['available'] },
        kind: { type: 'string', enum: ['one_sided_outcome_pattern'] },
        evaluationWindowStart: { type: 'string', format: 'date-time' },
        evaluationWindowEnd: { type: 'string', format: 'date-time' },
        qualifyingForfeitCount: { type: 'integer', minimum: 0 },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['availability', 'reason', 'remediation'],
      properties: {
        availability: { type: 'string', enum: ['unavailable'] },
        reason: { type: 'string', enum: ['legacy_summary_not_retained'] },
        remediation: {
          type: 'string',
          enum: ['await_fresh_detector_evaluation'],
        },
      },
    },
  ],
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
    'expiresAt',
    'policyVersion',
    'state',
    'decayState',
    'safeSourceType',
    'reviewedFalsePositive',
    'opponentPattern',
  ],
  properties: {
    evidenceId: { type: 'string', format: 'uuid' },
    signalType: { type: 'string', enum: signalTypes },
    severity: { type: 'string' },
    basePoints: { type: 'integer', minimum: 1, maximum: 25 },
    effectivePoints: { type: 'integer', minimum: 0, maximum: 25 },
    observedAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    policyVersion: { type: 'string' },
    state: {
      type: 'string',
      enum: ['active', 'adjusted_false_positive', 'expired'],
    },
    decayState: {
      type: 'string',
      enum: ['active', 'expired', 'reviewed_false_positive'],
    },
    safeSourceType: { type: 'string' },
    reviewedFalsePositive: { type: 'boolean' },
    opponentPattern: opponentPatternSchema,
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

const historyRestrictionSchema = {
  ...restrictionSchema,
  required: [...restrictionSchema.required, 'expiresAt'],
  properties: {
    ...restrictionSchema.properties,
    expiresAt: { type: 'string', format: 'date-time' },
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
    'decisionType',
    'action',
    'previousStatus',
    'resultingStatus',
    'reasonCode',
    'reasonNote',
    'policyVersion',
    'caseVersionBefore',
    'caseVersionAfter',
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
    decisionType: { type: 'string' },
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
    caseVersionBefore: { type: 'integer', minimum: 0 },
    caseVersionAfter: { type: 'integer', minimum: 1 },
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
      items: historyRestrictionSchema,
    },
    occurredAt: { type: 'string', format: 'date-time' },
  },
} as const;

const scoreExplanationSchema = {
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
    submissionConflictPoints: { type: 'integer', minimum: 0, maximum: 30 },
    opponentPatternPoints: { type: 'integer', minimum: 0, maximum: 30 },
    finalScore: { type: 'integer', minimum: 0, maximum: 100 },
    reviewBand: { type: 'string', enum: bands },
    sourceSignalCount: { type: 'integer', minimum: 0 },
  },
} as const;

const caseDetailSchema = {
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
    'restrictionCount',
    'activeRestrictionCount',
    'activeRestrictionScopes',
    'latestRestrictionExpiry',
    'canReview',
    'categoryTotals',
    'sourceSignalCount',
    'scoreExplanation',
    'evidence',
    'evidencePreview',
    'evidenceTotalItems',
    'evidenceTruncated',
    'restrictionPreview',
    'restrictionTotalItems',
    'restrictionsTruncated',
    'recentHistory',
    'history',
    'historyTruncated',
    'openedAt',
    'updatedAt',
    'resolvedAt',
    'resolutionReason',
  ],
  properties: {
    caseId: { type: 'string', format: 'uuid' },
    playerId: { type: 'string', format: 'uuid' },
    playerName: { type: 'string' },
    status: { type: 'string', enum: statuses },
    version: { type: 'integer', minimum: 1 },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    band: { type: 'string', enum: bands },
    policyVersion: { type: 'string' },
    restrictionCount: { type: 'integer', minimum: 0 },
    activeRestrictionCount: { type: 'integer', minimum: 0 },
    activeRestrictionScopes: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', enum: readableRestrictionScopes },
    },
    latestRestrictionExpiry: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    canReview: { type: 'boolean' },
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
    scoreExplanation: scoreExplanationSchema,
    evidence: {
      type: 'array',
      maxItems: TRUST_REVIEW_DETAIL_PREVIEW_SIZE,
      items: evidenceSchema,
    },
    evidencePreview: {
      type: 'array',
      maxItems: TRUST_REVIEW_DETAIL_PREVIEW_SIZE,
      items: evidenceSchema,
    },
    evidenceTotalItems: { type: 'integer', minimum: 0 },
    evidenceTruncated: { type: 'boolean' },
    restrictionPreview: {
      type: 'array',
      maxItems: TRUST_REVIEW_DETAIL_PREVIEW_SIZE,
      items: restrictionSchema,
    },
    restrictionTotalItems: { type: 'integer', minimum: 0 },
    restrictionsTruncated: { type: 'boolean' },
    recentHistory: {
      type: 'array',
      maxItems: 20,
      items: historyItemSchema,
    },
    history: {
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
  },
} as const;

const detailEnvelopeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['case', 'requestId'],
  properties: {
    case: caseDetailSchema,
    requestId: { type: 'string' },
  },
} as const;

function paginatedSchema(itemSchema: object) {
  return {
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
        items: itemSchema,
      },
      ...paginationProperties,
      requestId: { type: 'string' },
    },
  } as const;
}

function exportPageSchema(itemSchema: object) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages'],
    properties: {
      items: {
        type: 'array',
        maxItems: TRUST_REVIEW_EXPORT_PAGE_SIZE,
        items: itemSchema,
      },
      ...paginationProperties,
    },
  } as const;
}

const exportEnvelopeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['export', 'requestId'],
  properties: {
    export: {
      type: 'object',
      additionalProperties: false,
      required: [
        'formatVersion',
        'generatedAt',
        'case',
        'evidence',
        'restrictions',
        'history',
      ],
      properties: {
        formatVersion: {
          type: 'string',
          enum: ['trust-case-review-v1'],
        },
        generatedAt: { type: 'string', format: 'date-time' },
        case: caseDetailSchema,
        evidence: exportPageSchema(evidenceSchema),
        restrictions: exportPageSchema(restrictionSchema),
        history: exportPageSchema(historyItemSchema),
      },
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
  reasonNote: {
    type: 'string',
    minLength: 1,
    maxLength: TRUST_REVIEW_MAX_NOTE_LENGTH,
    pattern: '^(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u001F\\u007F-\\u009F]+$',
    description:
      'Required reviewer reason. It must be trimmed and contain no control characters.',
  },
  evidenceIds: {
    type: 'array',
    maxItems: 100,
    uniqueItems: true,
    description:
      'Safe evidence summaries referenced by the decision. For mark_false_positive, every referenced summary is adjusted as a reviewed false positive.',
    items: { type: 'string', format: 'uuid' },
  },
} as const;

function decisionBodySchema(
  action: Exclude<TrustDecisionAction, 'restrict' | 'mark_false_positive'>,
) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['expectedVersion', 'action', 'reasonNote'],
    properties: {
      ...decisionCommonProperties,
      action: { type: 'string', enum: [action] },
    },
  } as const;
}

const falsePositiveDecisionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'action', 'reasonNote', 'evidenceIds'],
  properties: {
    ...decisionCommonProperties,
    action: { type: 'string', enum: ['mark_false_positive'] },
    evidenceIds: {
      ...decisionCommonProperties.evidenceIds,
      minItems: 1,
    },
  },
} as const;

const restrictDecisionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'expectedVersion',
    'action',
    'reasonNote',
    'restrictionScopes',
    'durationHours',
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
    durationHours: {
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
    '/author/trust-cases',
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
            status: {
              type: 'string',
              enum: queueStatuses,
              default: 'active',
              description:
                'active selects open and under_review cases; all applies no status filter. Omitted status defaults to active.',
            },
            search: {
              type: 'string',
              minLength: 1,
              maxLength: TRUST_REVIEW_MAX_SEARCH_LENGTH,
              pattern:
                '^(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u001F\\u007F-\\u009F]+$',
              description:
                'Case-insensitive literal substring match on Player Name, plus exact case or player UUID match when the complete search value is a UUID. SQL wildcard characters are treated literally.',
            },
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
                    'score',
                    'band',
                    'policyVersion',
                    'signalTypes',
                    'restrictionCount',
                    'activeRestrictionCount',
                    'latestRestrictionExpiry',
                    'activeRestrictionScopes',
                    'canReview',
                    'openedAt',
                    'updatedAt',
                  ],
                  properties: {
                    caseId: { type: 'string', format: 'uuid' },
                    playerId: { type: 'string', format: 'uuid' },
                    playerName: { type: 'string' },
                    status: { type: 'string', enum: statuses },
                    version: { type: 'integer', minimum: 1 },
                    score: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 100,
                    },
                    band: { type: 'string', enum: bands },
                    policyVersion: { type: 'string' },
                    signalTypes: {
                      type: 'array',
                      uniqueItems: true,
                      items: { type: 'string', enum: signalTypes },
                    },
                    restrictionCount: { type: 'integer', minimum: 0 },
                    activeRestrictionCount: {
                      type: 'integer',
                      minimum: 0,
                    },
                    latestRestrictionExpiry: {
                      anyOf: [
                        { type: 'string', format: 'date-time' },
                        { type: 'null' },
                      ],
                    },
                    activeRestrictionScopes: {
                      type: 'array',
                      uniqueItems: true,
                      items: {
                        type: 'string',
                        enum: readableRestrictionScopes,
                      },
                    },
                    canReview: { type: 'boolean' },
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
        status: request.query.status ?? 'active',
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? TRUST_REVIEW_DEFAULT_PAGE_SIZE,
      });
      return { ...result, requestId: request.id };
    },
  );

  app.get<{ Params: CaseParams }>(
    '/author/trust-cases/:caseId',
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
          200: detailEnvelopeSchema,
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
          case: await service.getCase({
            actorPlayerId: requireAuthor(request).id,
            caseId: request.params.caseId,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throw mapTrustReviewError(error);
      }
    },
  );

  app.get<{ Params: CaseParams; Querystring: PageQuery }>(
    '/author/trust-cases/:caseId/evidence',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listSuspectPlayerCaseEvidence',
        summary: 'List privacy-safe suspect-player evidence',
        description:
          'Returns a deterministic page of derived evidence summaries. Opponent-pattern evidence includes the signal-time aggregate counts and policy thresholds, never opponent identities or private match payloads.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: caseParamsSchema,
        querystring: pageQuerySchema,
        response: {
          200: paginatedSchema(evidenceSchema),
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
          ...(await service.listEvidence({
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

  app.get<{ Params: CaseParams; Querystring: PageQuery }>(
    '/author/trust-cases/:caseId/restrictions',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listSuspectPlayerCaseRestrictions',
        summary: 'List suspect-player restriction history',
        description:
          'Returns a deterministic page of current and historical restriction summaries with authoritative original and effective expiry times.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: caseParamsSchema,
        querystring: pageQuerySchema,
        response: {
          200: paginatedSchema(restrictionSchema),
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
          ...(await service.listRestrictions({
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

  app.get<{ Params: CaseParams; Querystring: PageQuery }>(
    '/author/trust-cases/:caseId/history',
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
          200: paginatedSchema(historyItemSchema),
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
    '/author/trust-cases/:caseId/decisions',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'decideSuspectPlayerCase',
        summary: 'Record an auditable suspect-player decision',
        description:
          'Atomically advances the expected case version, appends the authenticated Author decision, links at most 100 reviewed evidence summaries, records false-positive adjustments only for mark_false_positive, and applies only the three trust-v1 time-bounded restriction scopes. Decisions are rejected while legacy opponent-pattern evidence lacks a reviewer-safe summary and no fresh explainable evaluation supersedes it.',
        tags: ['Trust review'],
        security: bearerSecurity,
        params: caseParamsSchema,
        body: {
          oneOf: [
            decisionBodySchema('continue_monitoring'),
            decisionBodySchema('dismiss'),
            falsePositiveDecisionBodySchema,
            restrictDecisionBodySchema,
          ],
        },
        response: {
          200: detailEnvelopeSchema,
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
          case: await service.decide({
            actorPlayerId: requireAuthor(request).id,
            caseId: request.params.caseId,
            expectedVersion: request.body.expectedVersion,
            action: request.body.action,
            reasonNote: request.body.reasonNote,
            evidenceIds: request.body.evidenceIds ?? [],
            restrictionScopes: request.body.restrictionScopes ?? [],
            ...(request.body.durationHours === undefined
              ? {}
              : {
                  restrictionDurationHours: request.body.durationHours,
                }),
          }),
          requestId: request.id,
        };
      } catch (error) {
        throw mapTrustReviewError(error);
      }
    },
  );

  app.get<{ Params: CaseParams }>(
    '/author/trust-cases/:caseId/export',
    {
      config: { rateLimitPolicy: 'author-expensive' },
      onRequest: authorGuards,
      schema: {
        operationId: 'exportSuspectPlayerCase',
        summary: 'Export a bounded privacy-safe suspect-player case',
        description: `Returns a server-defined JSON export containing the safe case projection and at most ${TRUST_REVIEW_EXPORT_PAGE_SIZE} evidence, restriction, and history records per collection. Counts and pagination metadata identify any truncation.`,
        tags: ['Trust review'],
        security: bearerSecurity,
        produces: ['application/json'],
        params: caseParamsSchema,
        response: {
          200: exportEnvelopeSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const exported = await service.exportCase({
          actorPlayerId: requireAuthor(request).id,
          caseId: request.params.caseId,
        });
        return reply
          .type('application/json; charset=utf-8')
          .header(
            'content-disposition',
            `attachment; filename="trust-case-${request.params.caseId}.json"`,
          )
          .send({ export: exported, requestId: request.id });
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
