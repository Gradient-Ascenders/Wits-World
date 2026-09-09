import { createHash } from 'node:crypto';
import { URL } from 'node:url';

const supportedProfiles = new Set(['nightly', 'release']);

export function resolveVerificationProfile(arguments_) {
  const profileIndex = arguments_.indexOf('--profile');
  const profile =
    profileIndex === -1 ? undefined : arguments_[profileIndex + 1];

  if (!profile || !supportedProfiles.has(profile)) {
    throw new Error(
      'A verification profile of nightly or release is required.',
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
  const expectedIdentity = requireValue(
    env.TEST_DATABASE_IDENTITY_SHA256,
    'TEST_DATABASE_IDENTITY_SHA256 is required to confirm the dedicated test target.',
  );

  if (!/^[0-9a-f]{64}$/u.test(expectedIdentity)) {
    throw new Error(
      'TEST_DATABASE_IDENTITY_SHA256 must be a lowercase SHA-256 digest.',
    );
  }

  if (isNeonPooledEndpoint(testUrl)) {
    throw new Error(
      'TEST_DATABASE_URL must use a direct Neon endpoint; pooled endpoints cannot hold the verification session lock.',
    );
  }

  if (sameDatabaseIdentity(testUrl, guardUrl)) {
    throw new Error(
      'TEST_DATABASE_URL must not identify the DATABASE_URL database.',
    );
  }

  const databaseName = decodeDatabaseName(testUrl);
  if (databaseTargetIdentitySha256(testUrl) !== expectedIdentity) {
    throw new Error(
      'TEST_DATABASE_URL does not match the repository-approved dedicated test target.',
    );
  }

  return {
    connectionString: testUrl.toString(),
    databaseName,
    hostname: testUrl.hostname.toLowerCase(),
  };
}

export function databaseTargetIdentitySha256(urlOrString) {
  const url =
    urlOrString instanceof URL
      ? urlOrString
      : requirePostgresUrl(urlOrString, 'PostgreSQL URL');
  const identity = `${url.hostname.toLowerCase()}:${url.port || '5432'}/${decodeDatabaseName(url)}`;
  return createHash('sha256').update(identity).digest('hex');
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

export function confirmAdvisoryUnlock(result) {
  if (result.rowCount !== 1 || result.rows[0]?.unlocked !== true) {
    throw new Error(
      'The verification advisory lock was not held by this session.',
    );
  }
}

function isNeonPooledEndpoint(url) {
  return url.hostname.split('.')[0]?.endsWith('-pooler') === true;
}
