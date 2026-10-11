import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPostgresGameplayCoordination } from '../src/matches/postgres-gameplay-coordination.js';
import {
  createLivePvpNotificationListener,
  GAMEPLAY_WORK_NOTIFY_CHANNEL,
} from '../src/matches/live-pvp-notifications.js';
import { readGameplayWork } from '../src/matches/gameplay-work.js';

const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
function fixture() {
  const listener = {
    startCoordination: vi.fn().mockResolvedValue(undefined),
    stopCoordination: vi.fn().mockResolvedValue(undefined),
    readGameplayWork: vi
      .fn()
      .mockResolvedValue({ live: false, ranked: 1_800_000 }),
  };
  const workers = { live: { wake: vi.fn() }, ranked: { wake: vi.fn() } };
  const logger = log();
  return {
    listener,
    workers,
    logger,
    coordination: createPostgresGameplayCoordination(listener, workers, logger),
  };
}
afterEach(() => {
  vi.useRealTimers();
});

describe('PostgreSQL gameplay discovery', () => {
  it('reconciles startup and six idle ticks per minute without waking idle workers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.coordination.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(f.listener.readGameplayWork).toHaveBeenCalledTimes(6);
    expect(f.workers.live.wake).not.toHaveBeenCalled();
    expect(f.workers.ranked.wake).not.toHaveBeenCalled();
    expect(f.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ probes: 6, failures: 0 }),
      'PostgreSQL gameplay coordination',
    );
    await f.coordination.stop();
  });
  it('recovers a dropped hint within ten seconds and does not add scans to active workers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.coordination.start();
    await vi.advanceTimersByTimeAsync(0);
    f.listener.readGameplayWork.mockResolvedValue({ live: true, ranked: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.workers.live.wake).toHaveBeenCalledOnce();
    expect(f.workers.ranked.wake).toHaveBeenCalledOnce();
    f.coordination.observeActive('live', true);
    f.coordination.observeActive('ranked', true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.workers.live.wake).toHaveBeenCalledOnce();
    f.coordination.wake('ranked');
    expect(f.workers.ranked.wake).toHaveBeenCalledTimes(2);
    await f.coordination.stop();
  });
  it('keeps ten-second recovery checks on repeated failures and reconciles reconnection', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.listener.readGameplayWork.mockRejectedValue(
      new Error('private transport detail'),
    );
    await f.coordination.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.listener.readGameplayWork).toHaveBeenCalledTimes(4);
    expect(f.workers.live.wake).toHaveBeenCalledTimes(4);
    f.listener.readGameplayWork.mockResolvedValue({
      live: false,
      ranked: 1_800_000,
    });
    f.coordination.ready();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.listener.readGameplayWork).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(f.logger.info.mock.calls)).not.toContain(
      'private transport',
    );
    await f.coordination.stop();
    const count = f.listener.readGameplayWork.mock.calls.length;
    f.coordination.ready();
    f.coordination.unavailable();
    f.coordination.wake('live');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.listener.readGameplayWork).toHaveBeenCalledTimes(count);
  });
  it('wakes Ranked for a persisted near boundary without requiring active queue rows', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.listener.readGameplayWork.mockResolvedValue({
      live: false,
      ranked: 5_000,
    });
    await f.coordination.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.workers.ranked.wake).toHaveBeenCalledOnce();
    await f.coordination.stop();
  });
  it('serializes start/stop during pending acquisition and never reopens after shutdown', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let ready!: () => void;
    f.listener.startCoordination.mockImplementation(
      () =>
        new Promise<void>((r) => {
          ready = r;
        }),
    );
    const start = f.coordination.start();
    await Promise.resolve();
    const stop = f.coordination.stop();
    ready();
    await Promise.all([start, stop]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.listener.stopCoordination).toHaveBeenCalledOnce();
    expect(f.listener.startCoordination).toHaveBeenCalledOnce();
  });
  it('requires installed triggers and validates snapshots, retaining the original Ranked query', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          pending: false,
          delay_ms: 50,
          live_pending: true,
          migration_ready: true,
        },
      ],
    });
    expect(await readGameplayWork({ query } as unknown as pg.Pool)).toEqual({
      live: true,
      ranked: 50,
    });
    expect(query.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        query_timeout: 1000,
        values: [1_800_000, expect.any(String)],
      }),
    );
    query.mockResolvedValue({
      rows: [
        {
          pending: false,
          delay_ms: 50,
          live_pending: true,
          migration_ready: false,
        },
      ],
    });
    await expect(
      readGameplayWork({ query } as unknown as pg.Pool),
    ).rejects.toThrow(/unavailable/u);
  });
});

describe('shared direct notification transport', () => {
  function transport() {
    const client = Object.assign(new EventEmitter(), {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            pending: false,
            delay_ms: 10000,
            live_pending: false,
            migration_ready: true,
          },
        ],
      }),
      release: vi.fn(),
    });
    const connect = vi.fn().mockResolvedValue(client);
    const wake = vi.fn();
    const ready = vi.fn();
    const unavailable = vi.fn();
    const listener = createLivePvpNotificationListener(
      { connect } as unknown as pg.Pool,
      {
        broadcastMatch: vi.fn().mockResolvedValue(undefined),
        broadcastPresence: vi.fn().mockResolvedValue(undefined),
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      },
      log(),
      { onWake: wake, onReady: ready, onUnavailable: unavailable },
    );
    return { client, connect, wake, ready, unavailable, listener };
  }
  it('keeps exactly one client through gateway idle changes, validates hints and releases last owner', async () => {
    const f = transport();
    await f.listener.start();
    await f.listener.startCoordination();
    await f.listener.stop();
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.client.release).not.toHaveBeenCalled();
    expect(f.client.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'listen ' + GAMEPLAY_WORK_NOTIFY_CHANNEL,
        query_timeout: 1000,
      }),
    );
    f.client.emit('notification', {
      channel: GAMEPLAY_WORK_NOTIFY_CHANNEL,
      payload: 'ranked',
    });
    f.client.emit('notification', {
      channel: GAMEPLAY_WORK_NOTIFY_CHANNEL,
      payload: 'private-player-value',
    });
    expect(f.wake).toHaveBeenCalledExactlyOnceWith('ranked');
    await f.listener.readGameplayWork();
    await f.listener.stopCoordination();
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it('destroys a stalled or invalid probe client instead of reusing it or claiming idle', async () => {
    vi.useFakeTimers();
    const f = transport();
    await f.listener.startCoordination();
    f.client.query.mockRejectedValue(new Error('private SQL details'));
    await expect(f.listener.readGameplayWork()).rejects.toThrow(
      'PostgreSQL gameplay discovery failed.',
    );
    expect(f.client.release).toHaveBeenCalledWith(true);
    expect(f.unavailable).toHaveBeenCalledOnce();
    await f.listener.stopCoordination();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.connect).toHaveBeenCalledOnce();
  });
  it('destroys failed coordination cleanup and reconnects only the remaining gateway owner', async () => {
    vi.useFakeTimers();
    const f = transport();
    await f.listener.start();
    await f.listener.startCoordination();
    f.client.query.mockRejectedValueOnce(new Error('private cleanup details'));
    await expect(f.listener.stopCoordination()).rejects.toThrow(
      'PostgreSQL gameplay listener cleanup failed.',
    );
    expect(f.client.release).toHaveBeenCalledExactlyOnceWith(true);
    f.client.query.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.connect).toHaveBeenCalledTimes(2);
    expect(f.client.query.mock.calls).toHaveLength(2);
    expect(f.client.query.mock.calls.flat()).not.toContain(
      'listen ' + GAMEPLAY_WORK_NOTIFY_CHANNEL,
    );
    await f.listener.stop();
  });
  it('waits for third LISTEN success and does not expose a falsely ready session on failure', async () => {
    vi.useFakeTimers();
    const f = transport();
    f.client.query.mockImplementation(
      async (input: string | { text: string }) => {
        const sql = typeof input === 'string' ? input : input.text;
        if (sql.includes(GAMEPLAY_WORK_NOTIFY_CHANNEL))
          throw new Error('private');
        return { rows: [] };
      },
    );
    await expect(f.listener.startCoordination()).rejects.toThrow(
      /unavailable/u,
    );
    expect(f.ready).not.toHaveBeenCalled();
    await expect(f.listener.readGameplayWork()).rejects.toThrow(/unavailable/u);
    expect(f.client.release).toHaveBeenCalledWith(true);
    await f.listener.stopCoordination();
  });
});
