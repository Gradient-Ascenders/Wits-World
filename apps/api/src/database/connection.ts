import pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';

const { Pool } = pg;

export interface DatabasePoolLogger {
  error(context: Record<string, unknown>, message: string): void;
}

interface CreateDatabasePoolOptions {
  logger?: DatabasePoolLogger;
}

export type DatabaseClientRunner = <T>(
  databaseConfig: DatabaseConfig,
  callback: (client: pg.PoolClient) => Promise<T>,
) => Promise<T>;

export function createDatabasePool(
  databaseConfig: DatabaseConfig,
  { logger = console }: CreateDatabasePoolOptions = {},
) {
  const connectionUrl = new URL(databaseConfig.connectionString);
  connectionUrl.searchParams.delete('sslmode');

  const pool = new Pool({
    connectionString: connectionUrl.toString(),
    connectionTimeoutMillis: 5_000,
    // The shared API pool serves a worker every 60 seconds. Keep released
    // clients through the next normal sweep, but retain no permanent floor so
    // the pool can still drain when legitimate database activity stops.
    idleTimeoutMillis: 75_000,
    max: 4,
    min: 0,
    ssl: {
      rejectUnauthorized: true,
    },
  });

  pool.on('error', (error) => {
    const databaseErrorCode = getSafeDatabaseErrorCode(error);

    logger.error(
      databaseErrorCode === undefined ? {} : { databaseErrorCode },
      'An idle PostgreSQL client failed and was removed from the pool.',
    );
  });

  return pool;
}

export const withDatabaseClient: DatabaseClientRunner = async <T>(
  databaseConfig: DatabaseConfig,
  callback: (client: pg.PoolClient) => Promise<T>,
) => {
  const pool = createDatabasePool(databaseConfig);
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
    await pool.end();
  }
};

function getSafeDatabaseErrorCode(error: Error): string | undefined {
  const code = (error as NodeJS.ErrnoException).code;

  return typeof code === 'string' && /^[A-Z0-9_]{1,20}$/.test(code)
    ? code
    : undefined;
}
