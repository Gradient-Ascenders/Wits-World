import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  StarterAlreadyClaimedError,
  StarterCatalogueUnavailableError,
  type StarterGrantService,
} from '../src/cards/starter-grant.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('card starter route error boundaries', () => {
  let app: FastifyInstance;
  let listStarterOptions: ReturnType<
    typeof vi.fn<StarterGrantService['listStarterOptions']>
  >;
  let selectStarter: ReturnType<
    typeof vi.fn<StarterGrantService['selectStarter']>
  >;

  beforeEach(async () => {
    const verifier: AccessTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        issuer: authConfig.issuer,
        subject: 'auth0|starter-boundary-player',
        connectionStrategy: 'auth0',
        playerName: 'starter_player',
      }),
    };
    const resolve = vi.fn().mockResolvedValue({
      id: PLAYER_ID,
      role: 'player',
      playerName: 'starter_player',
      lifecycleStatus: 'active',
    });
    listStarterOptions = vi.fn();
    selectStarter = vi.fn();
    const starterGrant: StarterGrantService = {
      listStarterOptions,
      selectStarter,
    };
    app = await buildApp({
      authConfig,
      accessTokenVerifier: verifier,
      playerIdentityService: { resolve },
      cardServices: {
        starterGrant,
        collection: {
          listOwnedCards: vi.fn().mockResolvedValue([]),
          listTradingCatalogue: vi.fn().mockResolvedValue([]),
        },
      },
      logger: false,
    });
  });

  afterEach(async () => app.close());

  it('maps an unavailable starter catalogue on both read and selection routes', async () => {
    listStarterOptions.mockRejectedValueOnce(
      new StarterCatalogueUnavailableError(),
    );
    const options = await app.inject({
      method: 'GET',
      url: '/api/v1/cards/starter-options',
      headers: { authorization: 'Bearer token' },
    });
    expect(options.statusCode).toBe(409);
    expect(options.json()).toMatchObject({
      code: 'STARTER_CATALOGUE_UNAVAILABLE',
    });

    selectStarter.mockRejectedValueOnce(new StarterCatalogueUnavailableError());
    const selection = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/starter',
      headers: { authorization: 'Bearer token' },
      payload: { affinity: 'wit' },
    });
    expect(selectStarter).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      affinity: 'wit',
    });
    expect(selection.statusCode).toBe(409);
    expect(selection.json()).toMatchObject({
      code: 'STARTER_CATALOGUE_UNAVAILABLE',
    });
  });

  it('returns a conflict when this player already selected a starter', async () => {
    selectStarter.mockRejectedValueOnce(
      new StarterAlreadyClaimedError('spark'),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/starter',
      headers: { authorization: 'Bearer token' },
      payload: { affinity: 'wit' },
    });
    expect(selectStarter).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      affinity: 'wit',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'STARTER_ALREADY_CLAIMED' });
  });
});
