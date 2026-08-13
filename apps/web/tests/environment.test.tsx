import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConfigurationErrorScreen } from '../src/components/ConfigurationErrorScreen';
import { ConfigurationError, loadWebConfig } from '../src/config/environment';

const validEnvironment = {
  VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
  VITE_AUTH0_AUDIENCE: 'https://api.wits-world.invalid',
  VITE_AUTH0_CLIENT_ID: 'public-spa-client-id',
  VITE_AUTH0_DOMAIN: 'dev-5artxfvpdennq8qm.us.auth0.com',
};

describe('web configuration', () => {
  it('rejects missing API configuration', () => {
    expect(() => loadWebConfig({})).toThrow(
      new ConfigurationError(
        'VITE_API_BASE_URL is required to start the web application.',
      ),
    );
  });

  it.each(['not-a-url', 'ftp://api.example.test'])(
    'rejects an unsupported API URL: %s',
    (apiBaseUrl) => {
      expect(() => loadWebConfig({ VITE_API_BASE_URL: apiBaseUrl })).toThrow(
        ConfigurationError,
      );
    },
  );

  it('normalises a valid HTTP API URL', () => {
    expect(
      loadWebConfig({
        ...validEnvironment,
        VITE_API_BASE_URL: ' http://localhost:3000/api/v1/ ',
      }),
    ).toEqual({
      apiBaseUrl: 'http://localhost:3000/api/v1',
      auth: {
        audience: 'https://api.wits-world.invalid',
        clientId: 'public-spa-client-id',
        domain: 'dev-5artxfvpdennq8qm.us.auth0.com',
      },
    });
  });

  it.each(['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE'])(
    'rejects missing public authentication configuration: %s',
    (key) => {
      expect(() =>
        loadWebConfig({ ...validEnvironment, [key]: undefined }),
      ).toThrow(
        new ConfigurationError(
          `${key} is required to start the web application.`,
        ),
      );
    },
  );

  it.each([
    'https://dev-5artxfvpdennq8qm.us.auth0.com',
    'dev-5artxfvpdennq8qm.us.auth0.com/path',
  ])('rejects a malformed Auth0 domain: %s', (domain) => {
    expect(() =>
      loadWebConfig({ ...validEnvironment, VITE_AUTH0_DOMAIN: domain }),
    ).toThrow(
      new ConfigurationError(
        'VITE_AUTH0_DOMAIN must be a valid Auth0 hostname without a protocol or path.',
      ),
    );
  });

  it('presents a clear setup screen when configuration is invalid', () => {
    render(
      <ConfigurationErrorScreen message="VITE_API_BASE_URL is required." />,
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Wits World is not configured yet',
      }),
    ).toBeVisible();
    expect(screen.getByText('VITE_API_BASE_URL is required.')).toBeVisible();
  });
});
