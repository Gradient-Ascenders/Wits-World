import { describe, expect, it } from 'vitest';

import { getAuthSessionPolicy } from '../src/auth/session-policy';

describe('Auth0 session policy', () => {
  it('uses only the in-memory cache in production', () => {
    expect(getAuthSessionPolicy('production')).toEqual({
      cacheLocation: 'memory',
      useRefreshTokens: true,
      useRefreshTokensFallback: true,
    });
    expect(getAuthSessionPolicy('production').cacheLocation).not.toBe(
      'localstorage',
    );
  });

  it('uses rotating refresh tokens in local development', () => {
    expect(getAuthSessionPolicy('development')).toEqual({
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
      useRefreshTokensFallback: false,
    });
  });

  it.each(['e2e', 'sprint1-e2e'])(
    'uses persistent rotating refresh-token state in %s mode',
    (mode) => {
      expect(getAuthSessionPolicy(mode)).toEqual({
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
        useRefreshTokensFallback: false,
      });
    },
  );

  it('keeps unrecognised deployment modes on the production-safe policy', () => {
    expect(getAuthSessionPolicy('staging')).toEqual({
      cacheLocation: 'memory',
      useRefreshTokens: true,
      useRefreshTokensFallback: true,
    });
  });
});
