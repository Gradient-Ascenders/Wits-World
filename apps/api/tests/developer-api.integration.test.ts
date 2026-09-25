import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  DeveloperApiKeyService,
  DeveloperApiKeyMetadata,
} from '../src/developer/developer-api-key-service.js';
import type { DeveloperPublicDataService } from '../src/developer/developer-public-data-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import { createRateProtection } from '../src/security/rate-protection.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const PLAYER_ID = '17200000-0000-4000-8000-000000000001';
const KEY_ID = '18200000-0000-4000-8000-000000000001';
const EVENT_ID = '19200000-0000-4000-8000-000000000001';
const CARD_ID = '20200000-0000-4000-8000-000000000001';
const VALID_KEY = `ww_api_0123456789abcdef_${'a'.repeat(43)}`;
const SECOND_KEY = `ww_api_fedcba9876543210_${'b'.repeat(43)}`;
const SECOND_KEY_ID = '18200000-0000-4000-8000-000000000002';

const keyMetadata: DeveloperApiKeyMetadata = {
  id: KEY_ID,
  name: 'Lecturer demo',
  keyPrefix: 'ww_api_0123456789abcdef_…',
  createdAt: '2026-09-23T18:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  status: 'active',
};

let app: FastifyInstance;
let keyService: DeveloperApiKeyService;
let publicDataService: DeveloperPublicDataService;

beforeEach(async () => {
  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'developer-owner',
      subject: 'auth0|developer-owner',
      tokenIssuedAt: new Date('2026-09-23T17:00:00.000Z'),
    }),
  };
  const playerIdentityService: PlayerIdentityService = {
    resolve: vi.fn().mockResolvedValue({
      id: PLAYER_ID,
      role: 'player',
      playerName: 'developer-owner',
      lifecycleStatus: 'active',
    }),
  };

  keyService = {
    listForPlayer: vi.fn().mockResolvedValue([keyMetadata]),
    createForPlayer: vi.fn().mockResolvedValue({
      key: keyMetadata,
      apiKey: VALID_KEY,
    }),
    revokeForPlayer: vi.fn().mockResolvedValue({
      ...keyMetadata,
      revokedAt: '2026-09-23T19:00:00.000Z',
      status: 'revoked',
    }),
    authenticate: vi.fn().mockImplementation(async (key: string) => {
      if (key === VALID_KEY) return { id: KEY_ID, ownerPlayerId: PLAYER_ID };
      if (key === SECOND_KEY) {
        return { id: SECOND_KEY_ID, ownerPlayerId: PLAYER_ID };
      }
      return null;
    }),
  };

  publicDataService = {
    listEvents: vi.fn().mockResolvedValue({
      events: [
        {
          eventId: EVENT_ID,
          title: 'Great Hall challenge',
          description: 'Public event.',
          latitude: -26.191,
          longitude: 28.03,
          radiusMetres: 75,
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-10-01T00:00:00.000Z',
          availability: 'active',
        },
      ],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    }),
    getEvent: vi.fn().mockResolvedValue({
      eventId: EVENT_ID,
      title: 'Great Hall challenge',
      description: 'Public event.',
      latitude: -26.191,
      longitude: 28.03,
      radiusMetres: 75,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
      availability: 'active',
    }),
    listCards: vi.fn().mockResolvedValue([
      {
        cardDefinitionId: CARD_ID,
        name: 'Quillip',
        category: 'creature',
        affinity: 'wit',
        rarity: 'common',
        hp: 98,
        power: 11,
        description: 'A Wit scholar.',
        imageUrl: '/cards/quillip.webp',
        imageAlt: 'A small owl-like creature.',
        deckPointCost: 1,
        evolvesFromCardDefinitionId: null,
        evolutionCopiesRequired: null,
        moves: [
          {
            position: 1,
            name: 'Quick Study',
            moveType: 'basic',
            powerCost: 0,
            rulesText: 'Deal damage.',
          },
        ],
        effects: [],
      },
    ]),
    getCard: vi
      .fn()
      .mockImplementation(async (id: string) =>
        id === CARD_ID ? (await publicDataService.listCards())[0]! : null,
      ),
    listLeaderboard: vi.fn().mockResolvedValue({
      period: 'all_time',
      month: null,
      entries: [{ playerName: 'leader', points: 100, rank: 1 }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService,
    developerApi: {
      keyService,
      publicDataService,
      rateProtection: createRateProtection({
        maxRequests: 3,
        windowMs: 60_000,
      }),
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('developer API', () => {
  it('requires X-API-Key and keeps bearer authentication separate', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/developer/cards',
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('ApiKey');

    const bearerOnly = await app.inject({
      method: 'GET',
      url: '/api/v1/developer/cards',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(bearerOnly.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/developer/cards',
      headers: { 'x-api-key': 'ww_api_invalid' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.body).not.toContain('ww_api_invalid');

    const playerRoute = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': VALID_KEY },
    });
    expect(playerRoute.statusCode).toBe(401);
  });

  it('returns read-only public resources with a valid developer key', async () => {
    const events = await developerGet('/api/v1/developer/events');
    expect(events.statusCode).toBe(200);
    expect(events.json()).toMatchObject({
      events: [{ eventId: EVENT_ID, title: 'Great Hall challenge' }],
      pagination: { totalItems: 1 },
      requestId: expect.any(String),
    });
    expect(vi.mocked(publicDataService.listEvents)).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
    });

    const cards = await developerGet('/api/v1/developer/cards');
    expect(cards.statusCode).toBe(200);
    expect(cards.body).not.toContain('authoringStatus');
    expect(cards.body).not.toContain('rewardEligible');
    expect(cards.body).not.toContain('effectConfig');

    const leaderboard = await developerGet('/api/v1/developer/leaderboard');
    expect(leaderboard.statusCode).toBe(200);
    expect(leaderboard.json()).toMatchObject({
      period: 'all_time',
      entries: [{ playerName: 'leader', points: 100, rank: 1 }],
    });
    expect(leaderboard.body).not.toContain('playerId');
    expect(leaderboard.body).not.toContain('trust');
  });

  it('applies an independent process-local quota per developer key', async () => {
    expect((await developerGet('/api/v1/developer/events')).statusCode).toBe(
      200,
    );
    expect((await developerGet('/api/v1/developer/events')).statusCode).toBe(
      200,
    );
    expect((await developerGet('/api/v1/developer/events')).statusCode).toBe(
      200,
    );
    const limited = await developerGet('/api/v1/developer/events');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['ratelimit-limit']).toBe('3');
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(limited.headers['retry-after']).toBeDefined();

    const independent = await developerGet(
      '/api/v1/developer/events',
      SECOND_KEY,
    );
    expect(independent.statusCode).toBe(200);
    expect(independent.headers['ratelimit-remaining']).toBe('2');
  });

  it('lets an active account manage named keys using bearer authentication', async () => {
    const list = await bearerRequest('GET', '/api/v1/developer/keys');
    expect(list.statusCode).toBe(200);
    expect(vi.mocked(keyService.listForPlayer)).toHaveBeenCalledWith(PLAYER_ID);
    expect(list.json()).toMatchObject({
      activeKeyLimit: 5,
      keys: [keyMetadata],
    });
    expect(list.json().keys[0]).not.toHaveProperty('apiKey');

    const created = await bearerRequest('POST', '/api/v1/developer/keys', {
      name: ' Lecturer demo ',
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(vi.mocked(keyService.createForPlayer)).toHaveBeenCalledWith(
      PLAYER_ID,
      ' Lecturer demo ',
    );
    expect(created.json()).toMatchObject({
      apiKey: VALID_KEY,
      key: keyMetadata,
    });

    const revoked = await bearerRequest(
      'DELETE',
      `/api/v1/developer/keys/${KEY_ID}`,
    );
    expect(revoked.statusCode).toBe(200);
    expect(vi.mocked(keyService.revokeForPlayer)).toHaveBeenCalledWith(
      PLAYER_ID,
      KEY_ID,
    );
  });

  it('publishes separate bearer and developer-key OpenAPI security schemes', async () => {
    await app.ready();
    const document = app.swagger();
    expect('components' in document).toBe(true);
    if (!('components' in document)) {
      throw new Error('Expected an OpenAPI 3 document');
    }
    expect(document.components?.securitySchemes).toMatchObject({
      bearerAuth: { type: 'http', scheme: 'bearer' },
      developerApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    });
    expect(document.paths?.['/api/v1/developer/keys']?.get?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(document.paths?.['/api/v1/developer/cards']?.get?.security).toEqual([
      { developerApiKey: [] },
    ]);
    expect(
      document.paths?.['/api/v1/developer/cards']?.get?.responses,
    ).toHaveProperty('429');
  });
});

async function developerGet(url: string, apiKey = VALID_KEY) {
  return app.inject({
    method: 'GET',
    url,
    headers: { 'x-api-key': apiKey },
  });
}

async function bearerRequest(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: object,
) {
  return app.inject({
    method,
    url,
    headers: {
      authorization: 'Bearer valid-token',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { payload: body } : {}),
  });
}
