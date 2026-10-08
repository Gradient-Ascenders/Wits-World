import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createPoolRunObserver,
  instrumentPool,
  poolCategories,
  safePoolEvent,
  withPoolObservation,
} from '../src/database/pool-observability.js';
import { rankedTransaction } from '../src/matches/ranked-database.js';
import { createMovementEvidenceCleanupScheduler } from '../src/events/movement-evidence-cleanup-scheduler.js';
import { createTrustEvaluationScheduler } from '../src/trust/trust-evaluation-scheduler.js';
import { createCardTradeMaintenanceScheduler } from '../src/trading/card-trade-maintenance-scheduler.js';
import { createAccountDeletionRetryScheduler } from '../src/players/account-deletion-retry-scheduler.js';
import { createAsyncPvpDeadlineScheduler } from '../src/matches/asynchronous-pvp-deadline-scheduler.js';
import { createPlacementScheduler } from '../src/placement/placement-scheduler.js';
import { createLivePvpRuntimeScheduler } from '../src/matches/live-pvp-runtime-scheduler.js';
import { createGameplayCoordination } from '../src/matches/gameplay-coordination.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const logger = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() });
function client() {
  let released = false;
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(() => {
      if (released) throw new Error('native double release');
      released = true;
    }),
  } as unknown as pg.PoolClient;
}
function fixture() {
  const log = logger();
  const native = Object.assign(new EventEmitter(), {
    options: { max: 4 },
    totalCount: 4,
    idleCount: 0,
    waitingCount: 0,
    connect: vi.fn(async () => client()),
    end: vi.fn(async () => undefined),
  });
  const pool = native as unknown as pg.Pool;
  const connect = native.connect;
  instrumentPool(pool, log);
  const rows = (event: string, category?: string) =>
    log.info.mock.calls
      .map(([fields]) => fields)
      .filter(
        (fields) =>
          fields.event === event && (!category || fields.category === category),
      );
  const acquire = async () => {
    const c = await pool.connect();
    c.release();
  };
  return { native, connect, pool, log, rows, acquire };
}

it.each(poolCategories)(
  'counts nested/delegated acquisition once for %s',
  async (category) => {
    const f = fixture();
    await withPoolObservation(category, async () => {
      await Promise.resolve();
      await rankedTransaction(f.pool, async (c) => {
        await c.query('test delegated operation');
        await c.query('test delegated operation');
      });
    });
    await f.pool.end();
    expect(f.rows('operation_summary', category)).toEqual([
      expect.objectContaining({
        acquisition_attempts_count: 1,
        acquisitions_count: 1,
        holds_completed_count: 1,
        checkout_failures_count: 0,
        active_holds_count: 0,
        pending_count: 0,
      }),
    ]);
    expect(f.connect).toHaveBeenCalledOnce();
  },
);

it('keeps simultaneous holder and pending ownership, restores outer context, and cleans rejection/shutdown', async () => {
  vi.useFakeTimers();
  const f = fixture();
  let reject!: (error: Error) => void;
  f.connect.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const waiting = withPoolObservation('movement_retention', () =>
    f.pool.connect(),
  );
  const rejected = expect(waiting).rejects.toThrow('private timeout');
  let held!: pg.PoolClient;
  await withPoolObservation('request', async () => {
    await withPoolObservation('trade_retention', f.acquire);
    held = await f.pool.connect();
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(
    f.rows('operation_summary', 'movement_retention').at(-1),
  ).toMatchObject({
    acquisition_attempts_count: 1,
    acquisitions_count: 0,
    pending_count: 1,
    oldest_pending_ms: 60_000,
    active_holds_count: 0,
  });
  expect(f.rows('operation_summary', 'request').at(-1)).toMatchObject({
    active_holds_count: 1,
    pending_count: 0,
    oldest_hold_ms: 60_000,
  });
  reject(new Error('private timeout'));
  await rejected;
  held.release(true);
  expect(() => held.release()).toThrow('native double release');
  await f.pool.end();
  expect(
    f.rows('operation_summary', 'movement_retention').at(-1),
  ).toMatchObject({
    acquisition_attempts_count: 0,
    checkout_failures_count: 1,
    pending_count: 0,
  });
  expect(f.rows('operation_summary', 'request').at(-1)).toMatchObject({
    holds_completed_count: 1,
    active_holds_count: 0,
  });
  expect(f.rows('pool_shutdown').at(-1)).toMatchObject({
    active_holds_count: 0,
    pending_count: 0,
  });
});

it('retains complete aggregates under detailed-event suppression and rejects arbitrary nested labels/data', async () => {
  vi.useFakeTimers();
  const f = fixture();
  for (let n = 0; n < 30; n++)
    await withPoolObservation('trust_evaluation', f.acquire);
  expect(f.rows('checkout')).toHaveLength(20);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.rows('operation_summary', 'trust_evaluation').at(-1)).toMatchObject({
    acquisition_attempts_count: 30,
    acquisitions_count: 30,
    holds_completed_count: 30,
    pending_count: 0,
    active_holds_count: 0,
  });
  expect(f.rows('pool_summary').at(-1)).toMatchObject({ suppressed_count: 10 });
  expect(
    safePoolEvent({
      operations: [
        { category: 'secret-user', pending_count: 1 },
        {
          category: 'movement_retention',
          pending_count: 2,
          sql: 'secret',
          active_holds_count: 0.5,
        },
        { category: 'movement_retention', pending_count: 999 },
      ],
    }),
  ).toEqual({
    event: 'database_error',
    category: 'other',
    operations: [{ category: 'movement_retention', pending_count: 2 }],
  });
  await f.pool.end();
});

it('cleans synchronous checkout errors and observes cancellation without inventing native cancellation', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const failure = new Error('native synchronous failure');
  f.connect.mockImplementationOnce(() => {
    throw failure;
  });
  expect(() =>
    withPoolObservation('trade_retention', () => f.pool.connect()),
  ).toThrow(failure);
  let settle!: (client: pg.PoolClient) => void;
  f.connect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  const pending = withPoolObservation('movement_retention', () =>
    f.pool.connect(),
  );
  // An abandoned/aborted caller does not cancel pg's outstanding checkout.
  const controller = new AbortController();
  controller.abort();
  await expect(
    Promise.race([pending, Promise.reject(controller.signal.reason)]),
  ).rejects.toBe(controller.signal.reason);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(
    f.rows('operation_summary', 'movement_retention').at(-1),
  ).toMatchObject({ pending_count: 1 });
  settle(client());
  (await pending).release();
  await f.pool.end();
  expect(f.rows('operation_summary', 'trade_retention').at(-1)).toMatchObject({
    checkout_failures_count: 1,
    pending_count: 0,
  });
  expect(f.rows('pool_shutdown').at(-1)).toMatchObject({
    active_holds_count: 0,
    pending_count: 0,
  });
});

it('reports a physical connection that completes after the attempts reporting window', async () => {
  vi.useFakeTimers();
  const f = fixture();
  let finish!: (value: pg.PoolClient) => void;
  f.connect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = withPoolObservation('live_cleanup', () => f.pool.connect());
  await vi.advanceTimersByTimeAsync(60_000);
  f.native.emit('connect');
  finish(client());
  (await pending).release();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.rows('pool_summary').at(-1)).toMatchObject({
    checkout_count: 0,
    new_connections_count: 1,
    pending_count: 0,
    active_holds_count: 0,
  });
  expect(f.rows('operation_summary', 'live_cleanup').at(-1)).toMatchObject({
    acquisition_attempts_count: 0,
    acquisitions_count: 1,
    holds_completed_count: 1,
  });
  await f.pool.end();
});

it('does not erase a successor holder during native synchronous release handoff', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const reused = client();
  let handoff!: (value: pg.PoolClient) => void;
  reused.release = vi.fn(() => {
    reused.release = vi.fn();
    handoff(reused);
  });
  f.connect.mockResolvedValueOnce(reused).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        handoff = resolve;
      }),
  );
  const first = await withPoolObservation('request', () => f.pool.connect());
  const second = withPoolObservation('movement_retention', () =>
    f.pool.connect(),
  );
  first.release();
  const successor = await second;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.rows('operation_summary', 'request').at(-1)).toMatchObject({
    active_holds_count: 0,
    holds_completed_count: 1,
  });
  expect(
    f.rows('operation_summary', 'movement_retention').at(-1),
  ).toMatchObject({
    active_holds_count: 1,
    pending_count: 0,
    holds_completed_count: 0,
  });
  successor.release();
  await f.pool.end();
  expect(f.rows('pool_shutdown').at(-1)).toMatchObject({
    active_holds_count: 0,
    pending_count: 0,
  });
});

it('aggregates concurrent run completions/failures without serializing work or losing throttled results', async () => {
  vi.useFakeTimers();
  const f = fixture(),
    observer = createPoolRunObserver('trust_evaluation', f.log);
  let finish!: () => void;
  const first = observer.run(async () => {
    await f.acquire();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  await Promise.resolve();
  await Promise.resolve();
  const failure = new Error('private failure');
  await expect(
    observer.run(async () => {
      await f.acquire();
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(f.rows('scheduler_summary').at(-1)).toMatchObject({
    runs_count: 2,
    runs_completed_count: 1,
    run_failures_count: 1,
    running_count: 1,
  });
  finish();
  await first;
  await observer.run(async () => {
    observer.failed();
  });
  observer.skipped();
  observer.flush();
  const reports = f.rows('scheduler_summary');
  expect(reports.reduce((sum, row) => sum + row.runs_completed_count, 0)).toBe(
    3,
  );
  expect(reports.reduce((sum, row) => sum + row.run_failures_count, 0)).toBe(2);
  expect(reports.reduce((sum, row) => sum + row.checkout_count, 0)).toBe(2);
  expect(reports.reduce((sum, row) => sum + row.holds_completed_count, 0)).toBe(
    2,
  );
  expect(reports.at(-1)).toMatchObject({ running_count: 0, skipped_count: 1 });
  expect(JSON.stringify(reports)).not.toContain('private failure');
  await f.pool.end();
});

it('instruments actual startup worker entry points, preserves parallel lanes and trade/trust order, and reports zero-row cleanup', async () => {
  vi.useFakeTimers();
  const f = fixture(),
    order: string[] = [];
  const work = async (name: string) => {
    order.push(name);
    await f.acquire();
  };
  const interval = 1_800_000;
  const workers = [
    createMovementEvidenceCleanupScheduler(
      {
        purgeExpired: async () => {
          await work('movement');
          return 0;
        },
      },
      f.log,
      interval,
    ),
    createTrustEvaluationScheduler(
      {
        evaluateMaintenanceBatch: async () => {
          await work('trust');
          return 0;
        },
        purgeExpiredData: async () => {
          await work('trust-retention');
          return {
            signalRowsDeleted: 0,
            snapshotRowsDeleted: 0,
            caseRowsDeleted: 0,
          };
        },
      },
      f.log,
      interval,
    ),
    createCardTradeMaintenanceScheduler(
      {
        expireDueTrades: async () => {
          await work('expiry');
          return 0;
        },
        purgeTerminalTrades: async () => {
          await work('trade-retention');
          return 0;
        },
      },
      f.log,
      interval,
    ),
    createAccountDeletionRetryScheduler(
      {
        runOnce: async () => {
          await work('account');
          return {
            attempted: 0,
            completed: 0,
            retryRequired: 0,
            purgedAudits: 0,
          };
        },
      },
      f.log,
      { intervalMs: interval },
    ),
    createAsyncPvpDeadlineScheduler(
      {
        runOnce: async () => {
          await work('async');
          return { invitationsExpired: 0, matchesForfeited: 0, failures: 0 };
        },
      },
      f.log,
      interval,
    ),
    createPlacementScheduler(
      {
        runScheduled: async () => {
          await work('placement');
          return { outcome: 'no_change' } as never;
        },
        nextBoundaryDelayMs: async () => {
          await work('boundary');
          return interval;
        },
      },
      f.log,
    ),
    createLivePvpRuntimeScheduler(
      {
        runOnce: async () => {
          await work('live');
          return { matchesScanned: 0, transitionsCommitted: 0, failures: 0 };
        },
      },
      {
        purgeTransientAccess: async () => {
          await work('cleanup');
          return { accessRowsDeleted: 0, ticketRowsDeleted: 0 };
        },
      },
      f.log,
      {
        deadlineSweepIntervalMs: 1_000,
        transientCleanupIntervalMs: interval,
        hasActiveWork: async () => {
          await work('probe');
          return true;
        },
      },
    ),
  ];
  for (const worker of workers) worker.start();
  // Independent lanes acquire immediately; no observation admission queue.
  expect(order).toEqual([
    'movement',
    'trust',
    'expiry',
    'account',
    'async',
    'placement',
    'boundary',
    'cleanup',
  ]);
  await vi.advanceTimersByTimeAsync(0);
  await Promise.all(workers.map((worker) => worker.stop()));
  await f.pool.end();
  for (const category of [
    'movement_retention',
    'trust_evaluation',
    'trust_retention',
    'trade_expiry',
    'trade_retention',
    'account_deletion_retry',
    'async_pvp_deadline',
    'placement_sweep',
    'placement_boundary',
    'live_deadline',
    'live_cleanup',
    'live_probe',
  ]) {
    expect(f.rows('operation_summary', category)).toEqual([
      expect.objectContaining({
        acquisitions_count: 1,
        holds_completed_count: 1,
      }),
    ]);
    expect(
      f
        .rows('scheduler_summary', category)
        .some((row) => row.runs_completed_count === 1),
    ).toBe(true);
  }
  expect(order.indexOf('trade-retention')).toBeGreaterThan(
    order.indexOf('expiry'),
  );
  expect(order.indexOf('trust-retention')).toBeGreaterThan(
    order.indexOf('trust'),
  );
});

it('attributes coordination idle transactions and delegated probes to the correct worker', async () => {
  const f = fixture();
  f.connect.mockImplementation(async () => {
    const c = client();
    vi.mocked(c.query).mockResolvedValue({
      rows: [{ acquired: true }],
    } as never);
    return c;
  });
  const coordination = createGameplayCoordination(
    f.pool,
    {
      read: vi.fn().mockResolvedValue({
        epoch: 'test',
        ranked: { active: false },
        live: { active: false },
      }),
      removeAbandoned: vi.fn(),
      tryIdle: vi.fn().mockResolvedValue(true),
    } as never,
    { ranked: { wake: vi.fn() }, live: { wake: vi.fn() } },
    f.log,
  );
  for (const kind of ['ranked', 'live'] as const)
    await coordination.confirmIdle(kind, async (c) => {
      await c.query('delegated test probe');
      return false;
    });
  coordination.start();
  await coordination.stop();
  await f.pool.end();
  for (const category of ['ranked_coordination', 'live_coordination'])
    expect(f.rows('operation_summary', category)).toEqual([
      expect.objectContaining({ acquisitions_count: 1 }),
    ]);
  expect(
    f
      .rows('scheduler_summary', 'coordination_monitor')
      .some((row) => row.runs_completed_count === 1),
  ).toBe(true);
});
