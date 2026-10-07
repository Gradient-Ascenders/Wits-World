import { randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type { Redis } from '@upstash/redis';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createGameplayCoordination,
  createGameplayExistingWorkGuard,
  createGameplayMutationGuard,
  GameplayCoordinationUnavailable,
} from '../src/matches/gameplay-coordination.js';
import { createUpstashGameplayActivityStore } from '../src/matches/gameplay-activity-store.js';
import {
  rankedTransaction,
  type RankedDatabase,
} from '../src/matches/ranked-database.js';

const databaseUrl = process.env.GAMEPLAY_COORDINATION_TEST_DATABASE_URL;
const redisContainer = process.env.GAMEPLAY_COORDINATION_TEST_REDIS_CONTAINER;
const redisHost = process.env.GAMEPLAY_COORDINATION_TEST_REDIS_HOST;
const enabled = Boolean(databaseUrl && (redisHost || redisContainer));
const orphanAfterMs = 100;
const advisoryLockClass = 1_468_503_121;
const isolatedCiDatabaseGuard =
  'postgresql://ci-guard:ci-guard@127.0.0.1:1/wits_world_ci_guard';
const workerId = { live: 1, ranked: 2 } as const;
const execFileAsync = promisify(execFileCallback);

describe.skipIf(!enabled)('gameplay coordination integration', () => {
  let pool: pg.Pool | undefined;
  let schema: string | undefined;
  let namespace: string | undefined;
  let store!: ReturnType<typeof createUpstashGameplayActivityStore>;
  let redis: Pick<Redis, 'eval' | 'hmget'> | undefined;

  function redisKeys(): string[] {
    if (!namespace) throw new Error('Redis test namespace is not initialized.');
    const prefix = `ww:gameplay:v1:${namespace}`;
    return [`${prefix}:state`, `${prefix}:live`, `${prefix}:ranked`];
  }

  async function redisCommand(args: string[]): Promise<unknown> {
    let executable: string;
    let executableArgs: string[];
    if (redisHost) {
      executable = 'redis-cli';
      executableArgs = ['-h', redisHost, '--json', ...args];
    } else if (redisContainer) {
      executable = 'docker';
      executableArgs = ['exec', redisContainer, 'redis-cli', '--json', ...args];
    } else {
      throw new Error('Redis integration target is not configured.');
    }
    const { stdout } = await execFileAsync(executable, executableArgs, {
      encoding: 'utf8',
      timeout: 10_000,
    });
    const output = stdout.toString().trim();
    return output.length > 0 ? JSON.parse(output) : null;
  }

  function createStore(adapter = redis) {
    if (!namespace) throw new Error('Redis test namespace is not initialized.');
    if (!adapter) throw new Error('Redis test adapter is not initialized.');
    return createUpstashGameplayActivityStore({
      url: 'https://redis.test.invalid',
      token: 'integration-test-only',
      namespace,
      timeoutMs: 10_000,
      orphanAfterMs,
      redis: adapter,
    });
  }

  function workTable(): string {
    if (!schema) throw new Error('PostgreSQL test schema is not initialized.');
    return `"${schema}".committed_work`;
  }

  function logger() {
    return { error: () => undefined };
  }

  function coordination() {
    if (!pool) throw new Error('PostgreSQL test pool is not initialized.');
    return createGameplayCoordination(
      pool,
      store,
      { live: { wake: () => undefined }, ranked: { wake: () => undefined } },
      logger(),
    );
  }

  beforeAll(async () => {
    if (!databaseUrl || (!redisHost && !redisContainer)) {
      throw new Error('Gameplay coordination integration env is incomplete.');
    }
    const database = new URL(databaseUrl);
    const host = database.hostname.replace(/^\[|\]$/gu, '');
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(host);
    const guardedCiService =
      process.env.CI === 'true' &&
      host === 'postgres' &&
      database.port === '5432' &&
      database.username === 'wits_world_ci' &&
      database.pathname === '/wits_world_test' &&
      process.env.DATABASE_URL === isolatedCiDatabaseGuard;
    if (!loopback && !guardedCiService) {
      throw new Error(
        'Gameplay coordination tests require isolated local PostgreSQL.',
      );
    }
    if (redisHost && !/^(?:[A-Za-z0-9][A-Za-z0-9.-]*|::1)$/u.test(redisHost)) {
      throw new Error('Gameplay coordination Redis host is invalid.');
    }
    if (
      !redisHost &&
      (!redisContainer || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(redisContainer))
    ) {
      throw new Error('Gameplay coordination Redis container name is invalid.');
    }

    pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    await pool.query('select 1');
    schema = `gameplay_coord_test_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`create schema "${schema}"`);
    await pool.query(
      `create table ${workTable()} (id uuid primary key, worker text not null)`,
    );

    namespace = `test_${randomUUID().replaceAll('-', '')}`;
    redis = {
      async eval<TArgs extends unknown[], TData = unknown>(
        script: string,
        keys: string[],
        args: TArgs,
      ): Promise<TData> {
        return (await redisCommand([
          'EVAL',
          script,
          String(keys.length),
          ...keys,
          ...args.map(String),
        ])) as TData;
      },
      async hmget<TData extends Record<string, unknown>>(
        key: string,
        ...fields: string[]
      ): Promise<TData | null> {
        const values = await redisCommand(['HMGET', key, ...fields]);
        if (!Array.isArray(values) || values.length !== fields.length) {
          throw new Error('Unexpected redis-cli HMGET response.');
        }
        if (values.every((value) => value === null)) return null;
        return Object.fromEntries(
          fields.map((field, index) => [field, values[index]]),
        ) as TData;
      },
    };
    store = createStore();
  }, 30_000);

  afterAll(async () => {
    try {
      if (pool && schema) await pool.query(`drop schema "${schema}" cascade`);
    } finally {
      await pool?.end();
    }
    if (namespace && (redisHost || redisContainer)) {
      await redisCommand(['DEL', ...redisKeys()]).catch(() => undefined);
    }
  });

  it('persists Lua intents across store instances and rejects stale idle CAS', async () => {
    const initial = await store.read();
    expect(initial.epoch).not.toHaveLength(0);
    expect(initial.live.active).toBe(true);
    expect(await store.tryIdle('live', initial)).toBe(true);

    const idleSnapshot = await store.read();
    const token = randomUUID();
    await store.begin(['live'], token);
    const begun = await store.read();
    expect(begun.live.revision).toBe(idleSnapshot.live.revision + 1);
    expect(begun.live.active).toBe(true);

    const secondStore = createStore();
    await expect(secondStore.contains(['live'], token)).resolves.toBe(true);
    await expect(secondStore.contains(['live', 'ranked'], token)).resolves.toBe(
      false,
    );

    await store.begin(['live'], token);
    expect((await store.read()).live.revision).toBe(begun.live.revision);
    await expect(store.tryIdle('live', idleSnapshot)).resolves.toBe(false);

    await secondStore.finish(['live'], token);
    await expect(store.contains(['live'], token)).resolves.toBe(false);
    expect((await store.read()).live.revision).toBe(begun.live.revision + 1);
  });

  it('fences shared writers against an exclusive transaction lock', async () => {
    const guard = createGameplayMutationGuard(store, ['live'], logger());
    const permit = await guard.begin();
    const blocker = await pool!.connect();
    const writer = await pool!.connect();
    let blockerTransaction = false;
    let writerTransaction = false;
    try {
      await blocker.query('begin');
      blockerTransaction = true;
      await blocker.query('select pg_advisory_xact_lock($1, $2)', [
        advisoryLockClass,
        workerId.live,
      ]);

      await writer.query('begin');
      writerTransaction = true;
      const entering = permit.enter(writer);
      const settled = entering.then(
        () => true,
        () => true,
      );
      const settledBeforeUnlock = await Promise.race([
        settled,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 75)),
      ]);
      expect(settledBeforeUnlock).toBe(false);

      await blocker.query('rollback');
      blockerTransaction = false;
      await expect(entering).resolves.toBeUndefined();

      const exclusiveProbe = await pool!.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock($1, $2) as acquired',
        [advisoryLockClass, workerId.live],
      );
      expect(exclusiveProbe.rows[0]?.acquired).toBe(false);
    } finally {
      if (writerTransaction) await writer.query('rollback');
      if (blockerTransaction) await blocker.query('rollback');
      writer.release();
      blocker.release();
      await permit.finish();
    }
  });

  it('rejects a delayed producer after locked orphan recovery removes its intent', async () => {
    const guard = createGameplayMutationGuard(store, ['ranked'], logger());
    const permit = await guard.begin();
    const reaper = await pool!.connect();
    let transaction = false;
    try {
      await reaper.query('begin');
      transaction = true;
      await reaper.query('select pg_advisory_xact_lock($1, $2)', [
        advisoryLockClass,
        workerId.ranked,
      ]);
      await new Promise((resolve) => setTimeout(resolve, orphanAfterMs + 75));
      await expect(store.removeAbandoned('ranked')).resolves.toBe(1);
      await reaper.query('rollback');
      transaction = false;

      const delayedWriter = await pool!.connect();
      try {
        await delayedWriter.query('begin');
        await expect(permit.enter(delayedWriter)).rejects.toBeInstanceOf(
          GameplayCoordinationUnavailable,
        );
      } finally {
        await delayedWriter.query('rollback');
        delayedWriter.release();
      }
    } finally {
      if (transaction) await reaper.query('rollback');
      reaper.release();
      await permit.finish();
    }
  });

  it('keeps idle CAS from winning against a concurrent durable begin', async () => {
    await pool!.query(`delete from ${workTable()}`);
    const coordinator = coordination();
    let enterProbe!: () => void;
    let releaseProbe!: () => void;
    const probeEntered = new Promise<void>((resolve) => {
      enterProbe = resolve;
    });
    const probeGate = new Promise<void>((resolve) => {
      releaseProbe = resolve;
    });

    const confirmation = coordinator.confirmIdle('ranked', async () => {
      enterProbe();
      await probeGate;
      return false;
    });
    await probeEntered;

    const token = randomUUID();
    await store.begin(['ranked'], token);
    releaseProbe();
    await expect(confirmation).resolves.toMatchObject({
      idle: false,
      nextSweep: true,
    });
    await expect(store.contains(['ranked'], token)).resolves.toBe(true);

    const client = await pool!.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock_shared($1, $2)', [
        advisoryLockClass,
        workerId.ranked,
      ]);
      await expect(store.contains(['ranked'], token)).resolves.toBe(true);
    } finally {
      await client.query('rollback');
      client.release();
      await store.finish(['ranked'], token);
    }
  });

  it('survives Redis state reset during a writer transaction and finds committed work', async () => {
    await pool!.query(`delete from ${workTable()}`);
    const before = await store.read();
    if (before.ranked.active) {
      expect(await store.tryIdle('ranked', before)).toBe(true);
    }
    const priorEpoch = (await store.read()).epoch;

    const guard = createGameplayMutationGuard(store, ['ranked'], logger());
    const permit = await guard.begin();
    const writer = await pool!.connect();
    let transaction = false;
    let writerReleased = false;
    let committedId: string | undefined;
    try {
      await writer.query('begin');
      transaction = true;
      await permit.enter(writer);
      committedId = randomUUID();
      await writer.query(
        `insert into ${workTable()} (id, worker) values ($1, 'ranked')`,
        [committedId],
      );

      await redisCommand(['DEL', ...redisKeys()]);
      const whileWriterOpen = await coordination().confirmIdle(
        'ranked',
        async () => false,
      );
      expect(whileWriterOpen.idle).toBe(false);

      await writer.query('commit');
      transaction = false;
      writer.release();
      writerReleased = true;

      // Deliberately omit permit.finish(): this models a creator crash after
      // its PostgreSQL commit but before the Redis intent cleanup.
      const recovery = await coordination().confirmIdle(
        'ranked',
        async (client) => {
          const result = await client.query<{ pending: boolean }>(
            `select exists (select 1 from ${workTable()} where id = $1) as pending`,
            [committedId],
          );
          return result.rows[0]?.pending ?? false;
        },
      );
      expect(recovery).toMatchObject({ idle: false, nextSweep: true });
      const recoveredSnapshot = await store.read();
      expect(recoveredSnapshot.epoch).not.toBe(priorEpoch);
      expect(recoveredSnapshot.ranked.active).toBe(true);
    } finally {
      if (transaction) await writer.query('rollback');
      if (!writerReleased) writer.release();
    }
  });

  it('commits existing-work expiry during a Redis outage only with the explicit PG guard', async () => {
    const id = randomUUID();
    await pool!.query(
      `insert into ${workTable()} (id, worker) values ($1, 'ranked')`,
      [id],
    );
    let redisCalls = 0;
    const unavailableStore = createStore({
      async eval() {
        redisCalls += 1;
        throw new Error('Redis offline in integration test.');
      },
      async hmget() {
        redisCalls += 1;
        throw new Error('Redis offline in integration test.');
      },
    });
    const database: RankedDatabase = {
      connect: pool!.connect.bind(pool!),
      query: pool!.query.bind(pool!),
      activityGuard: createGameplayMutationGuard(
        unavailableStore,
        ['ranked'],
        logger(),
      ),
    };
    let writes = 0;
    async function expire(client: pg.PoolClient): Promise<number> {
      writes += 1;
      const result = await client.query<{ id: string }>(
        `delete from ${workTable()} where id = $1 returning id`,
        [id],
      );
      return result.rows.length;
    }

    try {
      // An absent override must retain the fail-closed producer guard.
      await expect(
        rankedTransaction(database, expire, database.existingWorkGuard),
      ).rejects.toBeInstanceOf(GameplayCoordinationUnavailable);
      expect(writes).toBe(0);
      expect(redisCalls).toBe(1);
      const before = await pool!.query<{ pending: boolean }>(
        `select exists (select 1 from ${workTable()} where id = $1) as pending`,
        [id],
      );
      expect(before.rows[0]?.pending).toBe(true);

      database.existingWorkGuard = createGameplayExistingWorkGuard('ranked');
      await expect(
        rankedTransaction(database, expire, database.existingWorkGuard),
      ).resolves.toBe(1);
      expect(writes).toBe(1);
      expect(redisCalls).toBe(1);
      const after = await pool!.query<{ pending: boolean }>(
        `select exists (select 1 from ${workTable()} where id = $1) as pending`,
        [id],
      );
      expect(after.rows[0]?.pending).toBe(false);
    } finally {
      await pool!.query(`delete from ${workTable()} where id = $1`, [id]);
    }
  });

  it('serializes the existing-work PG guard with exclusive idle confirmation in both directions', async () => {
    await pool!.query(`delete from ${workTable()}`);
    const id = randomUUID();
    await pool!.query(
      `insert into ${workTable()} (id, worker) values ($1, 'ranked')`,
      [id],
    );
    const permit = await createGameplayExistingWorkGuard('ranked').begin();
    const idle = await pool!.connect();
    const writer = await pool!.connect();
    let idleTransaction = false;
    let writerTransaction = false;
    try {
      await idle.query('begin');
      idleTransaction = true;
      await idle.query('select pg_advisory_xact_lock($1, $2)', [
        advisoryLockClass,
        workerId.ranked,
      ]);
      await writer.query('begin');
      writerTransaction = true;
      const backend = await writer.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      );
      const entering = permit.enter(writer);
      let settled = false;
      void entering.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      let waiting = false;
      const waitUntil = Date.now() + 1_000;
      // Observe the blocked PostgreSQL lock request before releasing the fence.
      while (!waiting && Date.now() < waitUntil) {
        const locks = await pool!.query<{ waiting: boolean }>(
          `select exists (
             select 1 from pg_locks
              where pid = $1 and locktype = 'advisory' and not granted
           ) as waiting`,
          [backend.rows[0]?.pid],
        );
        waiting = locks.rows[0]?.waiting ?? false;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      expect(settled).toBe(false);

      await idle.query('rollback');
      idleTransaction = false;
      await expect(entering).resolves.toBeUndefined();
      await writer.query(`delete from ${workTable()} where id = $1`, [id]);
      const coordinator = coordination();
      let probes = 0;
      async function probe(client: pg.PoolClient): Promise<boolean> {
        probes += 1;
        const result = await client.query<{ pending: boolean }>(
          `select exists (
             select 1 from ${workTable()} where worker = 'ranked'
           ) as pending`,
        );
        return result.rows[0]?.pending ?? false;
      }

      await expect(coordinator.confirmIdle('ranked', probe)).resolves.toEqual({
        idle: false,
        nextSweep: true,
      });
      expect(probes).toBe(0);

      await writer.query('commit');
      writerTransaction = false;
      await expect(coordinator.confirmIdle('ranked', probe)).resolves.toEqual({
        idle: true,
        nextSweep: false,
      });
      expect(probes).toBe(1);
      expect((await store.read()).ranked.active).toBe(false);
    } finally {
      try {
        if (idleTransaction) {
          await idle.query('rollback');
          idleTransaction = false;
        }
      } finally {
        idle.release(idleTransaction);
        try {
          if (writerTransaction) {
            await writer.query('rollback');
            writerTransaction = false;
          }
        } finally {
          writer.release(writerTransaction);
          await permit.finish();
          await pool!.query(`delete from ${workTable()} where id = $1`, [id]);
        }
      }
    }
  });
});
