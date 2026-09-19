import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { getMigrationsDirectory } from '../src/database/paths.js';
import { runSeeds } from '../src/database/seeds.js';
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

const MIGRATION_NAME = '0047_persist_ranked_competition.sql';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface RankedPlayer {
  id: string;
  deckId: string;
}

interface RankedPair {
  seasonId: string;
  first: RankedPlayer;
  second: RankedPlayer;
  firstQueueId: string;
  secondQueueId: string;
  proposalId: string;
}

interface CardDefinition extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic' | null;
  rarity: 'common';
}

describe.skipIf(!runIntegrationTests)('ranked persistence integration', () => {
  let administrationConfig: DatabaseConfig;
  let temporaryDatabaseName: string;
  let migrationDirectory: string;
  let pool: pg.Pool;
  let seasonId: string;
  let cards: CardDefinition[];

  beforeAll(async () => {
    loadApiEnvironment();
    administrationConfig = buildDatabaseConfig({ target: 'test' });
    temporaryDatabaseName = `wits_quest_ranked_${Date.now()}_${process.pid}`;

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(`create database ${temporaryDatabaseName}`);
    });

    const url = new URL(administrationConfig.connectionString);
    url.pathname = `/${temporaryDatabaseName}`;
    const config: DatabaseConfig = {
      ...administrationConfig,
      connectionString: url.toString(),
    };

    migrationDirectory = await copyPriorMigrations();
    await runMigrations(config, migrationDirectory);
    await copyFile(
      join(getMigrationsDirectory(), MIGRATION_NAME),
      join(migrationDirectory, MIGRATION_NAME),
    );
    expect((await runMigrations(config, migrationDirectory)).applied).toEqual([
      MIGRATION_NAME,
    ]);
    expect((await runMigrations(config, migrationDirectory)).applied).toEqual(
      [],
    );

    pool = createDatabasePool(config);
    await runSeeds(config);

    const definitions = await pool.query<CardDefinition>(
      `select id::text, category, affinity, rarity
         from public.card_definitions
        where is_active = true and rarity = 'common'
        order by category, affinity nulls last, name, id`,
    );
    cards = [
      ...definitions.rows
        .filter((card) => card.category === 'creature')
        .slice(0, 3),
      ...definitions.rows
        .filter((card) => card.category === 'power')
        .slice(0, 2),
    ];
    expect(cards).toHaveLength(5);

    seasonId = randomUUID();
    await pool.query(
      `insert into public.ranked_seasons (
         id, policy_version, name, intended_start_at
       ) values ($1::uuid, 'ranked-v1', 'First season', now())`,
      [seasonId],
    );
    await activateSeason(pool, seasonId);
  }, 180_000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (migrationDirectory) {
      await rm(migrationDirectory, { recursive: true, force: true });
    }
    if (!administrationConfig || !temporaryDatabaseName) return;

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${temporaryDatabaseName} with (force)`,
      );
    });
  }, 30_000);

  it('seeds ranked-v1 privately and enforces one active season and immutable policy', async () => {
    const policy = await pool.query<{ policy_version: string }>(
      `select policy_version from private.ranked_policy_versions`,
    );
    expect(policy.rows).toEqual([{ policy_version: 'ranked-v1' }]);

    const grants = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.table_privileges
        where table_schema = 'private'
          and table_name like 'ranked_%'
          and grantee = 'PUBLIC'`,
    );
    expect(grants.rows[0]?.count).toBe('0');

    await expect(
      pool.query(
        `update private.ranked_policy_versions
            set initial_rating = 1001
          where policy_version = 'ranked-v1'`,
      ),
    ).rejects.toThrow(/immutable/u);

    const otherSeasonId = randomUUID();
    await pool.query(
      `insert into public.ranked_seasons (
         id, policy_version, name, intended_start_at
       ) values ($1::uuid, 'ranked-v1', 'Second season', now())`,
      [otherSeasonId],
    );
    await expect(activateSeason(pool, otherSeasonId)).rejects.toThrow();
  });

  it('enforces private queue uniqueness, ownership, leases, and serialized proposal claims', async () => {
    const first = await createPlayer(pool, seasonId);
    const second = await createPlayer(pool, seasonId);
    const third = await createPlayer(pool, seasonId);
    const firstQueueId = await enqueue(pool, seasonId, first);
    const secondQueueId = await enqueue(pool, seasonId, second);
    const thirdQueueId = await enqueue(pool, seasonId, third);

    const duplicate = await Promise.allSettled([
      enqueue(pool, seasonId, first),
      enqueue(pool, seasonId, first),
    ]);
    expect(duplicate.every((result) => result.status === 'rejected')).toBe(
      true,
    );

    await expect(
      pool.query(
        `insert into private.ranked_queue_entries (
           season_id, player_id, selected_deck_id
         ) values ($1::uuid, $2::uuid, $3::uuid)`,
        [seasonId, second.id, first.deckId],
      ),
    ).rejects.toThrow();

    const claims = await Promise.allSettled([
      claimPair(pool, seasonId, firstQueueId, secondQueueId, first, second),
      claimPair(pool, seasonId, firstQueueId, thirdQueueId, first, third),
    ]);
    expect(
      claims.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      claims.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const claimed = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from private.ranked_queue_entries
        where player_id = $1::uuid and status = 'proposed'`,
      [first.id],
    );
    expect(claimed.rows[0]?.count).toBe('1');

    const winner = claims.find((result) => result.status === 'fulfilled');
    expect(winner?.status).toBe('fulfilled');
    if (winner?.status !== 'fulfilled') return;

    await expect(
      pool.query(
        `insert into private.ranked_matchmaking_proposals (
           season_id, acceptance_deadline
         ) values ($1::uuid, now() + interval '20 seconds')`,
        [seasonId],
      ),
    ).rejects.toThrow(/exactly two participants/u);

    await cancelPair(pool, winner.value.proposalId);
    await pool.query(
      `update private.ranked_queue_entries
          set status = 'cancelled', version = version + 1,
              lease_expires_at = null, terminal_at = now(), updated_at = now()
        where id in ($1::uuid, $2::uuid, $3::uuid)
          and status = 'searching'`,
      [firstQueueId, secondQueueId, thirdQueueId],
    );
  }, 60_000);

  it('deletes an owned deck while retaining anonymous terminal queue and proposal history', async () => {
    const deletingPlayer = await createPlayer(pool, seasonId);
    const opponent = await createPlayer(pool, seasonId);
    const historicalQueueId = await enqueue(pool, seasonId, deletingPlayer);

    await pool.query(
      `update private.ranked_queue_entries
          set status = 'expired', version = version + 1,
              lease_expires_at = null, terminal_at = now(), updated_at = now()
        where id = $1::uuid`,
      [historicalQueueId],
    );

    await expect(
      pool.query(`delete from public.player_decks where id = $1::uuid`, [
        deletingPlayer.deckId,
      ]),
    ).rejects.toThrow();

    const deletingQueueId = await enqueue(pool, seasonId, deletingPlayer);
    const opponentQueueId = await enqueue(pool, seasonId, opponent);
    const pair = await claimPair(
      pool,
      seasonId,
      deletingQueueId,
      opponentQueueId,
      deletingPlayer,
      opponent,
    );

    const lifecycle = createAccountDeletionLifecycle(pool);
    const request = await lifecycle.request({
      issuer: 'https://issuer.example/',
      subject: `auth0|ranked-${deletingPlayer.id}`,
    });
    const completed = await lifecycle.complete(request.id);
    expect(completed.status).toBe('completed');
    expect(await lifecycle.complete(request.id)).toEqual(completed);

    const decks = await pool.query<{ id: string }>(
      `select id::text from public.player_decks where player_id = $1::uuid`,
      [deletingPlayer.id],
    );
    expect(decks.rows).toEqual([]);

    const history = await pool.query<{
      id: string;
      status: string;
      selected_deck_id: string | null;
    }>(
      `select id::text, status, selected_deck_id::text
         from private.ranked_queue_entries
        where player_id = $1::uuid
        order by id`,
      [deletingPlayer.id],
    );
    expect(history.rows).toEqual(
      expect.arrayContaining([
        {
          id: historicalQueueId,
          status: 'expired',
          selected_deck_id: null,
        },
        {
          id: deletingQueueId,
          status: 'cancelled',
          selected_deck_id: null,
        },
      ]),
    );
    expect(history.rows).toHaveLength(2);

    const proposal = await pool.query<{ status: string }>(
      `select status from private.ranked_matchmaking_proposals
        where id = $1::uuid`,
      [pair.proposalId],
    );
    expect(proposal.rows[0]?.status).toBe('cancelled');

    const opponentQueue = await pool.query<{
      status: string;
      selected_deck_id: string;
    }>(
      `select status, selected_deck_id::text
         from private.ranked_queue_entries where id = $1::uuid`,
      [opponentQueueId],
    );
    expect(opponentQueue.rows).toEqual([
      { status: 'cancelled', selected_deck_id: opponent.deckId },
    ]);

    const tombstone = await pool.query<{
      auth_subject: string | null;
      lifecycle_status: string;
    }>(
      `select auth_subject, lifecycle_status
         from public.players where id = $1::uuid`,
      [deletingPlayer.id],
    );
    expect(tombstone.rows).toEqual([
      { auth_subject: null, lifecycle_status: 'deleted' },
    ]);
  }, 60_000);

  it('requires authoritative terminal live matches and exactly one paired settlement', async () => {
    const first = await createPlayer(pool, seasonId);
    const second = await createPlayer(pool, seasonId);
    const proposal = await createAcceptedPair(pool, seasonId, first, second);
    const matchId = await createRankedMatch(pool, proposal, cards);

    await expect(
      pool.query(
        `insert into private.ranked_rating_settlements (
           match_id, season_id, policy_version, winner_player_id,
           loser_player_id, completion_reason, settled_at
         ) values (
           $1::uuid, $2::uuid, 'ranked-v1', $3::uuid,
           $4::uuid, 'defeat', now()
         )`,
        [matchId, seasonId, first.id, second.id],
      ),
    ).rejects.toThrow(/terminal live match/u);

    await expect(
      completeLiveMatch(pool, matchId, first, second),
    ).rejects.toThrow(/must settle ratings/u);

    const stillActive = await pool.query<{ status: string }>(
      `select status from public.live_pvp_matches where id = $1::uuid`,
      [matchId],
    );
    expect(stillActive.rows[0]?.status).toBe('active');

    await completeLiveMatch(pool, matchId, first, second, seasonId);

    const state = await pool.query<{
      rating: number;
      settled_match_count: number;
      wins: number;
    }>(
      `select rating, settled_match_count, wins
         from public.ranked_player_season_ratings
        where season_id = $1::uuid and player_id = $2::uuid`,
      [seasonId, first.id],
    );
    expect(state.rows).toEqual([
      { rating: 1020, settled_match_count: 1, wins: 1 },
    ]);

    const replay = await Promise.allSettled([
      settlePair(pool, seasonId, matchId, first, second),
      settlePair(pool, seasonId, matchId, first, second),
    ]);
    expect(replay.every((result) => result.status === 'rejected')).toBe(true);
    const receipt = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from private.ranked_rating_settlements
        where match_id = $1::uuid`,
      [matchId],
    );
    expect(receipt.rows[0]?.count).toBe('1');

    await expect(
      pool.query(
        `update public.ranked_player_season_ratings
            set rating = rating + 1
          where season_id = $1::uuid and player_id = $2::uuid`,
        [seasonId, first.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `delete from private.ranked_rating_ledger_entries
          where match_id = $1::uuid`,
        [matchId],
      ),
    ).rejects.toThrow(/immutable/u);
  }, 30_000);

  it('seals closed seasons with immutable anonymous competitive facts and soft reset', async () => {
    const nextSeasonId = randomUUID();
    await pool.query(
      `insert into public.ranked_seasons (
         id, policy_version, name, intended_start_at
       ) values ($1::uuid, 'ranked-v1', 'Next season', now())`,
      [nextSeasonId],
    );

    const player = await createPlayer(pool, seasonId);
    const opponent = await createPlayer(pool, seasonId);

    for (let index = 0; index < 5; index += 1) {
      const proposal = await createAcceptedPair(
        pool,
        seasonId,
        player,
        opponent,
      );
      const matchId = await createRankedMatch(pool, proposal, cards);
      await completeLiveMatch(pool, matchId, player, opponent, seasonId);
    }

    const season = await pool.query<{ active_ends_at: Date }>(
      `select active_ends_at from public.ranked_seasons where id = $1::uuid`,
      [seasonId],
    );
    const closingAt = season.rows[0]!.active_ends_at;
    await pool.query(
      `update public.ranked_seasons
          set status = 'closing', version = version + 1,
              closing_at = active_ends_at, updated_at = active_ends_at
        where id = $1::uuid`,
      [seasonId],
    );

    const rating = await pool.query<{
      player_id: string;
      rating: number;
      wins: number;
      losses: number;
      settled_match_count: number;
    }>(
      `select player_id::text, rating, wins, losses, settled_match_count
         from public.ranked_player_season_ratings
        where season_id = $1::uuid and settled_match_count >= 5
        order by rating desc, rating_first_reached_at, player_id`,
      [seasonId],
    );
    expect(rating.rows).toHaveLength(2);
    const settled = await pool.query<{ count: number }>(
      `select count(*)::integer as count
         from private.ranked_rating_settlements
        where season_id = $1::uuid`,
      [seasonId],
    );
    const closedAt = new Date(closingAt.getTime() + 1);
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const [index, entry] of rating.rows.entries()) {
        await client.query(
          `insert into public.ranked_season_standing_archives (
             season_id, player_id, rank, rating, wins, losses,
             settled_match_count, archived_at
           ) values (
             $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
             $8::timestamptz
           )`,
          [
            seasonId,
            entry.player_id,
            index + 1,
            entry.rating,
            entry.wins,
            entry.losses,
            entry.settled_match_count,
            closedAt,
          ],
        );
      }
      await client.query(
        `insert into private.ranked_season_close_receipts (
           season_id, settlement_count, archived_player_count, closed_at
         ) values ($1::uuid, $2, $3, $4::timestamptz)`,
        [seasonId, settled.rows[0]?.count, rating.rows.length, closedAt],
      );
      await client.query(
        `update public.ranked_seasons
            set status = 'closed', version = version + 1,
                closed_at = $2::timestamptz, updated_at = $2::timestamptz
          where id = $1::uuid`,
        [seasonId, closedAt],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    await expect(
      pool.query(
        `update public.ranked_season_standing_archives
            set rank = 99
          where season_id = $1::uuid and player_id = $2::uuid`,
        [seasonId, player.id],
      ),
    ).rejects.toThrow(/immutable/u);
    await expect(
      pool.query(
        `update public.ranked_player_season_ratings
            set rating = 1000
          where season_id = $1::uuid and player_id = $2::uuid`,
        [seasonId, player.id],
      ),
    ).rejects.toThrow(/immutable/u);

    const nextRating = await pool.query<{ rating: number }>(
      `insert into public.ranked_player_season_ratings (
         season_id, player_id, starting_rating, rating, carried_from_season_id
       ) values (
         $1::uuid, $2::uuid, $3, $3, $4::uuid
       ) returning rating`,
      [
        nextSeasonId,
        player.id,
        1000 + Math.round(((rating.rows[0]?.rating ?? 1000) - 1000) / 2),
        seasonId,
      ],
    );
    expect(nextRating.rows[0]?.rating).toBeGreaterThan(1000);

    await expect(
      pool.query(
        `insert into public.ranked_player_season_ratings (
           season_id, player_id, starting_rating, rating, carried_from_season_id
         ) values ($1::uuid, $2::uuid, 1000, 1000, $3::uuid)`,
        [nextSeasonId, opponent.id, seasonId],
      ),
    ).rejects.toThrow(/authoritative season seed/u);

    const privateColumns = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public'
          and table_name = 'ranked_season_standing_archives'`,
    );
    expect(privateColumns.rows.map((row) => row.column_name)).not.toContain(
      'player_name',
    );
  }, 90_000);
});

async function copyPriorMigrations(): Promise<string> {
  const source = getMigrationsDirectory();
  const target = await mkdtemp(join(tmpdir(), 'wits-ranked-migrations-'));
  const names = await readdir(source);
  await Promise.all(
    names
      .filter((name) => name.endsWith('.sql') && name < MIGRATION_NAME)
      .map((name) => copyFile(join(source, name), join(target, name))),
  );
  return target;
}

async function activateSeason(database: Pick<pg.Pool, 'query'>, id: string) {
  return database.query(
    `update public.ranked_seasons
        set status = 'active', version = version + 1,
            activated_at = now(), active_ends_at = now() + interval '28 days',
            updated_at = now()
      where id = $1::uuid`,
    [id],
  );
}

async function createPlayer(
  database: Pick<pg.Pool, 'query'>,
  seasonId: string,
): Promise<RankedPlayer> {
  const id = randomUUID();
  const deckId = randomUUID();
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values (
       $1::uuid, 'https://issuer.example/', $2,
       $3, 'player'
     )`,
    [id, `auth0|ranked-${id}`, `ranked_${id.slice(0, 8)}`],
  );
  await database.query(
    `insert into public.player_decks (id, player_id, name)
     values ($1::uuid, $2::uuid, 'Ranked test deck')`,
    [deckId, id],
  );
  await database.query(
    `insert into public.ranked_player_season_ratings (
       season_id, player_id, starting_rating, rating
     ) values ($1::uuid, $2::uuid, 1000, 1000)`,
    [seasonId, id],
  );
  return { id, deckId };
}

async function enqueue(
  database: Pick<pg.Pool, 'query'>,
  seasonId: string,
  player: RankedPlayer,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `insert into private.ranked_queue_entries (
       id, season_id, player_id, selected_deck_id
     ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    [id, seasonId, player.id, player.deckId],
  );
  return id;
}

async function claimPair(
  database: Pick<pg.Pool, 'connect'>,
  seasonId: string,
  firstQueueId: string,
  secondQueueId: string,
  first: RankedPlayer,
  second: RankedPlayer,
): Promise<RankedPair> {
  const proposalId = randomUUID();
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into private.ranked_matchmaking_proposals (
         id, season_id, created_at, acceptance_deadline
       ) values (
         $1::uuid, $2::uuid, now(), now() + interval '20 seconds'
       )`,
      [proposalId, seasonId],
    );
    const updated = await client.query(
      `update private.ranked_queue_entries
          set status = 'proposed', version = version + 1,
              lease_expires_at = null, active_proposal_id = $3::uuid,
              updated_at = now()
        where id in ($1::uuid, $2::uuid) and status = 'searching'
        returning id`,
      [firstQueueId, secondQueueId, proposalId],
    );
    if (updated.rowCount !== 2) {
      throw new Error('Another worker claimed this queue entry');
    }
    await client.query(
      `insert into private.ranked_matchmaking_proposal_participants (
         proposal_id, season_id, player_id, queue_entry_id
       ) values
         ($1::uuid, $2::uuid, $3::uuid, $4::uuid),
         ($1::uuid, $2::uuid, $5::uuid, $6::uuid)`,
      [proposalId, seasonId, first.id, firstQueueId, second.id, secondQueueId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return { seasonId, first, second, firstQueueId, secondQueueId, proposalId };
}

async function cancelPair(database: pg.Pool, proposalId: string) {
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `update private.ranked_matchmaking_proposal_participants
          set acceptance_status = 'system_cancelled', responded_at = now()
        where proposal_id = $1::uuid`,
      [proposalId],
    );
    await client.query(
      `update private.ranked_queue_entries
          set status = 'cancelled', version = version + 1,
              lease_expires_at = null, active_proposal_id = null,
              terminal_at = now(), updated_at = now()
        where active_proposal_id = $1::uuid`,
      [proposalId],
    );
    await client.query(
      `update private.ranked_matchmaking_proposals
          set status = 'cancelled', version = version + 1, resolved_at = now()
        where id = $1::uuid`,
      [proposalId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createAcceptedPair(
  database: pg.Pool,
  seasonId: string,
  first: RankedPlayer,
  second: RankedPlayer,
): Promise<RankedPair> {
  const firstQueueId = await enqueue(database, seasonId, first);
  const secondQueueId = await enqueue(database, seasonId, second);
  const pair = await claimPair(
    database,
    seasonId,
    firstQueueId,
    secondQueueId,
    first,
    second,
  );
  await database.query(
    `update private.ranked_matchmaking_proposal_participants
        set acceptance_status = 'accepted', responded_at = now()
      where proposal_id = $1::uuid`,
    [pair.proposalId],
  );
  return pair;
}

async function createRankedMatch(
  database: pg.Pool,
  pair: RankedPair,
  cards: readonly CardDefinition[],
): Promise<string> {
  const matchId = randomUUID();
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `update private.ranked_queue_entries
          set status = 'matched', version = version + 1,
              lease_expires_at = null, active_proposal_id = null,
              terminal_at = now(), updated_at = now()
        where active_proposal_id = $1::uuid`,
      [pair.proposalId],
    );
    await client.query(
      `update private.ranked_matchmaking_proposals
          set status = 'matched', version = version + 1, resolved_at = now()
        where id = $1::uuid`,
      [pair.proposalId],
    );
    await client.query(
      `insert into public.live_pvp_matches (
         id, decision_started_at, turn_deadline
       ) values ($1::uuid, now(), now() + interval '60 seconds')`,
      [matchId],
    );
    for (const [index, player] of [pair.first, pair.second].entries()) {
      const snapshotId = randomUUID();
      await client.query(
        `insert into private.live_pvp_deck_snapshots (
           id, match_id, player_id, participant_side, source_deck_id
         ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
        [
          snapshotId,
          matchId,
          player.id,
          index === 0 ? 'player_one' : 'player_two',
          player.deckId,
        ],
      );
      for (const [position, card] of cards.entries()) {
        await client.query(
          `insert into private.live_pvp_deck_snapshot_cards (
             snapshot_id, position, battle_card_id, source_owned_card_id,
             source_card_definition_id, category, affinity, rarity,
             card_snapshot
           ) values (
             $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8,
             '{}'::jsonb
           )`,
          [
            snapshotId,
            position + 1,
            randomUUID(),
            randomUUID(),
            card.id,
            card.category,
            card.affinity,
            card.rarity,
          ],
        );
      }
      await client.query(
        `insert into public.live_pvp_match_participants (
           match_id, player_id, participant_side, deck_snapshot_id
         ) values ($1::uuid, $2::uuid, $3, $4::uuid)`,
        [
          matchId,
          player.id,
          index === 0 ? 'player_one' : 'player_two',
          snapshotId,
        ],
      );
    }
    await client.query(
      `insert into private.live_pvp_match_states (
         match_id, version, battle_state
       ) values ($1::uuid, 0, '{}'::jsonb)`,
      [matchId],
    );
    await client.query(
      `insert into private.ranked_matchmaking_receipts (
         proposal_id, match_id, season_id, policy_version
       ) values ($1::uuid, $2::uuid, $3::uuid, 'ranked-v1')`,
      [pair.proposalId, matchId, pair.seasonId],
    );
    for (const player of [pair.first, pair.second]) {
      await client.query(
        `insert into private.ranked_match_rating_inputs (
           match_id, season_id, policy_version, player_id,
           pre_match_rating, prior_settled_match_count, k_factor
         )
         select $1::uuid, rating.season_id, 'ranked-v1', $2::uuid,
                rating.rating, rating.settled_match_count,
                case when rating.settled_match_count < 5 then 40 else 24 end
           from public.ranked_player_season_ratings rating
          where rating.season_id = $3::uuid and rating.player_id = $2::uuid`,
        [matchId, player.id, pair.seasonId],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return matchId;
}

async function completeLiveMatch(
  database: pg.Pool,
  matchId: string,
  winner: RankedPlayer,
  loser: RankedPlayer,
  seasonId?: string,
) {
  const eventId = randomUUID();
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `update public.live_pvp_matches
          set status = 'completed', version = 1, phase = 'completed',
              decision_started_at = null, turn_deadline = null,
              winner_player_id = $2::uuid, completion_reason = 'defeat',
              completed_at = now(), updated_at = now()
        where id = $1::uuid`,
      [matchId, winner.id],
    );
    await client.query(
      `update private.live_pvp_match_states
          set version = 1, battle_state = '{"phase":"completed"}'::jsonb,
              updated_at = now()
        where match_id = $1::uuid`,
      [matchId],
    );
    await client.query(
      `update public.live_pvp_match_participants
          set outcome = case when player_id = $2::uuid then 'win' else 'loss' end,
              updated_at = now()
        where match_id = $1::uuid`,
      [matchId, winner.id],
    );
    await client.query(
      `insert into public.live_pvp_match_actions (
         id, match_id, sequence, previous_version, committed_version,
         transition_kind, public_result
       ) values ($1::uuid, $2::uuid, 1, 0, 1, 'timeout', '{}'::jsonb)`,
      [eventId, matchId],
    );
    await client.query(
      `insert into private.live_pvp_match_transitions (
         action_id, match_id, state_before, state_after,
         authoritative_result
       ) values (
         $1::uuid, $2::uuid, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
       )`,
      [eventId, matchId],
    );
    await client.query(
      `insert into private.live_pvp_completion_sources (
         match_id, player_id, outcome, completion_reason, occurred_at
       ) values
         ($1::uuid, $2::uuid, 'win', 'defeat', now()),
         ($1::uuid, $3::uuid, 'loss', 'defeat', now())`,
      [matchId, winner.id, loser.id],
    );
    if (seasonId) {
      await settlePair(database, seasonId, matchId, winner, loser, client);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function settlePair(
  database: pg.Pool,
  seasonId: string,
  matchId: string,
  winner: RankedPlayer,
  loser: RankedPlayer,
  existingClient?: pg.PoolClient,
) {
  const client = existingClient ?? (await database.connect());
  try {
    if (!existingClient) await client.query('begin');
    await client.query(
      `insert into private.ranked_rating_settlements (
         match_id, season_id, policy_version, winner_player_id,
         loser_player_id, completion_reason, settled_at
       ) values (
         $1::uuid, $2::uuid, 'ranked-v1', $3::uuid, $4::uuid,
         'defeat', now()
       )`,
      [matchId, seasonId, winner.id, loser.id],
    );
    for (const [player, outcome] of [
      [winner, 'win'],
      [loser, 'loss'],
    ] as const) {
      const state = await client.query<{
        rating: number;
        settled_match_count: number;
        wins: number;
        losses: number;
      }>(
        `select rating, settled_match_count, wins, losses
           from public.ranked_player_season_ratings
          where season_id = $1::uuid and player_id = $2::uuid
          for update`,
        [seasonId, player.id],
      );
      const current = state.rows[0]!;
      const opponentState = await client.query<{ rating: number }>(
        `select pre_match_rating as rating
           from private.ranked_match_rating_inputs
          where match_id = $1::uuid and player_id <> $2::uuid`,
        [matchId, player.id],
      );
      const kFactor = current.settled_match_count < 5 ? 40 : 24;
      const expected =
        1 /
        (1 + 10 ** ((opponentState.rows[0]!.rating - current.rating) / 400));
      const expectedScore = Number(expected.toFixed(15));
      const rawDelta = kFactor * (Number(outcome === 'win') - expectedScore);
      const calculatedDelta =
        Math.sign(rawDelta) * Math.round(Math.abs(rawDelta));
      const nextRating = Math.max(100, current.rating + calculatedDelta);
      const appliedDelta = nextRating - current.rating;
      await client.query(
        `insert into private.ranked_rating_ledger_entries (
           match_id, season_id, policy_version, player_id, outcome,
           rating_before, expected_score, k_factor,
           calculated_delta, applied_delta, rating_after,
           match_count_before, match_count_after,
           wins_before, wins_after, losses_before, losses_after
         ) values (
           $1::uuid, $2::uuid, 'ranked-v1', $3::uuid, $4,
           $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
         )`,
        [
          matchId,
          seasonId,
          player.id,
          outcome,
          current.rating,
          expectedScore,
          kFactor,
          calculatedDelta,
          appliedDelta,
          nextRating,
          current.settled_match_count,
          current.settled_match_count + 1,
          current.wins,
          current.wins + Number(outcome === 'win'),
          current.losses,
          current.losses + Number(outcome === 'loss'),
        ],
      );
      await client.query(
        `update public.ranked_player_season_ratings
            set rating = $3, settled_match_count = settled_match_count + 1,
                wins = wins + $4, losses = losses + $5,
                rating_first_reached_at = now(),
                last_settled_match_id = $6::uuid, updated_at = now()
          where season_id = $1::uuid and player_id = $2::uuid`,
        [
          seasonId,
          player.id,
          nextRating,
          Number(outcome === 'win'),
          Number(outcome === 'loss'),
          matchId,
        ],
      );
    }
    if (!existingClient) await client.query('commit');
  } catch (error) {
    if (!existingClient) await client.query('rollback');
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}
