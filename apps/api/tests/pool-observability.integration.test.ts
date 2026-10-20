import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
} from '../src/config/database.js';
import { createDatabasePool } from '../src/database/connection.js';
import {
  poolSnapshot,
  withPoolObservation,
} from '../src/database/pool-observability.js';

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'real disposable PostgreSQL pool observations',
  () => {
    it('leaves three native slots available while routine work queues fairly', async () => {
      loadApiEnvironment();
      const pool = createDatabasePool(buildDatabaseConfig({ target: 'test' }), {
        logger: { info: vi.fn(), error: vi.fn() },
      });
      const held: pg.PoolClient[] = [];
      let queued: Promise<pg.PoolClient> | undefined;
      try {
        held.push(
          await withPoolObservation('trust_evaluation', () => pool.connect()),
        );
        queued = withPoolObservation('movement_retention', () =>
          pool.connect(),
        );
        const callback = vi.fn();
        void queued.then(callback);
        for (const category of [
          'request',
          'live_deadline',
          'async_pvp_deadline',
        ] as const) {
          held.push(await withPoolObservation(category, () => pool.connect()));
        }
        expect(pool.options.max).toBe(4);
        expect(pool.totalCount).toBe(4);
        expect(callback).not.toHaveBeenCalled();
        held.shift()!.release();
        const next = await queued;
        queued = undefined;
        held.push(next);
        expect((await next.query('select 1::integer as value')).rows).toEqual([
          { value: 1 },
        ]);
      } finally {
        held.forEach((client) => client.release());
        if (queued) (await queued).release();
        await pool.end();
      }
    });

    it('counts native promise/callback queries and delegated client work once under background ownership', async () => {
      loadApiEnvironment();
      const config = buildDatabaseConfig({ target: 'test' });
      const info = vi.fn();
      const pool = createDatabasePool(config, {
        logger: { info, error: vi.fn() },
      });
      try {
        await withPoolObservation('movement_retention', async () => {
          await pool.query('select 1');
          await new Promise<void>((resolve, reject) => {
            pool.query('select 1', (error) =>
              error ? reject(error) : resolve(),
            );
          });
        });
        await withPoolObservation('placement_boundary', async () => {
          const client = await pool.connect();
          try {
            await client.query('begin');
            await client.query('select 1');
            await client.query('rollback');
          } finally {
            client.release();
          }
        });
      } finally {
        await pool.end();
      }
      const rows = info.mock.calls
        .map(([fields]) => fields)
        .filter((fields) => fields.event === 'operation_summary');
      for (const [category, count] of [
        ['movement_retention', 2],
        ['placement_boundary', 1],
      ] as const) {
        const totals = rows.filter((row) => row.category === category);
        expect(
          totals.reduce((sum, row) => sum + row.acquisition_attempts_count, 0),
        ).toBe(count);
        expect(
          totals.reduce((sum, row) => sum + row.acquisitions_count, 0),
        ).toBe(count);
        expect(
          totals.reduce((sum, row) => sum + row.holds_completed_count, 0),
        ).toBe(count);
        expect(totals.at(-1)).toMatchObject({
          active_holds_count: 0,
          pending_count: 0,
        });
      }
    }, 30_000);

    it('observes checkout saturation, native query/callback recovery and release', async () => {
      loadApiEnvironment();
      const config = buildDatabaseConfig({ target: 'test' });
      const info = vi.fn();
      const pool = createDatabasePool(config, {
        logger: { info, error: vi.fn() },
      });
      // These limits apply only to this test pool, never to the factory defaults.
      pool.options.max = 1;
      let held: pg.PoolClient | undefined;
      try {
        held = await withPoolObservation('request', () => pool.connect(), {
          info,
        });
        pool.options.connectionTimeoutMillis = 120;
        const queued = pool.connect();
        const rejected = expect(queued).rejects.toThrow(
          'timeout exceeded when trying to connect',
        );
        expect(poolSnapshot(pool)).toEqual({
          totalCount: 1,
          idleCount: 0,
          waitingCount: 1,
        });
        await rejected;
        expect(info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'checkout_failed',
            error_category: 'checkout_timeout',
            before_total: 1,
            before_idle: 0,
            after_waiting: 0,
          }),
          'PostgreSQL pool observation',
        );
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        held.release();
        held = undefined;
        expect(poolSnapshot(pool)).toEqual({
          totalCount: 1,
          idleCount: 1,
          waitingCount: 0,
        });
        expect(info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'release',
            after_idle: 1,
            hold_ms: expect.any(Number),
          }),
          'PostgreSQL pool observation',
        );
        const query = await pool.query<{ value: number }>(
          'select 1::integer as value',
        );
        expect(query.rows).toEqual([{ value: 1 }]);
        await new Promise<void>((resolve, reject) => {
          pool.connect((error, client, release) => {
            if (error) {
              reject(error);
              return;
            }
            expect(client).toBeDefined();
            release();
            resolve();
          });
        });
        expect(pool.idleCount).toBe(1);
        expect(pool.waitingCount).toBe(0);
        // Restore the factory timeout before creating another physical client.
        pool.options.connectionTimeoutMillis = 5_000;
        await expect(pool.query('select 1 / 0')).rejects.toMatchObject({
          code: '22012',
        });
        expect(poolSnapshot(pool)).toEqual({
          totalCount: 0,
          idleCount: 0,
          waitingCount: 0,
        });
        const recovered = await pool.query<{ value: number }>(
          'select 1::integer as value',
        );
        expect(recovered.rows).toEqual([{ value: 1 }]);
        const destroyed = await pool.connect();
        destroyed.release(true);
        expect(() => destroyed.release()).toThrow(
          'Release called on client which has already been released to the pool.',
        );
        expect(poolSnapshot(pool)).toEqual({
          totalCount: 0,
          idleCount: 0,
          waitingCount: 0,
        });
      } finally {
        held?.release();
        await pool.end();
      }
    }, 30_000);
  },
);
