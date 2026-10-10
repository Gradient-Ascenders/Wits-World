import { afterEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

import {
  createDatabasePool,
  createListenerDatabasePool,
  type DatabasePoolLogger,
  withDatabaseClient,
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
    vi.restoreAllMocks();
  });

  it('ends a maintenance pool when connection acquisition fails', async () => {
    vi.spyOn(pg.Pool.prototype, 'connect').mockRejectedValue(
      new Error('connection failed'),
    );
    const end = vi.spyOn(pg.Pool.prototype, 'end').mockResolvedValue(undefined);
    const callback = vi.fn();
    await expect(withDatabaseClient(databaseConfig, callback)).rejects.toThrow(
      'connection failed',
    );
    expect(callback).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'destroys a maintenance session and ends its pool after callback failure=%s',
    async (fail) => {
      const release = vi.fn();
      vi.spyOn(pg.Pool.prototype, 'connect').mockImplementation(
        async () =>
          ({
            release,
          }) as unknown as pg.PoolClient,
      );
      const end = vi
        .spyOn(pg.Pool.prototype, 'end')
        .mockResolvedValue(undefined);
      const work = withDatabaseClient(databaseConfig, async () => {
        if (fail) throw new Error('query failed');
        return 'completed';
      });
      if (fail) await expect(work).rejects.toThrow('query failed');
      else await expect(work).resolves.toBe('completed');
      expect(release).toHaveBeenCalledWith(true);
      expect(end).toHaveBeenCalledOnce();
    },
  );

  it('isolates the max-one listener pool with unchanged TLS and acquisition settings', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const pool = createListenerDatabasePool(
      {
        connectionString: databaseConfig.connectionString,
        variableName: 'LISTENER_DATABASE_URL',
      },
      { logger },
    );
    pools.push(pool);
    expect(pool.options).toMatchObject({
      max: 1,
      min: 0,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 75_000,
      ssl: { rejectUnauthorized: true },
    });
    pool.emit('error', new Error('private-marker'));
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'database_error',
        pool_role: 'listener',
      }),
      'PostgreSQL pool observation',
    );
    await pool.end();
    pools.pop();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pool_shutdown',
        pool_role: 'listener',
        active_holds_count: 0,
      }),
      'PostgreSQL pool observation',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'private-marker',
    );
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

  it('does not enable TLS for a local connection without an SSL mode', () => {
    const pool = createDatabasePool({
      ...databaseConfig,
      connectionString:
        'postgresql://wits_world_ci:password@postgres:5432/wits_world_test',
    });
    pools.push(pool);

    expect(pool.options.ssl).toBe(false);
  });

  it('does not enable TLS when SSL is explicitly disabled', () => {
    const pool = createDatabasePool({
      ...databaseConfig,
      connectionString:
        'postgresql://wits_world_ci:password@postgres:5432/wits_world_test?sslmode=disable',
    });
    pools.push(pool);

    expect(pool.options.ssl).toBe(false);
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

  it('preserves callback pool shutdown and labels the completed shared pool', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const pool = createPool(logger);
    await new Promise<void>((resolve) => {
      pool.end(resolve);
    });
    pools.pop();
    expect(pool.ended).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pool_shutdown',
        pool_role: 'shared',
        active_holds_count: 0,
      }),
      'PostgreSQL pool observation',
    );
  });

  function createPool(logger?: DatabasePoolLogger) {
    const pool = createDatabasePool(databaseConfig, { logger });
    pools.push(pool);
    return pool;
  }
});
