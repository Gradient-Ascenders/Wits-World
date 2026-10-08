// Frozen aggregate queries from 035cde0, retained only for result parity tests.
import type { TrustQueryable } from '../../src/trust/trust-service.js';
interface PairCountRow {
  player_id: string;
  total_matches: number;
  pair_matches: number;
}
interface OneSidedRow {
  winner_player_id: string;
  matching_forfeits: number;
}
export async function loadThirtyDayPairCounts(
  client: TrustQueryable,
  pair: readonly string[],
  now: Date,
): Promise<PairCountRow[]> {
  const result = await client.query<PairCountRow>(
    `
      with completed as (
        select 'async:' || match.id::text as match_id,
               match.completed_at,
               participant.player_id::text
          from public.async_pvp_matches match
          join public.async_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '30 days'
           and match.completed_at <= $3::timestamptz
        union all
        select 'live:' || match.id::text,
               match.completed_at,
               participant.player_id::text
          from public.live_pvp_matches match
          join public.live_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '30 days'
           and match.completed_at <= $3::timestamptz
      ), matches as (
        select match_id,
               max(completed_at) as completed_at,
               array_agg(player_id order by player_id) as players
          from completed
         group by match_id
        having count(*) = 2
      )
      select player.player_id,
             count(*)::integer as total_matches,
             count(*) filter (where matches.players = array[$1::text, $2::text])::integer as pair_matches
        from (values ($1::text), ($2::text)) player(player_id)
        join matches on player.player_id = any(matches.players)
       group by player.player_id
    `,
    [pair[0], pair[1], now],
  );
  return result.rows;
}

export async function loadSevenDayOneSidedCounts(
  client: TrustQueryable,
  pair: readonly string[],
  now: Date,
): Promise<{ rows: OneSidedRow[] }> {
  return client.query<OneSidedRow>(
    `
      with outcomes as (
        select match.winner_player_id::text as winner_player_id,
               array_agg(participant.player_id::text order by participant.player_id::text) as players
          from public.async_pvp_matches match
          join public.async_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '7 days'
           and match.completed_at <= $3::timestamptz
           and match.completion_reason in ('turn_forfeit', 'voluntary_resignation')
         group by match.id
        union all
        select match.winner_player_id::text,
               array_agg(participant.player_id::text order by participant.player_id::text)
          from public.live_pvp_matches match
          join public.live_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '7 days'
           and match.completed_at <= $3::timestamptz
           and match.completion_reason in ('abandonment_forfeit', 'voluntary_resignation')
         group by match.id
      )
      select winner_player_id,
             count(*)::integer as matching_forfeits
        from outcomes
       where players = array[$1::text, $2::text]
       group by winner_player_id
    `,
    [pair[0], pair[1], now],
  );
}
