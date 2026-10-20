import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';

const config: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'fixture-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};
let privateKey: CryptoKey;
let publicKey: CryptoKey;
let otherKey: CryptoKey;
let jwk: JWK;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('RS256'));
  otherKey = (await generateKeyPair('RS256')).privateKey;
  jwk = {
    ...(await exportJWK(publicKey)),
    kid: 'fixture-key',
    alg: 'RS256',
    use: 'sig',
  };
});
afterEach(() => vi.unstubAllGlobals());
const keysResponse = () =>
  new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
async function token(
  key = privateKey,
  audience = config.audience,
  expiration = '5m',
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setIssuer(config.issuer)
    .setAudience(audience)
    .setSubject('auth0|fixture')
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(key);
}

describe('authentication signing-key startup warmup', () => {
  it('loads only public keys once and keeps the first player request off that network path', async () => {
    const fetch = vi.fn().mockImplementation(async () => keysResponse());
    vi.stubGlobal('fetch', fetch);
    const verifier = createAccessTokenVerifier(config);
    await verifier.warmup?.();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe(config.jwksUrl.href);
    await expect(verifier.verify(await token())).resolves.toMatchObject({
      issuer: config.issuer,
      subject: 'auth0|fixture',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1].headers.has('Authorization')).toBe(false);
  });

  it('shares an in-progress prefetch with the first real verification', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const verifier = createAccessTokenVerifier(config);
    const signed = await token();
    const warmup = verifier.warmup?.();
    const verification = verifier.verify(signed);
    finish(keysResponse());
    await warmup;
    await expect(verification).resolves.toMatchObject({
      subject: 'auth0|fixture',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries on demand after a failed prefetch, without accepting an unverified token', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Connection unavailable'))
      .mockImplementation(async () => keysResponse());
    vi.stubGlobal('fetch', fetch);
    const verifier = createAccessTokenVerifier(config);
    await expect(verifier.warmup?.()).rejects.toThrow('Connection unavailable');
    await expect(verifier.verify(await token())).resolves.toMatchObject({
      subject: 'auth0|fixture',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('still rejects a wrong signature, wrong audience and expired token after prefetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => keysResponse()),
    );
    const verifier = createAccessTokenVerifier(config);
    await verifier.warmup?.();
    await expect(verifier.verify(await token(otherKey))).rejects.toThrow();
    await expect(
      verifier.verify(await token(privateKey, 'wrong-audience')),
    ).rejects.toThrow();
    await expect(
      verifier.verify(await token(privateKey, config.audience, '-1m')),
    ).rejects.toThrow();
  });

  it('does not fetch remotely when a trusted verification key is injected', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const verifier = createAccessTokenVerifier(config, {
      verificationKey: publicKey,
    });
    await verifier.warmup?.();
    await expect(verifier.verify(await token())).resolves.toMatchObject({
      subject: 'auth0|fixture',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
