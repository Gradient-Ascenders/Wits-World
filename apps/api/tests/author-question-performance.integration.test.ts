import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import type { QuestionPerformanceService } from '../src/challenges/question-performance-service.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};
const identity = {
  connectionStrategy: 'auth0' as const,
  issuer: authConfig.issuer,
  playerName: 'author',
  subject: 'auth0|analytics',
};
const author = {
  id: '10000000-0000-4000-8000-000000000001',
  role: 'author' as const,
  playerName: 'author',
  lifecycleStatus: 'active' as const,
};
const aggregate = {
  questionId: '20000000-0000-4000-8000-000000000001',
  challengeId: '30000000-0000-4000-8000-000000000001',
  eventId: '40000000-0000-4000-8000-000000000001',
  eventTitle: 'Great Hall',
  prompt: 'Where is the Great Hall?',
  format: 'multiple_choice' as const,
  difficulty: 2 as const,
  status: 'published' as const,
  answerCount: 10,
  correctCount: 3,
  incorrectCount: 7,
  timeoutCount: 1,
  correctRate: 0.3,
  incorrectRate: 0.7,
  hasSufficientSample: true,
  isProblematic: true,
};

let app: FastifyInstance;
let list: ReturnType<typeof vi.fn>;
let resolve: ReturnType<typeof createPlayerResolveMock>;

beforeEach(async () => {
  list = vi.fn().mockResolvedValue({
    items: [aggregate],
    page: 1,
    pageSize: 25,
    totalItems: 1,
    totalPages: 1,
    minimumSampleSize: 10,
    problematicIncorrectRate: 0.7,
  });
  const verifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue(identity),
  };
  resolve = createPlayerResolveMock();
  app = await buildApp({
    authConfig,
    accessTokenVerifier: verifier,
    playerIdentityService: { resolve },
    logger: false,
    authorContentServices: {
      questionPerformance: { list } as QuestionPerformanceService,
    },
  });
});

afterEach(async () => app.close());

describe('author question performance API', () => {
  it('requires authentication and rejects a non-Author', async () => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/author/question-performance',
        })
      ).statusCode,
    ).toBe(401);
    resolve.mockResolvedValue({ ...author, role: 'player' });
    const rejected = await request('/api/v1/author/question-performance');
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
    expect(list).not.toHaveBeenCalled();
  });

  it('validates filters and bounds the response', async () => {
    const malformed = await request(
      '/api/v1/author/question-performance?eventId=nope',
    );
    expect(malformed.statusCode).toBe(400);
    const oversized = await request(
      '/api/v1/author/question-performance?pageSize=101',
    );
    expect(oversized.statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('passes composable filters and projects aggregate fields only', async () => {
    const from = '2026-09-01T00:00:00.000Z';
    const to = '2026-09-05T00:00:00.000Z';
    const response = await request(
      `/api/v1/author/question-performance?eventId=${aggregate.eventId}&challengeId=${aggregate.challengeId}&format=multiple_choice&difficulty=2&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({
      eventId: aggregate.eventId,
      challengeId: aggregate.challengeId,
      format: 'multiple_choice',
      difficulty: 2,
      from,
      to,
      page: 1,
      pageSize: 25,
    });
    const body = response.json();
    expect(body.items).toEqual([aggregate]);
    expect(JSON.stringify(body)).not.toMatch(
      /player|selected|latitude|longitude|location|submittedPosition/i,
    );
  });

  it('returns a clean empty page', async () => {
    list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
      minimumSampleSize: 10,
      problematicIncorrectRate: 0.7,
    });
    const response = await request('/api/v1/author/question-performance');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [],
      totalItems: 0,
      totalPages: 0,
    });
  });
});

function request(url: string) {
  return app.inject({
    method: 'GET',
    url,
    headers: { authorization: 'Bearer token' },
  });
}

function createPlayerResolveMock() {
  const playerResolve: PlayerIdentityService['resolve'] = async () => author;
  return vi.fn(playerResolve);
}
