import { describe, expect, it } from 'vitest';

import { buildAuthManagementConfig } from '../src/config/auth-management.js';
import type { AuthConfig } from '../src/config/auth.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('Auth0 Management API configuration', () => {
  it('derives the trusted Auth0 endpoints from the tenant configuration', () => {
    const config = buildAuthManagementConfig({
      authConfig,
      env: {
        AUTH0_MANAGEMENT_CLIENT_ID: 'management-client',
        AUTH0_MANAGEMENT_CLIENT_SECRET: 'management-secret',
      },
    });

    expect(config).toEqual({
      clientId: 'management-client',
      clientSecret: 'management-secret',
      tokenUrl: new URL('https://auth.example.test/oauth/token'),
      apiBaseUrl: new URL('https://auth.example.test/api/v2/'),
      audience: 'https://auth.example.test/api/v2/',
    });
  });

  it('rejects a missing Management API client ID', () => {
    expect(() =>
      buildAuthManagementConfig({
        authConfig,
        env: {
          AUTH0_MANAGEMENT_CLIENT_SECRET: 'management-secret',
        },
      }),
    ).toThrow('AUTH0_MANAGEMENT_CLIENT_ID is required to start the API.');
  });

  it('rejects a missing Management API client secret', () => {
    expect(() =>
      buildAuthManagementConfig({
        authConfig,
        env: {
          AUTH0_MANAGEMENT_CLIENT_ID: 'management-client',
        },
      }),
    ).toThrow('AUTH0_MANAGEMENT_CLIENT_SECRET is required to start the API.');
  });

  it('trims Management API credentials', () => {
    const config = buildAuthManagementConfig({
      authConfig,
      env: {
        AUTH0_MANAGEMENT_CLIENT_ID: '  management-client  ',
        AUTH0_MANAGEMENT_CLIENT_SECRET: '  management-secret  ',
      },
    });

    expect(config.clientId).toBe('management-client');
    expect(config.clientSecret).toBe('management-secret');
  });
});
