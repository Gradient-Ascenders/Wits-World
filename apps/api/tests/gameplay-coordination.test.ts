import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  GameplayActivitySnapshot,
  GameplayActivityStore,
  GameplayWorkerKind,
} from '../src/matches/gameplay-activity-store.js';
import {
  createGameplayCoordination,
  createGameplayExistingWorkGuard,
  createGameplayMutationGuard,
  GAMEPLAY_COORDINATION_POLL_INTERVAL_MS,
  GameplayCoordinationUnavailable,
  gameplayCoordinationNamespace,
} from '../src/matches/gameplay-coordination.js';
import { createLivePvpRuntimeScheduler } from '../src/matches/live-pvp-runtime-scheduler.js';
import { rankedTransaction } from '../src/matches/ranked-database.js';
import { createRankedService } from '../src/matches/ranked-service.js';
import type { TrustRestrictionService } from '../src/trust/trust-restrictions.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  const snapshot: GameplayActivitySnapshot = {
    epoch: 'test-epoch',
    live: { revision: 0, active: false },
    ranked: { revision: 0, active: false },
  };
  const store = {
    read: vi.fn(async () => structuredClone(snapshot)),
    markActive: vi.fn(async (worker: GameplayWorkerKind) => {
      snapshot[worker].active = true;
    }),
    begin: vi.fn().mockResolvedValue(undefined),
    contains: vi.fn().mockResolvedValue(true),
    finish: vi.fn().mockResolvedValue(undefined),
    removeAbandoned: vi.fn().mockResolvedValue(0),
    tryIdle: vi.fn().mockResolvedValue(true),
  } satisfies GameplayActivityStore;
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [{ acquired: true }] }),
    release: vi.fn(),
  };
  const database = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(client),
  };
  const wakes = { live: { wake: vi.fn() }, ranked: { wake: vi.fn() } };
  const logger = { error: vi.fn() };
  const coordination = createGameplayCoordination(
    database,
    store,
    wakes,
    logger,
  );
  return { snapshot, store, client, database, wakes, logger, coordination };
}

describe('durable gameplay coordination', () => {
  it('leaves PostgreSQL query-free for over five minutes, then discovers a remote commit without an HTTP wake', async () => {
    vi.useFakeTimers();
    const { snapshot, store, database, coordination, wakes } = setup();
    const persistedWork = vi.fn().mockResolvedValue(false);
    const runOnce = vi.fn().mockResolvedValue({
      matchesScanned: 1,
      transitionsCommitted: 0,
      failures: 0,
    });
    const scheduler = createLivePvpRuntimeScheduler(
      { runOnce },
      {
        purgeTransientAccess: vi
          .fn()
          .mockResolvedValue({ accessRowsDeleted: 0, ticketRowsDeleted: 0 }),
      },
      { error: vi.fn(), info: vi.fn() },
      {
        deadlineSweepIntervalMs: 1000,
        transientCleanupIntervalMs: 1_800_000,
        coordinatedIdle: true,
        hasActiveWork: async () => {
          if (await persistedWork()) {
            await coordination.observeActive('live', true);
            return true;
          }
          return !(await coordination.confirmIdle('live', persistedWork)).idle;
        },
      },
    );
    wakes.live.wake.mockImplementation(scheduler.wake);
    scheduler.start();
    coordination.start();
    await vi.advanceTimersByTimeAsync(1);
    const initialCheckouts = database.connect.mock.calls.length;
    const initialProbes = persistedWork.mock.calls.length;
    await vi.advanceTimersByTimeAsync(420_000);
    expect(database.connect).toHaveBeenCalledTimes(initialCheckouts);
    expect(persistedWork).toHaveBeenCalledTimes(initialProbes);
    expect(runOnce).not.toHaveBeenCalled();
    expect(store.read.mock.calls.length).toBeLessThan(50);

    // Another process published an intent and committed, but died before finish
    // or the response hook. The persistent activity flag still wakes this API.
    snapshot.live.active = true;
    snapshot.live.revision += 1;
    persistedWork.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(GAMEPLAY_COORDINATION_POLL_INTERVAL_MS);
    expect(runOnce).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runOnce).toHaveBeenCalledTimes(2);
    await coordination.stop();
    await scheduler.stop();
  });

  it('cannot declare idle while a writer holds the shared PostgreSQL fence', async () => {
    const { coordination, client, store } = setup();
    client.query.mockResolvedValue({ rows: [{ acquired: false }] });
    const probe = vi.fn().mockResolvedValue(false);
    expect(await coordination.confirmIdle('ranked', probe)).toEqual({
      idle: false,
      nextSweep: true,
    });
    expect(store.removeAbandoned).not.toHaveBeenCalled();
    expect(store.tryIdle).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('rollback');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('retains fast scans when a concurrent announcement prevents the idle CAS', async () => {
    const { coordination, store } = setup();
    store.tryIdle.mockResolvedValue(false);
    const probe = vi.fn().mockResolvedValue(1_800_000);
    expect(await coordination.confirmIdle('ranked', probe)).toEqual({
      idle: false,
      nextSweep: true,
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it('wakes both workers on Redis outage or epoch reset and logs no credentials', async () => {
    vi.useFakeTimers();
    const { coordination, store, snapshot, wakes, logger } = setup();
    coordination.start();
    await vi.advanceTimersByTimeAsync(0);
    await coordination.observeActive('live', true);
    await coordination.observeActive('ranked', true);
    wakes.live.wake.mockClear();
    wakes.ranked.wake.mockClear();
    store.read.mockRejectedValueOnce(new Error('private Redis URL token'));
    await vi.advanceTimersByTimeAsync(GAMEPLAY_COORDINATION_POLL_INTERVAL_MS);
    expect(wakes.live.wake).toHaveBeenCalledOnce();
    expect(wakes.ranked.wake).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
    snapshot.epoch = 'new-epoch';
    await vi.advanceTimersByTimeAsync(GAMEPLAY_COORDINATION_POLL_INTERVAL_MS);
    expect(wakes.live.wake).toHaveBeenCalledTimes(2);
    expect(wakes.ranked.wake).toHaveBeenCalledTimes(2);
    await coordination.stop();
  });

  it('does not turn a failed Redis idle confirmation into a long database sleep', async () => {
    const { coordination, store, client } = setup();
    store.read.mockRejectedValue(new Error('private Redis details'));
    expect(await coordination.confirmIdle('live', vi.fn())).toEqual({
      idle: false,
      nextSweep: true,
    });
    expect(store.tryIdle).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('rollback');
  });

  it('retries active publication after an outage so another replica can discover existing work', async () => {
    const { coordination, store, snapshot } = setup();
    store.markActive.mockRejectedValueOnce(new Error('Redis offline'));
    await coordination.observeActive('live', true);
    expect(snapshot.live.active).toBe(false);
    await coordination.observeActive('live', true);
    expect(store.markActive).toHaveBeenCalledTimes(2);
    expect((await store.read()).live.active).toBe(true);
    await coordination.observeActive('live', true);
    expect(store.markActive).toHaveBeenCalledTimes(2);
  });

  it('releases the connection destructively if rollback of the idle fence fails', async () => {
    const { coordination, client } = setup();
    client.query.mockImplementation(async (sql) => {
      if (sql === 'rollback') throw new Error('connection terminated');
      return { rows: [{ acquired: true }] };
    });
    await coordination.confirmIdle('live', async () => false);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('uses the same credential-free namespace for pooled and direct Neon connections', () => {
    const direct = gameplayCoordinationNamespace(
      'postgresql://user:secret@ep-example.neon.tech/production?sslmode=require',
    );
    expect(
      gameplayCoordinationNamespace(
        'postgresql://other:password@ep-example-pooler.neon.tech:5432/production',
      ),
    ).toBe(direct);
    expect(
      gameplayCoordinationNamespace(
        'postgresql://user:secret@ep-example.neon.tech/testing',
      ),
    ).not.toBe(direct);
    expect(direct).toMatch(/^[a-f0-9]{32}$/u);
  });
});

describe('pre-write gameplay mutation guard', () => {
  it('expires existing queue entries without Redis while new pairing still fails closed', async () => {
    const { store, database, client, logger } = setup();
    store.begin.mockRejectedValue(new Error('Redis offline'));
    client.query.mockImplementation(async (sql) => {
      if (sql === 'select clock_timestamp() as now') {
        return { rows: [{ now: new Date('2026-10-08T08:00:30.000Z') }] };
      }
      if (sql.includes('with due as')) return { rows: [{ id: 'expired' }] };
      return { rows: [] };
    });
    const service = createRankedService(
      {
        ...database,
        activityGuard: createGameplayMutationGuard(store, ['ranked'], logger),
        existingWorkGuard: createGameplayExistingWorkGuard('ranked'),
      },
      {} as TrustRestrictionService,
    );

    expect(await service.expireQueueEntries()).toBe(1);
    expect(store.begin).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'select pg_advisory_xact_lock_shared($1, $2)',
      [1_468_503_121, 2],
    );
    expect(client.query).toHaveBeenLastCalledWith('commit');
    expect(client.release).toHaveBeenCalledOnce();
    await expect(service.pairOnce()).rejects.toBeInstanceOf(
      GameplayCoordinationUnavailable,
    );
    expect(database.connect).toHaveBeenCalledOnce();
  });

  it('resolves an existing timed-out proposal without a durable producer signal', async () => {
    const { store, database, client, logger } = setup();
    store.begin.mockRejectedValue(new Error('Redis offline'));
    const proposalId = 'proposal';
    const now = new Date('2026-10-08T08:00:20.000Z');
    database.query.mockResolvedValue({ rows: [{ id: proposalId }] });
    client.query.mockImplementation(async (sql) => {
      if (sql === 'select clock_timestamp() as now') return { rows: [{ now }] };
      if (sql.includes('from private.ranked_matchmaking_proposals')) {
        return {
          rows: [
            {
              id: proposalId,
              season_id: 'season',
              status: 'awaiting_acceptance',
              acceptance_deadline: now,
            },
          ],
        };
      }
      if (sql.includes('from public.ranked_seasons')) {
        return {
          rows: [
            {
              status: 'active',
              active_ends_at: new Date(now.getTime() + 60_000),
            },
          ],
        };
      }
      if (
        sql.includes('from private.ranked_matchmaking_proposal_participants')
      ) {
        return {
          rows: ['one', 'two'].map((playerId) => ({
            player_id: playerId,
            queue_entry_id: playerId,
            acceptance_status: 'pending',
            territory_contender: false,
          })),
        };
      }
      if (sql.includes('from public.players')) {
        return { rows: [{ id: 'one' }, { id: 'two' }] };
      }
      return { rows: [] };
    });
    const service = createRankedService(
      {
        ...database,
        activityGuard: createGameplayMutationGuard(store, ['ranked'], logger),
        existingWorkGuard: createGameplayExistingWorkGuard('ranked'),
      },
      {} as TrustRestrictionService,
    );
    expect(await service.expireProposals()).toBe(1);
    expect(store.begin).not.toHaveBeenCalled();
    expect(client.query.mock.calls).toContainEqual([
      expect.stringContaining('update private.ranked_matchmaking_proposals'),
      [proposalId, 'expired', now],
    ]);
    for (const playerId of ['one', 'two']) {
      expect(client.query.mock.calls).toContainEqual([
        expect.stringContaining('update private.ranked_queue_entries'),
        [playerId, 'expired', now],
      ]);
    }
    expect(client.query).toHaveBeenLastCalledWith('commit');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('announces before checkout, fences before writes, and cleans up after commit and release', async () => {
    const { store, database, client, logger } = setup();
    const order: string[] = [];
    store.begin.mockImplementation(async () => {
      order.push('announce');
    });
    database.connect.mockImplementation(async () => {
      order.push('connect');
      return client;
    });
    client.query.mockImplementation(async (sql) => {
      order.push(sql);
      return { rows: [] };
    });
    store.contains.mockImplementation(async () => {
      order.push('verify');
      return true;
    });
    client.release.mockImplementation(() => {
      order.push('release');
    });
    store.finish.mockImplementation(async () => {
      order.push('finish');
    });
    const guard = createGameplayMutationGuard(
      store,
      ['ranked', 'live'],
      logger,
    );
    expect(
      await rankedTransaction(
        database,
        async () => {
          order.push('write');
          return 'committed';
        },
        guard,
      ),
    ).toBe('committed');
    expect(order).toEqual([
      'announce',
      'connect',
      'begin',
      'select pg_advisory_xact_lock_shared($1, $2)',
      'select pg_advisory_xact_lock_shared($1, $2)',
      'verify',
      'write',
      'commit',
      'release',
      'finish',
    ]);
    expect(client.query.mock.calls[1]?.[1]).toEqual([1_468_503_121, 1]);
    expect(client.query.mock.calls[2]?.[1]).toEqual([1_468_503_121, 2]);
  });

  it('fails closed before opening a database connection when announcement is unavailable', async () => {
    const { store, database, logger } = setup();
    store.begin.mockRejectedValue(new Error('private Redis token'));
    const operation = vi.fn();
    await expect(
      rankedTransaction(
        database,
        operation,
        createGameplayMutationGuard(store, ['ranked'], logger),
      ),
    ).rejects.toBeInstanceOf(GameplayCoordinationUnavailable);
    expect(database.connect).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it('aborts a delayed producer if recovery already removed its intent', async () => {
    const { store, database, client, logger } = setup();
    store.contains.mockResolvedValue(false);
    const operation = vi.fn();
    await expect(
      rankedTransaction(
        database,
        operation,
        createGameplayMutationGuard(store, ['ranked'], logger),
      ),
    ).rejects.toBeInstanceOf(GameplayCoordinationUnavailable);
    expect(operation).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('rollback');
    expect(store.finish).toHaveBeenCalledOnce();
  });

  it('cleans up abandoned signals when database checkout fails', async () => {
    const { store, database, logger } = setup();
    const error = new Error('checkout timeout');
    database.connect.mockRejectedValue(error);
    await expect(
      rankedTransaction(
        database,
        vi.fn(),
        createGameplayMutationGuard(store, ['ranked'], logger),
      ),
    ).rejects.toBe(error);
    expect(store.finish).toHaveBeenCalledOnce();
  });

  it('preserves a successful commit when post-commit Redis cleanup fails', async () => {
    const { store, database, client, logger } = setup();
    store.finish.mockRejectedValue(new Error('private Redis token'));
    expect(
      await rankedTransaction(
        database,
        async () => 'committed',
        createGameplayMutationGuard(store, ['ranked'], logger),
      ),
    ).toBe('committed');
    expect(client.query).toHaveBeenLastCalledWith('commit');
    expect(client.release).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
  });
});
