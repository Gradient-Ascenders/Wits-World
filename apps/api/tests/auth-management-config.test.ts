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
  it('uses the custom domain for requests and the tenant domain for the audience', () => {
    const config = buildAuthManagementConfig({
      authConfig,
      env: {
        AUTH0_MANAGEMENT_CLIENT_ID: 'management-client',
        AUTH0_MANAGEMENT_CLIENT_SECRET: 'management-secret',
        AUTH0_TENANT_DOMAIN: 'tenant.us.auth0.com',
      },
    });

    expect(config).toEqual({
      clientId: 'management-client',
      clientSecret: 'management-secret',
      tokenUrl: new URL('https://auth.example.test/oauth/token'),
      apiBaseUrl: new URL('https://auth.example.test/api/v2/'),
      audience: 'https://tenant.us.auth0.com/api/v2/',
    });
  });

  it('uses the default Auth0 domain as the audience when no custom domain is configured', () => {
    const tenantAuthConfig = {
      ...authConfig,
      domain: 'tenant.us.auth0.com',
      issuer: 'https://tenant.us.auth0.com/',
    };

    expect(
      buildAuthManagementConfig({
        authConfig: tenantAuthConfig,
        env: {
          AUTH0_MANAGEMENT_CLIENT_ID: 'management-client',
          AUTH0_MANAGEMENT_CLIENT_SECRET: 'management-secret',
        },
      }).audience,
    ).toBe('https://tenant.us.auth0.com/api/v2/');
  });

  it('requires the default tenant domain when the authentication domain is custom', () => {
    expect(() =>
      buildAuthManagementConfig({
        authConfig,
        env: {
          AUTH0_MANAGEMENT_CLIENT_ID: 'management-client',
          AUTH0_MANAGEMENT_CLIENT_SECRET: 'management-secret',
        },
      }),
    ).toThrow(
      'AUTH0_TENANT_DOMAIN is required when AUTH0_DOMAIN is a custom domain.',
    );
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
        AUTH0_TENANT_DOMAIN: '  tenant.us.auth0.com  ',
      },
    });

    expect(config.clientId).toBe('management-client');
    expect(config.clientSecret).toBe('management-secret');
    expect(config.audience).toBe('https://tenant.us.auth0.com/api/v2/');
  });

  it.each([
    'https://tenant.us.auth0.com',
    'tenant.us.auth0.com/path',
    'tenant.us.auth0.com:443',
    'tenant.example.com',
  ])('rejects a malformed default tenant domain: %s', (tenantDomain) => {
    expect(() =>
      buildAuthManagementConfig({
        authConfig,
        env: {
          AUTH0_MANAGEMENT_CLIENT_ID: 'management-client',
          AUTH0_MANAGEMENT_CLIENT_SECRET: 'management-secret',
          AUTH0_TENANT_DOMAIN: tenantDomain,
        },
      }),
    ).toThrow(
      'AUTH0_TENANT_DOMAIN must contain only the default Auth0 tenant hostname.',
    );
  });
});
