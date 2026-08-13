export interface WebConfig {
  apiBaseUrl: string;
  auth: AuthConfig;
  mapboxAccessToken: string;
}

export interface AuthConfig {
  audience: string;
  clientId: string;
  domain: string;
}

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

type PublicEnvironment = Record<string, boolean | string | undefined>;

function readRequiredValue(
  environment: PublicEnvironment,
  key: string,
): string {
  const value = environment[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigurationError(
      `${key} is required to start the web application.`,
    );
  }

  return value.trim();
}

function validateAuth0Domain(domain: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(`https://${domain}`);
  } catch {
    throw new ConfigurationError(
      'VITE_AUTH0_DOMAIN must be a valid Auth0 hostname without a protocol or path.',
    );
  }

  if (
    parsedUrl.hostname !== domain ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new ConfigurationError(
      'VITE_AUTH0_DOMAIN must be a valid Auth0 hostname without a protocol or path.',
    );
  }

  return domain;
}

function validateMapboxAccessToken(token: string): string {
  if (!token.startsWith('pk.')) {
    throw new ConfigurationError(
      'VITE_MAPBOX_ACCESS_TOKEN must be a public Mapbox pk. token.',
    );
  }

  return token;
}

export function loadWebConfig(environment: PublicEnvironment): WebConfig {
  const apiBaseUrl = readRequiredValue(environment, 'VITE_API_BASE_URL');
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(apiBaseUrl);
  } catch {
    throw new ConfigurationError(
      'VITE_API_BASE_URL must be a valid HTTP or HTTPS URL.',
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ConfigurationError(
      'VITE_API_BASE_URL must use the HTTP or HTTPS protocol.',
    );
  }

  const domain = validateAuth0Domain(
    readRequiredValue(environment, 'VITE_AUTH0_DOMAIN'),
  );
  const clientId = readRequiredValue(environment, 'VITE_AUTH0_CLIENT_ID');
  const audience = readRequiredValue(environment, 'VITE_AUTH0_AUDIENCE');
  const mapboxAccessToken = validateMapboxAccessToken(
    readRequiredValue(environment, 'VITE_MAPBOX_ACCESS_TOKEN'),
  );

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    auth: {
      audience,
      clientId,
      domain,
    },
    mapboxAccessToken,
  };
}
