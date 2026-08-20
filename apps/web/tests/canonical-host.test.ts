import { describe, expect, it, vi } from 'vitest';

import { redirectToCanonicalHost } from '../src/canonical-host';

describe('canonical production host redirect', () => {
  it('redirects the www production hostname to the apex origin', () => {
    const location = createLocation({ hostname: 'www.witsworld.co.za' });

    expect(redirectToCanonicalHost(location)).toBe(true);
    expect(location.replace).toHaveBeenCalledWith('https://witsworld.co.za/');
  });

  it('preserves the path, query string, and fragment', () => {
    const location = createLocation({
      hash: '#x',
      hostname: 'www.witsworld.co.za',
      pathname: '/decks',
      search: '?foo=bar',
    });

    expect(redirectToCanonicalHost(location)).toBe(true);
    expect(location.replace).toHaveBeenCalledWith(
      'https://witsworld.co.za/decks?foo=bar#x',
    );
  });

  it('does not redirect the canonical production hostname', () => {
    const location = createLocation({ hostname: 'witsworld.co.za' });

    expect(redirectToCanonicalHost(location)).toBe(false);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each([
    'localhost',
    '127.0.0.1',
    'witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net',
    'e2e.witsworld.co.za',
    'www.witsworld.co.za.example.com',
  ])('does not redirect the non-production hostname %s', (hostname) => {
    const location = createLocation({ hostname });

    expect(redirectToCanonicalHost(location)).toBe(false);
    expect(location.replace).not.toHaveBeenCalled();
  });
});

interface TestLocation {
  hash: string;
  hostname: string;
  pathname: string;
  replace: (url: string) => void;
  search: string;
}

function createLocation(overrides: Partial<TestLocation> = {}): TestLocation {
  return {
    hash: '',
    hostname: 'localhost',
    pathname: '/',
    replace: vi.fn<(url: string) => void>(),
    search: '',
    ...overrides,
  };
}
