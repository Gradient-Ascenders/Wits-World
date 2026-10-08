import { randomUUID } from 'node:crypto';
import type pg from 'pg';
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
import {
  createTrustService,
  type TrustQueryable,
} from '../src/trust/trust-service.js';
import {
  insertTrustHistoryLiveMatch,
  insertTrustHistoryPlayer,
  insertRollbackTrustHistoryAsync,
} from './fixtures/trust-history.js';
import {
  loadThirtyDayPairCounts,
  loadSevenDayOneSidedCounts,
} from './fixtures/trust-history-legacy.js';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const sorted = <T>(rows: T[]) =>
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe.skipIf(!enabled)('combined Trust history PostgreSQL', () => {
  let pool: ReturnType<typeof createDatabasePool>;
  let admin: DatabaseConfig;
  let name: string;
  beforeAll(async () => {
    loadApiEnvironment();
    admin = buildDatabaseConfig({ target: 'test' });
    name = `wits_trust_history_${Date.now()}_${process.pid}`;
    await withDatabaseClient(admin, (client) =>
      client.query(`create database ${name}`).then(() => {}),
    );
    const url = new URL(admin.connectionString);
    url.pathname = `/${name}`;
    const cfg = { ...admin, connectionString: url.toString() };
    await runMigrations(cfg);
    pool = createDatabasePool(cfg);
  }, 180_000);
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin && name)
      await withDatabaseClient(admin, (client) =>
        client
          .query(`drop database if exists ${name} with (force)`)
          .then(() => {}),
      );
  }, 30_000);

  async function rollback(run: (client: pg.PoolClient) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await run(client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  async function aggregate(
    client: pg.PoolClient,
    pair: string[],
    cutoff: Date,
  ) {
    let rows: Record<string, unknown>[] = [];
    const tap: TrustQueryable = {
      async query<T extends pg.QueryResultRow>(
        sql: string,
        values?: unknown[],
      ) {
        if (sql.includes('match.id = $1'))
          return {
            rows: [
              {
                player_low_id: pair[1],
                player_high_id: pair[0],
                completed_at: cutoff,
              },
            ] as unknown as T[],
          };
        if (sql.includes('count(*)::integer as count'))
          return { rows: [{ count: 2 }] as unknown as T[] };
        if (sql.includes('aggregate_type')) {
          const result = await client.query<T>(sql, values);
          rows = result.rows;
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const service = createTrustService({
      connect: async () => {
        throw new Error('within transaction only');
      },
    });
    await service.evaluateOpponentPatternsForMatchWithinTransaction(
      tap,
      randomUUID(),
    );
    return {
      counts: rows
        .filter((r) => r.aggregate_type === 'concentration')
        .map((r) => ({
          player_id: r.player_id,
          total_matches: r.total_matches,
          pair_matches: r.pair_matches,
        })),
      oneSided: rows
        .filter((r) => r.aggregate_type === 'one_sided')
        .map((r) => ({
          winner_player_id: r.player_id,
          matching_forfeits: r.matching_forfeits,
        })),
    };
  }

  it('matches both old aggregates across modes, IDs, boundaries, opponents and winners', async () => {
    await rollback(async (client) => {
      const pair = [
        await insertTrustHistoryPlayer(client),
        await insertTrustHistoryPlayer(client),
      ].sort();
      const outsider = await insertTrustHistoryPlayer(client);
      const cutoff = new Date('2026-10-01T12:00:00Z');
      const days = (n: number, offset = 0) =>
        new Date(+cutoff - n * 86_400_000 + offset);
      const sameId = randomUUID();
      await insertTrustHistoryLiveMatch(client, {
        pair,
        completedAt: days(0),
        matchId: sameId,
      });
      await insertRollbackTrustHistoryAsync(client, {
        pair,
        completedAt: days(0),
        matchId: sameId,
      });
      for (const [date, reason, winner] of [
        [days(7), 'abandonment_forfeit', pair[0]],
        [days(7, 1), 'abandonment_forfeit', pair[1]],
        [days(30), 'abandonment_forfeit', pair[0]],
        [days(30, 1), 'defeat', pair[0]],
        [days(0, 1), 'abandonment_forfeit', pair[0]],
        [days(1), 'account_deletion_forfeit', pair[1]],
        [days(2), 'voluntary_resignation', pair[0]],
      ] as const)
        await insertTrustHistoryLiveMatch(client, {
          pair,
          completedAt: date,
          reason,
          winner,
        });
      await insertRollbackTrustHistoryAsync(client, {
        pair,
        completedAt: days(1),
        reason: 'voluntary_resignation',
        winner: pair[1],
      });
      await insertRollbackTrustHistoryAsync(client, {
        pair,
        completedAt: days(2),
        reason: 'defeat',
      });
      await insertRollbackTrustHistoryAsync(client, {
        pair,
        completedAt: days(2),
        reason: 'account_deletion_forfeit',
      });
      await insertTrustHistoryLiveMatch(client, {
        pair: [pair[0]!, outsider],
        completedAt: days(2),
      });
      const current = await aggregate(client, pair, cutoff);
      expect(sorted(current.counts)).toEqual(
        sorted(await loadThirtyDayPairCounts(client, pair, cutoff)),
      );
      expect(sorted(current.oneSided)).toEqual(
        sorted((await loadSevenDayOneSidedCounts(client, pair, cutoff)).rows),
      );
      expect(current.counts).toEqual(
        expect.arrayContaining([
          { player_id: pair[0], total_matches: 11, pair_matches: 10 },
          { player_id: pair[1], total_matches: 10, pair_matches: 10 },
        ]),
      );
      expect(sorted(current.oneSided)).toEqual(
        sorted([
          { winner_player_id: pair[0], matching_forfeits: 3 },
          { winner_player_id: pair[1], matching_forfeits: 2 },
        ]),
      );
      const empty = await aggregate(client, pair, days(100));
      expect(empty).toEqual({ counts: [], oneSided: [] });
    });
  }, 60_000);

  it('rejects empty, single-participant and inactive contexts without signal writes', async () => {
    await rollback(async (client) => {
      const pair = [
        await insertTrustHistoryPlayer(client),
        await insertTrustHistoryPlayer(client),
      ].sort();
      const matchId = randomUUID();
      const ended = new Date();
      const started = new Date(+ended - 60_000);
      await client.query(
        `insert into public.live_pvp_matches (id,status,version,phase,decision_started_at,turn_deadline,started_at,created_at,updated_at)
        values ($1,'active',0,'initial_selection',$2,$3,$2,$2,$2)`,
        [matchId, started, ended],
      );
      await client.query(
        `update public.live_pvp_matches set status='completed',version=1,phase='completed',decision_started_at=null,turn_deadline=null,
        winner_player_id=$2,completion_reason='abandonment_forfeit',completed_at=$3,updated_at=$3 where id=$1`,
        [matchId, pair[0], ended],
      );
      const service = createTrustService({
        connect: async () => {
          throw new Error('within transaction only');
        },
      });
      await service.evaluateOpponentPatternsForMatchWithinTransaction(
        client,
        matchId,
      );
      await client.query(
        `insert into public.live_pvp_match_participants (match_id,player_id,participant_side,deck_snapshot_id,outcome,created_at,updated_at)
        values ($1,$2,'player_one',$3,'win',$4,$5)`,
        [matchId, pair[0], randomUUID(), started, ended],
      );
      await service.evaluateOpponentPatternsForMatchWithinTransaction(
        client,
        matchId,
      );
      // Incomplete public graphs are inspected only inside the rollback fixture.
      expect(await aggregate(client, pair, ended)).toEqual({
        counts: [],
        oneSided: [],
      });
      const valid = await insertTrustHistoryLiveMatch(client, {
        pair,
        completedAt: ended,
      });
      const deletionRequestId = randomUUID();
      await client.query(
        `insert into public.account_deletion_requests (id,requested_at,status) values ($1,$2,'pending')`,
        [deletionRequestId, ended],
      );
      await client.query(
        `update public.players set lifecycle_status='deletion_pending',deletion_request_id=$2 where id=$1`,
        [pair[1], deletionRequestId],
      );
      await service.evaluateOpponentPatternsForMatchWithinTransaction(
        client,
        valid,
      );
      expect(
        (
          await client.query(
            `select count(*)::integer as count from private.trust_signals where player_id=any($1::uuid[])`,
            [pair],
          )
        ).rows[0]?.count,
      ).toBe(0);
    });
  }, 30_000);

  it('preserves first signals, immutable summaries, scores and decisions on replay with 47 then 13 statements', async () => {
    const pair = [
      await insertTrustHistoryPlayer(pool),
      await insertTrustHistoryPlayer(pool),
    ].sort();
    const client = await pool.connect();
    let last = '';
    try {
      await client.query('begin');
      for (let i = 0; i < 6; i++)
        last = await insertTrustHistoryLiveMatch(client, {
          pair,
          completedAt: new Date(Date.now() - (6 - i) * 86_400_000),
          reason: i < 4 ? 'abandonment_forfeit' : 'defeat',
        });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    let statements = 0,
      acquisitions = 0,
      releases = 0;
    const service = createTrustService({
      async connect() {
        acquisitions++;
        const held = await pool.connect();
        return {
          async query<T extends pg.QueryResultRow>(
            sql: string,
            values?: unknown[],
          ) {
            statements++;
            return held.query<T>(sql, values);
          },
          release() {
            releases++;
            held.release();
          },
        };
      },
    });
    await service.evaluateOpponentPatternsForMatch(last);
    expect(statements).toBe(47);
    expect(acquisitions).toBe(1);
    expect(releases).toBe(1);
    const audit = async () => ({
      signals: (
        await pool.query(
          `select player_id,signal_type,review_summary from private.trust_signals where player_id=any($1::uuid[]) order by player_id,signal_type`,
          [pair],
        )
      ).rows,
      cases: (
        await pool.query(
          `select player_id,status,version,current_score,current_band from private.trust_cases where player_id=any($1::uuid[]) order by player_id`,
          [pair],
        )
      ).rows,
      decisions: (
        await pool.query(
          `select decision.id,decision.decision_type from private.trust_case_decisions decision join private.trust_cases c on c.id=decision.case_id where c.player_id=any($1::uuid[]) order by decision.id`,
          [pair],
        )
      ).rows,
      evidence: (
        await pool.query(
          `select e.id,e.safe_review_summary from private.trust_case_evidence e join private.trust_cases c on c.id=e.case_id where c.player_id=any($1::uuid[]) order by e.id`,
          [pair],
        )
      ).rows,
    });
    const before = await audit();
    expect(before.signals).toHaveLength(4);
    expect(before.cases).toHaveLength(2);
    expect(before.cases).toEqual(
      pair.map((player_id) => ({
        player_id,
        status: 'open',
        version: 1,
        current_score: 28,
        current_band: 'observe',
      })),
    );
    expect(before.decisions.map((d) => d.decision_type)).toEqual([
      'case_opened',
      'case_opened',
    ]);
    expect(before.signals.map((s) => s.review_summary)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          completedMatchCount: 6,
          repeatedOpponentMatchCount: 6,
          opponentConcentrationRatio: 1,
        }),
        expect.objectContaining({ qualifyingForfeitCount: 4 }),
      ]),
    );
    statements = 0;
    await Promise.all([
      service.evaluateOpponentPatternsForMatch(last),
      service.evaluateOpponentPatternsForMatch(last),
    ]);
    expect(statements).toBe(26);
    expect(acquisitions).toBe(3);
    expect(releases).toBe(3);
    expect(await audit()).toEqual(before);
  }, 60_000);

  it('uses one statement snapshot for concurrent committed backfill and observes it next time', async () => {
    const pair = [
      await insertTrustHistoryPlayer(pool),
      await insertTrustHistoryPlayer(pool),
    ].sort();
    const cutoff = new Date();
    const writer = await pool.connect();
    const reader = await pool.connect();
    try {
      await writer.query('begin');
      await insertTrustHistoryLiveMatch(writer, {
        pair,
        completedAt: new Date(+cutoff - 1000),
      });
      await reader.query('begin');
      const oldBeforeCommit = await loadThirtyDayPairCounts(
        reader,
        pair,
        cutoff,
      );
      expect(await aggregate(reader, pair, cutoff)).toEqual({
        counts: [],
        oneSided: [],
      });
      await writer.query('commit');
      // The former two-statement path could mix pre/post-commit histories.
      expect(oldBeforeCommit).toEqual([]);
      expect(
        (await loadSevenDayOneSidedCounts(reader, pair, cutoff)).rows,
      ).toHaveLength(1);
      const after = await aggregate(reader, pair, cutoff);
      expect(after.counts).toHaveLength(2);
      expect(after.oneSided).toHaveLength(1);
      expect(after.oneSided[0]?.matching_forfeits).toBe(1);
      expect(sorted(after.counts)).toEqual(
        sorted(await loadThirtyDayPairCounts(reader, pair, cutoff)),
      );
      expect(after.oneSided).toEqual(
        (await loadSevenDayOneSidedCounts(reader, pair, cutoff)).rows,
      );
    } finally {
      await writer.query('rollback');
      await reader.query('rollback');
      writer.release();
      reader.release();
    }
  }, 30_000);
});
