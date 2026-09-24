import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventProductAnalyticsRecorder } from '../src/analytics/event-product-aggregates.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  EventDiscoveryService,
  PlayerEvent,
} from '../src/events/event-discovery.js';
import type {
  EventEligibilityResult,
  EventEligibilityService,
} from '../src/events/event-eligibility.js';
import {
  NonMonotonicMovementEvidenceError,
  type MovementEvidenceService,
} from '../src/events/movement-evidence.js';

import type { PlayerIdentityService } from '../src/players/player-identity.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000018';

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
  subject: 'auth0|player-123',
};

const activeLocalPlayer = {
  id: '00000000-0000-4000-8000-000000000101',
  role: 'player' as const,
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

const receivedAt = new Date('2026-08-10T12:00:00.000Z');

const activeEvent: PlayerEvent = {
  eventId: EVENT_ID,
  title: 'Sprint 1 Demo - Wits Great Hall',
  description: 'A player-safe event description.',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000Z',
  endsAt: '2026-08-20T00:00:00.000Z',
  availability: 'active',
};

let app: FastifyInstance;
let discoveryList: ReturnType<typeof createDiscoveryMock>;
let eligibilityEvaluate: ReturnType<typeof createEligibilityMock>;
let evaluateMovementJourney: ReturnType<
  typeof vi.fn<MovementEvidenceService['evaluateJourney']>
>;
let playerResolve: ReturnType<typeof createPlayerResolveMock>;
let recordViews: ReturnType<
  typeof vi.fn<EventProductAnalyticsRecorder['recordViews']>
>;
let recordEligibility: ReturnType<
  typeof vi.fn<EventProductAnalyticsRecorder['recordEligibility']>
>;

beforeEach(async () => {
  discoveryList = createDiscoveryMock();
  eligibilityEvaluate = createEligibilityMock();
  evaluateMovementJourney = vi
    .fn<MovementEvidenceService['evaluateJourney']>()
    .mockResolvedValue({ outcome: 'baseline' });
  playerResolve = createPlayerResolveMock();
  recordViews = vi
    .fn<EventProductAnalyticsRecorder['recordViews']>()
    .mockResolvedValue(undefined);
  recordEligibility = vi
    .fn<EventProductAnalyticsRecorder['recordEligibility']>()
    .mockResolvedValue(undefined);

  const discoveryService: EventDiscoveryService = {
    list: discoveryList,
  };

  const eligibilityService: EventEligibilityService = {
    evaluate: eligibilityEvaluate,
  };
  const movementEvidenceService: MovementEvidenceService = {
    record: vi.fn().mockResolvedValue(undefined),
    evaluateJourney: evaluateMovementJourney,
    evaluateJourneyWithinTransaction: vi
      .fn()
      .mockResolvedValue({ outcome: 'baseline' }),
    purgeExpired: vi.fn().mockResolvedValue(0),
  };

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue(authenticatedIdentity),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: playerResolve,
    },
    eventServices: {
      discovery: discoveryService,
      eligibility: eligibilityService,
      movementEvidence: movementEvidenceService,
      analyticsRecorder: { recordViews, recordEligibility },
      clock: () => receivedAt,
      maxLocationClaimAgeMs: 120_000,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('event discovery API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(discoveryList).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending player before event discovery', async () => {
    playerResolve.mockResolvedValue({
      ...activeLocalPlayer,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      status: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      requestId: expect.any(String),
    });

    expect(playerResolve).toHaveBeenCalledWith(authenticatedIdentity);
    expect(discoveryList).not.toHaveBeenCalled();
  });

  it('returns published player-safe event information', async () => {
    const eventWithPrivateFields = {
      ...activeEvent,
      acceptedAnswer: 'private answer',
      internalAuthorNote: 'private author note',
      isPublished: true,
      sourceUrls: ['https://review-only.example.test/source'],
    };

    discoveryList.mockResolvedValue([eventWithPrivateFields]);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      events: Array<Record<string, unknown>>;
      requestId: string;
    }>();

    expect(body.requestId).toEqual(expect.any(String));
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toEqual(activeEvent);

    expect(body.events[0]).not.toHaveProperty('acceptedAnswer');
    expect(body.events[0]).not.toHaveProperty('internalAuthorNote');
    expect(body.events[0]).not.toHaveProperty('isPublished');
    expect(body.events[0]).not.toHaveProperty('sourceUrls');

    expect(discoveryList).toHaveBeenCalledOnce();
    expect(recordViews).toHaveBeenCalledWith(
      [{ eventId: EVENT_ID }],
      receivedAt,
    );
  });

  it('keeps analytics-only placement identifiers out of the player response', async () => {
    discoveryList.mockResolvedValue([
      {
        ...activeEvent,
        placementAssignmentId: '90000000-0000-4000-8000-000000000001',
      },
    ]);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events[0]).not.toHaveProperty(
      'placementAssignmentId',
    );
    expect(recordViews).toHaveBeenCalledWith(
      [
        {
          eventId: EVENT_ID,
          placementAssignmentId: '90000000-0000-4000-8000-000000000001',
        },
      ],
      receivedAt,
    );
  });

  it('does not wait for discovery analytics recording to settle', async () => {
    recordViews.mockReturnValueOnce(new Promise<void>(() => undefined));

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toEqual([activeEvent]);
    expect(recordViews).toHaveBeenCalledOnce();
  });

  it('does not fail discovery when aggregate recording fails', async () => {
    recordViews.mockRejectedValueOnce(new Error('analytics unavailable'));

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/events',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toEqual([activeEvent]);
  });
});

describe('event eligibility API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${EVENT_ID}/eligibility`,
      payload: validLocationClaim(),
    });

    expect(response.statusCode).toBe(401);
    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending player before evaluating eligibility', async () => {
    playerResolve.mockResolvedValue({
      ...activeLocalPlayer,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      status: 403,
      code: 'ACCOUNT_UNAVAILABLE',
      requestId: expect.any(String),
    });

    expect(playerResolve).toHaveBeenCalledWith(authenticatedIdentity);
    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('authenticates before validating a malformed eligibility request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events/not-a-uuid/eligibility',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      title: 'Authentication required',
      detail: 'A valid bearer access token is required.',
      requestId: expect.any(String),
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
  });

  it('returns reachable for an inside point at the accuracy limit', async () => {
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'evaluated',
      eventId: EVENT_ID,
      eligible: true,
      distanceMetres: 20,
      radiusMetres: 75,
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest({
      accuracyMetres: 150,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventId: EVENT_ID,
      status: 'reachable',
      reachable: true,
      requestId: expect.any(String),
    });

    expect(eligibilityEvaluate).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      latitude: -26.19205,
      longitude: 28.03038,
    });
    expect(evaluateMovementJourney).toHaveBeenCalledWith(
      {
        playerId: activeLocalPlayer.id,
        eventId: EVENT_ID,
        latitude: -26.19205,
        longitude: 28.03038,
        accuracyMetres: 150,
        acquiredAt: new Date('2026-08-10T11:59:30.000Z'),
        receivedAt,
      },
      'reachable',
    );
    expect(recordEligibility).toHaveBeenCalledWith(
      { eventId: EVENT_ID },
      receivedAt,
    );
  });

  it('does not wait for eligibility analytics recording to settle', async () => {
    recordEligibility.mockReturnValueOnce(new Promise<void>(() => undefined));
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'evaluated',
      eventId: EVENT_ID,
      eligible: true,
      distanceMetres: 20,
      radiusMetres: 75,
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventId: EVENT_ID,
      status: 'reachable',
      reachable: true,
    });
    expect(recordEligibility).toHaveBeenCalledOnce();
  });

  it('does not fail a reachable eligibility response when aggregate recording fails', async () => {
    recordEligibility.mockRejectedValueOnce(new Error('analytics unavailable'));
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'evaluated',
      eventId: EVENT_ID,
      eligible: true,
      distanceMetres: 20,
      radiusMetres: 75,
      assignmentId: '90000000-0000-4000-8000-000000000001',
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventId: EVENT_ID,
      status: 'reachable',
      reachable: true,
    });
    expect(recordEligibility).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        placementAssignmentId: '90000000-0000-4000-8000-000000000001',
      },
      receivedAt,
    );
  });

  it('returns unreachable when the reported point is outside the radius', async () => {
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'evaluated',
      eventId: EVENT_ID,
      eligible: false,
      distanceMetres: 110,
      radiusMetres: 75,
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest({
      accuracyMetres: 10,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventId: EVENT_ID,
      status: 'unreachable',
      reachable: false,
      requestId: expect.any(String),
    });
    expect(recordEligibility).not.toHaveBeenCalled();
  });

  it('returns retry when reported accuracy exceeds the event limit', async () => {
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'evaluated',
      eventId: EVENT_ID,
      eligible: true,
      distanceMetres: 70,
      radiusMetres: 75,
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest({
      accuracyMetres: 150.01,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventId: EVENT_ID,
      status: 'retry',
      reachable: null,
      reason: 'location_accuracy',
      requestId: expect.any(String),
    });
  });

  it('returns a neutral retry when the server rejects a too-fast journey', async () => {
    evaluateMovementJourney.mockResolvedValueOnce({ outcome: 'too_fast' });

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventId: EVENT_ID,
      status: 'retry',
      reachable: null,
      reason: 'journey_too_fast',
      requestId: expect.any(String),
    });
  });

  it('returns retry for a stale location claim without evaluating PostGIS eligibility', async () => {
    const response = await authenticatedEligibilityRequest({
      acquiredAt: '2026-08-10T11:57:59.000Z',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventId: EVENT_ID,
      status: 'retry',
      reachable: null,
      reason: 'stale_location',
      requestId: expect.any(String),
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('returns retry for a future acquisition timestamp', async () => {
    const response = await authenticatedEligibilityRequest({
      acquiredAt: '2026-08-10T12:00:01.000Z',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventId: EVENT_ID,
      status: 'retry',
      reachable: null,
      reason: 'future_acquisition_time',
      requestId: expect.any(String),
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('rejects malformed timestamps', async () => {
    const response = await authenticatedEligibilityRequest({
      acquiredAt: 'not-a-date',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it.each([
    {
      field: 'latitude',
      value: -90.1,
    },
    {
      field: 'latitude',
      value: 90.1,
    },
    {
      field: 'longitude',
      value: -180.1,
    },
    {
      field: 'longitude',
      value: 180.1,
    },
    {
      field: 'accuracyMetres',
      value: -1,
    },
  ])('rejects an invalid $field value', async ({ field, value }) => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/events/${EVENT_ID}/eligibility`,
      payload: {
        ...validLocationClaim(),
        [field]: value,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it.each([
    ['eligible', true],
    ['insideRadius', true],
    ['playerId', '00000000-0000-4000-8000-000000000999'],
    ['rewardEligible', true],
    ['elapsedMilliseconds', 60_000],
    ['requiredSpeedMetresPerSecond', 1],
    ['maxPlausibleSpeedMetresPerSecond', 1000],
  ])('rejects the client-supplied authority field %s', async (field, value) => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/events/${EVENT_ID}/eligibility`,
      payload: {
        ...validLocationClaim(),
        [field]: value,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('returns 404 when an event does not exist', async () => {
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'not_found',
      eventId: EVENT_ID,
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
      detail: 'The requested event was not found.',
    });
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('does not reveal unpublished events', async () => {
    eligibilityEvaluate.mockResolvedValue({
      outcome: 'unavailable',
      eventId: EVENT_ID,
      reason: 'unpublished',
    } satisfies EventEligibilityResult);

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    });
    expect(evaluateMovementJourney).not.toHaveBeenCalled();
  });

  it('rejects reordered movement evidence without exposing the prior sample', async () => {
    evaluateMovementJourney.mockRejectedValueOnce(
      new NonMonotonicMovementEvidenceError(),
    );

    const response = await authenticatedEligibilityRequest();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      status: 409,
      code: 'NON_MONOTONIC_MOVEMENT_EVIDENCE',
      detail:
        'Use a newly acquired location before checking eligibility again.',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.json())).not.toContain('-26.19205');
    expect(JSON.stringify(response.json())).not.toContain('28.03038');
  });

  it.each(['not_started', 'ended'] as const)(
    'returns unavailable for an event that is %s',
    async (reason) => {
      eligibilityEvaluate.mockResolvedValue({
        outcome: 'unavailable',
        eventId: EVENT_ID,
        reason,
      } satisfies EventEligibilityResult);

      const response = await authenticatedEligibilityRequest();

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        eventId: EVENT_ID,
        status: 'unavailable',
        reachable: false,
        reason,
        requestId: expect.any(String),
      });
    },
  );

  it('rejects an invalid event identifier before calling the service', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/events/not-a-uuid/eligibility',
      payload: validLocationClaim(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(eligibilityEvaluate).not.toHaveBeenCalled();
  });
});

describe('event OpenAPI documentation', () => {
  it('documents both event routes as bearer-protected', async () => {
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
        }
      >;
    }>();

    expect(document.paths['/api/v1/events']?.get?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    expect(
      document.paths['/api/v1/events/{eventId}/eligibility']?.post?.security,
    ).toEqual([
      {
        bearerAuth: [],
      },
    ]);
  });
});

function createDiscoveryMock() {
  return vi.fn(async (): Promise<PlayerEvent[]> => [activeEvent]);
}

function createEligibilityMock() {
  return vi.fn(async (): Promise<EventEligibilityResult> => ({
    outcome: 'evaluated',
    eventId: EVENT_ID,
    eligible: true,
    distanceMetres: 20,
    radiusMetres: 75,
  }));
}

function createPlayerResolveMock() {
  const resolve: PlayerIdentityService['resolve'] = async () =>
    activeLocalPlayer;

  return vi.fn(resolve);
}

function validLocationClaim() {
  return {
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: '2026-08-10T11:59:30.000Z',
  };
}

async function authenticatedEligibilityRequest(
  overrides: Partial<ReturnType<typeof validLocationClaim>> = {},
) {
  return authenticatedRequest({
    method: 'POST',
    url: `/api/v1/events/${EVENT_ID}/eligibility`,
    payload: {
      ...validLocationClaim(),
      ...overrides,
    },
  });
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST';
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
