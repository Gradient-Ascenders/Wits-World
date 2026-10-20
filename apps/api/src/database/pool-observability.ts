import { AsyncLocalStorage } from 'node:async_hooks';
import type pg from 'pg';

export const poolCategories = [
  'request',
  'ranked_maintenance',
  'live_deadline',
  'listener',
  'live_cleanup',
  'movement_retention',
  'trust_evaluation',
  'trust_retention',
  'placement_sweep',
  'placement_boundary',
  'account_deletion_retry',
  'async_pvp_deadline',
  'trade_expiry',
  'trade_retention',
  'ranked_probe',
  'live_probe',
  'coordination_monitor',
  'ranked_coordination',
  'live_coordination',
  'other',
] as const;
const categories = poolCategories;
const events = [
  'checkout',
  'checkout_failed',
  'release',
  'pool_summary',
  'operation_summary',
  'pool_shutdown',
  'scheduler_summary',
  'database_error',
  'listener_checkout_start',
  'listener_checkout_success',
  'listener_checkout_failed',
  'listener_listen_success',
  'listener_client_error',
  'listener_reconnect',
  'listener_recovered',
  'listener_release',
  'listener_destroy',
] as const;
const errors = [
  'checkout_timeout',
  'connection_timeout',
  'connection_terminated',
  'query_error',
  'rollback_failure',
  'client_error',
  'unknown_db_error',
] as const;
export type PoolCategory = (typeof categories)[number];
export type PoolRole = 'shared' | 'listener';
export type PoolEvent = (typeof events)[number];
export type DatabaseErrorCategory = (typeof errors)[number];
export interface PoolTelemetryLogger {
  info?(fields: Record<string, unknown>, message: string): void;
  warn?(fields: Record<string, unknown>, message: string): void;
}
export interface PoolSnapshot {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}
const numericFields = [
  'checkout_ms',
  'hold_ms',
  'before_total',
  'before_idle',
  'before_waiting',
  'after_total',
  'after_idle',
  'after_waiting',
  'totalCount',
  'idleCount',
  'waitingCount',
  'oldest_hold_ms',
  'listener_oldest_hold_ms',
  'request_oldest_hold_ms',
  'maintenance_oldest_hold_ms',
  'other_oldest_hold_ms',
  'listener_holds_count',
  'request_holds_count',
  'maintenance_holds_count',
  'other_holds_count',
  'active_holds_count',
  'checkout_count',
  'checkout_failures_count',
  'new_connections_count',
  'contention_count',
  'suppressed_count',
  'run_started_unix_ms',
  'run_ms',
  'runs_count',
  'run_failures_count',
  'skipped_count',
  'running_count',
  'acquisition_attempts_count',
  'acquisitions_count',
  'pending_count',
  'oldest_pending_ms',
  'holds_completed_count',
  'checkout_max_ms',
  'hold_max_ms',
  'runs_completed_count',
  'runs_ms',
  'peak_pending_count',
  'peak_active_holds_count',
] as const;

/** Construct rather than serialize caller data. No arbitrary strings or objects. */
export function safePoolEvent(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    event: events.includes(input.event as PoolEvent)
      ? input.event
      : 'database_error',
    category: categories.includes(input.category as PoolCategory)
      ? input.category
      : 'other',
  };
  if (errors.includes(input.error_category as DatabaseErrorCategory))
    output.error_category = input.error_category;
  if (input.pool_role === 'shared' || input.pool_role === 'listener')
    output.pool_role = input.pool_role;
  for (const field of numericFields) {
    const value = input[field];
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      (!field.endsWith('_count') || Number.isInteger(value))
    )
      output[field] = value;
  }
  if (Array.isArray(input.operations)) {
    const operations = input.operations;
    output.operations = categories.flatMap((category) => {
      const row = operations.find(
        (value: unknown) =>
          value !== null &&
          typeof value === 'object' &&
          (value as Record<string, unknown>).category === category,
      ) as Record<string, unknown> | undefined;
      if (!row) return [];
      const safe: Record<string, unknown> = { category };
      for (const field of [
        'active_holds_count',
        'pending_count',
        'oldest_hold_ms',
        'oldest_pending_ms',
      ] as const) {
        const value = row[field];
        if (
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 0 &&
          (!field.endsWith('_count') || Number.isSafeInteger(value))
        )
          safe[field] = value;
      }
      return [safe];
    });
  }
  return output;
}
export function emitPoolEvent(
  logger: PoolTelemetryLogger | undefined,
  input: Record<string, unknown>,
) {
  try {
    logger?.info?.(safePoolEvent(input), 'PostgreSQL pool observation');
  } catch {
    /* Telemetry cannot affect database work. */
  }
}
export function poolSnapshot(pool: Partial<PoolSnapshot>): PoolSnapshot {
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : 0;
  return {
    totalCount: count(pool.totalCount),
    idleCount: count(pool.idleCount),
    waitingCount: count(pool.waitingCount),
  };
}
export function classifyDatabaseError(
  error: unknown,
  stage:
    'checkout' | 'query' | 'rollback' | 'client' | 'transaction' = 'checkout',
): DatabaseErrorCategory {
  try {
    if (stage === 'rollback') return 'rollback_failure';
    const message = error instanceof Error ? error.message : '';
    if (message === 'timeout exceeded when trying to connect')
      return 'checkout_timeout';
    if (message === 'Connection terminated due to connection timeout')
      return 'connection_timeout';
    if (
      message === 'Connection terminated unexpectedly' ||
      message === 'Connection terminated'
    )
      return 'connection_terminated';
    if (stage === 'query') return 'query_error';
    if (
      stage === 'transaction' &&
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(error.code)
    )
      return 'query_error';
    if (stage === 'client') return 'client_error';
  } catch {
    /* Untrusted exception properties are never serialized. */
  }
  return 'unknown_db_error';
}
interface Metrics {
  checkout_count: number;
  checkout_failures_count: number;
  checkout_ms: number;
  contention_count: number;
  holds_completed_count?: number;
  hold_ms?: number;
  before_total?: number;
  before_idle?: number;
  before_waiting?: number;
  after_total?: number;
  after_idle?: number;
  after_waiting?: number;
}
interface Scope {
  category: PoolCategory;
  logger?: PoolTelemetryLogger;
  metrics?: Metrics;
  markFailed?: () => void;
}
const emptyAcquisitions = () => ({
  acquisition_attempts_count: 0,
  acquisitions_count: 0,
  checkout_failures_count: 0,
  checkout_ms: 0,
  checkout_max_ms: 0,
  holds_completed_count: 0,
  hold_ms: 0,
  hold_max_ms: 0,
  peak_pending_count: 0,
  peak_active_holds_count: 0,
});
const context = new AsyncLocalStorage<Scope>();
export function currentPoolCategory(): PoolCategory {
  return context.getStore()?.category ?? 'other';
}
export function withPoolObservation<T>(
  category: PoolCategory,
  operation: () => T,
  logger?: PoolTelemetryLogger,
  metrics?: Metrics,
  markFailed?: () => void,
): T {
  return context.run({ category, logger, metrics, markFailed }, operation);
}
export function observeDatabaseError(
  error: unknown,
  stage: 'query' | 'rollback' | 'transaction',
) {
  const errorCategory = classifyDatabaseError(error, stage);
  // Transaction callbacks can throw application/domain errors unrelated to DB access.
  if (stage === 'transaction' && errorCategory === 'unknown_db_error') return;
  const scope = context.getStore();
  emitPoolEvent(scope?.logger, {
    event: 'database_error',
    category: scope?.category,
    error_category: errorCategory,
  });
}
export async function observeRollback<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    observeDatabaseError(error, 'rollback');
    throw error;
  }
}
const snapshots = (before: PoolSnapshot, after: PoolSnapshot) => ({
  before_total: before.totalCount,
  before_idle: before.idleCount,
  before_waiting: before.waitingCount,
  after_total: after.totalCount,
  after_idle: after.idleCount,
  after_waiting: after.waitingCount,
});

/** Preserve native promise/callback checkout and query semantics; no SQL interception. */
export function instrumentPool(
  pool: pg.Pool,
  logger?: PoolTelemetryLogger,
  poolRole: PoolRole = 'shared',
) {
  const connect = pool.connect.bind(pool);
  const end = pool.end.bind(pool);
  const held = new Map<
    pg.PoolClient,
    { start: number; category: PoolCategory }
  >();
  const pending = new Map<object, { start: number; category: PoolCategory }>();
  const aggregates = new Map(
    categories.map((category) => [category, emptyAcquisitions()]),
  );
  const counts = new Map(
    categories.map((category) => [category, { pending: 0, active: 0 }]),
  );
  let checkoutCount = 0,
    failures = 0,
    newConnections = 0,
    suppressed = 0,
    emitted = 0;
  let windowStart = performance.now();
  const publish = (fields: Record<string, unknown>, sink = logger) => {
    const now = performance.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      emitted = 0;
    }
    if (emitted >= 20) {
      suppressed++;
      return;
    }
    emitted++;
    emitPoolEvent(sink, { ...fields, pool_role: poolRole });
  };
  const onConnect = () => {
    newConnections++;
  };
  pool.on('connect', onConnect);
  const holdSnapshot = () => {
    const now = performance.now(),
      holds = [...held.values()];
    const groups: Record<string, number> = {
      active_holds_count: held.size,
      oldest_hold_ms: Math.max(0, ...holds.map((x) => now - x.start)),
      pending_count: pending.size,
      oldest_pending_ms: Math.max(
        0,
        ...[...pending.values()].map((x) => now - x.start),
      ),
    };
    for (const group of [
      'listener',
      'request',
      'maintenance',
      'other',
    ] as const) {
      const entries = holds.filter((x) =>
        group === 'maintenance'
          ? x.category === 'ranked_maintenance' ||
            x.category === 'live_deadline'
          : x.category === group,
      );
      groups[`${group}_holds_count`] = entries.length;
      groups[`${group}_oldest_hold_ms`] = Math.max(
        0,
        ...entries.map((x) => now - x.start),
      );
    }
    return groups;
  };
  const operationSnapshot = (category: PoolCategory) => {
    const now = performance.now();
    const holders = [...held.values()].filter((x) => x.category === category);
    const waiters = [...pending.values()].filter(
      (x) => x.category === category,
    );
    return {
      active_holds_count: holders.length,
      oldest_hold_ms: Math.max(0, ...holders.map((x) => now - x.start)),
      pending_count: waiters.length,
      oldest_pending_ms: Math.max(0, ...waiters.map((x) => now - x.start)),
    };
  };
  const operationStates = () =>
    categories.flatMap((category) => {
      const state = operationSnapshot(category);
      return state.pending_count || state.active_holds_count
        ? [{ category, ...state }]
        : [];
    });
  // Fixed-cardinality summaries bypass the detailed-event cap. Counters are
  // updated before suppression and remain valid even when detail is dropped.
  const reportOperations = () => {
    for (const category of categories) {
      const metrics = aggregates.get(category)!;
      const state = operationSnapshot(category);
      if (
        metrics.acquisition_attempts_count ||
        metrics.acquisitions_count ||
        metrics.checkout_failures_count ||
        metrics.holds_completed_count ||
        state.pending_count ||
        state.active_holds_count
      ) {
        emitPoolEvent(logger, {
          event: 'operation_summary',
          pool_role: poolRole,
          category,
          ...poolSnapshot(pool),
          ...metrics,
          ...state,
        });
      }
      Object.assign(metrics, emptyAcquisitions());
      metrics.peak_pending_count = state.pending_count;
      metrics.peak_active_holds_count = state.active_holds_count;
    }
  };
  const timer = setInterval(() => {
    reportOperations();
    if (
      !checkoutCount &&
      !held.size &&
      !pending.size &&
      !failures &&
      !newConnections &&
      !suppressed
    )
      return;
    emitPoolEvent(logger, {
      event: 'pool_summary',
      pool_role: poolRole,
      category: 'other',
      ...poolSnapshot(pool),
      checkout_count: checkoutCount,
      checkout_failures_count: failures,
      new_connections_count: newConnections,
      suppressed_count: suppressed,
      ...holdSnapshot(),
      operations: operationStates(),
    });
    checkoutCount = failures = newConnections = suppressed = 0;
  }, 60_000);
  timer.unref();
  pool.connect = ((
    callback?: (
      error: Error | undefined,
      client: pg.PoolClient | undefined,
      release: ((error?: Error | boolean) => void) | undefined,
    ) => void,
  ) => {
    const scope = context.getStore();
    const category = categories.includes(scope?.category as PoolCategory)
      ? scope!.category
      : 'other';
    const sink = scope?.logger ?? logger;
    const before = poolSnapshot(pool),
      started = performance.now();
    checkoutCount++;
    const totals = aggregates.get(category)!;
    const current = counts.get(category)!;
    totals.acquisition_attempts_count++;
    const attempt = {};
    pending.set(attempt, { start: started, category });
    current.pending++;
    totals.peak_pending_count = Math.max(
      totals.peak_pending_count,
      current.pending,
    );
    let completed = false;
    const complete = (error?: Error, client?: pg.PoolClient) => {
      if (completed) return;
      completed = true;
      pending.delete(attempt);
      current.pending--;
      const after = poolSnapshot(pool),
        duration = performance.now() - started;
      totals.checkout_ms += duration;
      totals.checkout_max_ms = Math.max(totals.checkout_max_ms, duration);
      totals.checkout_failures_count += error ? 1 : 0;
      totals.acquisitions_count += client && !error ? 1 : 0;
      const contention =
        before.waitingCount > 0 ||
        (before.idleCount === 0 && before.totalCount >= pool.options.max!);
      if (scope?.metrics) {
        scope.metrics.checkout_count++;
        scope.metrics.checkout_ms += duration;
        scope.metrics.checkout_failures_count += error ? 1 : 0;
        scope.metrics.contention_count += contention ? 1 : 0;
        Object.assign(scope.metrics, snapshots(before, after));
      }
      if (error) failures++;
      const acquired = performance.now();
      if (client && !error) {
        held.set(client, { start: acquired, category });
        current.active++;
        totals.peak_active_holds_count = Math.max(
          totals.peak_active_holds_count,
          current.active,
        );
      }
      if (error || duration >= 250 || contention)
        publish(
          {
            event: error ? 'checkout_failed' : 'checkout',
            category,
            checkout_ms: duration,
            ...snapshots(before, after),
            ...holdSnapshot(),
            operations: operationStates(),
            ...(error ? { error_category: classifyDatabaseError(error) } : {}),
          },
          sink,
        );
      if (!client || error) return;
      const release = client.release;
      let released = false;
      client.release = function (releaseError?: Error | boolean) {
        // Native double-release errors remain authoritative.
        if (released) return release.call(client, releaseError);
        released = true;
        // pg can synchronously hand this same client to a queued checkout
        // inside release(). Retire the old ownership before that handoff.
        held.delete(client);
        current.active--;
        try {
          return release.call(client, releaseError);
        } finally {
          const hold = performance.now() - acquired;
          totals.holds_completed_count++;
          totals.hold_ms += hold;
          totals.hold_max_ms = Math.max(totals.hold_max_ms, hold);
          if (scope?.metrics) {
            scope.metrics.holds_completed_count =
              (scope.metrics.holds_completed_count ?? 0) + 1;
            scope.metrics.hold_ms = (scope.metrics.hold_ms ?? 0) + hold;
          }
          if (hold >= 1_000 || category === 'listener')
            publish(
              {
                event: 'release',
                category,
                hold_ms: hold,
                ...snapshots(after, poolSnapshot(pool)),
              },
              sink,
            );
        }
      };
    };
    try {
      if (callback)
        return connect((error, client, release) => {
          complete(error ?? undefined, client);
          callback(error, client, client?.release ?? release);
        });
      return connect().then(
        (client) => {
          complete(undefined, client);
          return client;
        },
        (error: Error) => {
          complete(error);
          throw error;
        },
      );
    } catch (error) {
      complete(error as Error);
      throw error;
    }
  }) as pg.Pool['connect'];
  pool.end = ((callback?: () => void) => {
    clearInterval(timer);
    pool.off('connect', onConnect);
    const finished = () => {
      reportOperations();
      emitPoolEvent(logger, {
        event: 'pool_shutdown',
        category: 'other',
        pool_role: poolRole,
        ...poolSnapshot(pool),
        ...holdSnapshot(),
      });
    };
    if (callback)
      return end(() => {
        finished();
        callback();
      });
    return end().then(() => {
      finished();
    });
  }) as pg.Pool['end'];
}

/** Fixed-size aggregates; no timers, admission or changes to worker promises. */
export function createPoolRunObserver(
  category: PoolCategory,
  logger: PoolTelemetryLogger,
) {
  let runs = 0,
    completed = 0,
    failures = 0,
    skipped = 0,
    duration = 0;
  let lastReport = performance.now();
  let hasReported = false;
  const metrics: Metrics = {
    checkout_count: 0,
    checkout_failures_count: 0,
    checkout_ms: 0,
    contention_count: 0,
    holds_completed_count: 0,
    hold_ms: 0,
  };
  const active = new Set<{
    started: number;
    unix: number;
    failed: boolean;
    runningReported: boolean;
  }>();
  const report = (run?: { started: number; unix: number }) => {
    emitPoolEvent(logger, {
      event: 'scheduler_summary',
      pool_role: 'shared',
      category,
      run_started_unix_ms: run?.unix,
      run_ms: run ? performance.now() - run.started : 0,
      runs_count: runs,
      runs_completed_count: completed,
      runs_ms: duration,
      skipped_count: skipped,
      running_count: active.size,
      run_failures_count: failures,
      ...metrics,
    });
    for (const current of active) current.runningReported = true;
    runs = completed = failures = skipped = duration = 0;
    for (const key of Object.keys(metrics) as (keyof Metrics)[])
      delete metrics[key];
    Object.assign(metrics, {
      checkout_count: 0,
      checkout_failures_count: 0,
      checkout_ms: 0,
      contention_count: 0,
      holds_completed_count: 0,
      hold_ms: 0,
    });
    lastReport = performance.now();
    hasReported = true;
  };
  return {
    failed() {
      context.getStore()?.markFailed?.();
    },
    skipped() {
      skipped++;
      if (performance.now() - lastReport >= 60_000) report([...active][0]);
    },
    flush() {
      if (
        runs ||
        completed ||
        skipped ||
        metrics.checkout_count ||
        metrics.holds_completed_count
      )
        report([...active][0]);
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      runs++;
      const run = {
        started: performance.now(),
        unix: Date.now(),
        failed: false,
        runningReported: false,
      };
      active.add(run);
      try {
        return await withPoolObservation(
          category,
          operation,
          logger,
          metrics,
          () => {
            run.failed = true;
          },
        );
      } catch (error) {
        run.failed = true;
        throw error;
      } finally {
        active.delete(run);
        completed++;
        failures += run.failed ? 1 : 0;
        duration += performance.now() - run.started;
        const exceptional =
          run.failed ||
          metrics.checkout_failures_count ||
          metrics.contention_count ||
          performance.now() - run.started >= 1_000;
        const reportFirstSuccess =
          !hasReported &&
          category !== 'ranked_maintenance' &&
          category !== 'live_deadline';
        if (
          (run.runningReported && active.size === 0) ||
          reportFirstSuccess ||
          (exceptional &&
            (!hasReported || performance.now() - lastReport >= 10_000)) ||
          performance.now() - lastReport >= 60_000
        )
          report(run);
      }
    },
  };
}
