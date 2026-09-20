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
import { runSeeds } from '../src/database/seeds.js';
import { createLivePvpService } from '../src/matches/live-pvp-service.js';
import { rankedSearchRange } from '../src/matches/ranked-policy.js';
import { createRankedReadService } from '../src/matches/ranked-read-service.js';
import { createRankedService } from '../src/matches/ranked-service.js';
import { maintainRankedSeasons } from '../src/matches/ranked-season-service.js';
import { createSignedCursorCodec } from '../src/security/signed-cursor.js';
import { createTrustRestrictionService } from '../src/trust/trust-restrictions.js';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface CardDefinition extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  affinity: string | null;
}

describe('ranked-v1 search ranges', () => {
  it('widens on every complete 15-second boundary and caps at 400', () => {
    expect(
      [0, 14_999, 15_000, 29_999, 30_000, 90_000, 200_000].map(
        rankedSearchRange,
      ),
    ).toEqual([100, 100, 150, 150, 200, 400, 400]);
  });
});

describe.skipIf(!enabled)('ranked service integration', () => {
  let administrationConfig: DatabaseConfig;
  let temporaryDatabaseName: string;
  let pool: pg.Pool;
  let cards: CardDefinition[];
  let seasonId: string;
  let previousSeasonId: string;
  let carryPlayerId: string;

  beforeAll(async () => {
    loadApiEnvironment();
    administrationConfig = buildDatabaseConfig({ target: 'test' });
    temporaryDatabaseName = `wits_quest_ranked_service_${Date.now()}_${process.pid}`;
    await withDatabaseClient(administrationConfig, (client) =>
      client.query(`create database ${temporaryDatabaseName}`),
    );
    const url = new URL(administrationConfig.connectionString);
    url.pathname = `/${temporaryDatabaseName}`;
    const config = {
      ...administrationConfig,
      connectionString: url.toString(),
    };
    await runMigrations(config);
    await runSeeds(config);
    pool = createDatabasePool(config);
    const definitions = await pool.query<CardDefinition>(
      `select id::text, category, affinity from public.card_definitions
        where is_active = true and authoring_status = 'published'
          and rarity = 'common'
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
    previousSeasonId = randomUUID();
    carryPlayerId = randomUUID();
    await pool.query(
      `insert into public.ranked_seasons (
         id, policy_version, name, intended_start_at
       ) values ($1::uuid, 'ranked-v1', 'Previous service test', now() - interval '29 days')`,
      [previousSeasonId],
    );
    await pool.query(
      `update public.ranked_seasons
          set status = 'active', version = version + 1,
              activated_at = now() - interval '29 days',
              active_ends_at = now() - interval '1 day',
              updated_at = now()
        where id = $1::uuid`,
      [previousSeasonId],
    );
    await pool.query(
      `insert into public.players (
         id, auth_issuer, auth_subject, player_name, role
       ) values ($1::uuid, 'https://issuer.example/', $2, $3, 'player')`,
      [
        carryPlayerId,
        `auth0|ranked-${carryPlayerId}`,
        `ranked_${carryPlayerId.slice(0, 8)}`,
      ],
    );
    await pool.query(
      `insert into public.ranked_player_season_ratings (
         season_id, player_id, starting_rating, rating
       ) values ($1::uuid, $2::uuid, 1000, 1000)`,
      [previousSeasonId, carryPlayerId],
    );
    seasonId = randomUUID();
    await pool.query(
      `insert into public.ranked_seasons (
         id, policy_version, name, intended_start_at
       ) values ($1::uuid, 'ranked-v1', 'Ranked service test', now())`,
      [seasonId],
    );
    expect(await maintainRankedSeasons(pool)).toEqual({
      startedClosing: true,
      closedSeason: true,
      activatedSeason: true,
    });
  }, 180_000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (!administrationConfig || !temporaryDatabaseName) return;
    await withDatabaseClient(administrationConfig, (client) =>
      client.query(
        `drop database if exists ${temporaryDatabaseName} with (force)`,
      ),
    );
  }, 30_000);

  it('closes an expired season and seeds the due season once', async () => {
    const seasons = await pool.query<{ id: string; status: string }>(
      `select id::text, status from public.ranked_seasons
        where id in ($1::uuid, $2::uuid) order by id`,
      [previousSeasonId, seasonId],
    );
    expect(seasons.rows).toEqual(
      expect.arrayContaining([
        { id: previousSeasonId, status: 'closed' },
        { id: seasonId, status: 'active' },
      ]),
    );
    const carried = await pool.query<{
      rating: number;
      count: number;
      source: string;
    }>(
      `select rating, settled_match_count as count,
              carried_from_season_id::text as source
         from public.ranked_player_season_ratings
        where season_id = $1::uuid and player_id = $2::uuid`,
      [seasonId, carryPlayerId],
    );
    expect(carried.rows).toEqual([
      { rating: 1000, count: 0, source: previousSeasonId },
    ]);
    expect(await maintainRankedSeasons(pool)).toEqual({
      startedClosing: false,
      closedSeason: false,
      activatedSeason: false,
    });
    const reads = createRankedReadService(
      pool,
      createSignedCursorCodec('ranked-test-signing-key-longer-than-32-bytes'),
    );
    expect(await reads.profile(carryPlayerId)).toMatchObject({
      rating: 1000,
      provisional: true,
      placementMatchesRemaining: 5,
    });
    expect((await reads.currentStandings(carryPlayerId, 25)).entries).toEqual(
      [],
    );
    expect(
      (await reads.archivedStandings(carryPlayerId, previousSeasonId, 25))
        .entries,
    ).toEqual([]);
  });

  it('claims one pair under concurrent workers and settles an accepted live result once', async () => {
    const first = await createPlayerWithDeck(pool, cards);
    const second = await createPlayerWithDeck(pool, cards);
    const service = createRankedService(
      pool,
      createTrustRestrictionService(pool),
    );
    const reads = createRankedReadService(
      pool,
      createSignedCursorCodec('ranked-test-signing-key-longer-than-32-bytes'),
    );

    const firstQueue = await service.join(first.playerId, first.deckId);
    expect(await service.join(first.playerId, first.deckId)).toEqual(
      firstQueue,
    );
    await service.join(second.playerId, second.deckId);
    const attempts = await Promise.all([
      service.pairOnce(),
      service.pairOnce(),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const proposalId = (await service.status(first.playerId)).proposalId;
    expect(proposalId).not.toBeNull();
    expect((await service.status(second.playerId)).proposalId).toBe(proposalId);
    const accepted = await service.accept(first.playerId, proposalId!);
    expect(accepted.status).toBe('proposed');
    const matched = await service.accept(second.playerId, proposalId!);
    expect(matched.status).toBe('matched');
    expect(matched.matchId).not.toBeNull();
    expect((await service.accept(first.playerId, proposalId!)).matchId).toBe(
      matched.matchId,
    );

    const live = createLivePvpService(pool);
    const ticket = await live.mintConnectionTicket({
      matchId: matched.matchId!,
      playerId: second.playerId,
      requestedRole: 'participant',
    });
    const connection = await live.redeemConnectionTicket(ticket.ticket);
    const resignation = {
      matchId: matched.matchId!,
      playerId: second.playerId,
      connectionGeneration: connection.participantGeneration!,
      messageId: randomUUID(),
      expectedVersion: 0,
    };
    const result = await live.resign(resignation);
    expect(result.replayed).toBe(false);
    expect((await live.resign(resignation)).replayed).toBe(true);
    expect(
      await reads.settlement(first.playerId, matched.matchId!),
    ).toMatchObject({
      status: 'settled',
      outcome: 'win',
      ratingBefore: 1000,
      ratingAfter: 1020,
      appliedDelta: 20,
    });
    expect(
      await reads.settlement(second.playerId, matched.matchId!),
    ).toMatchObject({
      status: 'settled',
      outcome: 'loss',
      ratingBefore: 1000,
      ratingAfter: 980,
      appliedDelta: -20,
    });
    await expect(
      reads.settlement(randomUUID(), matched.matchId!),
    ).rejects.toMatchObject({
      code: 'RANKED_MATCH_UNAVAILABLE',
    });
    const ledger = await pool.query<{ count: string }>(
      `select count(*)::text as count from private.ranked_rating_ledger_entries
        where match_id = $1::uuid`,
      [matched.matchId],
    );
    expect(ledger.rows[0]?.count).toBe('2');
  }, 60_000);

  it('requeues only an accepting player after a decline and applies the cooldown', async () => {
    const first = await createPlayerWithDeck(pool, cards);
    const second = await createPlayerWithDeck(pool, cards);
    const service = createRankedService(
      pool,
      createTrustRestrictionService(pool),
    );
    const firstQueue = await service.join(first.playerId, first.deckId);
    await service.join(second.playerId, second.deckId);
    expect(await service.pairOnce()).toBe(true);
    const proposalId = (await service.status(first.playerId)).proposalId!;
    await service.accept(first.playerId, proposalId);
    await service.decline(second.playerId, proposalId);
    const requeued = await service.status(first.playerId);
    expect(requeued.status).toBe('searching');
    expect(requeued.queueEntryId).toBe(firstQueue.queueEntryId);
    expect(requeued.joinedAt).toBe(firstQueue.joinedAt);
    expect((await service.status(second.playerId)).status).toBe('cancelled');
    await expect(
      service.join(second.playerId, second.deckId),
    ).rejects.toMatchObject({
      code: 'RANKED_COOLDOWN',
    });
    await service.cancel(first.playerId);
  }, 60_000);

  it('allows an accepted player to cancel before the other acceptance commits', async () => {
    const first = await createPlayerWithDeck(pool, cards);
    const second = await createPlayerWithDeck(pool, cards);
    const service = createRankedService(
      pool,
      createTrustRestrictionService(pool),
    );
    await service.join(first.playerId, first.deckId);
    await service.join(second.playerId, second.deckId);
    expect(await service.pairOnce()).toBe(true);
    const proposalId = (await service.status(first.playerId)).proposalId!;
    expect((await service.accept(first.playerId, proposalId)).accepted).toBe(
      true,
    );
    expect((await service.cancel(first.playerId)).status).toBe('cancelled');
    const states = await pool.query<{
      player_id: string;
      acceptance_status: string;
      queue_status: string;
    }>(
      `select response.player_id::text, response.acceptance_status,
              queue.status as queue_status
         from private.ranked_matchmaking_proposal_participants response
         join private.ranked_queue_entries queue on queue.id = response.queue_entry_id
        where response.proposal_id = $1::uuid`,
      [proposalId],
    );
    expect(states.rows).toEqual(
      expect.arrayContaining([
        {
          player_id: first.playerId,
          acceptance_status: 'declined',
          queue_status: 'cancelled',
        },
        {
          player_id: second.playerId,
          acceptance_status: 'timed_out',
          queue_status: 'expired',
        },
      ]),
    );
    expect((await service.status(second.playerId)).status).toBe('expired');
    await expect(
      service.join(first.playerId, first.deckId),
    ).rejects.toMatchObject({
      code: 'RANKED_COOLDOWN',
    });
    await expect(
      service.join(second.playerId, second.deckId),
    ).rejects.toMatchObject({
      code: 'RANKED_COOLDOWN',
    });
  }, 60_000);

  it('revalidates edited decks before match creation', async () => {
    const first = await createPlayerWithDeck(pool, cards);
    const second = await createPlayerWithDeck(pool, cards);
    const service = createRankedService(
      pool,
      createTrustRestrictionService(pool),
    );
    await service.join(first.playerId, first.deckId);
    await service.join(second.playerId, second.deckId);
    expect(await service.pairOnce()).toBe(true);
    const proposalId = (await service.status(first.playerId)).proposalId!;
    await service.accept(first.playerId, proposalId);
    const removed = await pool.query<{ owned_card_id: string }>(
      `delete from public.player_deck_cards
        where deck_id = $1::uuid and position = 5
        returning owned_card_id::text`,
      [second.deckId],
    );
    expect((await service.accept(second.playerId, proposalId)).status).toBe(
      'invalid_deck',
    );
    expect((await service.status(first.playerId)).status).toBe('searching');
    const receipts = await pool.query<{ count: string }>(
      `select count(*)::text as count from private.ranked_matchmaking_receipts
        where proposal_id = $1::uuid`,
      [proposalId],
    );
    expect(receipts.rows[0]?.count).toBe('0');
    await pool.query(
      `insert into public.player_deck_cards (
         deck_id, player_id, owned_card_id, position
       ) values ($1::uuid, $2::uuid, $3::uuid, 5)`,
      [second.deckId, second.playerId, removed.rows[0]!.owned_card_id],
    );
    await expect(
      service.join(second.playerId, second.deckId),
    ).rejects.toMatchObject({
      code: 'RANKED_COOLDOWN',
    });
    await service.cancel(first.playerId);
  }, 60_000);

  it('does not requeue an accepted player whose deck became invalid', async () => {
    const first = await createPlayerWithDeck(pool, cards);
    const second = await createPlayerWithDeck(pool, cards);
    const service = createRankedService(
      pool,
      createTrustRestrictionService(pool),
    );
    await service.join(first.playerId, first.deckId);
    await service.join(second.playerId, second.deckId);
    expect(await service.pairOnce()).toBe(true);
    const proposalId = (await service.status(first.playerId)).proposalId!;
    await service.accept(first.playerId, proposalId);
    await pool.query(
      `delete from public.player_deck_cards
        where deck_id = $1::uuid and position = 5`,
      [first.deckId],
    );
    await service.decline(second.playerId, proposalId);
    expect((await service.status(first.playerId)).status).toBe('invalid_deck');
    expect((await service.status(second.playerId)).status).toBe('cancelled');
  }, 60_000);
});

async function createPlayerWithDeck(
  pool: pg.Pool,
  cards: readonly CardDefinition[],
): Promise<{ playerId: string; deckId: string }> {
  const playerId = randomUUID();
  const deckId = randomUUID();
  const grantId = randomUUID();
  await pool.query(
    `insert into public.players (id, auth_issuer, auth_subject, player_name, role)
     values ($1::uuid, 'https://issuer.example/', $2, $3, 'player')`,
    [playerId, `auth0|ranked-${playerId}`, `ranked_${playerId.slice(0, 8)}`],
  );
  await pool.query(
    `insert into public.player_starter_grants (id, player_id, affinity)
     values ($1::uuid, $2::uuid, $3)`,
    [grantId, playerId, cards[0]!.affinity],
  );
  await pool.query(
    `insert into public.player_decks (id, player_id, name)
     values ($1::uuid, $2::uuid, 'Ranked service deck')`,
    [deckId, playerId],
  );
  for (const [index, card] of cards.entries()) {
    const ownedId = randomUUID();
    await pool.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, acquisition_kind,
         source_starter_grant_id
       ) values ($1::uuid, $2::uuid, $3::uuid, 'starter', $4::uuid)`,
      [ownedId, playerId, card.id, grantId],
    );
    await pool.query(
      `insert into public.player_deck_cards (
         deck_id, player_id, owned_card_id, position
       ) values ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [deckId, playerId, ownedId, index + 1],
    );
  }
  return { playerId, deckId };
}
