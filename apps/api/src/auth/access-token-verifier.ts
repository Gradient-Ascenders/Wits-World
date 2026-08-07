import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { AuthConfig } from '../config/auth.js';
import type { AuthenticatedIdentity } from './types.js';

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedIdentity>;
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
        typeof payload.exp !== 'number'
      ) {
        throw new Error(
          'Validated access token is missing required identity claims.',
        );
      }

      return {
        issuer: payload.iss,
        subject: payload.sub,
      };
    },
  };
}
