import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  createDatabasePool,
  withDatabaseClient,
} from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { runBasicDemoSeeds } from '../src/database/seeds.js';

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'history-preserving fixture cleanup',
  () => {
    let admin: DatabaseConfig;
    let target: DatabaseConfig;
    let database: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let cleanupSql: string;

    beforeAll(async () => {
      loadApiEnvironment();
      admin = buildDatabaseConfig({ target: 'test' });
      database = `wits_content_cleanup_${Date.now()}_${process.pid}`;
      await withDatabaseClient(admin, (client) =>
        client.query(`create database ${database}`),
      );
      const url = new URL(admin.connectionString);
      url.pathname = `/${database}`;
      target = { ...admin, connectionString: url.toString() };
      await runMigrations(target);
      await runBasicDemoSeeds(target);
      pool = createDatabasePool(target);
      cleanupSql = await readFile(
        new URL(
          '../../../database/maintenance/2026-10-08_retire_demo_content.sql',
          import.meta.url,
        ),
        'utf8',
      );
    }, 120_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (admin && database)
        await withDatabaseClient(admin, (client) =>
          client.query(`drop database if exists ${database} with (force)`),
        );
    }, 30_000);

    it('deletes unused drafts, retires immutable fixture definitions, and is repeatable without disabling guards', async () => {
      const countsBefore = await pool.query(`select
      (select count(*) from public.players)::int as players,
      (select count(*) from public.player_cards)::int as cards,
      (select count(*) from public.challenge_questions)::int as questions`);
      for (let run = 0; run < 2; run++) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query(cleanupSql);
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally {
          client.release();
        }
      }
      const active = await pool.query(
        `select count(*)::int as count from public.events where is_published`,
      );
      expect(active.rows[0]?.count).toBe(0);
      const draft = await pool.query(
        `select id from public.events where id='00000000-0000-4000-8000-000000000022'`,
      );
      expect(draft.rows).toHaveLength(0);
      const countsAfter = await pool.query(`select
      (select count(*) from public.players)::int as players,
      (select count(*) from public.player_cards)::int as cards,
      (select count(*) from public.challenge_questions)::int as questions`);
      expect(countsAfter.rows).toEqual(countsBefore.rows);
      const published = await pool.query(
        `select count(*)::int as count from public.event_challenges where status='published'`,
      );
      expect(published.rows[0]?.count).toBe(0);
      await expect(
        pool.query(
          `delete from public.challenge_questions where id=(select id from public.challenge_questions limit 1)`,
        ),
      ).rejects.toMatchObject({ code: '55006' });
    });
  },
);
