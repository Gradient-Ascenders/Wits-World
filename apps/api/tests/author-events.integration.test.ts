import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  AuthorEventNotReadyError,
  AuthorEventStateConflictError,
  type AuthorEvent,
  type AuthorEventService,
} from '../src/events/author-event-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const AUTHOR_ID = 'c1000000-0000-4000-8000-000000000001';
const EVENT_ID = 'c2000000-0000-4000-8000-000000000001';

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
  playerName: 'test-author',
  subject: 'auth0|author-123',
};

const activeAuthor = {
  id: AUTHOR_ID,
  role: 'author' as const,
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

const activePlayer = {
  id: 'c1000000-0000-4000-8000-000000000002',
  role: 'player' as const,
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

const authoredEvent: AuthorEvent = {
  eventId: EVENT_ID,
  title: 'Great Hall Challenge',
  description: 'Explore East Campus.',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  sourceUrls: [],
  startsAt: '2026-09-01T08:00:00.000Z',
  endsAt: '2026-09-01T12:00:00.000Z',
  isPublished: false,
  createdAt: '2026-08-15T20:00:00.000Z',
  updatedAt: '2026-08-15T20:00:00.000Z',
  authoringStatus: 'draft',
  retiredAt: null,
  version: 0,
  submittedBy: null,
  submittedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  publicationProvenance: null,
};

let app: FastifyInstance;
let listEvents: ReturnType<typeof createListEventsMock>;
let createEvent: ReturnType<typeof createCreateEventMock>;
let updateEvent: ReturnType<typeof createUpdateEventMock>;
let playerResolve: ReturnType<typeof createPlayerResolveMock>;
let publishEvent: ReturnType<typeof createPublishEventMock>;
let retireEvent: ReturnType<typeof createRetireEventMock>;

beforeEach(async () => {
  listEvents = createListEventsMock();
  createEvent = createCreateEventMock();
  updateEvent = createUpdateEventMock();
  playerResolve = createPlayerResolveMock();
  publishEvent = createPublishEventMock();
  retireEvent = createRetireEventMock();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue(authenticatedIdentity),
  };

  const service: AuthorEventService = {
    listEvents,
    createEvent,
    updateEvent,
    submitEvent: vi.fn().mockResolvedValue(authoredEvent),
    approveEvent: vi.fn().mockResolvedValue(authoredEvent),
    returnEvent: vi.fn().mockResolvedValue(authoredEvent),
    publishEvent,
    retireEvent,
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: playerResolve,
    },
    authorContentServices: {
      events: service,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('author event API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/author/events',
    });

    expect(response.statusCode).toBe(401);

    expect(response.json()).toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(listEvents).not.toHaveBeenCalled();
  });

  it('rejects an ordinary Player', async () => {
    playerResolve.mockResolvedValue(activePlayer);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/events',
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'AUTHOR_REQUIRED',
    });

    expect(listEvents).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending Author', async () => {
    playerResolve.mockResolvedValue({
      ...activeAuthor,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/events',
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });

    expect(listEvents).not.toHaveBeenCalled();
  });

  it('allows an Author to list draft and published content', async () => {
    listEvents.mockResolvedValue([
      authoredEvent,
      {
        ...authoredEvent,
        eventId: 'c2000000-0000-4000-8000-000000000002',
        isPublished: true,
      },
    ]);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/events',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      events: [
        authoredEvent,
        {
          ...authoredEvent,
          eventId: 'c2000000-0000-4000-8000-000000000002',
          isPublished: true,
        },
      ],
      requestId: expect.any(String),
    });
  });

  it('creates a draft using the authenticated Author identity', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/events',
      payload: validEventBody(),
    });

    expect(response.statusCode).toBe(201);

    expect(response.json()).toEqual({
      event: authoredEvent,
      requestId: expect.any(String),
    });

    expect(createEvent).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      ...validEventBody(),
    });
  });

  it('updates an event using the authenticated Author identity', async () => {
    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/author/events/${EVENT_ID}`,
      payload: { ...validEventBody(), expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(200);

    expect(updateEvent).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      eventId: EVENT_ID,
      expectedVersion: 0,
      ...validEventBody(),
    });
  });

  it('rejects client-supplied Author identity or publication authority', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/events',
      payload: {
        ...validEventBody(),
        actorPlayerId: 'c1000000-0000-4000-8000-000000000099',
        isPublished: true,
      },
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(createEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid event identifier before calling the service', async () => {
    const response = await authenticatedRequest({
      method: 'PUT',
      url: '/api/v1/author/events/not-a-uuid',
      payload: validEventBody(),
    });

    expect(response.statusCode).toBe(400);

    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('authenticates before validating malformed author content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/author/events',
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(401);

    expect(response.json()).toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(createEvent).not.toHaveBeenCalled();
  });

  it('publishes an event using only the authenticated Author identity', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/events/${EVENT_ID}/publish`,
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(200);

    expect(publishEvent).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      eventId: EVENT_ID,
      expectedVersion: 0,
    });

    expect(response.json()).toMatchObject({
      event: {
        eventId: EVENT_ID,
        isPublished: true,
        authoringStatus: 'published',
        retiredAt: null,
      },
      requestId: expect.any(String),
    });
  });

  it('retires an event using only the authenticated Author identity', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/events/${EVENT_ID}/retire`,
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(200);

    expect(retireEvent).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      eventId: EVENT_ID,
      expectedVersion: 0,
    });

    expect(response.json()).toMatchObject({
      event: {
        eventId: EVENT_ID,
        isPublished: false,
        authoringStatus: 'retired',
        retiredAt: expect.any(String),
      },
    });
  });

  it('rejects a Player attempting to publish event content', async () => {
    playerResolve.mockResolvedValue(activePlayer);

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/events/${EVENT_ID}/publish`,
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'AUTHOR_REQUIRED',
    });

    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('maps publication readiness failures to 422', async () => {
    publishEvent.mockRejectedValue(
      new AuthorEventNotReadyError(
        'An event requires one published challenge before publication.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/events/${EVENT_ID}/publish`,
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(422);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_NOT_READY',
    });
  });

  it('maps invalid event lifecycle transitions to 409', async () => {
    publishEvent.mockRejectedValue(
      new AuthorEventStateConflictError('The event is already published.'),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/events/${EVENT_ID}/publish`,
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(409);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_STATE_CONFLICT',
    });
  });

  it('maps editing published or retired events to 409', async () => {
    updateEvent.mockRejectedValue(
      new AuthorEventStateConflictError(
        'Published events cannot be edited; retire the event and create a replacement instead.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/author/events/${EVENT_ID}`,
      payload: { ...validEventBody(), expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(409);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_STATE_CONFLICT',
    });
  });
});

describe('author event OpenAPI documentation', () => {
  it('documents every author event operation as bearer-protected', async () => {
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
          };
          post?: {
            security?: Array<Record<string, unknown>>;
          };
          put?: {
            security?: Array<Record<string, unknown>>;
          };
        }
      >;
    }>();

    expect(document.paths['/api/v1/author/events']?.get?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(document.paths['/api/v1/author/events']?.post?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(
      document.paths['/api/v1/author/events/{eventId}']?.put?.security,
    ).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(
      document.paths['/api/v1/author/events/{eventId}/publish']?.post?.security,
    ).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(
      document.paths['/api/v1/author/events/{eventId}/retire']?.post?.security,
    ).toEqual([
      {
        bearerAuth: [],
      },
    ]);
  });
});

function createListEventsMock() {
  return vi.fn(async (): Promise<AuthorEvent[]> => [authoredEvent]);
}

function createCreateEventMock() {
  return vi.fn(async (): Promise<AuthorEvent> => authoredEvent);
}

function createUpdateEventMock() {
  return vi.fn(async (): Promise<AuthorEvent> => authoredEvent);
}

function createPlayerResolveMock() {
  const resolve: PlayerIdentityService['resolve'] = async () => activeAuthor;

  return vi.fn(resolve);
}

function validEventBody() {
  return {
    title: 'Great Hall Challenge',
    description: 'Explore East Campus.',
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T12:00:00.000Z',
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

function createPublishEventMock() {
  return vi.fn(async (): Promise<AuthorEvent> => ({
    ...authoredEvent,
    isPublished: true,
    authoringStatus: 'published',
  }));
}

function createRetireEventMock() {
  return vi.fn(async (): Promise<AuthorEvent> => ({
    ...authoredEvent,
    isPublished: false,
    authoringStatus: 'retired',
    retiredAt: '2026-08-16T00:00:00.000Z',
  }));
}
