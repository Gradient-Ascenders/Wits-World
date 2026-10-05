import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyDatabaseError,
  createPoolRunObserver,
  emitPoolEvent,
  instrumentPool,
  observeRollback,
  poolSnapshot,
  safePoolEvent,
  withPoolObservation,
} from '../src/database/pool-observability.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function client() {
  let released = false;
  return {
    release: vi.fn(() => {
      if (released) throw new Error('native double release');
      released = true;
    }),
  } as unknown as pg.PoolClient;
}

describe('privacy-safe pool observations', () => {
  it('constructs numeric snapshots without serializing the pool', () => {
    const sensitive = {
      totalCount: 4,
      idleCount: 0,
      waitingCount: 3,
      password: 'secret',
      clients: ['private'],
    };
    expect(poolSnapshot(sensitive)).toEqual({
      totalCount: 4,
      idleCount: 0,
      waitingCount: 3,
    });
    expect(
      poolSnapshot({ totalCount: -1, idleCount: NaN, waitingCount: 1.5 }),
    ).toEqual({ totalCount: 0, idleCount: 0, waitingCount: 0 });
  });

  it('drops arbitrary fields, objects, caller categories, error messages and invalid numbers', () => {
    const event = safePoolEvent({
      event: 'checkout_failed',
      category: 'private account',
      error_category: 'password=secret',
      checkout_ms: 5_000,
      waitingCount: 2,
      hold_ms: Infinity,
      runs_count: 0.5,
      sql: 'select secret',
      params: ['secret'],
      hostname: 'private.host',
      client: { password: 'secret' },
      err: new Error('secret'),
      token: 'secret',
      backendPid: 123,
      requestId: 'private',
    });
    expect(event).toEqual({
      event: 'checkout_failed',
      category: 'other',
      checkout_ms: 5_000,
      waitingCount: 2,
    });
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(
      safePoolEvent({
        event: 'arbitrary',
        category: 'listener',
        error_category: 'client_error',
      }),
    ).toEqual({
      event: 'database_error',
      category: 'listener',
      error_category: 'client_error',
    });
  });

  it('classifies queue, establishment, query, rollback and listener errors without serializing them', () => {
    expect(
      classifyDatabaseError(
        new Error('timeout exceeded when trying to connect'),
      ),
    ).toBe('checkout_timeout');
    expect(
      classifyDatabaseError(
        new Error('Connection terminated due to connection timeout'),
      ),
    ).toBe('connection_timeout');
    expect(
      classifyDatabaseError(new Error('Connection terminated unexpectedly')),
    ).toBe('connection_terminated');
    expect(
      classifyDatabaseError(new Error('SQL password=secret'), 'query'),
    ).toBe('query_error');
    expect(classifyDatabaseError(new Error('private'), 'rollback')).toBe(
      'rollback_failure',
    );
    expect(classifyDatabaseError(new Error('private'), 'client')).toBe(
      'client_error',
    );
    expect(
      classifyDatabaseError({ message: 'private', password: 'secret' }),
    ).toBe('unknown_db_error');
    expect(
      classifyDatabaseError(new Error('game validation failed'), 'transaction'),
    ).toBe('unknown_db_error');
    expect(
      classifyDatabaseError(
        Object.assign(new Error('private SQL'), { code: '23505' }),
        'transaction',
      ),
    ).toBe('query_error');
  });

  it('measures promise checkout and hold/release while preserving native double-release errors', async () => {
    vi.useFakeTimers();
    const info = vi.fn();
    const acquired = client();
    const nativeRelease = acquired.release;
    let resolve!: (client: pg.PoolClient) => void;
    const native = Object.assign(new EventEmitter(), {
      options: { max: 1 },
      totalCount: 1,
      idleCount: 0,
      waitingCount: 0,
      connect: () =>
        new Promise<pg.PoolClient>((done) => {
          resolve = done;
        }),
      end: vi.fn().mockResolvedValue(undefined),
    });
    instrumentPool(native as unknown as pg.Pool, { info });
    const pending = withPoolObservation('request', () => native.connect(), {
      info,
    });
    await vi.advanceTimersByTimeAsync(300);
    resolve(acquired);
    expect(await pending).toBe(acquired);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'checkout',
        category: 'request',
        checkout_ms: 300,
        before_total: 1,
        before_idle: 0,
        after_total: 1,
      }),
      'PostgreSQL pool observation',
    );
    await vi.advanceTimersByTimeAsync(1_200);
    acquired.release();
    expect(nativeRelease).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'release', hold_ms: 1_200 }),
      'PostgreSQL pool observation',
    );
    expect(() => acquired.release()).toThrow('native double release');
    await native.end();
  });

  it('preserves callback checkout, callback error and release arguments', async () => {
    const acquired = client(),
      error = new Error('timeout exceeded when trying to connect');
    const nativeRelease = acquired.release;
    let fail = false;
    const native = Object.assign(new EventEmitter(), {
      options: { max: 1 },
      totalCount: 1,
      idleCount: 0,
      waitingCount: 1,
      connect: (
        callback: (
          error: Error | undefined,
          client?: pg.PoolClient,
          release?: () => void,
        ) => void,
      ) => {
        callback(
          fail ? error : undefined,
          fail ? undefined : acquired,
          fail ? undefined : acquired.release,
        );
      },
      end: vi.fn().mockResolvedValue(undefined),
    });
    const info = vi.fn();
    instrumentPool(native as unknown as pg.Pool, { info });
    native.connect((err, value, release) => {
      expect(err).toBeUndefined();
      expect(value).toBe(acquired);
      expect(release).toBe(acquired.release);
      release!();
    });
    expect(nativeRelease).toHaveBeenCalledOnce();
    fail = true;
    native.connect((err, value) => {
      expect(err).toBe(error);
      expect(value).toBeUndefined();
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'checkout_failed',
        error_category: 'checkout_timeout',
        before_waiting: 1,
      }),
      'PostgreSQL pool observation',
    );
    await native.end();
  });

  it('does not allow logger failures to change checkout, release or rollback errors', async () => {
    const acquired = client();
    const native = Object.assign(new EventEmitter(), {
      options: { max: 1 },
      totalCount: 1,
      idleCount: 0,
      waitingCount: 1,
      connect: async () => acquired,
      end: vi.fn().mockResolvedValue(undefined),
    });
    const logger = {
      info() {
        throw new Error('log failed');
      },
    };
    instrumentPool(native as unknown as pg.Pool, logger);
    expect(await native.connect()).toBe(acquired);
    expect(() => acquired.release()).not.toThrow();
    const rollbackError = new Error('private rollback');
    await expect(
      withPoolObservation(
        'request',
        () =>
          observeRollback(async () => {
            throw rollbackError;
          }),
        logger,
      ),
    ).rejects.toBe(rollbackError);
    expect(() => emitPoolEvent(logger, { event: 'release' })).not.toThrow();
    await native.end();
  });

  it('removes holder bookkeeping for destroy and throwing release, and never invents rejected holders', async () => {
    vi.useFakeTimers();
    const destroyed = client(),
      failedRelease = client();
    const releaseError = new Error('native release failed');
    const destroyRelease = destroyed.release;
    failedRelease.release = vi.fn(() => {
      throw releaseError;
    });
    const native = Object.assign(new EventEmitter(), {
      options: { max: 4 },
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      connect: vi
        .fn()
        .mockResolvedValueOnce(destroyed)
        .mockRejectedValueOnce(
          new Error('timeout exceeded when trying to connect'),
        )
        .mockResolvedValueOnce(failedRelease),
      end: vi.fn().mockResolvedValue(undefined),
    });
    const info = vi.fn();
    instrumentPool(native as unknown as pg.Pool, { info });
    await withPoolObservation('listener', () => native.connect());
    await expect(native.connect()).rejects.toThrow(
      'timeout exceeded when trying to connect',
    );
    await native.connect();
    destroyed.release(true);
    expect(destroyRelease).toHaveBeenCalledExactlyOnceWith(true);
    expect(() => failedRelease.release()).toThrow(releaseError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(info).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'pool_summary',
        active_holds_count: 0,
        listener_holds_count: 0,
        checkout_count: 3,
        checkout_failures_count: 1,
      }),
      'PostgreSQL pool observation',
    );
    await native.end();
  });

  it('isolates event-construction and exception-classification failures', async () => {
    const info = vi.fn();
    expect(() =>
      emitPoolEvent(
        { info },
        new Proxy(
          {},
          {
            get() {
              throw new Error('observation failed');
            },
          },
        ),
      ),
    ).not.toThrow();
    expect(info).not.toHaveBeenCalled();
    const error = new Error();
    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('classification failed');
      },
    });
    expect(classifyDatabaseError(error)).toBe('unknown_db_error');
    const native = Object.assign(new EventEmitter(), {
      options: { max: 1 },
      totalCount: 1,
      idleCount: 0,
      waitingCount: 1,
      connect: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(client()),
      end: vi.fn().mockResolvedValue(undefined),
    });
    instrumentPool(native as unknown as pg.Pool, {
      get info(): () => void {
        throw new Error('logger property failed');
      },
    });
    await expect(native.connect()).rejects.toBe(error);
    const acquired = await native.connect();
    expect(() => acquired.release()).not.toThrow();
    await native.end();
  });

  it('bounds exceptional checkout logs and includes periodic held-client evidence', async () => {
    vi.useFakeTimers();
    const native = Object.assign(new EventEmitter(), {
      options: { max: 1 },
      totalCount: 1,
      idleCount: 0,
      waitingCount: 1,
      connect: async () => {
        throw new Error('timeout exceeded when trying to connect');
      },
      end: vi.fn().mockResolvedValue(undefined),
    });
    const info = vi.fn();
    instrumentPool(native as unknown as pg.Pool, { info });
    for (let i = 0; i < 30; i++)
      await expect(native.connect()).rejects.toThrow();
    expect(info).toHaveBeenCalledTimes(20);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(info).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'pool_summary',
        checkout_failures_count: 30,
        suppressed_count: 10,
        waitingCount: 1,
      }),
      'PostgreSQL pool observation',
    );
    await native.end();
  });

  it('emits scheduler slow/skip summaries while leaving short successful runs quiet', async () => {
    vi.useFakeTimers();
    const info = vi.fn(),
      observation = createPoolRunObserver('ranked_maintenance', { info });
    await observation.run(async () => 1);
    expect(info).not.toHaveBeenCalled();
    let finish!: () => void;
    const pending = observation.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    observation.skipped();
    await vi.advanceTimersByTimeAsync(1_200);
    finish();
    await pending;
    expect(info).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'scheduler_summary',
        category: 'ranked_maintenance',
        run_ms: 1_200,
        runs_count: 2,
        skipped_count: 1,
        checkout_count: 0,
      }),
      'PostgreSQL pool observation',
    );
  });

  it('summarizes caught scheduler failures and bounds repeated fast failures', async () => {
    vi.useFakeTimers();
    const info = vi.fn(),
      observation = createPoolRunObserver('live_deadline', { info });
    await observation.run(async () => {
      observation.failed();
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scheduler_summary',
        run_failures_count: 1,
      }),
      'PostgreSQL pool observation',
    );
    await observation.run(async () => {
      observation.failed();
    });
    expect(info).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await observation.run(async () => {
      observation.failed();
    });
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('reports held listener capacity separately from maintenance and request holders', async () => {
    vi.useFakeTimers();
    const listener = client(),
      request = client();
    const native = Object.assign(new EventEmitter(), {
      options: { max: 4 },
      totalCount: 2,
      idleCount: 0,
      waitingCount: 0,
      connect: vi
        .fn()
        .mockResolvedValueOnce(listener)
        .mockResolvedValueOnce(request),
      end: vi.fn().mockResolvedValue(undefined),
    });
    const info = vi.fn();
    instrumentPool(native as unknown as pg.Pool, { info });
    await withPoolObservation('listener', () => native.connect());
    await withPoolObservation('request', () => native.connect());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(info).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'pool_summary',
        active_holds_count: 2,
        listener_holds_count: 1,
        request_holds_count: 1,
        listener_oldest_hold_ms: 60_000,
        request_oldest_hold_ms: 60_000,
      }),
      'PostgreSQL pool observation',
    );
    listener.release();
    request.release();
    await native.end();
  });

  it('attributes checkout contention to a maintenance run without logging normal query successes', async () => {
    const native = Object.assign(new EventEmitter(), {
      options: { max: 1 },
      totalCount: 1,
      idleCount: 0,
      waitingCount: 1,
      connect: async () => client(),
      end: vi.fn().mockResolvedValue(undefined),
    });
    const info = vi.fn();
    instrumentPool(native as unknown as pg.Pool, { info });
    const observer = createPoolRunObserver('live_deadline', { info });
    await observer.run(async () => {
      const acquired = await native.connect();
      acquired.release();
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'checkout', category: 'live_deadline' }),
      'PostgreSQL pool observation',
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scheduler_summary',
        checkout_count: 1,
        contention_count: 1,
        before_waiting: 1,
      }),
      'PostgreSQL pool observation',
    );
    await native.end();
  });
});
