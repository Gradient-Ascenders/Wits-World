import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import type { Redis } from '@upstash/redis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../src/database/migrations.js';
import { runSeeds } from '../src/database/seeds.js';
import {
  createDatabasePool,
  createListenerDatabasePool,
} from '../src/database/connection.js';
import {
  createLivePvpNotificationListener,
  GAMEPLAY_WORK_NOTIFY_CHANNEL,
} from '../src/matches/live-pvp-notifications.js';
import { createPostgresGameplayCoordination } from '../src/matches/postgres-gameplay-coordination.js';
import {
  createGameplayCoordination,
  createGameplayMutationGuard,
} from '../src/matches/gameplay-coordination.js';
import { createUpstashGameplayActivityStore } from '../src/matches/gameplay-activity-store.js';
import {
  hasLivePvpWork,
  nextRankedSweep,
} from '../src/matches/gameplay-work.js';
import { createLivePvpService } from '../src/matches/live-pvp-service.js';
import { createRankedService } from '../src/matches/ranked-service.js';
import { maintainRankedSeasons } from '../src/matches/ranked-season-service.js';
import { createTrustRestrictionService } from '../src/trust/trust-restrictions.js';
import { rankedTransaction } from '../src/matches/ranked-database.js';
import type { DatabaseConfig } from '../src/config/database.js';

const url = process.env.POSTGRES_GAMEPLAY_TEST_DATABASE_URL;
// These tests create databases and terminate only their own listener backend.
if (url && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname))
  throw new Error(
    'PostgreSQL gameplay integrations require an isolated local target.',
  );
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const exec = promisify(execFile);

describe.skipIf(!url)(
  'PostgreSQL gameplay migration on isolated infrastructure',
  () => {
    let admin: pg.Pool;
    let shared: pg.Pool;
    let dbName: string;
    let config: DatabaseConfig;
    let pools: pg.Pool[];
    let listeners: ReturnType<typeof createLivePvpNotificationListener>[];
    const clients: pg.PoolClient[] = [];
    const hints = [vi.fn(), vi.fn()];
    const coordinatorWake: (
      ((worker: 'ranked' | 'live') => void) | undefined
    )[] = [];
    const ready = [vi.fn(), vi.fn()];
    const gateways = [0, 1].map(() => ({
      broadcastMatch: vi.fn().mockResolvedValue(undefined),
      broadcastPresence: vi.fn().mockResolvedValue(undefined),
      recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
    }));
    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: url, max: 1 });
      dbName = 'coord_' + randomUUID().replaceAll('-', '');
      await admin.query('create database ' + dbName);
      const testUrl = new URL(url!);
      testUrl.pathname = '/' + dbName;
      config = {
        connectionString: testUrl.toString(),
        target: 'test',
        variableName: 'TEST_DATABASE_URL',
      };
      await runMigrations(config);
      await runSeeds(config);
      shared = createDatabasePool(config, { logger });
      pools = [0, 1].map((index) => {
        const pool = createListenerDatabasePool(
          {
            connectionString: config.connectionString,
            variableName: 'LISTENER_DATABASE_URL',
          },
          { logger },
        );
        pool.on('acquire', (client) => {
          clients[index] = client;
        });
        return pool;
      });
      listeners = pools.map((pool, index) =>
        createLivePvpNotificationListener(pool, gateways[index]!, logger, {
          onWake: (worker) => {
            hints[index]!(worker);
            coordinatorWake[index]?.(worker);
          },
          onReady: ready[index],
        }),
      );
      await Promise.all(listeners.map((l) => l.startCoordination()));
    }, 180_000);
    afterAll(async () => {
      await Promise.allSettled(
        (listeners ?? []).map((l) => l.stopCoordination()),
      );
      await Promise.allSettled((pools ?? []).map((p) => p.end()));
      if (shared) await shared.end();
      if (admin) {
        if (dbName)
          await admin.query(
            'drop database if exists ' + dbName + ' with (force)',
          );
        await admin.end();
      }
    });
    async function season(
      client: Pick<pg.Pool | pg.PoolClient, 'query'> = shared,
    ) {
      const id = randomUUID();
      await client.query(
        `insert into public.ranked_seasons(id,policy_version,name,intended_start_at) values($1,'ranked-v1','Coordination fixture',clock_timestamp()+interval '2 days')`,
        [id],
      );
      return id;
    }
    it('measures one/two-process discovery occupancy, query load, and legacy idle acquisition cost', async () => {
      const held: pg.PoolClient[] = [];
      try {
        for (let i = 0; i < 4; i++) held.push(await shared.connect());
        const durations: number[] = [];
        for (let i = 0; i < 12; i++) {
          const begin = performance.now();
          await listeners[i % 2]!.readGameplayWork();
          durations.push(performance.now() - begin);
        }
        expect(shared.totalCount).toBe(4);
        expect(shared.waitingCount).toBe(0);
        expect(
          pools.every(
            (p) =>
              p.options.max === 1 &&
              p.totalCount === 1 &&
              p.idleCount === 0 &&
              p.waitingCount === 0,
          ),
        ).toBe(true);
        durations.sort((a, b) => a - b);
        console.log(
          JSON.stringify({
            fixture: 'postgres_discovery',
            processes: 2,
            probes: 12,
            additional_shared_acquisitions: 0,
            median_ms: durations[6],
            max_ms: durations.at(-1),
            configured_shared_max: shared.options.max,
            direct_clients: 2,
          }),
        );
      } finally {
        held.forEach((c) => c.release());
      }
      const container = process.env.GAMEPLAY_COORDINATION_TEST_REDIS_CONTAINER;
      if (!container)
        throw new Error('Legacy comparison requires isolated Redis.');
      async function command(args: string[]) {
        const r = await exec(
          'docker',
          ['exec', container!, 'redis-cli', '--json', ...args],
          { timeout: 10_000 },
        );
        return JSON.parse(r.stdout.trim()) as unknown;
      }
      const adapter = {
        eval: (script: string, keys: string[], args: unknown[]) =>
          command([
            'EVAL',
            script,
            String(keys.length),
            ...keys,
            ...args.map(String),
          ]),
        hmget: (key: string, ...fields: string[]) =>
          command(['HMGET', key, ...fields]),
      } as unknown as Pick<Redis, 'eval' | 'hmget'>;
      const store = createUpstashGameplayActivityStore({
        url: 'https://isolated.invalid',
        token: 'fixture-only',
        namespace: randomUUID(),
        timeoutMs: 10_000,
        redis: adapter,
      });
      let acquisitions = 0,
        statements = 0;
      const holds: number[] = [];
      const database = {
        connect: async () => {
          acquisitions++;
          const c = await shared.connect();
          const begin = performance.now();
          return new Proxy(c, {
            get(target, key) {
              if (key === 'query')
                return (...args: unknown[]) => {
                  statements++;
                  return Reflect.apply(target.query, target, args);
                };
              if (key === 'release')
                return () => {
                  holds.push(performance.now() - begin);
                  c.release();
                };
              const value = Reflect.get(target, key, target) as unknown;
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
      };
      const legacy = createGameplayCoordination(
        database,
        store,
        { live: { wake: vi.fn() }, ranked: { wake: vi.fn() } },
        logger,
      );
      expect((await legacy.confirmIdle('live', hasLivePvpWork)).idle).toBe(
        true,
      );
      expect((await legacy.confirmIdle('ranked', nextRankedSweep)).idle).toBe(
        true,
      );
      expect(acquisitions).toBe(2);
      expect(statements).toBe(8);
      console.log(
        JSON.stringify({
          fixture: 'legacy_idle_confirmations',
          decisions: 2,
          shared_acquisitions: acquisitions,
          sql_statements: statements,
          hold_total_ms: holds.reduce((a, b) => a + b, 0),
          hold_max_ms: Math.max(...holds),
          transport:
            'Redis through Docker CLI; latency is not comparable to production',
        }),
      );
    }, 30_000);
    it('runs two independent coordinators on the existing sessions and delivers committed wakeups to both', async () => {
      const workers = [0, 1].map(() => ({
        live: { wake: vi.fn() },
        ranked: { wake: vi.fn() },
      }));
      const coordinators = listeners.map((listener, index) =>
        createPostgresGameplayCoordination(listener, workers[index]!, logger),
      );
      const probes = listeners.map((listener) =>
        vi.spyOn(listener, 'readGameplayWork'),
      );
      coordinators.forEach((coordinator, index) => {
        coordinatorWake[index] = (worker) => coordinator.wake(worker);
      });
      try {
        await Promise.all(
          coordinators.map((coordinator) => coordinator.start()),
        );
        await vi.waitUntil(() =>
          probes.every(
            (probe) => probe.mock.settledResults[0]?.type === 'fulfilled',
          ),
        );
        const before = workers.map(
          (worker) => worker.ranked.wake.mock.calls.length,
        );
        await season();
        await vi.waitUntil(
          () =>
            workers.every(
              (worker, index) =>
                worker.ranked.wake.mock.calls.length > before[index]!,
            ),
          { timeout: 3000 },
        );
        expect(
          pools.every(
            (pool) => pool.totalCount === 1 && pool.waitingCount === 0,
          ),
        ).toBe(true);
        const committed = workers.map(
          (worker) => worker.ranked.wake.mock.calls.length,
        );
        const c = await shared.connect();
        try {
          await c.query('begin');
          await season(c);
          await c.query('rollback');
        } finally {
          c.release();
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(
          workers.map((worker) => worker.ranked.wake.mock.calls.length),
        ).toEqual(committed);
      } finally {
        await Promise.all(
          coordinators.map((coordinator) => coordinator.stop()),
        );
        coordinatorWake.fill(undefined);
        probes.forEach((probe) => probe.mockRestore());
        await Promise.all(
          listeners.map((listener) => listener.startCoordination()),
        );
      }
    });
    it('publishes committed hints to two processes and emits nothing for rollback or metadata-only updates', async () => {
      const before = hints.map((h) => h.mock.calls.length);
      const c = await shared.connect();
      let committed: string;
      try {
        await c.query('begin');
        await season(c);
        await c.query('rollback');
        await c.query('begin');
        committed = await season(c);
        await c.query('commit');
      } finally {
        c.release();
      }
      await vi.waitUntil(
        () => hints.every((h, i) => h.mock.calls.length === before[i]! + 1),
        { timeout: 3000 },
      );
      const baseline = hints.map((h) => h.mock.calls.length);
      await shared.query(
        'update public.ranked_seasons set name=$2,version=version+1,updated_at=clock_timestamp() where id=$1',
        [committed!, 'Metadata only'],
      );
      await new Promise((r) => setTimeout(r, 50));
      expect(hints.map((h) => h.mock.calls.length)).toEqual(baseline);
    });
    it('discovers no uncommitted work, then observes a delayed commit without Redis intent replication', async () => {
      const c = await shared.connect();
      const before = hints.map((h) => h.mock.calls.length);
      try {
        await c.query('begin');
        const id = await season(c);
        await new Promise((r) => setTimeout(r, 50));
        expect(hints.map((h) => h.mock.calls.length)).toEqual(before);
        expect((await listeners[0]!.readGameplayWork()).ranked).toBeTypeOf(
          'number',
        );
        await c.query('commit');
        await vi.waitUntil(
          () => hints.every((h, i) => h.mock.calls.length > before[i]!),
          { timeout: 3000 },
        );
        expect(
          (
            await shared.query(
              'select count(*)::int as n from public.ranked_seasons where id=$1',
              [id],
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        await c.query('rollback');
        c.release();
      }
    });
    it('recovers a missing notification in ten seconds through the occupied direct session', async () => {
      let count = 0;
      const worker = {
        wake: () => {
          count++;
        },
      };
      const coordinator = createPostgresGameplayCoordination(
        listeners[0]!,
        { ranked: worker, live: { wake: vi.fn() } },
        logger,
      );
      const probe = vi.spyOn(listeners[0]!, 'readGameplayWork');
      await coordinator.start();
      await vi.waitUntil(
        () => probe.mock.settledResults[0]?.type === 'fulfilled',
      );
      expect(count).toBe(0);
      await clients[0]!.query('unlisten ' + GAMEPLAY_WORK_NOTIFY_CHANNEL);
      try {
        const id = await season();
        await shared.query(
          `update public.ranked_seasons set intended_start_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=$1`,
          [id],
        );
        const start = performance.now();
        await vi.waitUntil(() => count > 0, { timeout: 12_000, interval: 20 });
        expect(performance.now() - start).toBeLessThan(11_500);
        await clients[0]!.query('listen ' + GAMEPLAY_WORK_NOTIFY_CHANNEL);
      } finally {
        await coordinator.stop();
        await listeners[0]!.startCoordination();
      }
    }, 15_000);
    it('reconnects the same max1 pool and reconciles work committed during disconnection', async () => {
      const before = ready[1]!.mock.calls.length;
      const pid = await clients[1]!.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      );
      await admin.query('select pg_terminate_backend($1)', [pid.rows[0]!.pid]);
      await season();
      await vi.waitUntil(() => ready[1]!.mock.calls.length > before, {
        timeout: 8000,
        interval: 25,
      });
      expect(pools[1]!.totalCount).toBe(1);
      expect(gateways[1]!.recoverNotificationGap).toHaveBeenCalledOnce();
      await listeners[1]!.readGameplayWork();
    }, 10_000);
    it('requires migration readiness instead of enabling a falsely idle consumer', async () => {
      await shared.query(
        'alter table public.ranked_seasons disable trigger gameplay_work_wakeup',
      );
      try {
        await expect(listeners[1]!.readGameplayWork()).rejects.toThrow(
          /failed/u,
        );
      } finally {
        await shared.query(
          'alter table public.ranked_seasons enable trigger gameplay_work_wakeup',
        );
      }
      await listeners[1]!.startCoordination();
      expect(await listeners[1]!.readGameplayWork()).toHaveProperty('ranked');
    });
    it('retains Redis producer guard calls while delivering PostgreSQL hints', async () => {
      const store = {
        begin: vi.fn().mockResolvedValue(undefined),
        contains: vi.fn().mockResolvedValue(true),
        finish: vi.fn().mockResolvedValue(undefined),
      };
      const guard = createGameplayMutationGuard(
        store as never,
        ['ranked'],
        logger,
      );
      const before = hints[0]!.mock.calls.length;
      await rankedTransaction(
        {
          connect: shared.connect.bind(shared),
          query: shared.query.bind(shared),
          activityGuard: guard,
        },
        (c) => season(c),
      );
      expect(store.begin).toHaveBeenCalledOnce();
      expect(store.contains).toHaveBeenCalledOnce();
      expect(store.finish).toHaveBeenCalledOnce();
      await vi.waitUntil(() => hints[0]!.mock.calls.length > before, {
        timeout: 3000,
      });
    });
    it('serializes concurrent season activation, queue pairing and acceptance with actual domain constraints', async () => {
      const due = await shared.query<{ id: string }>(
        "select id::text from public.ranked_seasons where status='scheduled' order by intended_start_at,id limit 1",
      );
      await shared.query(
        'update public.ranked_seasons set intended_start_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=$1',
        [due.rows[0]!.id],
      );
      const transitions = await Promise.all([
        maintainRankedSeasons(shared),
        maintainRankedSeasons(shared),
      ]);
      expect(transitions.filter((t) => t.activatedSeason)).toHaveLength(1);
      const cards = (
        await shared.query<{ id: string; category: string; affinity: string }>(
          `select id::text,category,affinity from public.card_definitions where is_active and authoring_status='published' and rarity='common' order by category,affinity nulls last,id`,
        )
      ).rows;
      const selected = [
        ...cards.filter((c) => c.category === 'creature').slice(0, 3),
        ...cards.filter((c) => c.category === 'power').slice(0, 2),
      ];
      const players = await Promise.all([
        makePlayer(selected),
        makePlayer(selected),
      ]);
      const service = createRankedService(
        shared,
        createTrustRestrictionService(shared),
      );
      await Promise.all(players.map((p) => service.join(p.playerId, p.deckId)));
      const paired = await Promise.all([
        service.pairOnce(),
        service.pairOnce(),
      ]);
      expect(paired.filter(Boolean)).toHaveLength(1);
      const proposal = (await service.status(players[0]!.playerId)).proposalId!;
      const accepted = await Promise.all(
        players.map((p) => service.accept(p.playerId, proposal)),
      );
      expect(accepted.some((v) => v.matchId)).toBe(true);
      const matches = await shared.query(
        "select count(*)::int as n from public.live_pvp_matches where status='active'",
      );
      expect(matches.rows[0].n).toBe(1);
      expect((await listeners[0]!.readGameplayWork()).live).toBe(true);
    }, 15_000);
    async function makePlayer(
      cards: readonly { id: string; affinity: string }[],
    ) {
      const playerId = randomUUID(),
        deckId = randomUUID(),
        grant = randomUUID();
      await shared.query(
        `insert into public.players(id,auth_issuer,auth_subject,player_name,role) values($1,'https://isolated.test/',$2,$3,'player')`,
        [playerId, playerId, 'coord_' + playerId.slice(0, 8)],
      );
      await shared.query(
        'insert into public.player_starter_grants(id,player_id,affinity) values($1,$2,$3)',
        [grant, playerId, cards[0]!.affinity],
      );
      await shared.query(
        'insert into public.player_decks(id,player_id,name) values($1,$2,$3)',
        [deckId, playerId, 'Coordination deck'],
      );
      for (const [i, card] of cards.entries()) {
        const owned = randomUUID();
        await shared.query(
          `insert into public.player_cards(id,player_id,card_definition_id,acquisition_kind,source_starter_grant_id) values($1,$2,$3,'starter',$4)`,
          [owned, playerId, card.id, grant],
        );
        await shared.query(
          'insert into public.player_deck_cards(deck_id,player_id,owned_card_id,position) values($1,$2,$3,$4)',
          [deckId, playerId, owned, i + 1],
        );
      }
      return { playerId, deckId };
    }
    it('serializes concurrent deadline decisions without duplicate versions and wakes both listeners', async () => {
      const match = (
        await shared.query<{ id: string }>(
          "select id::text from public.live_pvp_matches where status='active'",
        )
      ).rows[0]!;
      const c = await shared.connect();
      try {
        await c.query('begin');
        // Age only this disposable fixture, as in the existing persistence suite.
        await c.query("set local session_replication_role = 'replica'");
        await c.query(
          "update public.live_pvp_matches set decision_started_at=transaction_timestamp()-interval '61 seconds',turn_deadline=transaction_timestamp()-interval '1 second' where id=$1",
          [match.id],
        );
        await c.query('commit');
      } finally {
        await c.query('rollback');
        c.release();
      }
      const before = hints.map((h) => h.mock.calls.length);
      const service = createLivePvpService(shared, { randomInt: () => 0 });
      const transitions = await Promise.all([
        service.processOverdueMatch(match.id),
        service.processOverdueMatch(match.id),
      ]);
      // Initial selection has two independent overdue player decisions.
      expect(transitions.filter((t) => t.transitioned)).toHaveLength(2);
      expect(transitions.map((t) => t.version).sort()).toEqual([1, 2]);
      expect(
        (
          await shared.query(
            'select version,phase from public.live_pvp_matches where id=$1',
            [match.id],
          )
        ).rows[0],
      ).toMatchObject({ version: 2, phase: 'active' });
      const active = await shared.connect();
      try {
        await active.query('begin');
        await active.query("set local session_replication_role = 'replica'");
        await active.query(
          "update public.live_pvp_matches set decision_started_at=transaction_timestamp()-interval '61 seconds',turn_deadline=transaction_timestamp()-interval '1 second' where id=$1",
          [match.id],
        );
        await active.query('commit');
      } finally {
        await active.query('rollback');
        active.release();
      }
      const turns = await Promise.all([
        service.processOverdueMatch(match.id),
        service.processOverdueMatch(match.id),
      ]);
      expect(turns.filter((t) => t.transitioned)).toHaveLength(1);
      expect(turns.find((t) => t.transitioned)).toMatchObject({
        previousVersion: 2,
        version: 3,
      });
      await vi.waitUntil(
        () => hints.every((h, i) => h.mock.calls.length > before[i]!),
        { timeout: 3000 },
      );
      expect(hints.every((h) => h.mock.calls.at(-1)?.[0] === 'live')).toBe(
        true,
      );
      expect(await service.listDueMatchIds()).not.toContain(match.id);
    });
    it('bounds a stalled discovery query and destroys its session before reconnecting', async () => {
      const active = clients[0]!;
      const query = active.query.bind(active) as (
        config: pg.QueryConfig,
      ) => Promise<pg.QueryResult>;
      const spy = vi.spyOn(active, 'query').mockImplementationOnce(((
        input: pg.QueryConfig,
      ) =>
        query({
          ...input,
          text: 'select pg_sleep(2)',
        })) as typeof active.query);
      const start = performance.now();
      await expect(listeners[0]!.readGameplayWork()).rejects.toThrow(/failed/u);
      expect(performance.now() - start).toBeLessThan(1800);
      spy.mockRestore();
      await vi.waitUntil(() => pools[0]!.totalCount === 1, {
        timeout: 8000,
        interval: 25,
      });
    }, 10_000);
    it('does not change constraints, indexes or authoritative deadline expressions', () => {
      const sql = readFileSync(
        new URL(
          '../../../database/migrations/0066_notify_gameplay_work.sql',
          import.meta.url,
        ),
        'utf8',
      );
      expect(sql).not.toMatch(
        /alter table|drop|create index|update public|update private/iu,
      );
      expect(sql).toContain('NEW.turn_deadline');
    });
  },
);
