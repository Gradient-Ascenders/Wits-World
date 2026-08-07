export interface AuthConfig {
  domain: string;
  issuer: string;
  audience: string;
  jwksUrl: URL;
}

interface BuildAuthConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export function buildAuthConfig({
  env = process.env,
}: BuildAuthConfigOptions = {}): AuthConfig {
  const domain = requireEnvironmentValue(env, 'AUTH0_DOMAIN');
  const audience = requireEnvironmentValue(env, 'AUTH0_AUDIENCE');

  const domainUrl = parseAuth0Domain(domain);
  validateAudience(audience);

  const issuer = domainUrl.toString();

  return {
    domain,
    issuer,
    audience,
    jwksUrl: new URL('.well-known/jwks.json', issuer),
  };
}

function requireEnvironmentValue(
  env: NodeJS.ProcessEnv,
  variableName: string,
): string {
  const value = env[variableName]?.trim();

  if (!value) {
    throw new Error(`${variableName} is required to start the API.`);
  }

  return value;
}

function parseAuth0Domain(domain: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(`https://${domain}/`);
  } catch {
    throw new Error(
      'AUTH0_DOMAIN must contain only the Auth0 tenant hostname.',
    );
  }

  const isHostnameOnly =
    parsedUrl.protocol === 'https:' &&
    parsedUrl.hostname === domain.toLowerCase() &&
    parsedUrl.port === '' &&
    parsedUrl.pathname === '/' &&
    parsedUrl.search === '' &&
    parsedUrl.hash === '';

  if (!isHostnameOnly) {
    throw new Error(
      'AUTH0_DOMAIN must contain only the Auth0 tenant hostname.',
    );
  }

  return parsedUrl;
}

function validateAudience(audience: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(audience);
  } catch {
    throw new Error('AUTH0_AUDIENCE must be a valid HTTPS URI.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('AUTH0_AUDIENCE must be a valid HTTPS URI.');
  }
}
