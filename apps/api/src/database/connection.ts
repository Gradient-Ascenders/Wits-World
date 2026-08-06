import pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';

const { Pool } = pg;

export type DatabaseClientRunner = <T>(
  databaseConfig: DatabaseConfig,
  callback: (client: pg.PoolClient) => Promise<T>,
) => Promise<T>;

export function createDatabasePool(databaseConfig: DatabaseConfig) {
  const connectionUrl = new URL(databaseConfig.connectionString);
  connectionUrl.searchParams.delete('sslmode');

  return new Pool({
    connectionString: connectionUrl.toString(),
    connectionTimeoutMillis: 5_000,
    max: 4,
    ssl: {
      rejectUnauthorized: true,
    },
  });
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
