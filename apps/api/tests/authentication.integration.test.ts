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
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  EventDiscoveryService,
  PlayerEvent,
} from '../src/events/event-discovery.js';

import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const tokenIdentity = {
  issuer: authConfig.issuer,
  subject: 'auth0|player-123',
};

const localPlayer = {
  id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
  role: 'player' as const,
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
  listEvents = createEventListMock();

  app = await buildApp({
    authConfig,
    accessTokenVerifier: createAccessTokenVerifier(authConfig, {
      verificationKey: publicKey,
    }),
    playerIdentityService,
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
      },
      payload: {
        issuer: 'https://attacker.example.test/',
        subject: 'attacker-controlled-subject',
      },
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      authenticatedIdentity: tokenIdentity,
      submittedBody: {
        issuer: 'https://attacker.example.test/',
        subject: 'attacker-controlled-subject',
      },
    });
  });

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
        if (!request.auth) {
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
}

async function createToken({
  issuer = tokenIdentity.issuer,
  audience = authConfig.audience,
  subject = tokenIdentity.subject,
  expirationTime = Math.floor(Date.now() / 1000) + 300,
  signingKey = privateKey,
  includeExpiration = true,
  emailVerified,
}: CreateTokenOptions = {}): Promise<string> {
  let token = new SignJWT(
    emailVerified === undefined ? {} : { email_verified: emailVerified },
  )
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
