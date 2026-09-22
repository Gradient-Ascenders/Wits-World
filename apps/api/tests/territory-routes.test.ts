import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import type { TerritoryReadService } from '../src/territory/territory-read-service.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('territory HTTP routes', () => {
  let app: FastifyInstance;
  let reads: TerritoryReadService;

  beforeEach(async () => {
    const verifier: AccessTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        issuer: authConfig.issuer,
        subject: 'auth0|territory-player',
        connectionStrategy: 'auth0',
        playerName: 'territory_player',
      }),
    };
    const resolve = vi
      .fn<PlayerIdentityService['resolve']>()
      .mockResolvedValue({
        id: PLAYER_ID,
        role: 'player',
        playerName: 'territory_player',
        lifecycleStatus: 'active',
      });
    reads = {
      listZones: vi.fn().mockResolvedValue({
        zones: [
          {
            zoneId: ZONE_ID,
            name: 'Braamfontein East',
            status: 'active',
            geometry: { type: 'MultiPolygon', coordinates: [] },
            owner: { playerName: 'owner_name' },
            seasonId: null,
            windowStart: null,
            windowEnd: null,
          },
        ],
      }),
      getZone: vi.fn(),
      standings: vi.fn().mockResolvedValue({
        zoneId: ZONE_ID,
        seasonId: '30000000-0000-4000-8000-000000000001',
        top: [
          { rank: 1, influence: 4 },
          { rank: 2, influence: 3 },
        ],
        activity: { influence: 10, contributors: 4 },
        viewer: {
          influence: 2,
          todayInfluence: 1,
          dailyCap: 5,
          remainingDailyInfluence: 4,
        },
      }),
      history: vi.fn().mockResolvedValue({ zoneId: ZONE_ID, entries: [] }),
    } as unknown as TerritoryReadService;
    app = await buildApp({
      authConfig,
      accessTokenVerifier: verifier,
      playerIdentityService: { resolve },
      territory: { reads },
      logger: false,
    });
  });

  afterEach(async () => app.close());

  it('requires an active authenticated player', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/territory/zones',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns privacy-safe anonymous standings with viewer-only influence', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/territory/zones/${ZONE_ID}/standings`,
      headers: { authorization: 'Bearer test-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(reads.standings).toHaveBeenCalledWith(PLAYER_ID, ZONE_ID);
    expect(response.json()).toEqual({
      zoneId: ZONE_ID,
      seasonId: '30000000-0000-4000-8000-000000000001',
      top: [
        { rank: 1, influence: 4 },
        { rank: 2, influence: 3 },
      ],
      activity: { influence: 10, contributors: 4 },
      viewer: {
        influence: 2,
        todayInfluence: 1,
        dailyCap: 5,
        remainingDailyInfluence: 4,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain('playerId');
  });
});
