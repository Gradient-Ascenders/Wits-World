const CANONICAL_PRODUCTION_ORIGIN = 'https://witsworld.co.za';
const ALTERNATE_PRODUCTION_HOSTNAME = 'www.witsworld.co.za';

interface BrowserLocation {
  readonly hash: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly search: string;
  replace(url: string): void;
}

export function redirectToCanonicalHost(location: BrowserLocation): boolean {
  if (location.hostname !== ALTERNATE_PRODUCTION_HOSTNAME) {
    return false;
  }

  location.replace(
    `${CANONICAL_PRODUCTION_ORIGIN}${location.pathname}${location.search}${location.hash}`,
  );
  return true;
}
