import { randomUUID } from 'node:crypto';

import { createBattleState } from '@wits-world/game-rules';

import { loadPlayerBattleDeck } from './player-battle-deck.js';
import type { RankedClient } from './ranked-database.js';
import { consumeTerritoryGrantForMatch } from '../territory/territory-grants.js';

export interface RankedMatchCandidate {
  playerId: string;
  queueEntryId: string;
  deckId: string;
  territoryContender: boolean;
}

/** The caller holds the season, both player, proposal, and queue row locks. */
export async function createRankedLiveMatch(
  client: RankedClient,
  input: {
    proposalId: string;
    seasonId: string;
    policyVersion: string;
    players: readonly [RankedMatchCandidate, RankedMatchCandidate];
    now: Date;
  },
): Promise<string> {
  const [first, second] = input.players;
  const firstDeck = await loadPlayerBattleDeck(
    client,
    first.playerId,
    first.deckId,
  );
  const secondDeck = await loadPlayerBattleDeck(
    client,
    second.playerId,
    second.deckId,
  );
  const decks = [firstDeck, secondDeck] as const;
  const state = createBattleState(decks[0].deck, decks[1].deck);
  const matchId = randomUUID();

  const ratings = await client.query<{
    player_id: string;
    rating: number;
    settled_match_count: number;
  }>(
    `select player_id::text, rating, settled_match_count
       from public.ranked_player_season_ratings
      where season_id = $1::uuid
        and player_id = any($2::uuid[])
      order by player_id
      for update`,
    [input.seasonId, input.players.map((player) => player.playerId)],
  );
  if (ratings.rows.length !== 2) {
    throw new Error('Accepted ranked players have no seasonal rating.');
  }

  await client.query(
    `insert into public.live_pvp_matches (
       id, decision_started_at, turn_deadline,
       started_at, created_at, updated_at
     ) values (
       $1::uuid, $2::timestamptz, $2::timestamptz + interval '60 seconds',
       $2::timestamptz, $2::timestamptz, $2::timestamptz
     )`,
    [matchId, input.now],
  );

  for (const [index, player] of input.players.entries()) {
    const deck = decks[index]!;
    const side = index === 0 ? 'player_one' : 'player_two';
    const snapshotId = randomUUID();
    await client.query(
      `insert into private.live_pvp_deck_snapshots (
         id, match_id, player_id, participant_side, source_deck_id, created_at
       ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6)`,
      [snapshotId, matchId, player.playerId, side, player.deckId, input.now],
    );
    for (const card of deck.cards) {
      await client.query(
        `insert into private.live_pvp_deck_snapshot_cards (
           snapshot_id, position, battle_card_id, source_owned_card_id,
           source_card_definition_id, category, affinity, rarity, card_snapshot
         ) values (
           $1::uuid, $2, $3::uuid, $3::uuid,
           $4::uuid, $5, $6, $7, $8::jsonb
         )`,
        [
          snapshotId,
          card.position,
          card.ownedCardId,
          card.cardDefinitionId,
          card.category,
          card.affinity,
          card.rarity,
          JSON.stringify(card.battleCard),
        ],
      );
    }
    await client.query(
      `insert into public.live_pvp_match_participants (
         match_id, player_id, participant_side, deck_snapshot_id,
         created_at, updated_at
       ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5, $5)`,
      [matchId, player.playerId, side, snapshotId, input.now],
    );
  }

  await client.query(
    `insert into private.live_pvp_match_states (
       match_id, version, battle_state, updated_at
     ) values ($1::uuid, 0, $2::jsonb, $3)`,
    [matchId, JSON.stringify(state), input.now],
  );
  await client.query(
    `update private.ranked_queue_entries
        set status = 'matched', version = version + 1,
            lease_expires_at = null, active_proposal_id = null,
            terminal_at = $2, updated_at = $2
      where id = any($1::uuid[]) and status = 'proposed'`,
    [input.players.map((player) => player.queueEntryId), input.now],
  );
  await client.query(
    `update private.ranked_matchmaking_proposals
        set status = 'matched', version = version + 1, resolved_at = $2
      where id = $1::uuid and status = 'awaiting_acceptance'`,
    [input.proposalId, input.now],
  );
  await client.query(
    `insert into private.ranked_matchmaking_receipts (
       proposal_id, match_id, season_id, policy_version, created_at
     ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
    [input.proposalId, matchId, input.seasonId, input.policyVersion, input.now],
  );
  for (const player of input.players) {
    const territory = await consumeTerritoryGrantForMatch(client, {
      queueEntryId: player.queueEntryId,
      playerId: player.playerId,
      territoryContender: player.territoryContender,
      matchId,
      now: input.now,
    });
    await client.query(
      `insert into private.territory_ranked_match_snapshots (
         match_id, player_id, ranked_season_id, ranked_policy_version,
         territory_policy_version, zone_id, source_grant_id,
         zone_lifecycle_version, snapshotted_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4,
         $5, $6::uuid, $7::uuid, $8, $9::timestamptz
       )`,
      [
        matchId,
        player.playerId,
        input.seasonId,
        input.policyVersion,
        territory.territoryPolicyVersion,
        territory.zoneId,
        territory.sourceGrantId,
        territory.zoneLifecycleVersion,
        territory.snapshottedAt,
      ],
    );

    const rating = ratings.rows.find(
      (row) => row.player_id === player.playerId,
    );
    if (!rating) throw new Error('Accepted ranked player has no rating.');
    await client.query(
      `insert into private.ranked_match_rating_inputs (
         match_id, season_id, policy_version, player_id,
         pre_match_rating, prior_settled_match_count, k_factor, created_at
       ) values (
         $1::uuid, $2::uuid, $3, $4::uuid,
         $5, $6, $7, $8
       )`,
      [
        matchId,
        input.seasonId,
        input.policyVersion,
        player.playerId,
        rating.rating,
        rating.settled_match_count,
        rating.settled_match_count < 5 ? 40 : 24,
        input.now,
      ],
    );
  }
  return matchId;
}
