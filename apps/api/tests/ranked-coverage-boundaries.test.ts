import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import { InvalidEventCoordinatesError } from '../src/events/event-eligibility.js';
import { InvalidLocationClaimError } from '../src/events/location-claim.js';
import { RankedError } from '../src/matches/ranked-database.js';
import type { RankedReadService } from '../src/matches/ranked-read-service.js';
import type { RankedService } from '../src/matches/ranked-service.js';
import { InvalidCursorError } from '../src/security/signed-cursor.js';
import { TerritoryClaimError } from '../src/territory/territory-grants.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const DECK_ID = '20000000-0000-4000-8000-000000000001';
const MATCH_ID = '30000000-0000-4000-8000-000000000001';
const SEASON_ID = '40000000-0000-4000-8000-000000000001';
const ZONE_ID = '50000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('ranked route error boundaries', () => {
  let app: FastifyInstance;
  let join: ReturnType<typeof vi.fn>;
  let currentStandings: ReturnType<typeof vi.fn>;
  let archivedStandings: ReturnType<typeof vi.fn>;
  let settlement: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const verifier: AccessTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        issuer: authConfig.issuer,
        subject: 'auth0|boundary-player',
        connectionStrategy: 'auth0',
        playerName: 'boundary_player',
      }),
    };
    const resolve = vi.fn().mockResolvedValue({
      id: PLAYER_ID,
      role: 'player',
      playerName: 'boundary_player',
      lifecycleStatus: 'active',
    });
    join = vi.fn();
    currentStandings = vi.fn();
    archivedStandings = vi.fn();
    settlement = vi.fn();
    const service = { join } as unknown as RankedService;
    const reads = {
      currentStandings,
      archivedStandings,
      settlement,
    } as unknown as RankedReadService;
    app = await buildApp({
      authConfig,
      accessTokenVerifier: verifier,
      playerIdentityService: { resolve },
      ranked: { service, reads },
      logger: false,
    });
  });

  afterEach(async () => app.close());

  it.each([
    [
      new InvalidEventCoordinatesError('latitude', 'Latitude is invalid.'),
      'TERRITORY_LOCATION_INVALID',
    ],
    [
      new InvalidLocationClaimError('accuracyMetres', 'Accuracy is invalid.'),
      'TERRITORY_LOCATION_INVALID',
    ],
    [
      new TerritoryClaimError(
        409,
        'TERRITORY_NOT_ELIGIBLE',
        'The zone is unavailable.',
      ),
      'TERRITORY_NOT_ELIGIBLE',
    ],
  ] as const)(
    'maps territory intent failures without losing the public code',
    async (error, code) => {
      join.mockRejectedValueOnce(error);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ranked/queue',
        headers: { authorization: 'Bearer token' },
        payload: {
          deckId: DECK_ID,
          territoryClaim: {
            zoneId: ZONE_ID,
            latitude: -26.19,
            longitude: 28.03,
            accuracyMetres: 8,
            acquiredAt: '2026-10-08T10:00:00.000Z',
          },
        },
      });
      expect(join).toHaveBeenCalledWith(
        PLAYER_ID,
        DECK_ID,
        expect.objectContaining({ zoneId: ZONE_ID }),
      );
      expect(response.statusCode).toBe(
        error instanceof TerritoryClaimError ? 409 : 400,
      );
      expect(response.json()).toMatchObject({ code, detail: error.message });
    },
  );

  it('returns a safe invalid-cursor response for current standings', async () => {
    currentStandings.mockRejectedValueOnce(new InvalidCursorError());
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ranked/standings?cursor=bad',
      headers: { authorization: 'Bearer token' },
    });
    expect(currentStandings).toHaveBeenCalledWith(PLAYER_ID, 25, 'bad');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'RANKED_CURSOR_INVALID' });
  });

  it('maps an archived standings failure and preserves pagination inputs', async () => {
    archivedStandings.mockRejectedValueOnce(new InvalidCursorError());
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/ranked/seasons/${SEASON_ID}/standings?limit=10&cursor=bad`,
      headers: { authorization: 'Bearer token' },
    });
    expect(archivedStandings).toHaveBeenCalledWith(
      PLAYER_ID,
      SEASON_ID,
      10,
      'bad',
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'RANKED_CURSOR_INVALID' });
  });

  it('maps ranked service errors from authenticated settlement reads', async () => {
    settlement.mockRejectedValueOnce(
      new RankedError(404, 'RANKED_MATCH_UNAVAILABLE', 'Match unavailable.'),
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/ranked/matches/${MATCH_ID}/settlement`,
      headers: { authorization: 'Bearer token' },
    });
    expect(settlement).toHaveBeenCalledWith(PLAYER_ID, MATCH_ID);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'RANKED_MATCH_UNAVAILABLE',
      detail: 'Match unavailable.',
    });
  });
});
