import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';

export const SPRINT1_E2E_ACCESS_TOKEN =
  'wits-world-sprint1-e2e-obvious-local-test-token';

export const SPRINT1_E2E_IDENTITY = {
  connectionStrategy: 'auth0',
  issuer: 'https://sprint1-e2e.invalid/',
  playerName: 'sprint1-player',
  subject: 'sprint1-e2e-player',
} as const;

export function createSprint1E2eAccessTokenVerifier(): AccessTokenVerifier {
  return {
    async verify(token) {
      if (token !== SPRINT1_E2E_ACCESS_TOKEN) {
        throw new Error('The deterministic E2E bearer token was rejected.');
      }

      return SPRINT1_E2E_IDENTITY;
    },
  };
}
