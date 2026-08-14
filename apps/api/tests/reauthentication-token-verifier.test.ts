import { generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { createReauthenticationTokenVerifier } from '../src/auth/reauthentication-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const now = new Date('2026-08-14T02:00:00.000Z');

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let unrelatedPrivateKey: CryptoKey;

beforeAll(async () => {
  const trusted = await generateKeyPair('RS256');
  const unrelated = await generateKeyPair('RS256');

  privateKey = trusted.privateKey;
  publicKey = trusted.publicKey;
  unrelatedPrivateKey = unrelated.privateKey;
});

describe('reauthentication token verification', () => {
  it('accepts a matching identity authenticated within five minutes', async () => {
    const token = await createToken({
      authTime: Math.floor(now.getTime() / 1000) - 299,
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      identity: {
        issuer: authConfig.issuer,
        subject: 'auth0|player-123',
      },
      authenticatedAt: new Date('2026-08-14T01:55:01.000Z'),
    });
  });

  it('rejects authentication older than five minutes', async () => {
    const token = await createToken({
      authTime: Math.floor(now.getTime() / 1000) - 301,
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).rejects.toThrow(
      'outside the allowed authentication age',
    );
  });

  it('rejects a token without auth_time', async () => {
    const token = await createToken({
      includeAuthTime: false,
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).rejects.toThrow(
      'missing required claims',
    );
  });

  it('rejects an ID token issued for another client', async () => {
    const token = await createToken({
      audience: 'another-spa-client',
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects an ID token from another issuer', async () => {
    const token = await createToken({
      issuer: 'https://attacker.example.test/',
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects an ID token with an invalid signature', async () => {
    const token = await createToken({
      signingKey: unrelatedPrivateKey,
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects a future authentication time', async () => {
    const token = await createToken({
      authTime: Math.floor(now.getTime() / 1000) + 60,
    });

    const verifier = createReauthenticationTokenVerifier(authConfig, {
      verificationKey: publicKey,
      clock: () => now,
    });

    await expect(verifier.verify(token)).rejects.toThrow(
      'outside the allowed authentication age',
    );
  });
});

interface CreateTokenOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  authTime?: number;
  signingKey?: CryptoKey;
  includeAuthTime?: boolean;
}

async function createToken({
  issuer = authConfig.issuer,
  audience = authConfig.spaClientId,
  subject = 'auth0|player-123',
  authTime = Math.floor(now.getTime() / 1000) - 60,
  signingKey = privateKey,
  includeAuthTime = true,
}: CreateTokenOptions = {}) {
  const payload = includeAuthTime
    ? {
        auth_time: authTime,
      }
    : {};

  const token = new SignJWT(payload)
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'JWT',
    })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 300);

  return token.sign(signingKey);
}
