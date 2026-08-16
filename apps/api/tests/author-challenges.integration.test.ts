import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  type AuthorChallenge,
  type AuthorChallengeQuestion,
  type AuthorChallengeService,
} from '../src/challenges/author-challenge-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const AUTHOR_ID = 'f1000000-0000-4000-8000-000000000001';
const PLAYER_ID = 'f1000000-0000-4000-8000-000000000002';
const EVENT_ID = 'f2000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = 'f3000000-0000-4000-8000-000000000001';
const QUESTION_ID = 'f4000000-0000-4000-8000-000000000001';
const ACCEPTED_CHOICE_ID = 'f5000000-0000-4000-8000-000000000002';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const authenticatedIdentity = {
  issuer: authConfig.issuer,
  subject: 'auth0|author-challenge',
};

const activeAuthor = {
  id: AUTHOR_ID,
  role: 'author' as const,
  lifecycleStatus: 'active' as const,
};

const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  lifecycleStatus: 'active' as const,
};

const challenge: AuthorChallenge = {
  challengeId: CHALLENGE_ID,
  eventId: EVENT_ID,
  format: 'multiple_choice',
  status: 'draft',
  createdAt: '2026-08-15T21:00:00.000Z',
  updatedAt: '2026-08-15T21:00:00.000Z',
};

const question: AuthorChallengeQuestion = {
  questionId: QUESTION_ID,
  challengeId: CHALLENGE_ID,
  prompt: 'Where is the Great Hall?',
  difficulty: 2,
  explanation: 'The Great Hall is on East Campus.',
  status: 'draft',
  choices: [
    {
      choiceId: 'f5000000-0000-4000-8000-000000000001',
      position: 1,
      text: 'West Campus',
    },
    {
      choiceId: ACCEPTED_CHOICE_ID,
      position: 2,
      text: 'East Campus',
    },
    {
      choiceId: 'f5000000-0000-4000-8000-000000000003',
      position: 3,
      text: 'Parktown',
    },
    {
      choiceId: 'f5000000-0000-4000-8000-000000000004',
      position: 4,
      text: 'Braamfontein',
    },
  ],
  acceptedChoiceId: ACCEPTED_CHOICE_ID,
  acceptedChoicePosition: 2,
  createdAt: '2026-08-15T21:00:00.000Z',
  updatedAt: '2026-08-15T21:00:00.000Z',
};

let app: FastifyInstance;
let service: {
  [K in keyof AuthorChallengeService]: ReturnType<typeof vi.fn>;
};
let playerResolve: ReturnType<typeof createPlayerResolveMock>;

beforeEach(async () => {
  service = createServiceMock();
  playerResolve = createPlayerResolveMock();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue(authenticatedIdentity),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: playerResolve,
    },
    authorContentServices: {
      challenges: service as unknown as AuthorChallengeService,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('author challenge API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/author/events/${EVENT_ID}/challenges`,
    });

    expect(response.statusCode).toBe(401);
    expect(service.listChallenges).not.toHaveBeenCalled();
  });

  it('rejects an ordinary Player', async () => {
    playerResolve.mockResolvedValue(activePlayer);

    const response = await authenticatedRequest({
      method: 'GET',
      url: `/api/v1/author/events/${EVENT_ID}/challenges`,
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'AUTHOR_REQUIRED',
    });

    expect(service.listChallenges).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending Author', async () => {
    playerResolve.mockResolvedValue({
      ...activeAuthor,
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedRequest({
      method: 'GET',
      url: `/api/v1/author/events/${EVENT_ID}/challenges`,
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });
  });

  it('creates a challenge using the authenticated Author identity', async () => {
    service.createChallenge.mockResolvedValue(challenge);

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/events/${EVENT_ID}/challenges`,
      payload: {},
    });

    expect(response.statusCode).toBe(201);

    expect(service.createChallenge).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      eventId: EVENT_ID,
    });
  });

  it('creates a complete draft question without accepting browser choice IDs', async () => {
    service.createQuestion.mockResolvedValue(question);

    const body = validQuestionBody();

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/challenges/${CHALLENGE_ID}/questions`,
      payload: body,
    });

    expect(response.statusCode).toBe(201);

    expect(service.createQuestion).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      challengeId: CHALLENGE_ID,
      ...body,
    });

    expect(response.json()).toEqual({
      question,
      requestId: expect.any(String),
    });
  });

  it('returns accepted answers only through the Author-protected question representation', async () => {
    service.listQuestions.mockResolvedValue([question]);

    const response = await authenticatedRequest({
      method: 'GET',
      url: `/api/v1/author/challenges/${CHALLENGE_ID}/questions`,
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      questions: AuthorChallengeQuestion[];
      requestId: string;
    }>();

    expect(body.questions[0]).toMatchObject({
      questionId: QUESTION_ID,
      acceptedChoiceId: ACCEPTED_CHOICE_ID,
      acceptedChoicePosition: 2,
      explanation: 'The Great Hall is on East Campus.',
    });
  });

  it('rejects browser-supplied authoritative challenge and choice identity fields', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/challenges/${CHALLENGE_ID}/questions`,
      payload: {
        ...validQuestionBody(),
        actorPlayerId: PLAYER_ID,
        challengeId: 'f3000000-0000-4000-8000-000000000099',
        acceptedChoiceId: ACCEPTED_CHOICE_ID,
        choiceIds: ['f5000000-0000-4000-8000-000000000001', ACCEPTED_CHOICE_ID],
        status: 'published',
      },
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(service.createQuestion).not.toHaveBeenCalled();
  });

  it('rejects malformed question structure before calling the service', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/challenges/${CHALLENGE_ID}/questions`,
      payload: {
        prompt: 'Broken',
        difficulty: 4,
        explanation: '',
        choices: ['A', 'B'],
        acceptedChoicePosition: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(service.createQuestion).not.toHaveBeenCalled();
  });

  it('publishes and retires content using only the authenticated Author identity', async () => {
    service.publishQuestion.mockResolvedValue({
      ...question,
      status: 'published',
    });

    service.retireChallenge.mockResolvedValue({
      ...challenge,
      status: 'retired',
    });

    const publish = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/questions/${QUESTION_ID}/publish`,
      payload: {},
    });

    expect(publish.statusCode).toBe(200);

    expect(service.publishQuestion).toHaveBeenCalledWith(
      AUTHOR_ID,
      QUESTION_ID,
    );

    const retire = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/challenges/${CHALLENGE_ID}/retire`,
      payload: {},
    });

    expect(retire.statusCode).toBe(200);

    expect(service.retireChallenge).toHaveBeenCalledWith(
      AUTHOR_ID,
      CHALLENGE_ID,
    );
  });

  it('maps publication readiness failures to 422', async () => {
    service.publishChallenge.mockRejectedValue(
      new AuthorContentNotReadyError(
        'A challenge requires at least five published questions before publication.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/challenges/${CHALLENGE_ID}/publish`,
      payload: {},
    });

    expect(response.statusCode).toBe(422);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_NOT_READY',
    });
  });

  it('maps invalid lifecycle transitions to 409', async () => {
    service.publishQuestion.mockRejectedValue(
      new AuthorContentStateConflictError(
        'Only a draft question can be published.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/questions/${QUESTION_ID}/publish`,
      payload: {},
    });

    expect(response.statusCode).toBe(409);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_STATE_CONFLICT',
    });
  });

  it('authenticates before validating malformed content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/author/challenges/not-a-uuid/questions',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(service.createQuestion).not.toHaveBeenCalled();
  });
});

describe('author challenge OpenAPI documentation', () => {
  it('documents all challenge and question authoring operations as bearer-protected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<
        string,
        Record<
          string,
          {
            security?: Array<Record<string, unknown>>;
          }
        >
      >;
    }>();

    const operations = [
      ['/api/v1/author/events/{eventId}/challenges', 'get'],
      ['/api/v1/author/events/{eventId}/challenges', 'post'],
      ['/api/v1/author/challenges/{challengeId}/questions', 'get'],
      ['/api/v1/author/challenges/{challengeId}/questions', 'post'],
      ['/api/v1/author/questions/{questionId}', 'put'],
      ['/api/v1/author/questions/{questionId}/publish', 'post'],
      ['/api/v1/author/questions/{questionId}/retire', 'post'],
      ['/api/v1/author/challenges/{challengeId}/publish', 'post'],
      ['/api/v1/author/challenges/{challengeId}/retire', 'post'],
    ] as const;

    for (const [path, method] of operations) {
      expect(document.paths[path]?.[method]?.security).toEqual([
        {
          bearerAuth: [],
        },
      ]);
    }
  });
});

function createServiceMock() {
  return {
    listChallenges: vi.fn().mockResolvedValue([challenge]),
    createChallenge: vi.fn().mockResolvedValue(challenge),
    listQuestions: vi.fn().mockResolvedValue([question]),
    createQuestion: vi.fn().mockResolvedValue(question),
    updateQuestion: vi.fn().mockResolvedValue(question),
    publishQuestion: vi.fn().mockResolvedValue({
      ...question,
      status: 'published',
    }),
    retireQuestion: vi.fn().mockResolvedValue({
      ...question,
      status: 'retired',
    }),
    publishChallenge: vi.fn().mockResolvedValue({
      ...challenge,
      status: 'published',
    }),
    retireChallenge: vi.fn().mockResolvedValue({
      ...challenge,
      status: 'retired',
    }),
  };
}

function createPlayerResolveMock() {
  const resolve: PlayerIdentityService['resolve'] = async () => activeAuthor;

  return vi.fn(resolve);
}

function validQuestionBody() {
  return {
    prompt: 'Where is the Great Hall?',
    difficulty: 2 as const,
    explanation: 'The Great Hall is on East Campus.',
    choices: ['West Campus', 'East Campus', 'Parktown', 'Braamfontein'],
    acceptedChoicePosition: 2,
  };
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  payload?: Record<string, unknown>;
}) {
  const headers = {
    authorization: 'Bearer test-access-token',
  };

  if (options.payload === undefined) {
    return app.inject({
      method: options.method,
      url: options.url,
      headers,
    });
  }

  return app.inject({
    method: options.method,
    url: options.url,
    headers,
    payload: options.payload,
  });
}
