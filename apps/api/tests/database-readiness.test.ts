import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../src/config/database.js';
import type { DatabaseClientRunner } from '../src/database/connection.js';
import { checkDatabaseReadiness } from '../src/database/readiness.js';

const databaseConfig: DatabaseConfig = {
  connectionString:
    'postgresql://owner:password@database.test/neondb?sslmode=require',
  target: 'test',
  variableName: 'TEST_DATABASE_URL',
};

describe('database readiness', () => {
  it('queries the connection and PostGIS versions', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            database: 'neondb',
            server_version: 'PostgreSQL 17',
            user: 'neondb_owner',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ postgis_version: 'POSTGIS="3.5.0"' }],
      });
    const runWithClient = createClientRunner(query);

    await expect(
      checkDatabaseReadiness(databaseConfig, runWithClient),
    ).resolves.toEqual({
      database: 'neondb',
      postgisVersion: 'POSTGIS="3.5.0"',
      serverVersion: 'PostgreSQL 17',
      user: 'neondb_owner',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('current_database()'),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'select postgis_full_version() as postgis_version',
    );
  });

  it('rejects readiness responses with no connection row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      checkDatabaseReadiness(databaseConfig, createClientRunner(query)),
    ).rejects.toThrow('Database readiness query returned no rows.');
  });

  it('reports an unavailable database connection', async () => {
    const unavailableRunner: DatabaseClientRunner = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    await expect(
      checkDatabaseReadiness(databaseConfig, unavailableRunner),
    ).rejects.toThrow('connect ECONNREFUSED');
  });
});

function createClientRunner(query: ReturnType<typeof vi.fn>) {
  const client = { query } as unknown as pg.PoolClient;

  const runWithClient: DatabaseClientRunner = async (
    _databaseConfig,
    callback,
  ) => callback(client);

  return runWithClient;
}
