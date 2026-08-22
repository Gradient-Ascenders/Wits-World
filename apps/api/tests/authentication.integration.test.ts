import type { FastifyInstance } from 'fastify';
import { generateKeyPair, SignJWT } from 'jose';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { createAccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import {
  AUTH0_DATABASE_CONNECTION_STRATEGY,
  CONNECTION_STRATEGY_CLAIM,
  GOOGLE_CONNECTION_STRATEGY,
  PLAYER_NAME_CLAIM,
} from '../src/auth/interactive-player-claims.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  EventDiscoveryService,
  PlayerEvent,
} from '../src/events/event-discovery.js';

import {
  InvalidPlayerNameError,
  PlayerNameAlreadyAssignedError,
  PlayerNameConflictError,
  type PlayerIdentityService,
  type PlayerNameSetupService,
} from '../src/players/player-identity.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const tokenIdentity = {
  connectionStrategy: AUTH0_DATABASE_CONNECTION_STRATEGY,
  issuer: authConfig.issuer,
  playerName: 'naledi',
  subject: 'auth0|player-123',
};

const localPlayer = {
  id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
  role: 'player' as const,
  playerName: tokenIdentity.playerName,
  lifecycleStatus: 'active' as const,
};

const activeEvent: PlayerEvent = {
  eventId: '00000000-0000-4000-8000-000000000018',
  title: 'Email verification policy regression event',
  description: 'Player-safe event details.',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000Z',
  endsAt: '2026-08-31T00:00:00.000Z',
  availability: 'active',
};

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let unrelatedPrivateKey: CryptoKey;
let app: FastifyInstance;
let playerIdentityService: PlayerIdentityService;
let playerNameSetupService: PlayerNameSetupService;
let listEvents: ReturnType<typeof createEventListMock>;

beforeAll(async () => {
  const trustedKeyPair = await generateKeyPair('RS256');
  const unrelatedKeyPair = await generateKeyPair('RS256');

  privateKey = trustedKeyPair.privateKey;
  publicKey = trustedKeyPair.publicKey;
  unrelatedPrivateKey = unrelatedKeyPair.privateKey;
});

beforeEach(async () => {
  playerIdentityService = {
    resolve: vi.fn().mockResolvedValue(localPlayer),
  };
  playerNameSetupService = {
    assignInitialPlayerName: vi.fn().mockResolvedValue(localPlayer),
  };
  listEvents = createEventListMock();

  app = await buildApp({
    authConfig,
    accessTokenVerifier: createAccessTokenVerifier(authConfig, {
      verificationKey: publicKey,
    }),
    playerIdentityService,
    playerNameSetupService,
    eventServices: {
      discovery: {
        list: listEvents,
      },
      eligibility: {
        evaluate: vi.fn(),
      },
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('API bearer authentication', () => {
  it('returns 401 when the bearer token is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expectUnauthorized(response);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns 401 for a malformed bearer token', async () => {
    const malformedToken = 'not-a-valid-jwt';

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${malformedToken}`,
      },
    });

    expectUnauthorized(response);
    expect(response.body).not.toContain(malformedToken);
  });

  it('returns 401 for a token with an invalid signature', async () => {
    const token = await createToken({
      signingKey: unrelatedPrivateKey,
    });

    const response = await authenticatedRequest(token);

    expectUnauthorized(response);
    expect(response.body).not.toContain(token);
  });

  it('returns 401 for an expired token', async () => {
    const token = await createToken({
      expirationTime: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await authenticatedRequest(token);

    expectUnauthorized(response);
    expect(response.body).not.toContain(token);
  });

  it('returns 401 for a token with the wrong issuer', async () => {
    const token = await createToken({
      issuer: 'https://untrusted.example.test/',
    });

    const response = await authenticatedRequest(token);

    expectUnauthorized(response);
    expect(response.body).not.toContain(token);
  });

  it('returns 401 for a token with the wrong audience', async () => {
    const token = await createToken({
      audience: 'https://another-api.example.test',
    });

    const response = await authenticatedRequest(token);

    expectUnauthorized(response);
    expect(response.body).not.toContain(token);
  });

  it('returns 401 when a token has no expiry claim', async () => {
    const token = await createToken({
      includeExpiration: false,
    });

    const response = await authenticatedRequest(token);

    expectUnauthorized(response);
    expect(response.body).not.toContain(token);
  });

  it('accepts the configured player-name claim from a fully validated token', async () => {
    const token = await createToken({ playerName: 'trusted-player' });

    const response = await authenticatedRequest(token);

    expect(response.statusCode).toBe(200);
    expect(playerIdentityService.resolve).toHaveBeenCalledWith({
      ...tokenIdentity,
      playerName: 'trusted-player',
    });
  });

  it('allows a Google token without a player-name claim to restore setup-required state', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      ...localPlayer,
      playerName: null,
    });
    const token = await createToken({
      connectionStrategy: GOOGLE_CONNECTION_STRATEGY,
      includePlayerName: false,
    });

    const response = await authenticatedRequest(token);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: localPlayer.id,
      lifecycleStatus: 'active',
      playerName: null,
      playerNameSetupRequired: true,
      requestId: expect.any(String),
      role: 'player',
    });
    expect(playerIdentityService.resolve).toHaveBeenCalledWith({
      connectionStrategy: GOOGLE_CONNECTION_STRATEGY,
      issuer: tokenIdentity.issuer,
      playerName: null,
      subject: tokenIdentity.subject,
    });
  });

  it('never uses Google profile or email claims as a Player Name fallback', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      ...localPlayer,
      playerName: null,
    });
    const token = await createToken({
      connectionStrategy: GOOGLE_CONNECTION_STRATEGY,
      email: 'private@example.test',
      includePlayerName: false,
      name: 'Profile Name',
      nickname: 'profile-nickname',
    });

    await authenticatedRequest(token);

    expect(playerIdentityService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: null }),
    );
  });

  it('rejects unknown and malformed interactive connection strategies', async () => {
    for (const connectionStrategy of ['github', 42, { provider: 'auth0' }]) {
      const response = await authenticatedRequest(
        await createToken({ connectionStrategy }),
      );

      expectUnauthorized(response);
    }

    expect(playerIdentityService.resolve).not.toHaveBeenCalled();
  });

  it('keeps a token without interactive claims valid for generic verification but rejects it as a player', async () => {
    const token = await createToken({
      includeConnectionStrategy: false,
      includePlayerName: false,
    });
    const verifier = createAccessTokenVerifier(authConfig, {
      verificationKey: publicKey,
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      connectionStrategy: null,
      playerName: null,
    });
    const response = await authenticatedRequest(token);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'UNAUTHORIZED',
      detail: 'An interactive player access token is required.',
    });
  });

  it.each([
    { emailVerified: true, label: 'email_verified: true' },
    { emailVerified: false, label: 'email_verified: false' },
    { emailVerified: undefined, label: 'no email_verified claim' },
  ])(
    'keeps $label authenticated for /auth/me and protected gameplay',
    async ({ emailVerified }) => {
      const token = await createToken({ emailVerified });

      const currentPlayerResponse = await authenticatedRequest(token);
      const gameplayResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(currentPlayerResponse.statusCode).toBe(200);
      expect(currentPlayerResponse.json()).toEqual({
        id: localPlayer.id,
        role: 'player',
        playerName: tokenIdentity.playerName,
        playerNameSetupRequired: false,
        lifecycleStatus: 'active',
        requestId: expect.any(String),
      });

      expect(gameplayResponse.statusCode).toBe(200);
      expect(gameplayResponse.json()).toEqual({
        events: [activeEvent],
        requestId: expect.any(String),
      });

      expect(playerIdentityService.resolve).toHaveBeenCalledTimes(2);
      expect(playerIdentityService.resolve).toHaveBeenNthCalledWith(
        1,
        tokenIdentity,
      );
      expect(playerIdentityService.resolve).toHaveBeenNthCalledWith(
        2,
        tokenIdentity,
      );
      expect(listEvents).toHaveBeenCalledOnce();
    },
  );

  it('does not allow request-body identity data to override the validated token identity', async () => {
    app.post(
      '/test/protected-identity',
      {
        preHandler: app.authenticate,
      },
      async (request) => ({
        authenticatedIdentity: request.auth,
        submittedBody: request.body,
      }),
    );

    const token = await createToken();

    const response = await app.inject({
      method: 'POST',
      url: '/test/protected-identity',
      headers: {
        authorization: `Bearer ${token}`,
        'x-player-name': 'attacker-header-name',
      },
      payload: {
        issuer: 'https://attacker.example.test/',
        playerName: 'attacker-name',
        subject: 'attacker-controlled-subject',
      },
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      authenticatedIdentity: tokenIdentity,
      submittedBody: {
        issuer: 'https://attacker.example.test/',
        playerName: 'attacker-name',
        subject: 'attacker-controlled-subject',
      },
    });
  });

  it('rejects a missing player-name claim without falling back to profile claims', async () => {
    const token = await createToken({
      email: 'naledi@example.test',
      includePlayerName: false,
      name: 'naledi@example.test',
      nickname: 'naledi',
    });

    const response = await authenticatedRequest(token);

    expectUnauthorized(response);
    expect(playerIdentityService.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['number', 42],
    ['object', { value: 'naledi' }],
    ['array', ['naledi']],
    ['empty string', ''],
    ['whitespace-only string', '   '],
    ['string with surrounding whitespace', ' naledi '],
    ['control character', 'naledi\nstar'],
    ['email-formatted string', 'bob@example.com'],
    ['email-formatted string with a single-label domain', 'player@example'],
    ['phone-formatted string', '+27123456789'],
  ])(
    'rejects a malformed player-name claim that is a %s',
    async (_label, playerName) => {
      const token = await createToken({ playerName });
      const response = await authenticatedRequest(token);

      expectUnauthorized(response);
      expect(playerIdentityService.resolve).not.toHaveBeenCalled();
    },
  );

  it('does not retain the superseded display-name mutation endpoint', async () => {
    const token = await createToken();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/me/display-name',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'attacker-controlled' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('assigns a Google Player Name once and returns authoritative current-player state', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      ...localPlayer,
      playerName: null,
    });
    vi.mocked(playerNameSetupService.assignInitialPlayerName).mockResolvedValue(
      {
        ...localPlayer,
        playerName: 'google-player',
      },
    );
    const token = await createToken({
      connectionStrategy: GOOGLE_CONNECTION_STRATEGY,
      includePlayerName: false,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/me/player-name',
      headers: { authorization: `Bearer ${token}` },
      payload: { playerName: 'Google-Player' },
    });

    expect(response.statusCode).toBe(200);
    expect(playerNameSetupService.assignInitialPlayerName).toHaveBeenCalledWith(
      localPlayer.id,
      'Google-Player',
    );
    expect(response.json()).toMatchObject({
      id: localPlayer.id,
      playerName: 'google-player',
      playerNameSetupRequired: false,
    });
  });

  it('does not allow a database account to use Google Player Name setup', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/me/player-name',
      headers: { authorization: `Bearer ${await createToken()}` },
      payload: { playerName: 'different-name' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'PLAYER_NAME_SETUP_NOT_AVAILABLE',
    });
    expect(
      playerNameSetupService.assignInitialPlayerName,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: 'INVALID_PLAYER_NAME',
      error: new InvalidPlayerNameError('characters'),
      statusCode: 400,
    },
    {
      code: 'PLAYER_NAME_CONFLICT',
      error: new PlayerNameConflictError(),
      statusCode: 409,
    },
    {
      code: 'PLAYER_NAME_ALREADY_ASSIGNED',
      error: new PlayerNameAlreadyAssignedError(),
      statusCode: 409,
    },
  ])(
    'returns $code for a rejected initial assignment',
    async ({ code, error, statusCode }) => {
      vi.mocked(playerIdentityService.resolve).mockResolvedValue({
        ...localPlayer,
        playerName: null,
      });
      vi.mocked(
        playerNameSetupService.assignInitialPlayerName,
      ).mockRejectedValue(error);
      const token = await createToken({
        connectionStrategy: GOOGLE_CONNECTION_STRATEGY,
        includePlayerName: false,
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/auth/me/player-name',
        headers: { authorization: `Bearer ${token}` },
        payload: { playerName: 'requested-name' },
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toMatchObject({ code });
    },
  );

  it('documents bearer authentication for the protected OpenAPI route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
      paths: Record<
        string,
        {
          get?: {
            security?: Array<Record<string, unknown>>;
          };
        }
      >;
    }>();

    expect(document.components?.securitySchemes).toHaveProperty('bearerAuth');

    expect(document.paths['/api/v1/auth/me']?.get).toMatchObject({
      operationId: 'getCurrentPlayer',
    });
  });

  it('does not pass browser-controlled identity data to local player resolution', async () => {
    const token = await createToken();

    app.post(
      '/test/current-player',
      {
        preHandler: app.authenticate,
      },
      async (request) => {
        if (!request.auth || request.auth.connectionStrategy === null) {
          throw new Error('Authenticated identity missing.');
        }

        return playerIdentityService.resolve(request.auth);
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/test/current-player',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        issuer: 'https://attacker.example.test/',
        playerName: 'attacker-name',
        subject: 'attacker-controlled-subject',
        role: 'author',
      },
    });

    expect(response.statusCode).toBe(200);

    expect(playerIdentityService.resolve).toHaveBeenCalledWith(tokenIdentity);
  });
});

describe('API bearer authentication', () => {
  // existing tests...

  it('rejects a deletion-pending current player even with a valid token', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      ...localPlayer,
      lifecycleStatus: 'deletion_pending',
    });

    const token = await createToken();

    const response = await authenticatedRequest(token);

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      status: 403,
      code: 'ACCOUNT_UNAVAILABLE',
    });
  });

  // existing tests...
});

interface CreateTokenOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  expirationTime?: number;
  signingKey?: CryptoKey;
  includeExpiration?: boolean;
  emailVerified?: boolean;
  email?: string;
  includePlayerName?: boolean;
  name?: string;
  nickname?: string;
  playerName?: unknown;
  connectionStrategy?: unknown;
  includeConnectionStrategy?: boolean;
}

async function createToken({
  issuer = tokenIdentity.issuer,
  audience = authConfig.audience,
  subject = tokenIdentity.subject,
  expirationTime = Math.floor(Date.now() / 1000) + 300,
  signingKey = privateKey,
  includeExpiration = true,
  emailVerified,
  email,
  includePlayerName = true,
  name,
  nickname,
  playerName = tokenIdentity.playerName,
  connectionStrategy = AUTH0_DATABASE_CONNECTION_STRATEGY,
  includeConnectionStrategy = true,
}: CreateTokenOptions = {}): Promise<string> {
  let token = new SignJWT({
    ...(includeConnectionStrategy
      ? { [CONNECTION_STRATEGY_CLAIM]: connectionStrategy }
      : {}),
    ...(includePlayerName ? { [PLAYER_NAME_CLAIM]: playerName } : {}),
    ...(emailVerified === undefined ? {} : { email_verified: emailVerified }),
    ...(email === undefined ? {} : { email }),
    ...(name === undefined ? {} : { name }),
    ...(nickname === undefined ? {} : { nickname }),
  })
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'JWT',
    })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt();

  if (includeExpiration) {
    token = token.setExpirationTime(expirationTime);
  }

  return token.sign(signingKey);
}

async function authenticatedRequest(token: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

function expectUnauthorized(response: {
  statusCode: number;
  body: string;
  json(): unknown;
}) {
  expect(response.statusCode).toBe(401);

  expect(response.json()).toMatchObject({
    status: 401,
    code: 'UNAUTHORIZED',
    title: 'Authentication required',
    detail: 'A valid bearer access token is required.',
    requestId: expect.any(String),
  });
}

function createEventListMock() {
  const list: EventDiscoveryService['list'] = async () => [activeEvent];

  return vi.fn(list);
}
