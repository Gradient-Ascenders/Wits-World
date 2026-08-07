import { describe, expect, it } from 'vitest';

import { buildCorsConfig } from '../src/config/cors.js';

describe('CORS configuration', () => {
  it('accepts the local Wits World web origin', () => {
    expect(
      buildCorsConfig({
        env: {
          CORS_ALLOWED_ORIGIN: 'http://localhost:5173',
        },
      }),
    ).toEqual({
      allowedOrigin: 'http://localhost:5173',
    });
  });

  it('requires an allowed origin', () => {
    expect(() =>
      buildCorsConfig({
        env: {},
      }),
    ).toThrow('CORS_ALLOWED_ORIGIN is required to start the API.');
  });

  it.each(['*', 'https://*.example.com'])(
    'rejects wildcard origin %s',
    (allowedOrigin) => {
      expect(() =>
        buildCorsConfig({
          env: {
            CORS_ALLOWED_ORIGIN: allowedOrigin,
          },
        }),
      ).toThrow('CORS_ALLOWED_ORIGIN must not contain a wildcard.');
    },
  );

  it.each([
    'not-a-url',
    'file:///tmp/example',
    'https://example.com/path',
    'https://example.com?test=1',
    'https://user:password@example.com',
  ])('rejects malformed origin %s', (allowedOrigin) => {
    expect(() =>
      buildCorsConfig({
        env: {
          CORS_ALLOWED_ORIGIN: allowedOrigin,
        },
      }),
    ).toThrow();
  });
});
