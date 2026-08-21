import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDatabasePool,
  type DatabasePoolLogger,
} from '../src/database/connection.js';

const databaseConfig = {
  connectionString:
    'postgresql://database-user:database-password@database.example.test/wits_world?sslmode=require',
  target: 'development',
  variableName: 'DATABASE_URL',
} as const;

describe('database connection pool', () => {
  const pools: ReturnType<typeof createDatabasePool>[] = [];

  afterEach(async () => {
    await Promise.all(pools.map(async (pool) => pool.end()));
    pools.length = 0;
  });

  it('retains idle connections across the normal background-worker interval', () => {
    const pool = createPool();

    expect(pool.options).toMatchObject({
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 75_000,
      max: 4,
      min: 0,
      ssl: {
        rejectUnauthorized: true,
      },
    });
  });

  it('handles idle-client errors without logging the error or client', () => {
    const logger: DatabasePoolLogger = {
      error: vi.fn(),
    };
    const pool = createPool(logger);
    const credential = 'must-not-be-logged';
    const error = Object.assign(new Error(`password=${credential}`), {
      code: 'ECONNRESET',
      connectionString: `postgresql://user:${credential}@database.example.test/wits_world`,
    });
    const idleClient = {
      password: credential,
    };

    expect(() => {
      pool.emit('error', error, idleClient as never);
    }).not.toThrow();

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      { databaseErrorCode: 'ECONNRESET' },
      'An idle PostgreSQL client failed and was removed from the pool.',
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      credential,
    );
  });

  it('shuts down the pool gracefully', async () => {
    const pool = createPool();

    await expect(pool.end()).resolves.toBeUndefined();

    expect(pool.ended).toBe(true);
    pools.pop();
  });

  function createPool(logger?: DatabasePoolLogger) {
    const pool = createDatabasePool(databaseConfig, { logger });
    pools.push(pool);
    return pool;
  }
});
