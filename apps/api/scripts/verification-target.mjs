import { URL } from 'node:url';

const supportedProfiles = new Set(['pr', 'nightly', 'release']);

export function resolveVerificationProfile(arguments_) {
  const profileIndex = arguments_.indexOf('--profile');
  const profile =
    profileIndex === -1 ? undefined : arguments_[profileIndex + 1];

  if (!profile || !supportedProfiles.has(profile)) {
    throw new Error(
      'A verification profile of pr, nightly, or release is required.',
    );
  }

  return profile;
}

export function validateTestDatabaseEnvironment(env) {
  const testUrl = requirePostgresUrl(
    env.TEST_DATABASE_URL,
    'TEST_DATABASE_URL',
  );
  const guardUrl = requirePostgresUrl(env.DATABASE_URL, 'DATABASE_URL');
  const expectedHost = requireValue(
    env.TEST_DATABASE_HOST,
    'TEST_DATABASE_HOST is required to confirm the dedicated test target.',
  ).toLowerCase();
  const expectedDatabase = requireValue(
    env.TEST_DATABASE_NAME,
    'TEST_DATABASE_NAME is required to confirm the dedicated test target.',
  );

  if (sameDatabaseIdentity(testUrl, guardUrl)) {
    throw new Error(
      'TEST_DATABASE_URL must not identify the DATABASE_URL database.',
    );
  }

  if (testUrl.hostname.toLowerCase() !== expectedHost) {
    throw new Error(
      'TEST_DATABASE_URL does not match the configured test database host.',
    );
  }

  const databaseName = decodeDatabaseName(testUrl);
  if (databaseName !== expectedDatabase) {
    throw new Error(
      'TEST_DATABASE_URL does not match the configured test database name.',
    );
  }

  return {
    connectionString: testUrl.toString(),
    databaseName,
    hostname: testUrl.hostname.toLowerCase(),
  };
}

export function validateReleaseCommit(profile, env, headCommit) {
  if (profile !== 'release') return;

  const expectedCommit = env.RELEASE_COMMIT_SHA?.trim();
  if (!expectedCommit || !/^[0-9a-f]{40}$/u.test(expectedCommit)) {
    throw new Error(
      'RELEASE_COMMIT_SHA must be the full lowercase commit SHA for a release gate.',
    );
  }

  if (headCommit !== expectedCommit) {
    throw new Error(
      'The checked-out commit does not match RELEASE_COMMIT_SHA.',
    );
  }
}

function requirePostgresUrl(value, variableName) {
  const configuredValue = requireValue(
    value,
    `${variableName} is required for verification.`,
  );
  let url;

  try {
    url = new URL(configuredValue);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${variableName} must use the PostgreSQL URL protocol.`);
  }

  decodeDatabaseName(url);
  return url;
}

function requireValue(value, errorMessage) {
  const configuredValue = value?.trim();
  if (!configuredValue) throw new Error(errorMessage);
  return configuredValue;
}

function decodeDatabaseName(url) {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('The PostgreSQL URL must identify exactly one database.');
  }
  return databaseName;
}

function sameDatabaseIdentity(left, right) {
  return (
    left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
    (left.port || '5432') === (right.port || '5432') &&
    decodeDatabaseName(left) === decodeDatabaseName(right)
  );
}
