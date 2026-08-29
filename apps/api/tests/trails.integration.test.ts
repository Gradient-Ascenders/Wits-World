import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import {
  PlayerTrailNotFoundError,
  type NearbyUnvisitedEvent,
  type PlayerTrail,
  type PlayerTrailService,
  type PlayerTrailSummary,
} from '../src/trails/player-trail-service.js';

const PLAYER_ID = '17630000-0000-4000-8000-000000000001';
const TRAIL_ID = '17640000-0000-4000-8000-000000000001';
const EVENT_ONE_ID = '17650000-0000-4000-8000-000000000001';
const EVENT_TWO_ID = '17650000-0000-4000-8000-000000000002';
const NOW = new Date('2026-08-29T10:00:00.000Z');

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  playerName: 'trail-player',
  lifecycleStatus: 'active' as const,
};

const trailSummary: PlayerTrailSummary = {
  trailId: TRAIL_ID,
  title: 'East Campus Heritage',
  description: 'Visit two historic campus landmarks.',
  publicationStatus: 'published',
  availability: 'active',
  startsAt: null,
  endsAt: null,
  progressStatus: 'in_progress',
  completedStepCount: 1,
  totalSteps: 2,
  currentStepPosition: 2,
};

const playerTrail: PlayerTrail = {
  ...trailSummary,
  steps: [
    {
      position: 1,
      eventId: EVENT_ONE_ID,
      title: 'Great Hall',
      description: null,
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      startsAt: '2026-08-29T08:00:00.000Z',
      endsAt: '2026-08-29T12:00:00.000Z',
      state: 'completed',
      unavailableReason: null,
      completedAt: '2026-08-29T09:00:00.000Z',
    },
    {
      position: 2,
      eventId: EVENT_TWO_ID,
      title: 'Origins Centre',
      description: null,
      latitude: -26.1901,
      longitude: 28.0288,
      radiusMetres: 75,
      startsAt: '2026-08-29T08:00:00.000Z',
      endsAt: '2026-08-29T12:00:00.000Z',
      state: 'current',
      unavailableReason: null,
      completedAt: null,
    },
  ],
};

const nearbyEvent: NearbyUnvisitedEvent = {
  eventId: EVENT_TWO_ID,
  title: 'Origins Centre',
  description: null,
  latitude: -26.1901,
  longitude: 28.0288,
  radiusMetres: 75,
  startsAt: '2026-08-29T08:00:00.000Z',
  endsAt: '2026-08-29T12:00:00.000Z',
  distanceMetres: 123.5,
  trailContexts: [
    {
      trailId: TRAIL_ID,
      title: 'East Campus Heritage',
      position: 2,
      totalSteps: 2,
    },
  ],
};

let app: FastifyInstance;
let playerResolve: ReturnType<typeof createPlayerResolveMock>;
let listTrails: ReturnType<typeof createListTrailsMock>;
let getTrail: ReturnType<typeof createGetTrailMock>;
let listNearbyUnvisited: ReturnType<typeof createNearbyMock>;

beforeEach(async () => {
  playerResolve = createPlayerResolveMock();
  listTrails = createListTrailsMock();
  getTrail = createGetTrailMock();
  listNearbyUnvisited = createNearbyMock();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'trail-player',
      subject: 'auth0|trail-player',
    }),
  };
  const service: PlayerTrailService = {
    listTrails,
    getTrail,
    listNearbyUnvisited,
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: { resolve: playerResolve },
    trailServices: {
      player: service,
      clock: () => NOW,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('player trail API', () => {
  it('requires authentication for trail progress', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/trails',
    });

    expect(response.statusCode).toBe(401);
    expect(listTrails).not.toHaveBeenCalled();
  });

  it('derives list identity exclusively from the validated token', async () => {
    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/trails',
    });

    expect(response.statusCode).toBe(200);
    expect(listTrails).toHaveBeenCalledWith(PLAYER_ID);
    expect(response.json()).toEqual({
      trails: [trailSummary],
      requestId: expect.any(String),
    });
  });

  it('returns ordered completed and current step state', async () => {
    const response = await authenticatedRequest({
      method: 'GET',
      url: `/api/v1/trails/${TRAIL_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(getTrail).toHaveBeenCalledWith(PLAYER_ID, TRAIL_ID);
    expect(response.json()).toEqual({
      trail: playerTrail,
      requestId: expect.any(String),
    });
  });

  it('hides unknown or inaccessible trails behind a safe 404', async () => {
    getTrail.mockRejectedValueOnce(new PlayerTrailNotFoundError());

    const response = await authenticatedRequest({
      method: 'GET',
      url: `/api/v1/trails/${TRAIL_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'TRAIL_NOT_FOUND' });
  });

  it('uses documented nearby defaults without accepting player identity', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/events/nearby-unvisited',
      payload: validLocationClaim(),
    });

    expect(response.statusCode).toBe(200);
    expect(listNearbyUnvisited).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      latitude: -26.19205,
      longitude: 28.03038,
      accuracyMetres: 20,
      maxDistanceMetres: 1_000,
      limit: 20,
    });
    expect(response.json()).toEqual({
      events: [nearbyEvent],
      requestId: expect.any(String),
    });
  });

  it('rejects a browser-selected player and authoritative trail state', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/events/nearby-unvisited',
      payload: {
        ...validLocationClaim(),
        playerId: '17630000-0000-4000-8000-000000000099',
        currentStepPosition: 4,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(listNearbyUnvisited).not.toHaveBeenCalled();
  });

  it('requires a fresh and sufficiently accurate location claim', async () => {
    const stale = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/events/nearby-unvisited',
      payload: {
        ...validLocationClaim(),
        acquiredAt: '2026-08-29T09:57:59.999Z',
      },
    });
    expect(stale.statusCode).toBe(422);
    expect(stale.json()).toMatchObject({ code: 'LOCATION_RETRY_REQUIRED' });

    const inaccurate = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/events/nearby-unvisited',
      payload: {
        ...validLocationClaim(),
        accuracyMetres: 1_001,
      },
    });
    expect(inaccurate.statusCode).toBe(422);
    expect(inaccurate.json()).toMatchObject({
      code: 'LOCATION_RETRY_REQUIRED',
    });
    expect(listNearbyUnvisited).not.toHaveBeenCalled();
  });

  it('documents trail and nearby operations', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const paths = response.json<{ paths: Record<string, unknown> }>().paths;

    expect(paths).toHaveProperty('/api/v1/trails');
    expect(paths).toHaveProperty('/api/v1/trails/{trailId}');
    expect(paths).toHaveProperty('/api/v1/events/nearby-unvisited');
  });
});

function createPlayerResolveMock() {
  const resolve: PlayerIdentityService['resolve'] = async () => activePlayer;
  return vi.fn(resolve);
}

function createListTrailsMock() {
  return vi.fn(async (): Promise<PlayerTrailSummary[]> => [trailSummary]);
}

function createGetTrailMock() {
  return vi.fn(async (): Promise<PlayerTrail> => playerTrail);
}

function createNearbyMock() {
  return vi.fn(async (): Promise<NearbyUnvisitedEvent[]> => [nearbyEvent]);
}

function validLocationClaim() {
  return {
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 20,
    acquiredAt: '2026-08-29T09:59:30.000Z',
  };
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST';
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
