import { describe, expect, it } from 'vitest';
import { sessionConnectionHints } from '../session-connections';

describe('early session connection hints', () => {
  it('preconnects Auth0 with cookies and the API with CORS before application startup', () => {
    expect(
      sessionConnectionHints({
        VITE_AUTH0_DOMAIN: 'auth.example.test',
        VITE_API_BASE_URL: 'https://api.example.test/api/v1',
      }),
    ).toEqual([
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: 'https://auth.example.test' },
        injectTo: 'head',
      },
      {
        tag: 'link',
        attrs: {
          rel: 'preconnect',
          href: 'https://api.example.test',
          crossorigin: 'anonymous',
        },
        injectTo: 'head',
      },
    ]);
  });
  it('never copies paths, query strings or credentials into connection hints', () => {
    expect(
      sessionConnectionHints({
        VITE_API_BASE_URL:
          'https://api.example.test/api/v1?private=value#fragment',
      })[0]?.attrs?.href,
    ).toBe('https://api.example.test');
    expect(
      sessionConnectionHints({
        VITE_API_BASE_URL: 'https://name:password@api.example.test/api/v1',
      }),
    ).toEqual([]);
  });
  it.each([
    'https://auth.example.test/path',
    'auth.example.test/path',
    'auth.example.test?query=value',
    'name@auth.example.test',
    'auth.example.test#fragment',
  ])('ignores an invalid Auth0 hostname: %s', (domain) => {
    expect(sessionConnectionHints({ VITE_AUTH0_DOMAIN: domain })).toEqual([]);
  });
  it.each(['javascript:alert(1)', 'not a url', '', undefined])(
    'ignores missing or invalid API configuration',
    (api) => {
      expect(sessionConnectionHints({ VITE_API_BASE_URL: api })).toEqual([]);
    },
  );
});
