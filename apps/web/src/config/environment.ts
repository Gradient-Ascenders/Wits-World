export interface WebConfig {
  apiBaseUrl: string;
}

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

type PublicEnvironment = Record<string, boolean | string | undefined>;

export function loadWebConfig(environment: PublicEnvironment): WebConfig {
  const rawApiBaseUrl = environment.VITE_API_BASE_URL;

  if (typeof rawApiBaseUrl !== 'string' || rawApiBaseUrl.trim() === '') {
    throw new ConfigurationError(
      'VITE_API_BASE_URL is required to start the web application.',
    );
  }

  const apiBaseUrl = rawApiBaseUrl.trim();
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

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
  };
}
