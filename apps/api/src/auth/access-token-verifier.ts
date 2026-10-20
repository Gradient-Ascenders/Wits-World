import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { AuthConfig } from '../config/auth.js';
import type { AuthenticatedPrincipal } from './types.js';
import { readInteractivePlayerClaims } from './interactive-player-claims.js';

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedPrincipal>;
  warmup?(): Promise<void>;
}

interface CreateAccessTokenVerifierOptions {
  verificationKey?: CryptoKey;
}

export function createAccessTokenVerifier(
  config: AuthConfig,
  { verificationKey }: CreateAccessTokenVerifierOptions = {},
): AccessTokenVerifier {
  const remoteJwks =
    verificationKey === undefined
      ? createRemoteJWKSet(config.jwksUrl)
      : undefined;

  return {
    async warmup() {
      // Fetch public signing keys before the first player request, using the
      // same resolver/cache as verification. No tokens or identities are cached.
      await remoteJwks?.reload();
    },
    async verify(token) {
      const verificationOptions = {
        algorithms: ['RS256'],
        audience: config.audience,
        issuer: config.issuer,
      };

      const { payload } =
        verificationKey === undefined
          ? await jwtVerify(token, remoteJwks!, verificationOptions)
          : await jwtVerify(token, verificationKey, verificationOptions);

      if (
        payload.iss !== config.issuer ||
        typeof payload.sub !== 'string' ||
        payload.sub.trim() === '' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error(
          'Validated access token is missing required identity claims.',
        );
      }

      const interactiveClaims = readInteractivePlayerClaims(payload);

      return {
        ...interactiveClaims,
        issuer: payload.iss,
        subject: payload.sub,
        tokenIssuedAt: new Date(payload.iat * 1000),
      };
    },
  };
}
