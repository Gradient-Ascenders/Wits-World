import type pg from 'pg';

import { DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS } from '../config/timers.js';
import { TERRITORY_POLICY_VERSION } from '../territory/territory-grants.js';

export async function hasLivePvpWork(
  database: Pick<pg.Pool | pg.PoolClient, 'query'>,
): Promise<boolean> {
  const result = await database.query<{ pending: boolean }>(
    `select exists (
       select 1 from public.live_pvp_matches where status = 'active'
     ) as pending`,
  );
  if (!result.rows[0]) throw new Error('Live work probe returned no row.');
  return result.rows[0].pending;
}

export async function nextRankedSweep(
  database: Pick<pg.Pool | pg.PoolClient, 'query'>,
): Promise<boolean | number> {
  const result = await database.query<{ pending: boolean; delay_ms: number }>(
    `with sampled as (select clock_timestamp() as now),
     season_boundary as (
       select min(case when season.status = 'active' then season.active_ends_at
                       else season.intended_start_at end) as due
         from public.ranked_seasons season
        where season.policy_version = 'ranked-v1'
          and (season.status = 'active' or (
            season.status = 'scheduled' and not exists (
              select 1 from public.ranked_seasons where status in ('active', 'closing')
            )
          ))
     ), territory_boundary as (
       select (date_trunc('hour', timezone(policy.daily_cap_timezone, sampled.now))
                  + policy.settlement_cadence) at time zone policy.daily_cap_timezone as due
         from private.territory_policy_versions policy cross join sampled
        where policy.policy_version = $2
          and exists (select 1 from public.territory_zones where status = 'active')
     )
     select exists (
              select 1 from private.ranked_queue_entries where status in ('searching', 'proposed')
            ) or exists (
              select 1 from private.ranked_matchmaking_proposals where status = 'awaiting_acceptance'
            ) or exists (
              select 1 from public.ranked_seasons where status = 'closing'
            ) as pending,
            greatest(1, least($1, coalesce(
              ceil(extract(epoch from ((select due from season_boundary) - sampled.now)) * 1000), $1
            ), coalesce(
              ceil(extract(epoch from ((select due from territory_boundary) - sampled.now)) * 1000), $1
            )))::integer as delay_ms
       from sampled`,
    [DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS, TERRITORY_POLICY_VERSION],
  );
  const state = result.rows[0];
  if (!state) throw new Error('Ranked work probe returned no row.');
  return state.pending || state.delay_ms;
}
