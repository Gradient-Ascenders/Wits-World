import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { CorsConfig } from '../src/config/cors.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const DISALLOWED_ORIGIN = 'https://untrusted.example.test';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const corsConfig: CorsConfig = {
  allowedOrigin: ALLOWED_ORIGIN,
};

const authenticatedIdentity = {
  issuer: authConfig.issuer,
  subject: 'auth0|cors-test-player',
};

const activeLocalPlayer = {
  id: '00000000-0000-4000-8000-000000000102',
  role: 'player' as const,
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;
let verifyAccessToken: ReturnType<typeof createVerifyAccessTokenMock>;

beforeEach(async () => {
  verifyAccessToken = createVerifyAccessTokenMock();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: verifyAccessToken,
  };

  app = await buildApp({
    authConfig,
    corsConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: vi.fn(async () => activeLocalPlayer),
    },
    eventServices: {
      discovery: {
        async list() {
          return [
            {
              eventId: '00000000-0000-4000-8000-000000000018',
              title: 'Sprint 1 Demo - Wits Great Hall',
              description: null,
              latitude: -26.19205,
              longitude: 28.03038,
              radiusMetres: 75,
              startsAt: '2026-08-01T00:00:00.000Z',
              endsAt: '2026-08-26T00:00:00.000Z',
              availability: 'active',
            },
          ];
        },
      },
      eligibility: {
        async evaluate() {
          return {
            outcome: 'not_found' as const,
            eventId: '00000000-0000-4000-8000-000000000099',
          };
        },
      },
      movementEvidence: {
        record: vi.fn(),
        evaluateJourney: vi.fn(),
        evaluateJourneyWithinTransaction: vi.fn(),
        purgeExpired: vi.fn(),
      },
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('browser-to-API CORS policy', () => {
  it('allows bearer preflight from the configured web origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/events',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      ALLOWED_ORIGIN,
    );

    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-methods']).toContain('PUT');
    expect(response.headers['access-control-allow-methods']).toContain(
      'DELETE',
    );

    expect(response.headers['access-control-allow-headers']).toContain(
      'Authorization',
    );

    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('allows an authenticated event request from the configured web origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: {
        origin: ALLOWED_ORIGIN,
        authorization: 'Bearer test-access-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      ALLOWED_ORIGIN,
    );

    expect(response.json()).toMatchObject({
      events: [
        {
          eventId: '00000000-0000-4000-8000-000000000018',
        },
      ],
    });

    expect(verifyAccessToken).toHaveBeenCalledWith('test-access-token');
  });

  it('does not allow an unapproved browser origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/events',
      headers: {
        origin: DISALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not use a wildcard allow-origin policy', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/events',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe(
      ALLOWED_ORIGIN,
    );

    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('preserves authentication for the actual protected request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/events',
      headers: {
        origin: ALLOWED_ORIGIN,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });

    expect(response.headers['access-control-allow-origin']).toBe(
      ALLOWED_ORIGIN,
    );
  });
});

function createVerifyAccessTokenMock() {
  return vi.fn<AccessTokenVerifier['verify']>(async () => ({
    ...authenticatedIdentity,
    connectionStrategy: 'auth0',
    playerName: 'test-player',
    tokenIssuedAt: new Date(0),
  }));
}
