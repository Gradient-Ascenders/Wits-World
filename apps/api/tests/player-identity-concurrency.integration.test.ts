import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { createDatabasePool } from '../src/database/connection.js';
import {
  createPlayerIdentityService,
  DeletedIdentityTokenError,
} from '../src/players/player-identity.js';

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'disposable PostgreSQL concurrent identity reads',
  () => {
    let admin: pg.Pool;
    let pool: pg.Pool;
    let name: string;
    let created = false;
    const issuer = 'https://identity-concurrency.example.test/';
    const issuedAt = new Date('2026-08-30T12:00:00Z');
    const logger = { info() {}, error() {} };

    beforeAll(async () => {
      loadApiEnvironment();
      const config = buildDatabaseConfig({ target: 'test' });
      admin = createDatabasePool(config, { logger });
      name = `wits_identity_reads_${Date.now()}_${process.pid}`;
      await admin.query(`create database ${name}`);
      created = true;
      const url = new URL(config.connectionString);
      url.pathname = `/${name}`;
      const fixtureConfig: DatabaseConfig = {
        ...config,
        connectionString: url.toString(),
      };
      pool = createDatabasePool(fixtureConfig, { logger });
      // Minimal isolated identity fixture, not a substitute for the full
      // migration/deletion-retention suite. Query and lock paths are real.
      await pool.query(`
        create schema private;
        create table public.players (
          id uuid primary key,
          auth_issuer text not null,
          auth_subject text not null,
          player_name text,
          role text not null default 'player',
          lifecycle_status text not null default 'active',
          updated_at timestamptz not null default now(),
          unique (auth_issuer, auth_subject)
        );
        create unique index players_player_name_case_insensitive_unique
          on public.players (lower(player_name));
        create table private.deleted_identity_token_denials (
          identity_salt bytea not null,
          identity_digest bytea not null,
          tokens_issued_before timestamptz not null,
          expires_at timestamptz not null
        );
      `);
    }, 30_000);

    afterAll(async () => {
      await pool?.end();
      if (created) await admin.query(`drop database ${name} with (force)`);
      await admin?.end();
    }, 30_000);

    const principal = (subject: string) => ({
      issuer,
      subject,
      connectionStrategy: 'auth0' as const,
      playerName: subject,
      tokenIssuedAt: issuedAt,
    });

    async function seed(subject: string) {
      const id = randomUUID();
      await pool.query(
        `insert into public.players
          (id, auth_issuer, auth_subject, player_name, role)
          values ($1, $2, $3, $3, 'player')`,
        [id, issuer, subject],
      );
      return id;
    }

    it('lets a fresh role read finish while a previous result is delayed', async () => {
      const subject = 'existing-player';
      const id = await seed(subject);
      let notifyRead!: () => void;
      let finishFirst!: () => void;
      const read = new Promise<void>((resolve) => (notifyRead = resolve));
      const delay = new Promise<void>((resolve) => (finishFirst = resolve));
      let calls = 0;
      const database = {
        connect: pool.connect.bind(pool),
        async query(statement: string, values: unknown[]) {
          const result = await pool.query(statement, values);
          if (++calls === 1) {
            notifyRead();
            await delay;
          }
          return result;
        },
      };
      const service = createPlayerIdentityService(
        database as unknown as Pick<pg.Pool, 'query' | 'connect'>,
      );
      const first = service.resolve(principal(subject));
      try {
        await read;
        await pool.query(
          `update public.players set role='author' where id=$1`,
          [id],
        );
        const follower = service.resolve(principal(subject));
        await expect(follower).resolves.toMatchObject({ id, role: 'author' });
        expect(calls).toBe(2);
      } finally {
        finishFirst();
        await expect(first).resolves.toMatchObject({ id, role: 'player' });
      }
    }, 15_000);

    it('keeps concurrent first-time provisioning to one transaction and one player', async () => {
      const subject = 'new-player';
      let transactions = 0;
      const database = {
        query: pool.query.bind(pool),
        connect() {
          transactions++;
          return pool.connect();
        },
      };
      const service = createPlayerIdentityService(database);
      const players = await Promise.all(
        Array.from({ length: 3 }, () => service.resolve(principal(subject))),
      );
      expect(new Set(players.map((player) => player.id)).size).toBe(1);
      expect(transactions).toBe(1);
      const count = await pool.query<{ count: number }>(
        `select count(*)::integer as count from public.players
          where auth_issuer=$1 and auth_subject=$2`,
        [issuer, subject],
      );
      expect(count.rows[0]?.count).toBe(1);
      expect(pool.waitingCount).toBe(0);
    }, 15_000);

    it('keeps both concurrent reads behind the deletion row lock', async () => {
      const subject = 'deleting-player';
      const id = await seed(subject);
      const deletion = await pool.connect();
      const service = createPlayerIdentityService(pool);
      let reads: Promise<unknown>[] = [];
      try {
        await deletion.query('begin');
        await deletion.query(
          `select id from public.players where id=$1 for update`,
          [id],
        );
        let completed = 0;
        reads = Array.from({ length: 2 }, () =>
          service.resolve(principal(subject)).then((player) => {
            completed++;
            return player;
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(completed).toBe(0);
        await deletion.query(
          `update public.players set lifecycle_status='deletion_pending' where id=$1`,
          [id],
        );
        await deletion.query('commit');
        const players = await Promise.all(reads);
        expect(players).toEqual([
          expect.objectContaining({ lifecycleStatus: 'deletion_pending' }),
          expect.objectContaining({ lifecycleStatus: 'deletion_pending' }),
        ]);
      } finally {
        await deletion.query('rollback');
        deletion.release();
        await Promise.allSettled(reads);
      }
    }, 15_000);

    it('evaluates token denial independently for simultaneous requests', async () => {
      const subject = 'denied-player';
      await seed(subject);
      const cutoff = new Date(Date.now() - 1_000);
      await pool.query(
        `insert into private.deleted_identity_token_denials
          (identity_salt,identity_digest,tokens_issued_before,expires_at)
          values (decode(repeat('ab',32),'hex'),
            sha256(decode(repeat('ab',32),'hex')
              || int4send(octet_length(convert_to($1,'UTF8')))
              || convert_to($1,'UTF8') || convert_to($2,'UTF8')),
            $3, now() + interval '1 hour')`,
        [issuer, subject, cutoff],
      );
      const service = createPlayerIdentityService(pool);
      const results = await Promise.allSettled([
        service.resolve(principal(subject)),
        service.resolve({ ...principal(subject), tokenIssuedAt: new Date() }),
      ]);
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: expect.any(DeletedIdentityTokenError),
      });
      expect(results[1]).toMatchObject({ status: 'fulfilled' });
    }, 15_000);
  },
);
