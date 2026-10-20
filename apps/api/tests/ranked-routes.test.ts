import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import { RankedError } from '../src/matches/ranked-database.js';
import type { RankedReadService } from '../src/matches/ranked-read-service.js';
import type { RankedService } from '../src/matches/ranked-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const DECK_ID = '20000000-0000-4000-8000-000000000001';
const PROPOSAL_ID = '30000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('ranked HTTP routes', () => {
  let app: FastifyInstance;
  let join: ReturnType<typeof vi.fn>;
  let accept: ReturnType<typeof vi.fn>;
  let heartbeat: ReturnType<typeof vi.fn>;
  let settlement: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const verifier: AccessTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        issuer: authConfig.issuer,
        subject: 'auth0|ranked-player',
        connectionStrategy: 'auth0',
        playerName: 'ranked_player',
      }),
    };
    const resolve = vi
      .fn<PlayerIdentityService['resolve']>()
      .mockResolvedValue({
        id: PLAYER_ID,
        role: 'player',
        playerName: 'ranked_player',
        lifecycleStatus: 'active',
      });
    join = vi.fn().mockResolvedValue({
      status: 'searching',
      queueEntryId: '40000000-0000-4000-8000-000000000001',
      seasonId: '50000000-0000-4000-8000-000000000001',
      joinedAt: '2026-09-20T00:00:00.000Z',
      leaseExpiresAt: '2026-09-20T00:00:30.000Z',
      searchRange: 100,
      proposalId: null,
      acceptanceDeadline: null,
      accepted: false,
      matchId: null,
    });
    accept = vi
      .fn()
      .mockRejectedValue(
        new RankedError(
          404,
          'RANKED_PROPOSAL_UNAVAILABLE',
          'The ranked proposal is unavailable.',
        ),
      );
    heartbeat = vi.fn();
    const service = {
      join,
      accept,
      status: vi.fn().mockResolvedValue({ status: 'idle' }),
      heartbeat,
      cancel: vi.fn(),
      decline: vi.fn(),
      expireQueueEntries: vi.fn(),
      expireProposals: vi.fn(),
      pairOnce: vi.fn(),
    } as unknown as RankedService;
    settlement = vi.fn().mockResolvedValue({
      matchId: '70000000-0000-4000-8000-000000000001',
      seasonId: '50000000-0000-4000-8000-000000000001',
      status: 'settled',
      completionReason: 'defeat',
      outcome: 'win',
      ratingBefore: 1000,
      ratingAfter: 1018,
      appliedDelta: 18,
      settledAt: '2026-09-22T10:15:00.000Z',
      territory: {
        zoneId: '60000000-0000-4000-8000-000000000001',
        zoneName: 'East Campus',
        outcome: 'accepted',
        influencePoints: 1,
        exclusionReason: null,
      },
    });
    const reads = {
      currentSeason: vi.fn().mockResolvedValue(null),
      profile: vi.fn().mockResolvedValue({
        season: null,
        rating: null,
        wins: 0,
        losses: 0,
        settledMatchCount: 0,
        placementMatchesRemaining: 5,
        provisional: true,
      }),
      settlement,
      currentStandings: vi.fn(),
      archivedStandings: vi.fn(),
      cleanupExpiredSnapshots: vi.fn(),
    } as unknown as RankedReadService;
    app = await buildApp({
      authConfig,
      corsConfig: { allowedOrigin: 'https://witsworld.co.za' },
      accessTokenVerifier: verifier,
      playerIdentityService: { resolve },
      ranked: { service, reads },
      logger: false,
    });
  });

  afterEach(async () => app.close());

  it('preserves a heartbeat availability error and its CORS header', async () => {
    heartbeat.mockRejectedValue(
      new RankedError(
        503,
        'GAMEPLAY_COORDINATION_UNAVAILABLE',
        'Gameplay scheduling is temporarily unavailable. Please try again.',
      ),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/queue/heartbeat',
      headers: {
        authorization: 'Bearer test-token',
        origin: 'https://witsworld.co.za',
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://witsworld.co.za',
    );
    expect(response.json()).toMatchObject({
      code: 'GAMEPLAY_COORDINATION_UNAVAILABLE',
    });
  });

  it('uses the validated player identity and accepts only a deck intent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/queue',
      headers: { authorization: 'Bearer test-token' },
      payload: { deckId: DECK_ID },
    });
    expect(response.statusCode).toBe(200);
    expect(join).toHaveBeenCalledWith(PLAYER_ID, DECK_ID, undefined);
    expect(response.json()).toMatchObject({
      status: 'searching',
      searchRange: 100,
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/queue',
      headers: { authorization: 'Bearer test-token' },
      payload: { deckId: DECK_ID, eligible: true, playerId: PLAYER_ID },
    });
    expect(invalid.statusCode).toBe(400);
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('accepts a location claim only as optional territory intent', async () => {
    const territoryClaim = {
      zoneId: '60000000-0000-4000-8000-000000000001',
      latitude: -26.191,
      longitude: 28.0305,
      accuracyMetres: 8,
      acquiredAt: '2026-09-22T10:00:00.000Z',
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/queue',
      headers: { authorization: 'Bearer test-token' },
      payload: { deckId: DECK_ID, territoryClaim },
    });
    expect(response.statusCode).toBe(200);
    expect(join).toHaveBeenCalledWith(PLAYER_ID, DECK_ID, territoryClaim);
  });

  it('hides another player proposal behind a neutral error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/ranked/proposals/${PROPOSAL_ID}/accept`,
      headers: { authorization: 'Bearer test-token' },
    });
    expect(accept).toHaveBeenCalledWith(PLAYER_ID, PROPOSAL_ID);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'RANKED_PROPOSAL_UNAVAILABLE',
    });
  });

  it('returns a retryable error when durable scheduling cannot authorize a write', async () => {
    join.mockRejectedValue(
      new RankedError(
        503,
        'GAMEPLAY_COORDINATION_UNAVAILABLE',
        'Gameplay scheduling is temporarily unavailable. Please try again.',
      ),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ranked/queue',
      headers: { authorization: 'Bearer test-token' },
      payload: { deckId: DECK_ID },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'GAMEPLAY_COORDINATION_UNAVAILABLE',
    });
  });

  it('requires authentication for profile reads', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ranked/me',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns only the authenticated player territory contribution result', async () => {
    const matchId = '70000000-0000-4000-8000-000000000001';
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/ranked/matches/${matchId}/settlement`,
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(settlement).toHaveBeenCalledWith(PLAYER_ID, matchId);
    expect(response.json()).toMatchObject({
      territory: {
        zoneName: 'East Campus',
        outcome: 'accepted',
        influencePoints: 1,
      },
    });
  });
});
