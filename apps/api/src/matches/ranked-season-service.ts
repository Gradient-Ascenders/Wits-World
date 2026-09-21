import type pg from 'pg';

import {
  rankedDatabaseNow,
  rankedTransaction,
  type RankedClient,
  type RankedDatabase,
} from './ranked-database.js';

interface SeasonRow extends pg.QueryResultRow {
  id: string;
  status: 'active' | 'closing';
  active_ends_at: Date;
}

export interface RankedSeasonMaintenanceResult {
  startedClosing: boolean;
  closedSeason: boolean;
  activatedSeason: boolean;
}

/** Each API instance may run this; the current season row serializes transitions. */
export async function maintainRankedSeasons(
  database: RankedDatabase,
): Promise<RankedSeasonMaintenanceResult> {
  return rankedTransaction(database, async (client) => {
    // There can be no current row between seasons; serialize that gap too.
    await client.query(
      `select pg_advisory_xact_lock(hashtext('ranked-season-maintenance'))`,
    );
    const now = await rankedDatabaseNow(client);
    const result: RankedSeasonMaintenanceResult = {
      startedClosing: false,
      closedSeason: false,
      activatedSeason: false,
    };
    const currentResult = await client.query<SeasonRow>(
      `select id::text, status, active_ends_at
         from public.ranked_seasons
        where status in ('active', 'closing')
        limit 1 for update`,
    );
    const current = currentResult.rows[0];
    if (current?.status === 'active') {
      if (now < current.active_ends_at) return result;
      await cancelSeasonQueue(client, current.id, now);
      await client.query(
        `update public.ranked_seasons
            set status = 'closing', version = version + 1,
                closing_at = $2, updated_at = $2
          where id = $1::uuid and status = 'active'`,
        [current.id, now],
      );
      result.startedClosing = true;
    }
    if (current) {
      const unsettled = await client.query<{ id: string }>(
        `select receipt.match_id::text as id
           from private.ranked_matchmaking_receipts receipt
           left join private.ranked_rating_settlements settlement
             on settlement.match_id = receipt.match_id
          where receipt.season_id = $1::uuid
            and settlement.match_id is null
          limit 1`,
        [current.id],
      );
      if (unsettled.rows[0]) return result;
      await closeSeason(client, current.id, now);
      result.closedSeason = true;
    }

    const scheduled = await client.query<{ id: string }>(
      `select id::text from public.ranked_seasons
        where status = 'scheduled' and intended_start_at <= $1
          and policy_version = 'ranked-v1'
        order by intended_start_at, id
        limit 1 for update skip locked`,
      [now],
    );
    const next = scheduled.rows[0];
    if (next) {
      await client.query(
        `update public.ranked_seasons
            set status = 'active', version = version + 1,
                activated_at = $2,
                active_ends_at = $2::timestamptz + interval '28 days',
                updated_at = $2
          where id = $1::uuid and status = 'scheduled'`,
        [next.id, now],
      );
      const previous = await client.query<{ id: string }>(
        `select id::text from public.ranked_seasons
          where status = 'closed'
          order by closed_at desc, id desc limit 1`,
      );
      await seedSeasonRatings(
        client,
        next.id,
        previous.rows[0]?.id ?? null,
        now,
      );
      result.activatedSeason = true;
    }
    return result;
  });
}

async function cancelSeasonQueue(
  client: RankedClient,
  seasonId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `update private.ranked_matchmaking_proposal_participants response
        set acceptance_status = 'system_cancelled', responded_at = $2
       from private.ranked_matchmaking_proposals proposal
      where response.proposal_id = proposal.id
        and proposal.season_id = $1::uuid
        and proposal.status = 'awaiting_acceptance'
        and response.acceptance_status = 'pending'`,
    [seasonId, now],
  );
  await client.query(
    `update private.ranked_queue_entries
        set status = 'cancelled', version = version + 1,
            lease_expires_at = null, active_proposal_id = null,
            terminal_at = $2, updated_at = $2
      where season_id = $1::uuid and status in ('searching', 'proposed')`,
    [seasonId, now],
  );
  await client.query(
    `update private.ranked_matchmaking_proposals
        set status = 'cancelled', version = version + 1,
            resolved_at = $2
      where season_id = $1::uuid and status = 'awaiting_acceptance'`,
    [seasonId, now],
  );
}

async function closeSeason(
  client: RankedClient,
  seasonId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `insert into public.ranked_season_standing_archives (
       season_id, player_id, rank, rating, wins, losses,
       settled_match_count, archived_at
     )
     select rating.season_id, rating.player_id,
            rank() over (order by rating.rating desc)::integer,
            rating.rating, rating.wins, rating.losses,
            rating.settled_match_count, $2
       from public.ranked_player_season_ratings rating
      where rating.season_id = $1::uuid
        and rating.settled_match_count >= 5
     on conflict (season_id, player_id) do nothing`,
    [seasonId, now],
  );
  await client.query(
    `insert into private.ranked_season_close_receipts (
       season_id, settlement_count, archived_player_count, closed_at
     ) values (
       $1::uuid,
       (select count(*)::integer from private.ranked_rating_settlements
         where season_id = $1::uuid),
       (select count(*)::integer from public.ranked_season_standing_archives
         where season_id = $1::uuid),
       $2
     ) on conflict (season_id) do nothing`,
    [seasonId, now],
  );
  await client.query(
    `update public.ranked_seasons
        set status = 'closed', version = version + 1,
            closed_at = $2, updated_at = $2
      where id = $1::uuid and status = 'closing'`,
    [seasonId, now],
  );
}

async function seedSeasonRatings(
  client: RankedClient,
  seasonId: string,
  previousSeasonId: string | null,
  now: Date,
): Promise<void> {
  await client.query(
    `insert into public.ranked_player_season_ratings (
       season_id, player_id, starting_rating, rating,
       rating_first_reached_at, carried_from_season_id,
       created_at, updated_at
     )
     select $1::uuid, player.id, seed.value, seed.value,
            $3, case when prior.player_id is null then null else $2::uuid end,
            $3, $3
       from public.players player
       left join public.ranked_player_season_ratings prior
         on prior.season_id = $2::uuid and prior.player_id = player.id
       cross join lateral (
         select case when prior.player_id is null then 1000
                     else greatest(100, 1000 + round(
                       (prior.rating - 1000)::numeric * 0.5
                     )::integer)
                end as value
       ) seed
      where player.lifecycle_status = 'active'
     on conflict (season_id, player_id) do nothing`,
    [seasonId, previousSeasonId, now],
  );
}
