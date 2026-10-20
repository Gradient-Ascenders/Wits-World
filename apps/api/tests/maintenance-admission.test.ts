import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { limitRoutineMaintenance } from '../src/database/maintenance-admission.js';
import { withPoolObservation } from '../src/database/pool-observability.js';

function fixture() {
  const releases: ReturnType<typeof vi.fn>[] = [];
  const connect = vi.fn(async () => {
    const release = vi.fn();
    releases.push(release);
    return { release } as unknown as pg.PoolClient;
  });
  const end = vi.fn(async () => undefined);
  const pool = { connect, end } as unknown as pg.Pool;
  limitRoutineMaintenance(pool);
  return { pool, connect, releases, end };
}

describe('routine maintenance admission', () => {
  it('serializes routine checkouts while players and urgent deadlines bypass the queue', async () => {
    const { pool, connect } = fixture();
    const first = await withPoolObservation('trust_evaluation', () =>
      pool.connect(),
    );
    const next = withPoolObservation('movement_retention', () =>
      pool.connect(),
    );
    const last = withPoolObservation('trade_retention', () => pool.connect());
    const direct = await Promise.all(
      (
        [
          'request',
          'live_deadline',
          'async_pvp_deadline',
          'ranked_maintenance',
          'placement_boundary',
        ] as const
      ).map((category) => withPoolObservation(category, () => pool.connect())),
    );
    expect(connect).toHaveBeenCalledTimes(6);
    first.release();
    const second = await next;
    expect(connect).toHaveBeenCalledTimes(7);
    second.release();
    const third = await last;
    expect(connect).toHaveBeenCalledTimes(8);
    third.release();
    direct.forEach((client) => client.release());
  });

  it('releases admission after checkout failure and passes destruction to pg', async () => {
    const { pool, connect, releases } = fixture();
    connect.mockRejectedValueOnce(new Error('checkout failed'));
    const failure = withPoolObservation('trust_evaluation', () =>
      pool.connect(),
    );
    const pending = withPoolObservation('live_cleanup', () => pool.connect());
    await expect(failure).rejects.toThrow('checkout failed');
    const client = await pending;
    client.release(true);
    expect(releases[0]).toHaveBeenCalledWith(true);
    const next = await withPoolObservation('trust_retention', () =>
      pool.connect(),
    );
    next.release();
  });

  it('supports callback checkouts and the callback release function', async () => {
    const { pool, releases } = fixture();
    const first = await withPoolObservation('trust_evaluation', () =>
      pool.connect(),
    );
    const callback = vi.fn();
    const result = withPoolObservation('account_deletion_retry', () =>
      pool.connect(callback),
    );
    expect(result).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
    first.release();
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    const [error, client, release] = callback.mock.calls[0]!;
    expect(error).toBeUndefined();
    expect(release).toBe(client.release);
    release(true);
    expect(releases[1]).toHaveBeenCalledWith(true);
  });

  it('rejects queued work on shutdown without leaking a permit', async () => {
    const { pool, end, connect } = fixture();
    const first = await withPoolObservation('trust_evaluation', () =>
      pool.connect(),
    );
    const pending = withPoolObservation('movement_retention', () =>
      pool.connect(),
    );
    const rejected = expect(pending).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
    await pool.end();
    await rejected;
    first.release();
    expect(connect).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    await expect(
      withPoolObservation('trust_retention', () => pool.connect()),
    ).rejects.toThrow('Cannot use a pool after calling end');
  });
});
