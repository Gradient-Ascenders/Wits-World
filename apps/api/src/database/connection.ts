import pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import {
  classifyDatabaseError,
  emitPoolEvent,
  instrumentPool,
  poolSnapshot,
  type PoolTelemetryLogger,
} from './pool-observability.js';

const { Pool } = pg;

const defaultLogger: DatabasePoolLogger = {
  info(fields, message) {
    console.info(JSON.stringify({ ...fields, msg: message }));
  },
  error(fields, message) {
    console.error(fields, message);
  },
};

export interface DatabasePoolLogger extends PoolTelemetryLogger {
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
  { logger = defaultLogger }: CreateDatabasePoolOptions = {},
) {
  const connectionUrl = new URL(databaseConfig.connectionString);
  const sslMode = connectionUrl.searchParams.get('sslmode');
  connectionUrl.searchParams.delete('sslmode');

  const pool = new Pool({
    connectionString: connectionUrl.toString(),
    connectionTimeoutMillis: 5_000,
    // Retain no permanent connection floor. Background maintenance is spaced
    // far enough apart for this pool and a serverless database compute to idle.
    idleTimeoutMillis: 75_000,
    max: 4,
    min: 0,
    ssl:
      sslMode === null || sslMode === 'disable'
        ? false
        : { rejectUnauthorized: true },
  });

  pool.on('error', (error) => {
    emitPoolEvent(logger, {
      event: 'database_error',
      category: 'other',
      error_category: classifyDatabaseError(error, 'client'),
      ...poolSnapshot(pool),
    });
    const databaseErrorCode = getSafeDatabaseErrorCode(error);

    logger.error(
      databaseErrorCode === undefined ? {} : { databaseErrorCode },
      'An idle PostgreSQL client failed and was removed from the pool.',
    );
  });

  instrumentPool(pool, logger);
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
