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
  InProgressChallengeAttempt,
} from '../src/challenges/challenge-attempt-reader.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import { InvalidLocationClaimError } from '../src/events/location-claim.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000001';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const authenticatedIdentity = {
  issuer: authConfig.issuer,
  subject: 'auth0|challenge-player',
};

const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;
let playerResolve: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;
let startOrResume: ReturnType<
  typeof vi.fn<ChallengeAttemptStartService['startOrResume']>
>;

beforeEach(async () => {
  playerResolve = vi.fn<PlayerIdentityService['resolve']>();
  playerResolve.mockResolvedValue(activePlayer);

  startOrResume = vi.fn<ChallengeAttemptStartService['startOrResume']>();

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
  });

  it('returns a completed result without question or answer details', async () => {
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
  });

  it('rejects client-supplied player and authoritative eligibility fields', async () => {
    const response = await authenticatedStartRequest({
      ...validLocationClaim(),
      playerId: PLAYER_ID,
      reachable: true,
      scoreCorrect: 5,
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

function completedAttempt(): CompletedChallengeAttempt {
  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'multiple_choice',
    status: 'completed',
    completedAt: '2026-09-01T10:01:25.000Z',
    completionReason: 'answered',
    totalQuestions: 5,
    scoreCorrect: 3,
    reward: {
      coinsAwarded: 37,
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
  };
}
