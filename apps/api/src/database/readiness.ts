import type pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';

export interface DatabaseReadiness {
  database: string;
  user: string;
  serverVersion: string;
  postgisVersion: string;
}

export async function checkDatabaseReadiness(
  databaseConfig: DatabaseConfig,
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<DatabaseReadiness> {
  return runWithClient(databaseConfig, async (client) => {
    const connection = await client.query<{
      database: string;
      user: string;
      server_version: string;
    }>(
      `select current_database() as database,
              current_user as "user",
              version() as server_version`,
    );

    const postgis = await client.query<{ postgis_version: string }>(
      'select postgis_full_version() as postgis_version',
    );

    return {
      database: requireSingleRow(connection).database,
      user: requireSingleRow(connection).user,
      serverVersion: requireSingleRow(connection).server_version,
      postgisVersion: requireSingleRow(postgis).postgis_version,
    };
  });
}

function requireSingleRow<T extends pg.QueryResultRow>(
  result: pg.QueryResult<T>,
) {
  const row = result.rows[0];

  if (!row) {
    throw new Error('Database readiness query returned no rows.');
  }

  return row;
}
