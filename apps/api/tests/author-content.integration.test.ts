import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthorContentReadService } from '../src/authoring/content-read-service.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authorId = 'c1000000-0000-4000-8000-000000000001';
const otherAuthorId = 'c1000000-0000-4000-8000-000000000002';
const entityId = 'c2000000-0000-4000-8000-000000000001';
const eventId = 'c2000000-0000-4000-8000-000000000002';
const challengeId = 'c2000000-0000-4000-8000-000000000003';
const auditId = 'c3000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  audience: 'https://api.example.test',
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
  spaClientId: 'wits-world-spa-client',
};

let app: FastifyInstance;
let listReviewQueue: ReturnType<
  typeof vi.fn<AuthorContentReadService['listReviewQueue']>
>;
let getHistory: ReturnType<
  typeof vi.fn<AuthorContentReadService['getHistory']>
>;
let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;

beforeEach(async () => {
  listReviewQueue = vi.fn().mockResolvedValue({
    items: [
      {
        canReview: true,
        entityId,
        entityType: 'question',
        eventId,
        challengeId,
        label: 'multiple_choice question',
        status: 'in_review',
        submittedAt: '2026-08-29T08:00:00.000Z',
        submittedBy: otherAuthorId,
        submittedByName: 'review-candidate',
        version: 3,
      },
    ],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  });
  getHistory = vi.fn().mockResolvedValue({
    items: [
      {
        action: 'return',
        actorPlayerId: otherAuthorId,
        actorPlayerName: 'reviewer-name',
        auditId,
        fromStatus: 'approved',
        note: 'Correct the active-time window.',
        occurredAt: '2026-08-29T08:05:00.000Z',
        resultingVersion: 4,
        toStatus: 'draft',
      },
    ],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
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
    authorContentServices: { read: { getHistory, listReviewQueue } },
    logger: false,
    playerIdentityService: { resolve: resolvePlayer },
  });
});

afterEach(async () => app.close());

describe('Author review queue and history API', () => {
  it('protects the review queue with authentication and active-Author authorization', async () => {
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/v1/author/review-queue',
    });
    expect(unauthenticated.statusCode).toBe(401);

    resolvePlayer.mockResolvedValue({
      id: authorId,
      lifecycleStatus: 'active',
      playerName: 'ordinary-player',
      role: 'player',
    });
    const ordinaryPlayer = await authenticatedGet(
      '/api/v1/author/review-queue',
    );
    expect(ordinaryPlayer.statusCode).toBe(403);
    expect(ordinaryPlayer.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
    expect(listReviewQueue).not.toHaveBeenCalled();
  });

  it('forwards safe pagination/filter context and returns summary-only queue data', async () => {
    const response = await authenticatedGet(
      '/api/v1/author/review-queue?entityType=question&page=1&pageSize=20',
    );

    expect(response.statusCode).toBe(200);
    expect(listReviewQueue).toHaveBeenCalledWith({
      actorPlayerId: authorId,
      entityType: 'question',
      page: 1,
      pageSize: 20,
    });
    const serialized = JSON.stringify(response.json());
    expect(serialized).not.toContain('auth0|private-subject');
    expect(serialized).not.toContain('acceptedAnswer');
    expect(serialized).not.toContain('latitude');
    expect(response.json()).toMatchObject({
      items: [
        {
          canReview: true,
          challengeId,
          entityType: 'question',
          eventId,
          status: 'in_review',
        },
      ],
      totalItems: 1,
    });
  });

  it('returns version-ordered safe audit identities and notes', async () => {
    const response = await authenticatedGet(
      `/api/v1/author/content/event/${entityId}/history`,
    );

    expect(response.statusCode).toBe(200);
    expect(getHistory).toHaveBeenCalledWith({
      entityId,
      entityType: 'event',
      page: 1,
      pageSize: 20,
    });
    expect(response.json()).toMatchObject({
      items: [
        {
          action: 'return',
          actorPlayerId: otherAuthorId,
          actorPlayerName: 'reviewer-name',
          fromStatus: 'approved',
          resultingVersion: 4,
          toStatus: 'draft',
        },
      ],
    });
    expect(response.body).not.toContain('auth0|private-subject');
  });

  it('documents both protected endpoints and rejects unknown filters', async () => {
    const invalid = await authenticatedGet(
      '/api/v1/author/review-queue?entityType=answer_key',
    );
    expect(invalid.statusCode).toBe(400);
    expect(listReviewQueue).not.toHaveBeenCalled();

    const document = app.swagger();
    expect(document.paths?.['/api/v1/author/review-queue']).toBeDefined();
    expect(
      document.paths?.[
        '/api/v1/author/content/{entityType}/{entityId}/history'
      ],
    ).toBeDefined();
  });
});

function authenticatedGet(url: string) {
  return app.inject({
    headers: { authorization: 'Bearer test-token' },
    method: 'GET',
    url,
  });
}
