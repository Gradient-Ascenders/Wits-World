import type { AuthConfig } from './auth.js';

export interface AuthManagementConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: URL;
  apiBaseUrl: URL;
  audience: string;
}

interface BuildAuthManagementConfigOptions {
  authConfig: AuthConfig;
  env?: NodeJS.ProcessEnv;
}

export function buildAuthManagementConfig({
  authConfig,
  env = process.env,
}: BuildAuthManagementConfigOptions): AuthManagementConfig {
  const clientId = requireEnvironmentValue(env, 'AUTH0_MANAGEMENT_CLIENT_ID');
  const clientSecret = requireEnvironmentValue(
    env,
    'AUTH0_MANAGEMENT_CLIENT_SECRET',
  );
  const tenantDomain = readTenantDomain(authConfig, env);

  const requestBaseUrl = new URL(authConfig.issuer);
  const apiBaseUrl = new URL('/api/v2/', requestBaseUrl);

  return {
    clientId,
    clientSecret,
    tokenUrl: new URL('/oauth/token', requestBaseUrl),
    apiBaseUrl,
    audience: new URL('/api/v2/', `https://${tenantDomain}/`).toString(),
  };
}

function readTenantDomain(
  authConfig: AuthConfig,
  env: NodeJS.ProcessEnv,
): string {
  const configuredDomain = env.AUTH0_TENANT_DOMAIN?.trim();

  if (!configuredDomain) {
    if (authConfig.domain.endsWith('.auth0.com')) {
      return authConfig.domain;
    }

    throw new Error(
      'AUTH0_TENANT_DOMAIN is required when AUTH0_DOMAIN is a custom domain.',
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(`https://${configuredDomain}/`);
  } catch {
    throw new Error(
      'AUTH0_TENANT_DOMAIN must contain only the default Auth0 tenant hostname.',
    );
  }

  if (
    parsedUrl.hostname !== configuredDomain.toLowerCase() ||
    !parsedUrl.hostname.endsWith('.auth0.com') ||
    parsedUrl.port !== '' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new Error(
      'AUTH0_TENANT_DOMAIN must contain only the default Auth0 tenant hostname.',
    );
  }

  return configuredDomain;
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
