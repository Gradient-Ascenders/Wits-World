import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import {
  StaleTrustCaseVersionError,
  TrustCaseNotFoundError,
  type TrustCaseDetail,
  type TrustReviewService,
} from '../src/trust/trust-review-service.js';

const authorId = 'd1000000-0000-4000-8000-000000000001';
const playerId = 'd1000000-0000-4000-8000-000000000002';
const caseId = 'd2000000-0000-4000-8000-000000000001';
const evidenceId = 'd3000000-0000-4000-8000-000000000001';
const decisionId = 'd4000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  audience: 'https://api.example.test',
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
  spaClientId: 'wits-world-spa-client',
};

let app: FastifyInstance;
let listCases: ReturnType<typeof vi.fn<TrustReviewService['listCases']>>;
let getCase: ReturnType<typeof vi.fn<TrustReviewService['getCase']>>;
let listEvidence: ReturnType<typeof vi.fn<TrustReviewService['listEvidence']>>;
let listRestrictions: ReturnType<
  typeof vi.fn<TrustReviewService['listRestrictions']>
>;
let listHistory: ReturnType<typeof vi.fn<TrustReviewService['listHistory']>>;
let decide: ReturnType<typeof vi.fn<TrustReviewService['decide']>>;
let exportCase: ReturnType<typeof vi.fn<TrustReviewService['exportCase']>>;
let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;

const detail: TrustCaseDetail = {
  caseId,
  playerId,
  playerName: 'review-candidate',
  status: 'under_review',
  version: 2,
  currentScore: 55,
  currentBand: 'review_required',
  policyVersion: 'trust-v1',
  categoryTotals: {
    movement: 25,
    submissionConflicts: 10,
    opponentPatterns: 20,
  },
  sourceSignalCount: 3,
  evidencePreview: [
    {
      evidenceId,
      signalType: 'impossible_movement',
      severity: 'strong',
      basePoints: 25,
      effectivePoints: 24,
      observedAt: '2026-09-24T10:00:00.000Z',
      decayState: 'active',
      safeSourceType: 'movement_decision',
      reviewedFalsePositive: false,
      opponentPattern: null,
    },
  ],
  evidenceTotalItems: 1,
  evidenceTruncated: false,
  restrictionPreview: [],
  restrictionTotalItems: 0,
  restrictionsTruncated: false,
  recentHistory: [
    {
      decisionId,
      actorType: 'author',
      actorPlayerId: authorId,
      actorPlayerName: 'active-author',
      action: 'monitoring_continued',
      previousStatus: 'open',
      resultingStatus: 'under_review',
      reasonCode: 'needs_review',
      reasonNote: 'Review the derived movement signal.',
      policyVersion: 'trust-v1',
      versionBefore: 1,
      versionAfter: 2,
      evidenceIds: [evidenceId],
      falsePositiveEvidenceIds: [],
      restrictions: [],
      occurredAt: '2026-09-25T10:00:00.000Z',
    },
  ],
  historyTruncated: false,
  openedAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-25T10:00:00.000Z',
  resolvedAt: null,
  resolutionReason: null,
};

beforeEach(async () => {
  listCases = vi.fn().mockResolvedValue({
    items: [
      {
        caseId,
        playerId,
        playerName: 'review-candidate',
        status: 'open',
        version: 1,
        currentScore: 55,
        currentBand: 'review_required',
        policyVersion: 'trust-v1',
        signalTypes: ['impossible_movement'],
        activeRestrictionScopes: [],
        openedAt: '2026-09-24T10:00:00.000Z',
        updatedAt: '2026-09-24T10:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  });
  getCase = vi.fn().mockResolvedValue(detail);
  listEvidence = vi.fn().mockResolvedValue({
    items: detail.evidencePreview,
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  });
  listRestrictions = vi.fn().mockResolvedValue({
    items: detail.restrictionPreview,
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  listHistory = vi.fn().mockResolvedValue({
    items: detail.recentHistory,
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  });
  decide = vi.fn().mockResolvedValue(detail);
  exportCase = vi.fn().mockResolvedValue({
    formatVersion: 'trust-case-review-v1',
    generatedAt: '2026-09-25T11:00:00.000Z',
    case: detail,
    evidence: {
      items: detail.evidencePreview,
      page: 1,
      pageSize: 100,
      totalItems: 1,
      totalPages: 1,
    },
    restrictions: {
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
      totalPages: 0,
    },
    history: {
      items: detail.recentHistory,
      page: 1,
      pageSize: 100,
      totalItems: 1,
      totalPages: 1,
    },
  });
  resolvePlayer = vi.fn().mockResolvedValue({
    id: authorId,
    lifecycleStatus: 'active',
    playerName: 'active-author',
    role: 'author',
  });
  const verifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'provider-name',
      subject: 'auth0|private-subject',
    }),
  };
  app = await buildApp({
    accessTokenVerifier: verifier,
    authConfig,
    logger: false,
    playerIdentityService: { resolve: resolvePlayer },
    trustReviewService: {
      listCases,
      getCase,
      listEvidence,
      listRestrictions,
      listHistory,
      decide,
      exportCase,
    },
  });
});

afterEach(async () => app.close());

describe('suspect-player review API', () => {
  it('protects every review operation from unauthenticated and ordinary players', async () => {
    const operations = reviewOperations();
    for (const operation of operations) {
      const unauthenticated = await app.inject(operation);
      expect(unauthenticated.statusCode).toBe(401);
    }
    resolvePlayer.mockResolvedValue({
      id: authorId,
      lifecycleStatus: 'active',
      playerName: 'ordinary-player',
      role: 'player',
    });
    for (const operation of operations) {
      const ordinaryPlayer = await app.inject({
        ...operation,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(ordinaryPlayer.statusCode).toBe(403);
      expect(ordinaryPlayer.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
    }
    expect(listCases).not.toHaveBeenCalled();
    expect(getCase).not.toHaveBeenCalled();
    expect(listEvidence).not.toHaveBeenCalled();
    expect(listRestrictions).not.toHaveBeenCalled();
    expect(listHistory).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
    expect(exportCase).not.toHaveBeenCalled();

    resolvePlayer.mockResolvedValue({
      id: authorId,
      lifecycleStatus: 'active',
      playerName: 'active-author',
      role: 'author',
    });
    for (const operation of operations) {
      const authorised = await app.inject({
        ...operation,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(authorised.statusCode).toBe(200);
    }
  });

  it('defaults the reviewer queue to active cases', async () => {
    const response = await authenticatedGet('/api/v1/author/trust-cases');
    expect(response.statusCode).toBe(200);
    expect(listCases).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      status: 'active',
      page: 1,
      pageSize: 20,
    });
  });

  it('forwards bounded filters and serializes only the safe queue projection', async () => {
    const response = await authenticatedGet(
      '/api/v1/author/trust-cases?status=open&search=Review-Candidate&band=review_required&restrictionState=none&signalType=impossible_movement&page=1&pageSize=20',
    );
    expect(response.statusCode).toBe(200);
    expect(listCases).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      status: 'open',
      search: 'Review-Candidate',
      band: 'review_required',
      restrictionState: 'none',
      signalType: 'impossible_movement',
      page: 1,
      pageSize: 20,
    });
    expect(response.json()).toMatchObject({
      items: [{ caseId, playerId, currentBand: 'review_required' }],
      totalItems: 1,
    });
    expect(response.body).not.toContain('auth0|private-subject');
    expect(response.body).not.toContain('latitude');
    expect(response.body).not.toContain('longitude');
    expect(response.body).not.toContain('sourceIdentifier');
    expectPrivacySafe(response.body);
  });

  it('rejects invalid filters before calling the service', async () => {
    const response = await authenticatedGet(
      '/api/v1/author/trust-cases?pageSize=101&signalType=raw_location',
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(listCases).not.toHaveBeenCalled();

    const invalidSearch = await authenticatedGet(
      `/api/v1/author/trust-cases?search=${'x'.repeat(65)}`,
    );
    expect(invalidSearch.statusCode).toBe(400);
    expect(invalidSearch.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(listCases).not.toHaveBeenCalled();
  });

  it('returns privacy-safe detail and protected paginated history', async () => {
    const caseResponse = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}`,
    );
    expect(caseResponse.statusCode).toBe(200);
    expect(getCase).toHaveBeenCalledWith({ actorPlayerId: authorId, caseId });
    expect(caseResponse.json()).toMatchObject({
      case: {
        caseId,
        evidencePreview: [
          {
            evidenceId,
            signalType: 'impossible_movement',
            safeSourceType: 'movement_decision',
            opponentPattern: null,
          },
        ],
        evidenceTotalItems: 1,
        evidenceTruncated: false,
      },
    });
    expect(caseResponse.body).not.toContain('auth0|private-subject');
    expect(caseResponse.body).not.toContain('latitude');
    expect(caseResponse.body).not.toContain('requiredSpeed');
    expectPrivacySafe(caseResponse.body);

    const historyResponse = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}/history?page=1&pageSize=20`,
    );
    expect(historyResponse.statusCode).toBe(200);
    expect(listHistory).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      caseId,
      page: 1,
      pageSize: 20,
    });
    expect(historyResponse.json()).toMatchObject({
      items: [{ actorPlayerId: authorId, reasonCode: 'needs_review' }],
    });
    expectPrivacySafe(historyResponse.body);
  });

  it('returns paginated evidence and restrictions and enforces page limits', async () => {
    const evidenceResponse = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}/evidence?page=1&pageSize=20`,
    );
    expect(evidenceResponse.statusCode).toBe(200);
    expect(listEvidence).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      caseId,
      page: 1,
      pageSize: 20,
    });
    expect(evidenceResponse.json()).toMatchObject({
      items: [{ evidenceId, opponentPattern: null }],
      totalItems: 1,
    });

    const restrictionsResponse = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}/restrictions?page=1&pageSize=20`,
    );
    expect(restrictionsResponse.statusCode).toBe(200);
    expect(listRestrictions).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      caseId,
      page: 1,
      pageSize: 20,
    });

    const oversized = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}/evidence?pageSize=101`,
    );
    expect(oversized.statusCode).toBe(400);
    expectPrivacySafe(evidenceResponse.body);
    expectPrivacySafe(restrictionsResponse.body);
  });

  it('exposes useful opponent aggregates without private match data', async () => {
    listEvidence.mockResolvedValueOnce({
      items: [
        {
          ...detail.evidencePreview[0]!,
          signalType: 'opponent_concentration',
          severity: 'pattern',
          basePoints: 20,
          effectivePoints: 19,
          safeSourceType: 'pvp_pattern',
          opponentPattern: {
            kind: 'opponent_concentration',
            evaluationWindowStart: '2026-08-26T10:00:00.000Z',
            evaluationWindowEnd: '2026-09-25T10:00:00.000Z',
            completedMatchCount: 8,
            repeatedOpponentMatchCount: 7,
            opponentConcentrationRatio: 0.875,
            minimumCompletedMatchCount: 6,
            minimumOpponentConcentrationRatio: 0.8,
          },
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    const response = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}/evidence`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          opponentPattern: {
            completedMatchCount: 8,
            repeatedOpponentMatchCount: 7,
            opponentConcentrationRatio: 0.875,
            minimumCompletedMatchCount: 6,
            minimumOpponentConcentrationRatio: 0.8,
          },
        },
      ],
    });
    expectPrivacySafe(response.body);
    expect(response.body).not.toContain('opponentPlayerId');
    expect(response.body).not.toContain('matchId');
    expect(response.body).not.toContain('battleState');
  });

  it('returns a bounded privacy-safe JSON export with a safe filename', async () => {
    const response = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}/export`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="trust-case-${caseId}.json"`,
    );
    expect(exportCase).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      caseId,
    });
    expect(response.json()).toMatchObject({
      export: {
        formatVersion: 'trust-case-review-v1',
        evidence: { pageSize: 100, totalItems: 1 },
      },
    });
    expectPrivacySafe(response.body);
  });

  it('uses a generic not-found response for missing or inaccessible cases', async () => {
    getCase.mockRejectedValueOnce(new TrustCaseNotFoundError());
    const response = await authenticatedGet(
      `/api/v1/author/trust-cases/${caseId}`,
    );
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      type: 'https://wits.world/problems/trust_case_not_found',
      title: 'Trust case not found',
      status: 404,
      code: 'TRUST_CASE_NOT_FOUND',
      detail: 'The requested trust case was not found.',
      requestId: expect.any(String),
    });
    expectPrivacySafe(response.body);
  });

  it('derives the reviewer from authentication and returns persisted state', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'needs_review',
        note: 'Review the derived movement signal.',
        evidenceIds: [evidenceId],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      caseId,
      expectedVersion: 1,
      action: 'monitor',
      reasonCode: 'needs_review',
      note: 'Review the derived movement signal.',
      evidenceIds: [evidenceId],
      falsePositiveEvidenceIds: [],
      restrictionScopes: [],
    });
    expect(response.json()).toMatchObject({
      case: { status: 'under_review', version: 2 },
    });
  });

  it('rejects malformed decisions and maps stale decisions to a safe conflict', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        expectedVersion: 0,
        action: 'ban',
        reasonCode: 'INVALID REASON',
        note: '',
      },
    });
    expect(malformed.statusCode).toBe(400);
    expect(decide).not.toHaveBeenCalled();

    decide.mockRejectedValueOnce(new StaleTrustCaseVersionError());
    const stale = await app.inject({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        expectedVersion: 1,
        action: 'resolve',
        reasonCode: 'review_complete',
        note: 'No active restriction remains.',
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'TRUST_CASE_VERSION_CONFLICT',
    });
    expectPrivacySafe(stale.body);
  });

  it('enforces action-specific restriction and reviewer-note schemas', async () => {
    const invalidPayloads = [
      {
        expectedVersion: 1,
        action: 'restrict',
        reasonCode: 'activity_review',
        note: 'A scope is required.',
        restrictionDurationHours: 24,
      },
      {
        expectedVersion: 1,
        action: 'restrict',
        reasonCode: 'activity_review',
        note: 'A duration is required.',
        restrictionScopes: ['new_competitive_match_hold'],
      },
      {
        expectedVersion: 1,
        action: 'restrict',
        reasonCode: 'activity_review',
        note: 'The duration is too short.',
        restrictionScopes: ['new_competitive_match_hold'],
        restrictionDurationHours: 0,
      },
      {
        expectedVersion: 1,
        action: 'restrict',
        reasonCode: 'activity_review',
        note: 'The duration is too long.',
        restrictionScopes: ['new_competitive_match_hold'],
        restrictionDurationHours: 169,
      },
      {
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'activity_review',
        note: 'A monitor action cannot restrict.',
        restrictionScopes: ['new_competitive_match_hold'],
        restrictionDurationHours: 24,
      },
      {
        expectedVersion: 1,
        action: 'restrict',
        reasonCode: 'activity_review',
        note: 'The trade hold is not writable.',
        restrictionScopes: ['card_trade_hold'],
        restrictionDurationHours: 24,
      },
      {
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'activity_review',
        note: ' leading whitespace is invalid.',
      },
      {
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'activity_review',
        note: 'A control\ncharacter is invalid.',
      },
    ];

    for (const payload of invalidPayloads) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/author/trust-cases/${caseId}/decisions`,
        headers: { authorization: 'Bearer test-token' },
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(decide).not.toHaveBeenCalled();
  });

  it('accepts exactly 100 combined evidence references in the request contract', async () => {
    const evidenceIds = Array.from({ length: 50 }, () => randomUUID());
    const falsePositiveEvidenceIds = Array.from({ length: 50 }, () =>
      randomUUID(),
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'evidence_review',
        note: 'Review exactly one hundred distinct evidence summaries.',
        evidenceIds,
        falsePositiveEvidenceIds,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceIds, falsePositiveEvidenceIds }),
    );
  });

  it('documents the complete protected request and response contract', async () => {
    await app.ready();
    const document = app.swagger();
    const queue = document.paths?.['/api/v1/author/trust-cases']?.get;
    const casePath = document.paths?.['/api/v1/author/trust-cases/{caseId}'];
    const history =
      document.paths?.['/api/v1/author/trust-cases/{caseId}/history']?.get;
    const evidence =
      document.paths?.['/api/v1/author/trust-cases/{caseId}/evidence']?.get;
    const restrictions =
      document.paths?.['/api/v1/author/trust-cases/{caseId}/restrictions']?.get;
    const exportOperation =
      document.paths?.['/api/v1/author/trust-cases/{caseId}/export']?.get;
    const decision =
      document.paths?.['/api/v1/author/trust-cases/{caseId}/decisions']?.post;

    expect(queue).toMatchObject({
      operationId: 'listSuspectPlayerCases',
      security: [{ bearerAuth: [] }],
    });
    expect(casePath?.get).toMatchObject({
      operationId: 'getSuspectPlayerCase',
      security: [{ bearerAuth: [] }],
    });
    expect(history).toMatchObject({
      operationId: 'listSuspectPlayerCaseHistory',
      security: [{ bearerAuth: [] }],
    });
    expect(evidence).toMatchObject({
      operationId: 'listSuspectPlayerCaseEvidence',
      security: [{ bearerAuth: [] }],
    });
    expect(restrictions).toMatchObject({
      operationId: 'listSuspectPlayerCaseRestrictions',
      security: [{ bearerAuth: [] }],
    });
    expect(exportOperation).toMatchObject({
      operationId: 'exportSuspectPlayerCase',
      security: [{ bearerAuth: [] }],
    });
    expect(decision).toMatchObject({
      operationId: 'decideSuspectPlayerCase',
      security: [{ bearerAuth: [] }],
    });

    expect(queue?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'status', in: 'query' }),
        expect.objectContaining({ name: 'search', in: 'query' }),
        expect.objectContaining({ name: 'createdFrom', in: 'query' }),
        expect.objectContaining({ name: 'createdTo', in: 'query' }),
        expect.objectContaining({
          name: 'pageSize',
          in: 'query',
          schema: expect.objectContaining({ minimum: 1, maximum: 100 }),
        }),
      ]),
    );
    const queueParameters = (queue?.parameters ?? []) as Array<{
      name?: string;
      schema?: unknown;
    }>;
    const statusParameter = queueParameters.find(
      (parameter) => parameter.name === 'status',
    );
    expect(statusParameter).toMatchObject({
      schema: {
        enum: ['active', 'open', 'under_review', 'resolved'],
        default: 'active',
      },
    });
    const searchParameter = queueParameters.find(
      (parameter) => parameter.name === 'search',
    );
    expect(searchParameter).toMatchObject({
      schema: { minLength: 1, maxLength: 64 },
    });
    expect(casePath?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'caseId',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ format: 'uuid' }),
        }),
      ]),
    );
    expect(Object.keys(casePath?.get?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429']),
    );
    expect(Object.keys(history?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429']),
    );
    expect(Object.keys(evidence?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429']),
    );
    expect(Object.keys(restrictions?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429']),
    );
    expect(Object.keys(exportOperation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429']),
    );
    expect(Object.keys(decision?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409', '429']),
    );

    const requestBody = (decision as { requestBody?: unknown } | undefined)
      ?.requestBody as
      | {
          content?: Record<
            string,
            {
              schema?: {
                oneOf?: Array<{
                  required?: string[];
                  properties?: Record<
                    string,
                    {
                      description?: string;
                      enum?: string[];
                      maxItems?: number;
                      minItems?: number;
                      minimum?: number;
                      maximum?: number;
                      items?: { enum?: string[] };
                    }
                  >;
                }>;
              };
            }
          >;
        }
      | undefined;
    const variants =
      requestBody?.content?.['application/json']?.schema?.oneOf ?? [];
    expect(variants).toHaveLength(4);
    const restrict = variants.find((variant) =>
      variant.properties?.action?.enum?.includes('restrict'),
    );
    expect(restrict?.required).toEqual(
      expect.arrayContaining(['restrictionScopes', 'restrictionDurationHours']),
    );
    expect(restrict?.properties?.restrictionScopes).toMatchObject({
      minItems: 1,
      maxItems: 3,
    });
    expect(restrict?.properties?.restrictionDurationHours).toMatchObject({
      minimum: 1,
      maximum: 168,
    });
    expect(restrict?.properties?.restrictionScopes?.items?.enum).not.toContain(
      'card_trade_hold',
    );
    for (const variant of variants.filter(
      (item) => !item.properties?.action?.enum?.includes('restrict'),
    )) {
      expect(variant.properties).not.toHaveProperty('restrictionScopes');
      expect(variant.properties).not.toHaveProperty('restrictionDurationHours');
    }
    expect(restrict?.properties?.evidenceIds).toMatchObject({ maxItems: 100 });
    expect(restrict?.properties?.evidenceIds?.description).toContain(
      'at most 100 distinct',
    );

    const historyDocument = JSON.stringify(history?.responses?.['200']);
    expect(historyDocument).toContain('falsePositiveEvidenceIds');
    expect(historyDocument).toContain('startsAt');
    expect(historyDocument).toContain('expiresAt');
    const evidenceDocument = JSON.stringify(evidence?.responses?.['200']);
    expect(evidenceDocument).toContain('opponentConcentrationRatio');
    expect(evidenceDocument).toContain('qualifyingForfeitCount');
  });
});

function authenticatedGet(url: string) {
  return app.inject({
    headers: { authorization: 'Bearer test-token' },
    method: 'GET',
    url,
  });
}

function reviewOperations() {
  return [
    { method: 'GET' as const, url: '/api/v1/author/trust-cases' },
    { method: 'GET' as const, url: `/api/v1/author/trust-cases/${caseId}` },
    {
      method: 'GET' as const,
      url: `/api/v1/author/trust-cases/${caseId}/evidence`,
    },
    {
      method: 'GET' as const,
      url: `/api/v1/author/trust-cases/${caseId}/restrictions`,
    },
    {
      method: 'GET' as const,
      url: `/api/v1/author/trust-cases/${caseId}/history`,
    },
    {
      method: 'GET' as const,
      url: `/api/v1/author/trust-cases/${caseId}/export`,
    },
    {
      method: 'POST' as const,
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      payload: {
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'needs_review',
        note: 'Review the derived movement signal.',
      },
    },
  ];
}

function expectPrivacySafe(body: string): void {
  for (const prohibitedField of [
    'latitude',
    'longitude',
    'coordinates',
    'locationPayload',
    'authIssuer',
    'authSubject',
    'providerIdentifier',
    'rawTelemetry',
    'submittedAnswer',
    'privateMatchState',
    'sourceIdentifier',
    'sourceDigest',
    'deduplicationDigest',
  ]) {
    expect(body).not.toContain(prohibitedField);
  }
  expect(body).not.toContain('auth0|private-subject');
}
