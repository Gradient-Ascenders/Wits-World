import type pg from 'pg';

import type { LiveCompletionReason } from './live-pvp-service.js';

interface QueryClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

interface RankedInput extends pg.QueryResultRow {
  season_id: string;
  policy_version: string;
  player_id: string;
  pre_match_rating: number;
  prior_settled_match_count: number;
  k_factor: number;
}

interface CurrentRating extends pg.QueryResultRow {
  player_id: string;
  rating: number;
  settled_match_count: number;
  wins: number;
  losses: number;
}

/** Called only from the transaction that persists an authoritative terminal live result. */
export async function settleRankedMatch(
  client: QueryClient,
  input: {
    matchId: string;
    winnerPlayerId: string;
    loserPlayerId: string;
    completionReason: LiveCompletionReason;
    completedAt: Date;
  },
): Promise<void> {
  const receipt = await client.query<{
    season_id: string;
    policy_version: string;
  }>(
    `select season_id::text, policy_version
       from private.ranked_matchmaking_receipts
      where match_id = $1::uuid`,
    [input.matchId],
  );
  const ranked = receipt.rows[0];
  if (!ranked) return;

  const priorSettlement = await client.query<{ match_id: string }>(
    `select match_id::text
       from private.ranked_rating_settlements
      where match_id = $1::uuid`,
    [input.matchId],
  );
  if (priorSettlement.rows[0]) return;

  const inputs = await client.query<RankedInput>(
    `select season_id::text, policy_version, player_id::text,
            pre_match_rating, prior_settled_match_count, k_factor
       from private.ranked_match_rating_inputs
      where match_id = $1::uuid
      order by player_id`,
    [input.matchId],
  );
  if (
    inputs.rows.length !== 2 ||
    !inputs.rows.some((row) => row.player_id === input.winnerPlayerId) ||
    !inputs.rows.some((row) => row.player_id === input.loserPlayerId) ||
    input.winnerPlayerId === input.loserPlayerId
  ) {
    throw new Error(
      'Ranked settlement is missing authoritative participant inputs.',
    );
  }

  // The match lock is held by the live service. All settlement paths then take
  // rating locks in the same player-id order.
  const ratings = await client.query<CurrentRating>(
    `select player_id::text, rating, settled_match_count, wins, losses
       from public.ranked_player_season_ratings
      where season_id = $1::uuid
        and player_id = any($2::uuid[])
      order by player_id
      for update`,
    [ranked.season_id, inputs.rows.map((row) => row.player_id)],
  );
  if (ratings.rows.length !== 2) {
    throw new Error('Ranked settlement is missing a seasonal rating.');
  }
  for (const snapshot of inputs.rows) {
    const current = ratings.rows.find(
      (row) => row.player_id === snapshot.player_id,
    );
    if (
      !current ||
      current.rating !== snapshot.pre_match_rating ||
      current.settled_match_count !== snapshot.prior_settled_match_count ||
      snapshot.season_id !== ranked.season_id ||
      snapshot.policy_version !== ranked.policy_version
    ) {
      throw new Error('Ranked rating inputs changed after match creation.');
    }
  }

  await client.query(
    `insert into private.ranked_rating_settlements (
       match_id, season_id, policy_version, winner_player_id, loser_player_id,
       completion_reason, settled_at
     ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7)`,
    [
      input.matchId,
      ranked.season_id,
      ranked.policy_version,
      input.winnerPlayerId,
      input.loserPlayerId,
      input.completionReason,
      input.completedAt,
    ],
  );

  for (const snapshot of inputs.rows) {
    const opponent = inputs.rows.find(
      (row) => row.player_id !== snapshot.player_id,
    )!;
    const current = ratings.rows.find(
      (row) => row.player_id === snapshot.player_id,
    )!;
    const outcome =
      snapshot.player_id === input.winnerPlayerId ? 'win' : 'loss';
    // PostgreSQL numeric round() is half away from zero, as required by
    // ranked-v1 and the migration's deferred settlement check.
    const calculation = await client.query<{
      expected_score: string;
      calculated_delta: number;
    }>(
      `with expected as (
         select round(
           1::numeric / (1::numeric + power(
             10::numeric, ($2::integer - $1::integer)::numeric / 400
           )), 15
         ) as score
       )
       select score::text as expected_score,
              round($3::integer * ($4::integer::numeric - score))::integer
                as calculated_delta
         from expected`,
      [
        snapshot.pre_match_rating,
        opponent.pre_match_rating,
        snapshot.k_factor,
        outcome === 'win' ? 1 : 0,
      ],
    );
    const result = calculation.rows[0];
    if (!result) throw new Error('Ranked Elo calculation returned no result.');
    const ratingAfter = Math.max(100, current.rating + result.calculated_delta);
    const winsAfter = current.wins + (outcome === 'win' ? 1 : 0);
    const lossesAfter = current.losses + (outcome === 'loss' ? 1 : 0);
    const matchCountAfter = current.settled_match_count + 1;

    await client.query(
      `insert into private.ranked_rating_ledger_entries (
         match_id, season_id, policy_version, player_id, outcome,
         rating_before, expected_score, k_factor, calculated_delta,
         applied_delta, rating_after, match_count_before, match_count_after,
         wins_before, wins_after, losses_before, losses_after
       ) values (
         $1::uuid, $2::uuid, $3, $4::uuid, $5,
         $6, $7::numeric, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17
       )`,
      [
        input.matchId,
        ranked.season_id,
        ranked.policy_version,
        snapshot.player_id,
        outcome,
        current.rating,
        result.expected_score,
        snapshot.k_factor,
        result.calculated_delta,
        ratingAfter - current.rating,
        ratingAfter,
        current.settled_match_count,
        matchCountAfter,
        current.wins,
        winsAfter,
        current.losses,
        lossesAfter,
      ],
    );
    await client.query(
      `update public.ranked_player_season_ratings
          set rating = $3, settled_match_count = $4,
              wins = $5, losses = $6,
              rating_first_reached_at = case
                when rating <> $3 then $7::timestamptz
                else rating_first_reached_at end,
              last_settled_match_id = $8::uuid, updated_at = $7::timestamptz
        where season_id = $1::uuid and player_id = $2::uuid`,
      [
        ranked.season_id,
        snapshot.player_id,
        ratingAfter,
        matchCountAfter,
        winsAfter,
        lossesAfter,
        input.completedAt,
        input.matchId,
      ],
    );
  }
}
