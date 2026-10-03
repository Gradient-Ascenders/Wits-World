import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorAnalyticsService } from '../src/analytics/author-analytics-service.js';
import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

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
  subject: 'auth0|advanced-analytics',
};
const author = {
  id: '10000000-0000-4000-8000-000000000001',
  role: 'author' as const,
  playerName: 'author',
  lifecycleStatus: 'active' as const,
};
const EVENT_ID = '20000000-0000-4000-8000-000000000001';
const LOCATION_ID = '30000000-0000-4000-8000-000000000001';
const QUESTION_ID = '40000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '50000000-0000-4000-8000-000000000001';
const CARD_ID = '60000000-0000-4000-8000-000000000001';

let app: FastifyInstance;
let resolve: ReturnType<typeof createPlayerResolveMock>;
let listEventLocations: ReturnType<
  typeof vi.fn<AuthorAnalyticsService['listEventLocations']>
>;
let listQuestions: ReturnType<
  typeof vi.fn<AuthorAnalyticsService['listQuestions']>
>;
let listCardIssuance: ReturnType<
  typeof vi.fn<AuthorAnalyticsService['listCardIssuance']>
>;
let listAttention: ReturnType<
  typeof vi.fn<AuthorAnalyticsService['listAttention']>
>;

beforeEach(async () => {
  listAttention = vi
    .fn<AuthorAnalyticsService['listAttention']>()
    .mockResolvedValue({
      items: [
        {
          eventId: EVENT_ID,
          eventTitle: 'Great Hall',
          ignoredLocationCount: 2,
          easyQuestionCount: 0,
          hardQuestionCount: 1,
          questionId: QUESTION_ID,
          challengeId: CHALLENGE_ID,
        },
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
      minimumSampleSize: 10,
    });
  listEventLocations = vi
    .fn<AuthorAnalyticsService['listEventLocations']>()
    .mockResolvedValue({
      items: [
        {
          eventId: EVENT_ID,
          eventTitle: 'Great Hall',
          locationKind: 'placement_site',
          locationId: LOCATION_ID,
          locationName: 'Library lawns',
          viewCount: 20,
          eligibleCount: null,
          startCount: 0,
          completionCount: 12,
          suppressed: true,
        },
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
      minimumSampleSize: 10,
    });
  listQuestions = vi
    .fn<AuthorAnalyticsService['listQuestions']>()
    .mockResolvedValue({
      items: [
        {
          questionId: QUESTION_ID,
          challengeId: CHALLENGE_ID,
          eventId: EVENT_ID,
          eventTitle: 'Great Hall',
          prompt: 'Question?',
          format: 'multiple_choice',
          difficulty: 2,
          status: 'published',
          answerCount: null,
          correctCount: null,
          incorrectCount: null,
          timeoutCount: null,
          correctRate: null,
          incorrectRate: null,
          classification: 'suppressed',
          suppressed: true,
        },
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
      minimumSampleSize: 10,
      easyCorrectRate: 0.9,
      problematicIncorrectRate: 0.7,
    });
  listCardIssuance = vi
    .fn<AuthorAnalyticsService['listCardIssuance']>()
    .mockResolvedValue({
      items: [
        {
          cardDefinitionId: CARD_ID,
          cardName: 'Campus Card',
          rarity: 'rare',
          rewardEligible: true,
          issuanceCount: 10,
          issuancesPer100Completions: 50,
          suppressed: false,
        },
      ],
      rarities: [
        {
          rarity: 'common',
          issuanceCount: 0,
          issuancesPer100Completions: 0,
          suppressed: false,
        },
        {
          rarity: 'rare',
          issuanceCount: 10,
          issuancesPer100Completions: 50,
          suppressed: false,
        },
        {
          rarity: 'epic',
          issuanceCount: 0,
          issuancesPer100Completions: 0,
          suppressed: false,
        },
        {
          rarity: 'legendary',
          issuanceCount: 0,
          issuancesPer100Completions: 0,
          suppressed: false,
        },
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
      minimumSampleSize: 10,
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
      analytics: {
        listAttention,
        listEventLocations,
        listQuestions,
        listCardIssuance,
      },
    },
  });
});

afterEach(async () => app.close());

describe('advanced author analytics API', () => {
  it('protects the attention report and forwards bounded filters without leaking identities', async () => {
    const url = '/api/v1/author/analytics/attention';
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    resolve.mockResolvedValue({ ...author, role: 'player' });
    expect((await request(url)).statusCode).toBe(403);
    expect(listAttention).not.toHaveBeenCalled();
    resolve.mockResolvedValue(author);
    expect((await request(`${url}?pageSize=101`)).statusCode).toBe(400);
    const response = await request(
      `${url}?fromDate=2026-09-01&toDate=2026-10-01&page=2&pageSize=10`,
    );
    expect(response.statusCode).toBe(200);
    expect(listAttention).toHaveBeenCalledWith({
      fromDate: '2026-09-01',
      toDate: '2026-10-01',
      page: 2,
      pageSize: 10,
    });
    expect(response.json().items[0]).toMatchObject({
      eventId: EVENT_ID,
      ignoredLocationCount: 2,
      hardQuestionCount: 1,
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /playerId|auth0|latitude|longitude|selectedChoice/i,
    );
  });
  it('requires authentication and Author role', async () => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/author/analytics/event-locations',
        })
      ).statusCode,
    ).toBe(401);

    resolve.mockResolvedValue({ ...author, role: 'player' });
    const rejected = await request('/api/v1/author/analytics/event-locations');
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
    expect(listEventLocations).not.toHaveBeenCalled();
  });

  it('passes date, mode, and pagination filters to location analytics', async () => {
    const response = await request(
      '/api/v1/author/analytics/event-locations?fromDate=2026-09-01&toDate=2026-09-30&mode=ignored&page=2&pageSize=10',
    );

    expect(response.statusCode).toBe(200);
    expect(listEventLocations).toHaveBeenCalledWith({
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      mode: 'ignored',
      page: 2,
      pageSize: 10,
    });
    expect(response.json()).toMatchObject({
      minimumSampleSize: 10,
      requestId: expect.any(String),
    });
  });

  it('projects suppressed question analytics without player-level evidence', async () => {
    const response = await request(
      `/api/v1/author/analytics/questions?eventId=${EVENT_ID}&format=multiple_choice&difficulty=2`,
    );

    expect(response.statusCode).toBe(200);
    expect(listQuestions).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      format: 'multiple_choice',
      difficulty: 2,
      page: 1,
      pageSize: 25,
    });
    const body = response.json();
    expect(body.items[0]).toMatchObject({
      answerCount: null,
      classification: 'suppressed',
      suppressed: true,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /playerId|auth0|latitude|longitude|selectedChoice/i,
    );
  });

  it('returns card and rarity issuance aggregates from the service contract', async () => {
    const response = await request('/api/v1/author/analytics/card-issuance');

    expect(response.statusCode).toBe(200);
    expect(listCardIssuance).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
    expect(response.json()).toMatchObject({
      items: [
        {
          cardDefinitionId: CARD_ID,
          issuanceCount: 10,
          issuancesPer100Completions: 50,
        },
      ],
      rarities: expect.arrayContaining([
        expect.objectContaining({ rarity: 'rare', issuanceCount: 10 }),
      ]),
    });
  });

  it('rejects malformed public query values before calling analytics services', async () => {
    const invalidMode = await request(
      '/api/v1/author/analytics/event-locations?mode=secret',
    );
    const oversized = await request(
      '/api/v1/author/analytics/card-issuance?pageSize=101',
    );
    const invalidDate = await request(
      '/api/v1/author/analytics/questions?fromDate=not-a-date',
    );

    expect(invalidMode.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(400);
    expect(invalidDate.statusCode).toBe(400);
    expect(listEventLocations).not.toHaveBeenCalled();
    expect(listQuestions).not.toHaveBeenCalled();
    expect(listCardIssuance).not.toHaveBeenCalled();
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
