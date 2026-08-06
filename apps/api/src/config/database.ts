import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';

export type DatabaseTarget = 'development' | 'test';

export interface DatabaseConfig {
  connectionString: string;
  target: DatabaseTarget;
  variableName: 'DATABASE_URL' | 'TEST_DATABASE_URL';
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

  validatePostgresConnectionString(connectionString, variableName);

  if (target === 'test' && env.DATABASE_URL === connectionString) {
    throw new Error('TEST_DATABASE_URL must not match DATABASE_URL.');
  }

  return {
    connectionString,
    target,
    variableName,
  };
}

function validatePostgresConnectionString(
  connectionString: string,
  variableName: string,
) {
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
