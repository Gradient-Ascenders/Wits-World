import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';

export type DatabaseTarget = 'development' | 'production' | 'test';

export interface DatabaseConfig {
  connectionString: string;
  target: DatabaseTarget;
  variableName: 'DATABASE_URL' | 'TEST_DATABASE_URL';
}

interface DatabaseIdentity {
  databasePath: string;
  hostname: string;
  port: string;
}

interface BuildDatabaseConfigOptions {
  env?: NodeJS.ProcessEnv;
  target?: DatabaseTarget;
}

export function loadApiEnvironment(cwd = process.cwd()) {
  for (const envFile of [resolve(cwd, '.env'), resolve(cwd, 'apps/api/.env')]) {
    if (existsSync(envFile)) {
      loadDotenv({ path: envFile, override: false, quiet: true });
    }
  }
}

export function buildDatabaseConfig({
  env = process.env,
  target = 'development',
}: BuildDatabaseConfigOptions = {}): DatabaseConfig {
  const variableName = target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const connectionString = env[variableName]?.trim();

  if (!connectionString) {
    throw new Error(
      `${variableName} is required for ${target} database access.`,
    );
  }

  const parsedUrl = parsePostgresConnectionString(
    connectionString,
    variableName,
  );

  if (target === 'test') {
    const developmentConnectionString = env.DATABASE_URL?.trim();

    if (!developmentConnectionString) {
      throw new Error(
        'DATABASE_URL is required to verify TEST_DATABASE_URL uses a separate database.',
      );
    }

    const developmentUrl = parsePostgresConnectionString(
      developmentConnectionString,
      'DATABASE_URL',
    );

    if (sameDatabaseIdentity(parsedUrl, developmentUrl)) {
      throw new Error(
        'TEST_DATABASE_URL must use a different host, port, or database from DATABASE_URL.',
      );
    }
  }

  return {
    connectionString,
    target,
    variableName,
  };
}

function parsePostgresConnectionString(
  connectionString: string,
  variableName: string,
): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error(
      `${variableName} must be a valid PostgreSQL connection URL.`,
    );
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error(
      `${variableName} must use the postgres:// or postgresql:// protocol.`,
    );
  }

  if (isNeonHostname(parsedUrl.hostname)) {
    if (!parsedUrl.searchParams.has('sslmode')) {
      throw new Error(
        `${variableName} must include sslmode=require for Neon connections.`,
      );
    }

    if (parsedUrl.searchParams.get('sslmode') !== 'require') {
      throw new Error(
        `${variableName} must set sslmode=require for Neon connections.`,
      );
    }
  }

  return parsedUrl;
}

function isNeonHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/u, '');
  return (
    normalizedHostname === 'neon.tech' ||
    normalizedHostname.endsWith('.neon.tech')
  );
}

function sameDatabaseIdentity(left: URL, right: URL) {
  const leftIdentity = getDatabaseIdentity(left);
  const rightIdentity = getDatabaseIdentity(right);

  return (
    leftIdentity.hostname === rightIdentity.hostname &&
    leftIdentity.port === rightIdentity.port &&
    leftIdentity.databasePath === rightIdentity.databasePath
  );
}

function getDatabaseIdentity(connectionUrl: URL): DatabaseIdentity {
  return {
    databasePath: decodeURIComponent(connectionUrl.pathname),
    hostname: connectionUrl.hostname.toLowerCase(),
    port: connectionUrl.port || '5432',
  };
}
