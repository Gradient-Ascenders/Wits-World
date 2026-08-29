import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import {
  AuthorTrailNotReadyError,
  AuthorTrailStateConflictError,
  type AuthorTrail,
  type AuthorTrailService,
} from '../src/trails/author-trail-service.js';

const AUTHOR_ID = '17600000-0000-4000-8000-000000000001';
const TRAIL_ID = '17610000-0000-4000-8000-000000000001';
const EVENT_ONE_ID = '17620000-0000-4000-8000-000000000001';
const EVENT_TWO_ID = '17620000-0000-4000-8000-000000000002';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const activeAuthor = {
  id: AUTHOR_ID,
  role: 'author' as const,
  playerName: 'trail-author',
  lifecycleStatus: 'active' as const,
};

const authoredTrail: AuthorTrail = {
  trailId: TRAIL_ID,
  title: 'East Campus Heritage',
  description: 'Visit two historic campus landmarks.',
  status: 'draft',
  publishedAt: null,
  retiredAt: null,
  createdAt: '2026-08-29T08:00:00.000Z',
  updatedAt: '2026-08-29T08:00:00.000Z',
  steps: [
    {
      position: 1,
      eventId: EVENT_ONE_ID,
      title: 'Great Hall',
      eventStatus: 'published',
    },
    {
      position: 2,
      eventId: EVENT_TWO_ID,
      title: 'Origins Centre',
      eventStatus: 'published',
    },
  ],
};

let app: FastifyInstance;
let playerResolve: ReturnType<typeof createPlayerResolveMock>;
let listTrails: ReturnType<typeof createListTrailsMock>;
let createTrail: ReturnType<typeof createCreateTrailMock>;
let updateTrail: ReturnType<typeof createUpdateTrailMock>;
let publishTrail: ReturnType<typeof createPublishTrailMock>;
let retireTrail: ReturnType<typeof createRetireTrailMock>;

beforeEach(async () => {
  playerResolve = createPlayerResolveMock();
  listTrails = createListTrailsMock();
  createTrail = createCreateTrailMock();
  updateTrail = createUpdateTrailMock();
  publishTrail = createPublishTrailMock();
  retireTrail = createRetireTrailMock();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'trail-author',
      subject: 'auth0|trail-author',
    }),
  };
  const service: AuthorTrailService = {
    listTrails,
    createTrail,
    updateTrail,
    publishTrail,
    retireTrail,
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: { resolve: playerResolve },
    authorContentServices: { trails: service },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('author trail API', () => {
  it('requires an authenticated Author', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/author/trails',
    });

    expect(response.statusCode).toBe(401);
    expect(listTrails).not.toHaveBeenCalled();
  });

  it('rejects an ordinary Player', async () => {
    playerResolve.mockResolvedValue({
      ...activeAuthor,
      role: 'player',
    });

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/trails',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'AUTHOR_REQUIRED' });
    expect(listTrails).not.toHaveBeenCalled();
  });

  it('lists all authoring lifecycle states', async () => {
    listTrails.mockResolvedValue([
      authoredTrail,
      {
        ...authoredTrail,
        trailId: '17610000-0000-4000-8000-000000000002',
        status: 'published',
        publishedAt: '2026-08-29T09:00:00.000Z',
      },
    ]);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/trails',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      trails: [{ trailId: TRAIL_ID, status: 'draft' }, { status: 'published' }],
      requestId: expect.any(String),
    });
  });

  it('creates ordered membership with the authenticated Author identity', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/trails',
      payload: validTrailBody(),
    });

    expect(response.statusCode).toBe(201);
    expect(createTrail).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      ...validTrailBody(),
    });
    expect(response.json()).toMatchObject({
      trail: { trailId: TRAIL_ID, steps: authoredTrail.steps },
    });
  });

  it('updates and reorders a draft atomically through one request', async () => {
    const eventIds = [EVENT_TWO_ID, EVENT_ONE_ID];

    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/author/trails/${TRAIL_ID}`,
      payload: { ...validTrailBody(), eventIds },
    });

    expect(response.statusCode).toBe(200);
    expect(updateTrail).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      trailId: TRAIL_ID,
      ...validTrailBody(),
      eventIds,
    });
  });

  it('rejects duplicate events and client-supplied lifecycle authority', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/trails',
      payload: {
        ...validTrailBody(),
        eventIds: [EVENT_ONE_ID, EVENT_ONE_ID],
        actorPlayerId: '17600000-0000-4000-8000-000000000099',
        status: 'published',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(createTrail).not.toHaveBeenCalled();
  });

  it('maps publication readiness and lifecycle conflicts safely', async () => {
    publishTrail.mockRejectedValueOnce(
      new AuthorTrailNotReadyError(
        'A trail requires at least two events before publication.',
      ),
    );

    const notReady = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/trails/${TRAIL_ID}/publish`,
      payload: {},
    });
    expect(notReady.statusCode).toBe(422);
    expect(notReady.json()).toMatchObject({ code: 'CONTENT_NOT_READY' });

    retireTrail.mockRejectedValueOnce(
      new AuthorTrailStateConflictError('The trail is already retired.'),
    );
    const conflict = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/trails/${TRAIL_ID}/retire`,
      payload: {},
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'CONTENT_STATE_CONFLICT' });
  });

  it('documents all author trail operations as bearer protected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const paths = response.json<{ paths: Record<string, unknown> }>().paths;

    expect(paths).toHaveProperty('/api/v1/author/trails');
    expect(paths).toHaveProperty('/api/v1/author/trails/{trailId}');
    expect(paths).toHaveProperty('/api/v1/author/trails/{trailId}/publish');
    expect(paths).toHaveProperty('/api/v1/author/trails/{trailId}/retire');
  });
});

function createPlayerResolveMock() {
  const resolve: PlayerIdentityService['resolve'] = async () => activeAuthor;
  return vi.fn(resolve);
}

function createListTrailsMock() {
  return vi.fn(async (): Promise<AuthorTrail[]> => [authoredTrail]);
}

function createCreateTrailMock() {
  return vi.fn(async (): Promise<AuthorTrail> => authoredTrail);
}

function createUpdateTrailMock() {
  return vi.fn(async (): Promise<AuthorTrail> => authoredTrail);
}

function createPublishTrailMock() {
  return vi.fn(async (): Promise<AuthorTrail> => ({
    ...authoredTrail,
    status: 'published',
    publishedAt: '2026-08-29T09:00:00.000Z',
  }));
}

function createRetireTrailMock() {
  return vi.fn(async (): Promise<AuthorTrail> => ({
    ...authoredTrail,
    status: 'retired',
    retiredAt: '2026-08-29T10:00:00.000Z',
  }));
}

function validTrailBody() {
  return {
    title: 'East Campus Heritage',
    description: 'Visit two historic campus landmarks.',
    eventIds: [EVENT_ONE_ID, EVENT_TWO_ID],
  };
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  payload?: Record<string, unknown>;
}) {
  const request = {
    method: options.method,
    url: options.url,
    headers: { authorization: 'Bearer test-access-token' },
  } as const;

  if (options.payload === undefined) {
    return app.inject(request);
  }

  return app.inject({ ...request, payload: options.payload });
}
