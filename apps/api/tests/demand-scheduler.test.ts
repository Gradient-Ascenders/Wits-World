import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDemandScheduler } from '../src/database/demand-scheduler.js';

const ACTIVE_INTERVAL_MS = 1_000;
const IDLE_INTERVAL_MS = 10 * 60 * 1_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('demand scheduler', () => {
  it('does not poll repeatedly while idle, even across more than five minutes', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000 + 1);

    expect(run).toHaveBeenCalledOnce();
    await scheduler.stop();
  });

  it('uses the fast cadence while persisted work remains', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(true);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS - 1);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('honors an explicit delay so a known boundary is checked on time', async () => {
    vi.useFakeTimers();
    const boundaryDelayMs = 90_000;
    const run = vi
      .fn()
      .mockResolvedValueOnce(boundaryDelayMs)
      .mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(boundaryDelayMs - 1);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('wakes an idle scheduler immediately and coalesces repeated wakes', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.wake();
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('runs one immediate follow-up when work is committed during an in-flight empty sweep', async () => {
    vi.useFakeTimers();
    let finishFirstRun!: (hasRemainingWork: boolean) => void;
    const run = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstRun = resolve;
          }),
      )
      .mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();

    scheduler.wake();
    scheduler.wake();
    expect(run).toHaveBeenCalledOnce();
    finishFirstRun(false);
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('retries failures on the active interval instead of entering idle cadence', async () => {
    vi.useFakeTimers();
    const failure = new Error('probe failed');
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(failure);
    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS - 1);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('treats an invalid explicit delay as an error and retries actively', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const run = vi.fn().mockResolvedValueOnce(0).mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid delay'),
      }),
    );
    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS - 1);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('makes start idempotent, drains on stop, and never schedules after stop', async () => {
    vi.useFakeTimers();
    let finishRun!: (hasRemainingWork: boolean) => void;
    const run = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishRun = resolve;
        }),
    );
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    finishRun(true);
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(2 * IDLE_INTERVAL_MS);
    expect(run).toHaveBeenCalledOnce();

    scheduler.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();
    await scheduler.stop();
  });

  it('starts a fresh immediate run after stop and restart while the old run drains', async () => {
    vi.useFakeTimers();
    let finishFirstRun!: (hasRemainingWork: boolean) => void;
    const run = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstRun = resolve;
          }),
      )
      .mockResolvedValue(false);
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    const stopping = scheduler.stop();
    scheduler.start();
    finishFirstRun(false);
    await stopping;
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('counts coalesced wakes without changing follow-up execution, even if observation throws', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const run = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(false);
          }),
      )
      .mockResolvedValue(false);
    const observed = vi.fn(() => {
      throw new Error('telemetry failure');
    });
    const scheduler = createDemandScheduler({
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      idleIntervalMs: IDLE_INTERVAL_MS,
      run,
      onError: vi.fn(),
      onCoalesced: observed,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.wake();
    scheduler.wake();
    expect(observed).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledOnce();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(IDLE_INTERVAL_MS * 2);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
