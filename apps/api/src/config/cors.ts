export interface CorsConfig {
  allowedOrigin: string;
}

interface BuildCorsConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export function buildCorsConfig({
  env = process.env,
}: BuildCorsConfigOptions = {}): CorsConfig {
  const allowedOrigin = env.CORS_ALLOWED_ORIGIN?.trim();

  if (!allowedOrigin) {
    throw new Error('CORS_ALLOWED_ORIGIN is required to start the API.');
  }

  if (allowedOrigin.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGIN must not contain a wildcard.');
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(allowedOrigin);
  } catch {
    throw new Error(
      'CORS_ALLOWED_ORIGIN must be a valid HTTP or HTTPS origin.',
    );
  }

  if (
    !['http:', 'https:'].includes(parsedOrigin.protocol) ||
    parsedOrigin.username !== '' ||
    parsedOrigin.password !== '' ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search !== '' ||
    parsedOrigin.hash !== '' ||
    parsedOrigin.origin === 'null'
  ) {
    throw new Error(
      'CORS_ALLOWED_ORIGIN must be a valid HTTP or HTTPS origin without credentials, path, query, or fragment.',
    );
  }

  return {
    allowedOrigin: parsedOrigin.origin,
  };
}
