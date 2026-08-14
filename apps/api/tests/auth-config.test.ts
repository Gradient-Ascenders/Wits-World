import { describe, expect, it } from 'vitest';

import { buildAuthConfig } from '../src/config/auth.js';

const validEnvironment: NodeJS.ProcessEnv = {
  AUTH0_DOMAIN: 'dev-5artxfvpdennq8qm.us.auth0.com',
  AUTH0_AUDIENCE: 'https://api.wits-world.invalid',
  AUTH0_SPA_CLIENT_ID: 'wits-world-spa-client',
};

describe('authentication configuration', () => {
  it('builds the canonical Auth0 configuration', () => {
    const config = buildAuthConfig({
      env: validEnvironment,
    });

    expect(config).toEqual({
      domain: 'dev-5artxfvpdennq8qm.us.auth0.com',
      issuer: 'https://dev-5artxfvpdennq8qm.us.auth0.com/',
      audience: 'https://api.wits-world.invalid',
      spaClientId: 'wits-world-spa-client',
      jwksUrl: new URL(
        'https://dev-5artxfvpdennq8qm.us.auth0.com/.well-known/jwks.json',
      ),
    });
  });

  it.each(['AUTH0_DOMAIN', 'AUTH0_AUDIENCE'] as const)(
    'rejects a missing %s value',
    (variableName) => {
      const env = {
        ...validEnvironment,
      };

      delete env[variableName];

      expect(() => buildAuthConfig({ env })).toThrow(
        `${variableName} is required to start the API.`,
      );
    },
  );

  it('rejects a domain containing a scheme', () => {
    expect(() =>
      buildAuthConfig({
        env: {
          ...validEnvironment,
          AUTH0_DOMAIN: 'https://dev-5artxfvpdennq8qm.us.auth0.com',
        },
      }),
    ).toThrow('AUTH0_DOMAIN must contain only the Auth0 tenant hostname.');
  });

  it('rejects a domain containing a path', () => {
    expect(() =>
      buildAuthConfig({
        env: {
          ...validEnvironment,
          AUTH0_DOMAIN: 'dev-5artxfvpdennq8qm.us.auth0.com/example',
        },
      }),
    ).toThrow('AUTH0_DOMAIN must contain only the Auth0 tenant hostname.');
  });

  it('rejects a malformed audience', () => {
    expect(() =>
      buildAuthConfig({
        env: {
          ...validEnvironment,
          AUTH0_AUDIENCE: 'not-a-url',
        },
      }),
    ).toThrow('AUTH0_AUDIENCE must be a valid HTTPS URI.');
  });

  it('rejects a non-HTTPS audience', () => {
    expect(() =>
      buildAuthConfig({
        env: {
          ...validEnvironment,
          AUTH0_AUDIENCE: 'http://api.example.test',
        },
      }),
    ).toThrow('AUTH0_AUDIENCE must be a valid HTTPS URI.');
  });

  it('rejects a missing AUTH0_SPA_CLIENT_ID value', () => {
    expect(() =>
      buildAuthConfig({
        env: {
          AUTH0_DOMAIN: 'auth.example.test',
          AUTH0_AUDIENCE: 'https://api.example.test',
        },
      }),
    ).toThrow('AUTH0_SPA_CLIENT_ID is required to start the API.');
  });
});
