import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { AuthConfig } from '../config/auth.js';
import type { AuthenticatedIdentity } from './types.js';

const DEFAULT_RECENT_AUTHENTICATION_MAX_AGE_SECONDS = 300;

export interface ReauthenticationProof {
  identity: AuthenticatedIdentity;
  authenticatedAt: Date;
}

export interface ReauthenticationTokenVerifier {
  verify(token: string): Promise<ReauthenticationProof>;
}

interface CreateReauthenticationTokenVerifierOptions {
  verificationKey?: CryptoKey;
  clock?: () => Date;
  maxAgeSeconds?: number;
}

export function createReauthenticationTokenVerifier(
  config: AuthConfig,
  {
    verificationKey,
    clock = () => new Date(),
    maxAgeSeconds = DEFAULT_RECENT_AUTHENTICATION_MAX_AGE_SECONDS,
  }: CreateReauthenticationTokenVerifierOptions = {},
): ReauthenticationTokenVerifier {
  const remoteJwks =
    verificationKey === undefined
      ? createRemoteJWKSet(config.jwksUrl)
      : undefined;

  return {
    async verify(token) {
      const currentDate = clock();

      const verificationOptions = {
        algorithms: ['RS256'],
        audience: config.spaClientId,
        issuer: config.issuer,
        currentDate,
      };

      const { payload } =
        verificationKey === undefined
          ? await jwtVerify(token, remoteJwks!, verificationOptions)
          : await jwtVerify(token, verificationKey, verificationOptions);

      if (
        payload.iss !== config.issuer ||
        typeof payload.sub !== 'string' ||
        payload.sub.trim() === '' ||
        typeof payload.exp !== 'number' ||
        typeof payload.auth_time !== 'number'
      ) {
        throw new Error(
          'Validated reauthentication token is missing required claims.',
        );
      }

      const nowSeconds = Math.floor(currentDate.getTime() / 1000);
      const authenticationAgeSeconds = nowSeconds - payload.auth_time;

      if (
        authenticationAgeSeconds < 0 ||
        authenticationAgeSeconds > maxAgeSeconds
      ) {
        throw new Error(
          'Validated reauthentication token is outside the allowed authentication age.',
        );
      }

      return {
        identity: {
          issuer: payload.iss,
          subject: payload.sub,
        },
        authenticatedAt: new Date(payload.auth_time * 1000),
      };
    },
  };
}
