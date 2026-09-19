import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import {
  ChallengeEventNotActiveError,
  ChallengeEventNotFoundError,
  ChallengeEventNotReachableError,
  type ChallengeAttemptStartService,
  ChallengeLocationRetryRequiredError,
  ChallengeUnavailableError,
} from '../src/challenges/challenge-attempt-start.js';
import type {
  CompletedChallengeAttempt,
  CompletedOrderingChallengeAttempt,
  InProgressChallengeAttempt,
  InProgressOrderingChallengeAttempt,
} from '../src/challenges/challenge-attempt-reader.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import { InvalidLocationClaimError } from '../src/events/location-claim.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import { TrustActivityRestrictedError } from '../src/trust/trust-restrictions.js';

import {
  ChallengeAnswerLockedError,
  ChallengeAttemptCompletedError,
  ChallengeAttemptNotFoundError,
  InvalidChallengeAnswerError,
} from '../src/challenges/challenge-answer-lock.js';
import type { ChallengeAnswerSubmissionService } from '../src/challenges/challenge-answer-submission.js';

import {
  ChallengeAttemptFetchNotFoundError,
  type ChallengeAttemptFetchService,
} from '../src/challenges/challenge-attempt-fetch.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000001';
const CHALLENGE_CONTRACT_HEADER = 'x-wits-challenge-contract-version';
const ACTIVE_CHALLENGE_CONTRACT_VERSION = '2';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const authenticatedIdentity = {
  connectionStrategy: 'auth0' as const,
  issuer: authConfig.issuer,
  playerName: 'test-player',
  subject: 'auth0|challenge-player',
};

const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;
let playerResolve: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;
let startOrResume: ReturnType<
  typeof vi.fn<ChallengeAttemptStartService['startOrResume']>
>;
let submitAnswer: ReturnType<
  typeof vi.fn<ChallengeAnswerSubmissionService['submitAnswer']>
>;
let fetchAttempt: ReturnType<
  typeof vi.fn<ChallengeAttemptFetchService['fetchAttempt']>
>;

beforeEach(async () => {
  playerResolve = vi.fn<PlayerIdentityService['resolve']>();
  playerResolve.mockResolvedValue(activePlayer);

  startOrResume = vi.fn<ChallengeAttemptStartService['startOrResume']>();

  fetchAttempt = vi.fn<ChallengeAttemptFetchService['fetchAttempt']>();

  submitAnswer = vi.fn<ChallengeAnswerSubmissionService['submitAnswer']>();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue(authenticatedIdentity),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: playerResolve,
    },
    challengeAttemptServices: {
      start: {
        startOrResume,
      },
      fetch: {
        fetchAttempt,
      },
      answerSubmission: {
        submitAnswer,
      },
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('challenge attempt start API', () => {
  it('requires authentication before starting a challenge', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${EVENT_ID}/challenge-attempts`,
      payload: validLocationClaim(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });

    expect(playerResolve).not.toHaveBeenCalled();
    expect(startOrResume).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending player before challenge start', async () => {
    playerResolve.mockResolvedValue({
      ...activePlayer,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedStartRequest();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      status: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      requestId: expect.any(String),
    });

    expect(playerResolve).toHaveBeenCalledWith(authenticatedIdentity);
    expect(startOrResume).not.toHaveBeenCalled();
  });

  it('rejects a stale client before starting or resuming an attempt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${EVENT_ID}/challenge-attempts`,
      headers: {
        authorization: 'Bearer test-access-token',
      },
      payload: validLocationClaim(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'CHALLENGE_CLIENT_UPGRADE_REQUIRED',
      requestId: expect.any(String),
    });
    expect(startOrResume).not.toHaveBeenCalled();
  });

  it('returns 201 for a newly created challenge attempt', async () => {
    const attempt = inProgressAttempt();

    startOrResume.mockResolvedValue({
      outcome: 'created',
      attempt,
    });

    const response = await authenticatedStartRequest();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expectActivePayloadToWithholdReview(response.json());

    expect(startOrResume).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      eventId: EVENT_ID,
      latitude: -26.19205,
      longitude: 28.03038,
      accuracyMetres: 10,
      acquiredAt: '2026-09-01T09:59:30.000Z',
    });
  });

  it('returns 200 with the same persisted in-progress attempt on resume', async () => {
    const attempt = inProgressAttempt();

    startOrResume.mockResolvedValue({
      outcome: 'resumed',
      attempt,
    });

    const response = await authenticatedStartRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expectActivePayloadToWithholdReview(response.json());
  });

  it('returns a completed result with completed-only answer review', async () => {
    const attempt = completedAttempt();

    startOrResume.mockResolvedValue({
      outcome: 'resumed',
      attempt,
    });

    const response = await authenticatedStartRequest();

    expect(response.statusCode).toBe(200);

    const body = response.json<Record<string, unknown>>();

    expect(body).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });

    expect(body).not.toHaveProperty('questions');
    expect(body).not.toHaveProperty('answeredCount');
    expect(body).not.toHaveProperty('selectedChoiceId');
    expect(body).not.toHaveProperty('answeredAt');
    expect(body).toHaveProperty('review', attempt.review);
  });

  it('rejects client-supplied player and authoritative eligibility fields', async () => {
    const response = await authenticatedStartRequest({
      ...validLocationClaim(),
      playerId: PLAYER_ID,
      reachable: true,
      scoreCorrect: 5,
      elapsedMilliseconds: 60_000,
      requiredSpeedMetresPerSecond: 1,
      maxPlausibleSpeedMetresPerSecond: 1000,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(startOrResume).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: new ChallengeEventNotReachableError(),
      status: 403,
      code: 'EVENT_NOT_REACHABLE',
    },
    {
      error: new ChallengeEventNotFoundError(),
      status: 404,
      code: 'EVENT_NOT_FOUND',
    },
    {
      error: new ChallengeEventNotActiveError('ended'),
      status: 409,
      code: 'EVENT_NOT_ACTIVE',
    },
    {
      error: new ChallengeUnavailableError(),
      status: 409,
      code: 'CHALLENGE_UNAVAILABLE',
    },
    {
      error: new ChallengeLocationRetryRequiredError('stale_location'),
      status: 422,
      code: 'LOCATION_RETRY_REQUIRED',
    },
    {
      error: new InvalidLocationClaimError(
        'acquiredAt',
        'Acquisition timestamp must be valid.',
      ),
      status: 400,
      code: 'INVALID_LOCATION_CLAIM',
    },
    {
      error: new TrustActivityRestrictedError({
        scope: 'location_reward_challenge_hold',
        startsAt: new Date('2026-09-19T00:00:00.000Z'),
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      }),
      status: 403,
      code: 'ACTIVITY_REVIEW_RESTRICTION',
    },
  ])(
    'maps challenge start failures to $status $code',
    async ({ error, status, code }) => {
      startOrResume.mockRejectedValue(error);

      const response = await authenticatedStartRequest();

      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({
        status,
        code,
        requestId: expect.any(String),
      });
    },
  );

  it('keeps trust-restriction feedback neutral and private', async () => {
    startOrResume.mockRejectedValue(
      new TrustActivityRestrictedError({
        scope: 'location_reward_challenge_hold',
        startsAt: new Date('2026-09-19T00:00:00.000Z'),
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      }),
    );

    const response = await authenticatedStartRequest();
    const body = response.json<{ detail: string; code: string }>();

    expect(response.statusCode).toBe(403);
    expect(body.code).toBe('ACTIVITY_REVIEW_RESTRICTION');
    expect(body.detail.toLowerCase()).not.toMatch(
      /score|signal|threshold|cheat|fraud|reviewer|opponent/u,
    );
  });

  it('documents the challenge start operation as bearer-protected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<
        string,
        {
          post?: {
            security?: Array<Record<string, unknown>>;
            responses?: Record<string, unknown>;
          };
        }
      >;
    }>();

    const operation =
      document.paths['/api/v1/events/{eventId}/challenge-attempts']?.post;

    expect(operation?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(operation?.responses).toHaveProperty('200');
    expect(operation?.responses).toHaveProperty('201');
    expect(operation?.responses).toHaveProperty('403');
    expect(operation?.responses).toHaveProperty('404');
    expect(operation?.responses).toHaveProperty('409');
    expect(operation?.responses).toHaveProperty('422');
  });
});

describe('challenge answer submission API', () => {
  it('requires authentication before submitting an answer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/challenge-attempts/${ATTEMPT_ID}/answers`,
      payload: validAnswer(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });

    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it('authenticates before validating a malformed answer request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/challenge-attempts/not-a-uuid/answers',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });

    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending player before answer submission', async () => {
    playerResolve.mockResolvedValue({
      ...activePlayer,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedAnswerRequest();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      status: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      requestId: expect.any(String),
    });

    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it.each([undefined, '1'])(
    'rejects stale contract version %s before changing an answer',
    async (contractVersion) => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/challenge-attempts/${ATTEMPT_ID}/answers`,
        headers: {
          authorization: 'Bearer test-access-token',
          ...(contractVersion === undefined
            ? {}
            : { [CHALLENGE_CONTRACT_HEADER]: contractVersion }),
        },
        payload: validAnswer(),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: 'CHALLENGE_CLIENT_UPGRADE_REQUIRED',
        detail: expect.stringContaining('No challenge answer was changed'),
        requestId: expect.any(String),
      });
      expect(submitAnswer).not.toHaveBeenCalled();
    },
  );

  it('submits an answer using only the authenticated local player identity', async () => {
    const attempt = inProgressAttempt();

    submitAnswer.mockResolvedValue(attempt);

    const response = await authenticatedAnswerRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expectActivePayloadToWithholdReview(response.json());

    expect(submitAnswer).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
      attemptQuestionId: '32000000-0000-4000-8000-000000000001',
      choiceId: '33000000-0000-4000-0001-000000000001',
      format: 'multiple_choice',
    });
  });

  it('accepts four unique ordering item IDs and withholds the answer key while active', async () => {
    const attempt = inProgressOrderingAttempt();
    submitAnswer.mockResolvedValue(attempt);
    const itemIds =
      attempt.questions[0]?.items.map((item) => item.itemId) ?? [];

    const response = await authenticatedAnswerRequest({
      format: 'ordering',
      attemptQuestionId: attempt.questions[0]?.attemptQuestionId,
      itemIds,
    });

    expect(response.statusCode).toBe(200);
    expect(submitAnswer).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
      format: 'ordering',
      attemptQuestionId: attempt.questions[0]?.attemptQuestionId,
      itemIds,
    });
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain('correctItems');
    expect(response.body).not.toContain('explanation');
    expect(response.body).not.toContain('correctPosition');
    expect(response.body).not.toContain('sourceUrls');
  });

  it.each([
    { itemIds: [] },
    { itemIds: ['34000000-0000-4000-8000-000000000001'] },
    {
      itemIds: [
        '34000000-0000-4000-8000-000000000001',
        '34000000-0000-4000-8000-000000000001',
        '34000000-0000-4000-8000-000000000003',
        '34000000-0000-4000-8000-000000000004',
      ],
    },
    {
      itemIds: [
        '34000000-0000-4000-8000-000000000001',
        '34000000-0000-4000-8000-000000000002',
        '34000000-0000-4000-8000-000000000003',
        'not-a-uuid',
      ],
    },
  ])('rejects malformed ordering item arrays %#', async ({ itemIds }) => {
    const response = await authenticatedAnswerRequest({
      format: 'ordering',
      attemptQuestionId: '32000000-0000-4000-8000-000000000001',
      itemIds,
    });

    expect(response.statusCode).toBe(400);
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it('returns the completed representation with five review entries', async () => {
    const attempt = completedAttempt();

    submitAnswer.mockResolvedValue(attempt);

    const response = await authenticatedAnswerRequest();

    expect(response.statusCode).toBe(200);

    const body = response.json<Record<string, unknown>>();

    expect(body).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });

    expect(body).not.toHaveProperty('questions');
    expect(body).not.toHaveProperty('answeredCount');
    expect(body).not.toHaveProperty('selectedChoiceId');
    expect(body).not.toHaveProperty('answeredAt');
    expect(body).not.toHaveProperty('answerCorrect');
    expect(body).not.toHaveProperty('correctAnswers');
    expect(body).not.toHaveProperty('acceptedChoiceId');
    expect(body).not.toHaveProperty('explanation');
    expect(response.body).not.toContain('"acceptedChoiceId"');
    expect(response.body).not.toContain('"explanation"');
    expect(body).toHaveProperty('review', attempt.review);
  });

  it('reveals the ordering sequence and explanation only in the completed representation', async () => {
    const attempt = completedOrderingAttempt();
    submitAnswer.mockResolvedValue(attempt);

    const response = await authenticatedAnswerRequest({
      format: 'ordering',
      attemptQuestionId: attempt.review[0]?.attemptQuestionId,
      itemIds: attempt.review[0]?.correctItems.map((item) => item.itemId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expect(response.body).toContain('correctItems');
    expect(response.body).toContain('explanation');
    expect(response.body).not.toContain('sourceItemId');
  });

  it('returns an incorrect ordering sequence without partial credit', async () => {
    const attempt = completedOrderingAttempt({ firstIncorrect: true });
    submitAnswer.mockResolvedValue(attempt);

    const response = await authenticatedAnswerRequest({
      format: 'ordering',
      attemptQuestionId: attempt.review[0]?.attemptQuestionId,
      itemIds: attempt.review[0]?.selectedItems?.map((item) => item.itemId),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<CompletedOrderingChallengeAttempt>();
    expect(body).toMatchObject({
      format: 'ordering',
      scoreCorrect: 4,
    });
    expect(body.review[0]).toMatchObject({
      isCorrect: false,
      selectedItems: attempt.review[0]?.selectedItems,
      correctItems: attempt.review[0]?.correctItems,
    });
  });

  it('maps a cross-player ordering submission to the ownership-safe 404', async () => {
    const attempt = inProgressOrderingAttempt();
    const itemIds =
      attempt.questions[0]?.items.map((item) => item.itemId) ?? [];
    submitAnswer.mockRejectedValue(new ChallengeAttemptNotFoundError());

    const response = await authenticatedAnswerRequest({
      format: 'ordering',
      attemptQuestionId: attempt.questions[0]?.attemptQuestionId,
      itemIds,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'ATTEMPT_NOT_FOUND',
      requestId: expect.any(String),
    });
    expect(submitAnswer).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
      format: 'ordering',
      attemptQuestionId: attempt.questions[0]?.attemptQuestionId,
      itemIds,
    });
  });

  it('rejects browser-supplied authoritative answer fields', async () => {
    const response = await authenticatedAnswerRequest({
      ...validAnswer(),
      playerId: PLAYER_ID,
      receivedAt: '2026-09-01T10:00:30.000Z',
      answerCorrect: true,
      scoreCorrect: 5,
      coinsAwarded: 1000,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it('rejects malformed attempt, question, and choice identifiers', async () => {
    const invalidAttempt = await authenticatedAnswerRequest(
      validAnswer(),
      'not-a-uuid',
    );

    expect(invalidAttempt.statusCode).toBe(400);
    expect(submitAnswer).not.toHaveBeenCalled();

    const invalidBody = await authenticatedAnswerRequest({
      attemptQuestionId: 'not-a-uuid',
      choiceId: 'also-not-a-uuid',
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: new InvalidChallengeAnswerError(),
      status: 400,
      code: 'INVALID_CHALLENGE_ANSWER',
    },
    {
      error: new ChallengeAttemptNotFoundError(),
      status: 404,
      code: 'ATTEMPT_NOT_FOUND',
    },
    {
      error: new ChallengeAnswerLockedError(),
      status: 409,
      code: 'ANSWER_LOCKED',
    },
    {
      error: new ChallengeAttemptCompletedError(),
      status: 409,
      code: 'ATTEMPT_COMPLETED',
    },
  ])(
    'maps answer submission failures to $status $code',
    async ({ error, status, code }) => {
      submitAnswer.mockRejectedValue(error);

      const response = await authenticatedAnswerRequest();

      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({
        status,
        code,
        requestId: expect.any(String),
      });
    },
  );

  it('uses the existing generic internal error response when finalization fails', async () => {
    submitAnswer.mockRejectedValue(new Error('reward transaction failed'));

    const response = await authenticatedAnswerRequest();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: 'https://wits.world/problems/internal-error',
      title: 'Internal server error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'The server could not complete the request.',
      requestId: expect.any(String),
    });

    expect(response.body).not.toContain('reward transaction failed');
  });

  it('documents answer submission as bearer-protected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<
        string,
        {
          post?: {
            security?: Array<Record<string, unknown>>;
            responses?: Record<string, unknown>;
          };
        }
      >;
    }>();

    const operation =
      document.paths['/api/v1/challenge-attempts/{attemptId}/answers']?.post;

    expect(operation?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(operation?.responses).toHaveProperty('200');
    expect(operation?.responses).toHaveProperty('400');
    expect(operation?.responses).toHaveProperty('401');
    expect(operation?.responses).toHaveProperty('403');
    expect(operation?.responses).toHaveProperty('404');
    expect(operation?.responses).toHaveProperty('409');
    expect(operation?.responses).toHaveProperty('500');
    expectCompletedOnlyReviewSchema(operation?.responses?.['200']);
  });
});

describe('challenge attempt fetch API', () => {
  it('requires authentication before fetching an attempt', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/challenge-attempts/${ATTEMPT_ID}`,
    });

    expect(response.statusCode).toBe(401);
    expect(fetchAttempt).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending player before fetching an attempt', async () => {
    playerResolve.mockResolvedValue({
      ...activePlayer,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedFetchRequest();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });

    expect(fetchAttempt).not.toHaveBeenCalled();
  });

  it('rejects a stale client before fetching or finalizing an attempt', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/challenge-attempts/${ATTEMPT_ID}`,
      headers: {
        authorization: 'Bearer test-access-token',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'CHALLENGE_CLIENT_UPGRADE_REQUIRED',
      requestId: expect.any(String),
    });
    expect(fetchAttempt).not.toHaveBeenCalled();
  });

  it('derives attempt ownership from the authenticated player', async () => {
    const attempt = inProgressAttempt();

    fetchAttempt.mockResolvedValue(attempt);

    const response = await authenticatedFetchRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expectActivePayloadToWithholdReview(response.json());

    expect(fetchAttempt).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
    });
  });

  it('returns a persisted completed timeout result with unanswered review entries', async () => {
    const attempt = completedAttempt('timeout');

    fetchAttempt.mockResolvedValue(attempt);

    const response = await authenticatedFetchRequest();

    expect(response.statusCode).toBe(200);

    const body = response.json<Record<string, unknown>>();

    expect(body).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });

    expect(body).not.toHaveProperty('questions');
    expect(body).not.toHaveProperty('answeredCount');
    expect(body).not.toHaveProperty('acceptedChoiceId');
    expect(body).not.toHaveProperty('correctAnswers');
    expect(body).not.toHaveProperty('explanation');
    expect(response.body).not.toContain('"acceptedChoiceId"');
    expect(response.body).not.toContain('"explanation"');

    expect(body).toHaveProperty('review', attempt.review);
    expect(attempt.review[4]).toMatchObject({
      selectedChoice: null,
      isCorrect: false,
    });
  });

  it('returns ordering timeout feedback with no answer for unanswered questions', async () => {
    const attempt = completedOrderingAttempt({ completionReason: 'timeout' });
    fetchAttempt.mockResolvedValue(attempt);

    const response = await authenticatedFetchRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...attempt,
      requestId: expect.any(String),
    });
    expect(attempt.review[4]).toMatchObject({
      selectedItems: null,
      isCorrect: false,
      explanation: 'Explanation 5',
    });
  });

  it('maps missing and cross-player attempts to the same safe 404', async () => {
    fetchAttempt.mockRejectedValue(new ChallengeAttemptFetchNotFoundError());

    const response = await authenticatedFetchRequest();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      status: 404,
      code: 'ATTEMPT_NOT_FOUND',
      requestId: expect.any(String),
    });
  });

  it('rejects a malformed attempt identifier', async () => {
    const response = await authenticatedFetchRequest('not-a-uuid');

    expect(response.statusCode).toBe(400);
    expect(fetchAttempt).not.toHaveBeenCalled();
  });

  it('uses the generic safe 500 response when defensive finalization fails', async () => {
    fetchAttempt.mockRejectedValue(
      new Error('timeout reward transaction failed'),
    );

    const response = await authenticatedFetchRequest();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: 'https://wits.world/problems/internal-error',
      title: 'Internal server error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'The server could not complete the request.',
      requestId: expect.any(String),
    });

    expect(response.body).not.toContain('timeout reward transaction failed');
  });

  it('documents fetch/resume as bearer-protected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<
        string,
        {
          get?: {
            security?: Array<Record<string, unknown>>;
            responses?: Record<string, unknown>;
          };
        }
      >;
    }>();

    const operation =
      document.paths['/api/v1/challenge-attempts/{attemptId}']?.get;

    expect(operation?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(operation?.responses).toHaveProperty('200');
    expect(operation?.responses).toHaveProperty('400');
    expect(operation?.responses).toHaveProperty('401');
    expect(operation?.responses).toHaveProperty('403');
    expect(operation?.responses).toHaveProperty('404');
    expect(operation?.responses).toHaveProperty('500');
  });
});

function validLocationClaim() {
  return {
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: '2026-09-01T09:59:30.000Z',
  };
}

async function authenticatedStartRequest(
  payload: Record<string, unknown> = validLocationClaim(),
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/events/${EVENT_ID}/challenge-attempts`,
    headers: {
      authorization: 'Bearer test-access-token',
      [CHALLENGE_CONTRACT_HEADER]: ACTIVE_CHALLENGE_CONTRACT_VERSION,
    },
    payload,
  });
}

function validAnswer() {
  return {
    attemptQuestionId: '32000000-0000-4000-8000-000000000001',
    choiceId: '33000000-0000-4000-0001-000000000001',
  };
}

async function authenticatedAnswerRequest(
  payload: Record<string, unknown> = validAnswer(),
  attemptId = ATTEMPT_ID,
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/challenge-attempts/${attemptId}/answers`,
    headers: {
      authorization: 'Bearer test-access-token',
      [CHALLENGE_CONTRACT_HEADER]: ACTIVE_CHALLENGE_CONTRACT_VERSION,
    },
    payload,
  });
}

function inProgressAttempt(): InProgressChallengeAttempt {
  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'multiple_choice',
    status: 'in_progress',
    startedAt: '2026-09-01T10:00:00.000Z',
    deadline: '2026-09-01T10:02:00.000Z',
    totalQuestions: 5,
    answeredCount: 1,
    questions: Array.from({ length: 5 }, (_, questionIndex) => {
      const position = questionIndex + 1;
      const attemptQuestionId = `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`;

      return {
        attemptQuestionId,
        position,
        prompt: `Question ${position}`,
        choices: Array.from({ length: 4 }, (_, choiceIndex) => ({
          choiceId: `33000000-0000-4000-${String(position).padStart(4, '0')}-${String(
            choiceIndex + 1,
          ).padStart(12, '0')}`,
          text: `Choice ${position}.${choiceIndex + 1}`,
        })),
        selectedChoiceId:
          position === 1 ? `33000000-0000-4000-0001-000000000001` : null,
        answeredAt: position === 1 ? '2026-09-01T10:00:20.000Z' : null,
      };
    }),
  };
}

function orderingItems(position: number) {
  return Array.from({ length: 4 }, (_, itemIndex) => ({
    itemId: `34000000-0000-4000-${String(position).padStart(4, '0')}-${String(
      itemIndex + 1,
    ).padStart(12, '0')}`,
    text: `Item ${position}.${itemIndex + 1}`,
  }));
}

function inProgressOrderingAttempt(): InProgressOrderingChallengeAttempt {
  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'ordering',
    status: 'in_progress',
    startedAt: '2026-09-01T10:00:00.000Z',
    deadline: '2026-09-01T10:02:00.000Z',
    totalQuestions: 5,
    answeredCount: 1,
    questions: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const items = orderingItems(position);
      return {
        attemptQuestionId: `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
        position,
        prompt: `Ordering question ${position}`,
        items,
        selectedItemIds:
          position === 1 ? items.map((item) => item.itemId) : null,
        answeredAt: position === 1 ? '2026-09-01T10:00:20.000Z' : null,
      };
    }),
  };
}

function completedAttempt(
  completionReason: 'answered' | 'timeout' = 'answered',
): CompletedChallengeAttempt {
  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'multiple_choice',
    status: 'completed',
    completedAt: '2026-09-01T10:01:25.000Z',
    completionReason,
    totalQuestions: 5,
    scoreCorrect: 3,
    reward: {
      cards: [
        {
          ownedCardId: '51000000-0000-4000-8000-000000000001',
          cardDefinitionId: '50000000-0000-4000-8000-000000000009',
          name: 'Campus Spark',
          category: 'creature',
          affinity: 'spark',
          rarity: 'common',
        },
      ],
    },
    review: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const answered = completionReason === 'answered' || position <= 3;
      const selectedChoiceNumber = position <= 3 ? 2 : 1;

      return {
        attemptQuestionId: `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
        position,
        prompt: `Question ${position}`,
        selectedChoice: answered
          ? {
              choiceId: `33000000-0000-4000-${String(position).padStart(
                4,
                '0',
              )}-${String(selectedChoiceNumber).padStart(12, '0')}`,
              text: `Choice ${position}.${selectedChoiceNumber}`,
            }
          : null,
        correctChoice: {
          choiceId: `33000000-0000-4000-${String(position).padStart(
            4,
            '0',
          )}-000000000002`,
          text: `Choice ${position}.2`,
        },
        isCorrect: answered && selectedChoiceNumber === 2,
      };
    }),
  };
}

function completedOrderingAttempt({
  completionReason = 'answered',
  firstIncorrect = false,
}: {
  completionReason?: 'answered' | 'timeout';
  firstIncorrect?: boolean;
} = {}): CompletedOrderingChallengeAttempt {
  const active = inProgressOrderingAttempt();
  const scoreCorrect = completionReason === 'timeout' || firstIncorrect ? 4 : 5;

  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'ordering',
    status: 'completed',
    completedAt: '2026-09-01T10:01:25.000Z',
    completionReason,
    totalQuestions: 5,
    scoreCorrect,
    reward: { cards: [] },
    review: active.questions.map((question) => {
      const unanswered =
        completionReason === 'timeout' && question.position === 5;
      const incorrect = firstIncorrect && question.position === 1;
      const selectedItems = unanswered
        ? null
        : incorrect
          ? [
              question.items[1]!,
              question.items[0]!,
              question.items[2]!,
              question.items[3]!,
            ]
          : question.items;

      return {
        attemptQuestionId: question.attemptQuestionId,
        position: question.position,
        prompt: question.prompt,
        selectedItems,
        correctItems: question.items,
        isCorrect: !unanswered && !incorrect,
        explanation: `Explanation ${question.position}`,
      };
    }),
  };
}

function expectActivePayloadToWithholdReview(body: unknown): void {
  expect(body).not.toHaveProperty('review');
  expect(body).not.toHaveProperty('scoreCorrect');
  expect(body).not.toHaveProperty('reward');
  expect(body).not.toHaveProperty('correctChoice');
  expect(body).not.toHaveProperty('isCorrect');
  expect(JSON.stringify(body)).not.toContain('acceptedChoice');
  expect(JSON.stringify(body)).not.toContain('explanation');
}

function expectCompletedOnlyReviewSchema(response: unknown): void {
  interface ResponseSchema {
    oneOf?: Array<{
      required?: string[];
      properties?: Record<
        string,
        {
          enum?: string[];
          minItems?: number;
          maxItems?: number;
          items?: { required?: string[] };
        }
      >;
    }>;
  }

  const schema = (
    response as {
      content?: {
        'application/json'?: {
          schema?: ResponseSchema;
        };
      };
    }
  ).content?.['application/json']?.schema;

  const inProgress = schema?.oneOf?.find((candidate) =>
    candidate.properties?.status?.enum?.includes('in_progress'),
  );
  const completed = schema?.oneOf?.find((candidate) =>
    candidate.properties?.status?.enum?.includes('completed'),
  );

  expect(inProgress?.properties).not.toHaveProperty('review');
  expect(inProgress?.properties).not.toHaveProperty('scoreCorrect');
  expect(completed?.required).toContain('review');
  expect(completed?.properties?.review).toMatchObject({
    minItems: 5,
    maxItems: 5,
    items: {
      required: [
        'attemptQuestionId',
        'position',
        'prompt',
        'selectedChoice',
        'correctChoice',
        'isCorrect',
      ],
    },
  });
}

async function authenticatedFetchRequest(attemptId = ATTEMPT_ID) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/challenge-attempts/${attemptId}`,
    headers: {
      authorization: 'Bearer test-access-token',
      [CHALLENGE_CONTRACT_HEADER]: ACTIVE_CHALLENGE_CONTRACT_VERSION,
    },
  });
}
