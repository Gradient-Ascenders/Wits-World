export const apiLogLevels = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type ApiLogLevel = (typeof apiLogLevels)[number];

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: ApiLogLevel;
  accountDeletionRetryIntervalMs: number;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
}

interface BuildApiConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export function buildApiConfig({
  env = process.env,
}: BuildApiConfigOptions = {}): ApiConfig {
  const host = requireEnvironmentValue(env, 'HOST');
  const portValue = requireEnvironmentValue(env, 'PORT');
  const logLevelValue = requireEnvironmentValue(env, 'LOG_LEVEL');

  const port = Number(portValue);

  const accountDeletionRetryIntervalValue =
    env.ACCOUNT_DELETION_RETRY_INTERVAL_MS?.trim() ?? '60000';

  const accountDeletionRetryIntervalMs = Number(
    accountDeletionRetryIntervalValue,
  );
  const rateLimitMaxRequests = Number(
    env.RATE_LIMIT_MAX_REQUESTS?.trim() ?? '120',
  );
  const rateLimitWindowMs = Number(env.RATE_LIMIT_WINDOW_MS?.trim() ?? '60000');

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  if (!isApiLogLevel(logLevelValue)) {
    throw new Error(`LOG_LEVEL must be one of: ${apiLogLevels.join(', ')}.`);
  }

  if (
    !Number.isInteger(accountDeletionRetryIntervalMs) ||
    accountDeletionRetryIntervalMs < 1000
  ) {
    throw new Error(
      'ACCOUNT_DELETION_RETRY_INTERVAL_MS must be an integer of at least 1000 milliseconds.',
    );
  }

  if (!Number.isInteger(rateLimitMaxRequests) || rateLimitMaxRequests < 1) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be a positive integer.');
  }

  if (!Number.isInteger(rateLimitWindowMs) || rateLimitWindowMs < 1000) {
    throw new Error(
      'RATE_LIMIT_WINDOW_MS must be an integer of at least 1000 milliseconds.',
    );
  }

  return {
    host,
    port,
    logLevel: logLevelValue,
    accountDeletionRetryIntervalMs,
    rateLimitMaxRequests,
    rateLimitWindowMs,
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

function isApiLogLevel(value: string): value is ApiLogLevel {
  return apiLogLevels.includes(value as ApiLogLevel);
}
