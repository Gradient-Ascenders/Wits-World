import type { FastifyInstance } from 'fastify';
import { generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const tokenIdentity = {
  issuer: authConfig.issuer,
  subject: 'auth0|player-123',
};

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let unrelatedPrivateKey: CryptoKey;
let app: FastifyInstance;

beforeAll(async () => {
  const trustedKeyPair = await generateKeyPair('RS256');
  const unrelatedKeyPair = await generateKeyPair('RS256');

  privateKey = trustedKeyPair.privateKey;
  publicKey = trustedKeyPair.publicKey;
  unrelatedPrivateKey = unrelatedKeyPair.privateKey;
});

beforeEach(async () => {
  app = await buildApp({
    authConfig,
    accessTokenVerifier: createAccessTokenVerifier(authConfig, {
      verificationKey: publicKey,
    }),
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

  it('makes the validated issuer and subject available to a protected route', async () => {
    const token = await createToken();

    const response = await authenticatedRequest(token);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      issuer: tokenIdentity.issuer,
      subject: tokenIdentity.subject,
      requestId: expect.any(String),
    });
  });

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

    expect(document.paths['/api/v1/auth/me']?.get?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);
  });
});

interface CreateTokenOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  expirationTime?: number;
  signingKey?: CryptoKey;
  includeExpiration?: boolean;
}

async function createToken({
  issuer = tokenIdentity.issuer,
  audience = authConfig.audience,
  subject = tokenIdentity.subject,
  expirationTime = Math.floor(Date.now() / 1000) + 300,
  signingKey = privateKey,
  includeExpiration = true,
}: CreateTokenOptions = {}): Promise<string> {
  let token = new SignJWT({})
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
