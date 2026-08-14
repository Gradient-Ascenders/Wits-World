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
}

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: ApiLogLevel;
  accountDeletionRetryIntervalMs: number;
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

  return {
    host,
    port,
    logLevel: logLevelValue,
    accountDeletionRetryIntervalMs,
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
