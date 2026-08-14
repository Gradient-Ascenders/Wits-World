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

  const tenantBaseUrl = new URL(authConfig.issuer);
  const apiBaseUrl = new URL('/api/v2/', tenantBaseUrl);

  return {
    clientId,
    clientSecret,
    tokenUrl: new URL('/oauth/token', tenantBaseUrl),
    apiBaseUrl,
    audience: apiBaseUrl.toString(),
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
