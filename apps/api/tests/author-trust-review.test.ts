import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import {
  SelfTrustReviewForbiddenError,
  StaleTrustCaseVersionError,
  type TrustCaseDetail,
  type TrustReviewService,
} from '../src/trust/trust-review-service.js';

const authorId = 'c1000000-0000-4000-8000-000000000001';
const playerId = 'c1000000-0000-4000-8000-000000000002';
const caseId = 'c2000000-0000-4000-8000-000000000001';
const snapshotId = 'c3000000-0000-4000-8000-000000000001';
const evidenceId = 'c4000000-0000-4000-8000-000000000001';
const decisionId = 'c5000000-0000-4000-8000-000000000001';
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
let recordDecision: ReturnType<
  typeof vi.fn<TrustReviewService['recordDecision']>
>;
let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;

beforeEach(async () => {
  const detail = caseFixture();
  listCases = vi.fn().mockResolvedValue({
    items: [queueItem(detail)],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  });
  getCase = vi.fn().mockResolvedValue(detail);
  recordDecision = vi.fn().mockResolvedValue({
    ...detail,
    status: 'under_review',
    version: 5,
    activeRestrictionCount: 1,
    latestRestrictionExpiry: '2026-09-28T09:00:00.000Z',
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
      playerName: 'identity-name',
      subject: 'auth0|private-subject',
    }),
  };
  app = await buildApp({
    accessTokenVerifier: verifier,
    authConfig,
    logger: false,
    playerIdentityService: { resolve: resolvePlayer },
    trustReviewService: { getCase, listCases, recordDecision },
  });
});

afterEach(async () => app.close());

describe('Author trust review API', () => {
  it('requires authentication and the active Author role', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/v1/author/trust-cases',
    });
    expect(anonymous.statusCode).toBe(401);

    resolvePlayer.mockResolvedValue({
      id: playerId,
      lifecycleStatus: 'active',
      playerName: 'ordinary-player',
      role: 'player',
    });
    const ordinaryPlayer = await authenticated({
      method: 'GET',
      url: '/api/v1/author/trust-cases',
    });
    expect(ordinaryPlayer.statusCode).toBe(403);
    expect(ordinaryPlayer.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
    expect(listCases).not.toHaveBeenCalled();
  });

  it('forwards bounded queue search and filters without exposing private source data', async () => {
    const response = await authenticated({
      method: 'GET',
      url: '/api/v1/author/trust-cases?search=campus_runner&status=under_review&band=review_required&page=1&pageSize=20',
    });

    expect(response.statusCode).toBe(200);
    expect(listCases).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      band: 'review_required',
      page: 1,
      pageSize: 20,
      search: 'campus_runner',
      status: 'under_review',
    });
    expect(response.json()).toMatchObject({
      items: [{ caseId, playerName: 'campus_runner', score: 62 }],
      totalItems: 1,
    });
    expect(response.body).not.toMatch(
      /latitude|longitude|auth0\||sourceIdentifier|submittedAnswer/u,
    );
  });

  it('returns a server-authored score explanation, safe signals, and audit history', async () => {
    const response = await authenticated({
      method: 'GET',
      url: `/api/v1/author/trust-cases/${caseId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(getCase).toHaveBeenCalledWith(authorId, caseId);
    expect(response.json()).toMatchObject({
      case: {
        caseId,
        scoreExplanation: {
          movementPoints: 42,
          submissionConflictPoints: 20,
          opponentPatternPoints: 0,
          finalScore: 62,
        },
        evidence: [
          {
            evidenceId,
            signalType: 'impossible_movement',
            severity: 'strong',
            effectivePoints: 22,
          },
        ],
        history: [{ decisionId, actorType: 'system' }],
      },
    });
    expect(response.body).not.toMatch(
      /latitude|longitude|exactSpeed|auth0\||rawLog/u,
    );
  });

  it('records the exact expected version and bounded restriction intent', async () => {
    const response = await authenticated({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      payload: {
        action: 'restrict',
        expectedVersion: 4,
        reasonNote:
          'Require online verification while movement evidence is reviewed.',
        evidenceIds: [evidenceId],
        restrictionScopes: ['online_verification_required'],
        durationHours: 72,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordDecision).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      caseId,
      action: 'restrict',
      expectedVersion: 4,
      reasonNote:
        'Require online verification while movement evidence is reviewed.',
      evidenceIds: [evidenceId],
      restrictionScopes: ['online_verification_required'],
      durationHours: 72,
    });
  });

  it('surfaces stale decisions as conflicts and self-review as forbidden', async () => {
    recordDecision.mockRejectedValueOnce(new StaleTrustCaseVersionError());
    const stale = await authenticated({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      payload: {
        action: 'continue_monitoring',
        expectedVersion: 4,
        reasonNote: 'Continue observing the current signals.',
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'STALE_TRUST_CASE_VERSION' });

    recordDecision.mockRejectedValueOnce(new SelfTrustReviewForbiddenError());
    const selfReview = await authenticated({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      payload: {
        action: 'dismiss',
        expectedVersion: 4,
        reasonNote: 'Dismiss this case.',
      },
    });
    expect(selfReview.statusCode).toBe(403);
    expect(selfReview.json()).toMatchObject({
      code: 'SELF_TRUST_REVIEW_FORBIDDEN',
    });
  });

  it('rejects malformed decisions before they reach the service and documents the contract', async () => {
    const invalid = await authenticated({
      method: 'POST',
      url: `/api/v1/author/trust-cases/${caseId}/decisions`,
      payload: {
        action: 'restrict',
        expectedVersion: 4,
        reasonNote: '',
        durationHours: 200,
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(recordDecision).not.toHaveBeenCalled();

    const document = app.swagger();
    expect(document.paths?.['/api/v1/author/trust-cases']).toBeDefined();
    expect(
      document.paths?.['/api/v1/author/trust-cases/{caseId}'],
    ).toBeDefined();
    expect(
      document.paths?.['/api/v1/author/trust-cases/{caseId}/decisions'],
    ).toBeDefined();
  });
});

function authenticated(options: {
  method: 'GET' | 'POST';
  payload?: Record<string, unknown>;
  url: string;
}): Promise<InjectResponse> {
  return app.inject({
    ...options,
    headers: { authorization: 'Bearer test-token' },
  });
}

function caseFixture(): TrustCaseDetail {
  return {
    caseId,
    playerId,
    playerName: 'campus_runner',
    status: 'open',
    version: 4,
    score: 62,
    band: 'review_required',
    policyVersion: 'trust-v1',
    openedAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
    activeRestrictionCount: 0,
    latestRestrictionExpiry: null,
    canReview: true,
    scoreExplanation: {
      snapshotId,
      evaluatedAt: '2026-09-25T09:00:00.000Z',
      movementPoints: 42,
      submissionConflictPoints: 20,
      opponentPatternPoints: 0,
      finalScore: 62,
      reviewBand: 'review_required',
      sourceSignalCount: 3,
    },
    evidence: [
      {
        evidenceId,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        effectivePoints: 22,
        observedAt: '2026-09-22T09:00:00.000Z',
        expiresAt: '2026-12-21T09:00:00.000Z',
        state: 'active',
        safeSourceType: 'movement_decision',
        policyVersion: 'trust-v1',
      },
    ],
    history: [
      {
        decisionId,
        actorType: 'system',
        actorPlayerId: null,
        actorPlayerName: null,
        policyVersion: 'trust-v1',
        caseVersionBefore: 0,
        caseVersionAfter: 1,
        decisionType: 'case_opened',
        previousStatus: null,
        resultingStatus: 'open',
        reasonCode: 'score_band_entered',
        reasonNote: null,
        evidenceIds: [],
        restrictions: [],
        occurredAt: '2026-09-20T08:00:00.000Z',
      },
    ],
  };
}

function queueItem(detail: TrustCaseDetail) {
  const { evidence, history, scoreExplanation, ...item } = detail;
  void evidence;
  void history;
  void scoreExplanation;
  return item;
}
