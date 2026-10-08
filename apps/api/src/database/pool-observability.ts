import { AsyncLocalStorage } from 'node:async_hooks';
import type pg from 'pg';

const categories = [
  'request',
  'ranked_maintenance',
  'live_deadline',
  'listener',
  'other',
] as const;
const events = [
  'checkout',
  'checkout_failed',
  'release',
  'pool_summary',
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
}
const context = new AsyncLocalStorage<Scope>();
export function withPoolObservation<T>(
  category: PoolCategory,
  operation: () => T,
  logger?: PoolTelemetryLogger,
  metrics?: Metrics,
): T {
  return context.run({ category, logger, metrics }, operation);
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
  const timer = setInterval(() => {
    if (!checkoutCount && !held.size && !failures && !suppressed) return;
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
    const category = scope?.category ?? 'other';
    const sink = scope?.logger ?? logger;
    const before = poolSnapshot(pool),
      started = performance.now();
    checkoutCount++;
    const complete = (error?: Error, client?: pg.PoolClient) => {
      const after = poolSnapshot(pool),
        duration = performance.now() - started;
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
      if (error || duration >= 250 || contention)
        publish(
          {
            event: error ? 'checkout_failed' : 'checkout',
            category,
            checkout_ms: duration,
            ...snapshots(before, after),
            ...holdSnapshot(),
            ...(error ? { error_category: classifyDatabaseError(error) } : {}),
          },
          sink,
        );
      if (!client || error) return;
      const acquired = performance.now(),
        release = client.release;
      held.set(client, { start: acquired, category });
      let released = false;
      client.release = function (releaseError?: Error | boolean) {
        // Native double-release errors remain authoritative.
        if (released) return release.call(client, releaseError);
        released = true;
        try {
          return release.call(client, releaseError);
        } finally {
          held.delete(client);
          const hold = performance.now() - acquired;
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
  }) as pg.Pool['connect'];
  pool.end = ((callback?: () => void) => {
    clearInterval(timer);
    pool.off('connect', onConnect);
    const finished = () =>
      emitPoolEvent(logger, {
        event: 'pool_shutdown',
        category: 'other',
        pool_role: poolRole,
        ...poolSnapshot(pool),
        ...holdSnapshot(),
      });
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

/** One bounded summary per minute, plus slow/contended/failed runs. */
export function createPoolRunObserver(
  category: 'ranked_maintenance' | 'live_deadline',
  logger: PoolTelemetryLogger,
) {
  let runs = 0,
    skipped = 0,
    lastReport = performance.now();
  let hasReported = false;
  let active:
    | {
        started: number;
        unix: number;
        metrics: Metrics;
        failed: boolean;
        runningReported: boolean;
      }
    | undefined;
  const report = (running: boolean) => {
    if (!active) return;
    emitPoolEvent(logger, {
      event: 'scheduler_summary',
      pool_role: 'shared',
      category,
      run_started_unix_ms: active.unix,
      run_ms: performance.now() - active.started,
      runs_count: runs,
      skipped_count: skipped,
      running_count: running ? 1 : 0,
      run_failures_count: active.failed ? 1 : 0,
      ...active.metrics,
    });
    if (running) active.runningReported = true;
    runs = skipped = 0;
    lastReport = performance.now();
    hasReported = true;
  };
  return {
    failed() {
      if (active) active.failed = true;
    },
    skipped() {
      skipped++;
      if (performance.now() - lastReport >= 60_000) report(true);
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      runs++;
      const metrics: Metrics = {
        checkout_count: 0,
        checkout_failures_count: 0,
        checkout_ms: 0,
        contention_count: 0,
      };
      active = {
        started: performance.now(),
        unix: Date.now(),
        metrics,
        failed: false,
        runningReported: false,
      };
      let failed = false;
      try {
        return await withPoolObservation(category, operation, logger, metrics);
      } catch (error) {
        failed = true;
        active.failed = true;
        throw error;
      } finally {
        const exceptional =
          failed ||
          active.failed ||
          metrics.checkout_failures_count ||
          metrics.contention_count ||
          performance.now() - active.started >= 1_000;
        if (
          active.runningReported ||
          (exceptional &&
            (!hasReported || performance.now() - lastReport >= 10_000)) ||
          performance.now() - lastReport >= 60_000
        )
          report(false);
        active = undefined;
      }
    },
  };
}
