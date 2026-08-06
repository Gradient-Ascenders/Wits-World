import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConfigurationErrorScreen } from '../src/components/ConfigurationErrorScreen';
import { ConfigurationError, loadWebConfig } from '../src/config/environment';

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
      loadWebConfig({ VITE_API_BASE_URL: ' http://localhost:3000/api/v1/ ' }),
    ).toEqual({
      apiBaseUrl: 'http://localhost:3000/api/v1',
    });
  });

  it('presents a clear setup screen when configuration is invalid', () => {
    render(
      <ConfigurationErrorScreen message="VITE_API_BASE_URL is required." />,
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Wits Quest is not configured yet',
      }),
    ).toBeVisible();
    expect(screen.getByText('VITE_API_BASE_URL is required.')).toBeVisible();
  });
});
