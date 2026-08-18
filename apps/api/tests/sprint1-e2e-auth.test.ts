import { describe, expect, it } from 'vitest';

import {
  createSprint1E2eAccessTokenVerifier,
  SPRINT1_E2E_ACCESS_TOKEN,
  SPRINT1_E2E_IDENTITY,
} from '../e2e/sprint1-auth.js';

describe('Sprint 1 deterministic E2E access-token verifier', () => {
  it('accepts only the documented local-test token', async () => {
    const verifier = createSprint1E2eAccessTokenVerifier();

    await expect(verifier.verify(SPRINT1_E2E_ACCESS_TOKEN)).resolves.toEqual(
      SPRINT1_E2E_IDENTITY,
    );
    await expect(verifier.verify('another-token')).rejects.toThrow(
      'deterministic E2E bearer token was rejected',
    );
  });
});
