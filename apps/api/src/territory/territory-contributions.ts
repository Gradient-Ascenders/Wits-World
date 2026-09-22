import type pg from 'pg';

import type { LiveCompletionReason } from '../matches/live-pvp-service.js';
import {
  TERRITORY_POLICY_VERSION,
  type TerritoryQueryable,
} from './territory-grants.js';

interface WinnerContextRow extends pg.QueryResultRow {
  prior_settled_match_count: number;
  territory_policy_version: string | null;
  zone_id: string | null;
}

interface PolicyRow extends pg.QueryResultRow {
  required_prior_ranked_settlements: number;
  influence_per_eligible_win: number;
  daily_influence_cap: number;
  daily_cap_timezone: string;
}

const ELIGIBLE_COMPLETION_REASONS = new Set<LiveCompletionReason>([
  'defeat',
  'abandonment_forfeit',
  'voluntary_resignation',
  'account_deletion_forfeit',
]);

/**
 * Called from the same transaction that inserts the authoritative ranked
 * rating settlement. The live match and both rating rows are already locked.
 */
export async function recordTerritoryContribution(
  client: TerritoryQueryable,
  input: {
    matchId: string;
    seasonId: string;
    rankedPolicyVersion: string;
    winnerPlayerId: string;
    completionReason: LiveCompletionReason;
  },
): Promise<void> {
  const existing = await client.query<{ source_match_id: string }>(
    `select source_match_id::text
       from private.territory_contribution_decisions
      where source_match_id = $1::uuid`,
    [input.matchId],
  );
  if (existing.rows[0]) return;

  const contextResult = await client.query<WinnerContextRow>(
    `select rating.prior_settled_match_count,
            snapshot.territory_policy_version,
            snapshot.zone_id::text
       from private.ranked_match_rating_inputs rating
       left join private.territory_ranked_match_snapshots snapshot
         on snapshot.match_id = rating.match_id
        and snapshot.player_id = rating.player_id
      where rating.match_id = $1::uuid
        and rating.player_id = $2::uuid`,
    [input.matchId, input.winnerPlayerId],
  );
  const context = contextResult.rows[0];
  if (!context) {
    throw new Error('Territory settlement is missing the ranked winner input.');
  }

  const territoryPolicyVersion =
    context.territory_policy_version ?? TERRITORY_POLICY_VERSION;
  const policyResult = await client.query<PolicyRow>(
    `select required_prior_ranked_settlements,
            influence_per_eligible_win,
            daily_influence_cap,
            daily_cap_timezone
       from private.territory_policy_versions
      where policy_version = $1`,
    [territoryPolicyVersion],
  );
  const policy = policyResult.rows[0];
  if (!policy) throw new Error('Territory contribution policy is unavailable.');

  if (!context.zone_id) {
    await insertExcludedDecision(
      client,
      input,
      territoryPolicyVersion,
      null,
      'no_zone_grant',
    );
    return;
  }
  if (
    context.prior_settled_match_count < policy.required_prior_ranked_settlements
  ) {
    await insertExcludedDecision(
      client,
      input,
      territoryPolicyVersion,
      context.zone_id,
      'winner_provisional',
    );
    return;
  }
  if (!ELIGIBLE_COMPLETION_REASONS.has(input.completionReason)) {
    await insertExcludedDecision(
      client,
      input,
      territoryPolicyVersion,
      context.zone_id,
      'result_not_eligible',
    );
    return;
  }

  // Match -> rating -> player -> zone is the documented lock order. The match
  // and rating locks are held by the caller before this function runs.
  const player = await client.query<{ lifecycle_status: string }>(
    `select lifecycle_status
       from public.players
      where id = $1::uuid
      for update`,
    [input.winnerPlayerId],
  );
  if (player.rows[0]?.lifecycle_status !== 'active') {
    await insertExcludedDecision(
      client,
      input,
      territoryPolicyVersion,
      context.zone_id,
      'winner_unavailable',
    );
    return;
  }

  const zone = await client.query<{ status: string }>(
    `select status
       from public.territory_zones
      where id = $1::uuid
        and policy_version = $2
      for update`,
    [context.zone_id, territoryPolicyVersion],
  );
  if (zone.rows[0]?.status !== 'active') {
    await insertExcludedDecision(
      client,
      input,
      territoryPolicyVersion,
      context.zone_id,
      'zone_inactive',
    );
    return;
  }

  const clock = await client.query<{
    contributed_at: Date;
    contribution_date: string;
  }>(
    `with sampled as (
       select clock_timestamp() as contributed_at
     )
     select contributed_at,
            timezone($1, contributed_at)::date::text as contribution_date
       from sampled`,
    [policy.daily_cap_timezone],
  );
  const authoritative = clock.rows[0];
  if (!authoritative) throw new Error('Territory contribution clock failed.');

  const daily = await client.query<{ accepted_count: number }>(
    `select count(*)::integer as accepted_count
       from private.territory_influence_contributions contribution
      where contribution.zone_id = $1::uuid
        and contribution.player_id = $2::uuid
        and contribution.contribution_date = $3::date`,
    [context.zone_id, input.winnerPlayerId, authoritative.contribution_date],
  );
  if ((daily.rows[0]?.accepted_count ?? 0) >= policy.daily_influence_cap) {
    await insertExcludedDecision(
      client,
      input,
      territoryPolicyVersion,
      context.zone_id,
      'daily_cap_reached',
    );
    return;
  }

  await client.query(
    `insert into private.territory_contribution_decisions (
       source_match_id, ranked_season_id, ranked_policy_version,
       territory_policy_version, winner_player_id, zone_id,
       outcome, influence_points
     ) values (
       $1::uuid, $2::uuid, $3,
       $4, $5::uuid, $6::uuid,
       'accepted', $7
     )`,
    [
      input.matchId,
      input.seasonId,
      input.rankedPolicyVersion,
      territoryPolicyVersion,
      input.winnerPlayerId,
      context.zone_id,
      policy.influence_per_eligible_win,
    ],
  );

  await client.query(
    `insert into private.territory_influence_contributions (
       source_match_id, ranked_season_id, territory_policy_version,
       zone_id, player_id, influence_points,
       contributed_at, contribution_date
     ) values (
       $1::uuid, $2::uuid, $3,
       $4::uuid, $5::uuid, $6,
       $7::timestamptz, $8::date
     )`,
    [
      input.matchId,
      input.seasonId,
      territoryPolicyVersion,
      context.zone_id,
      input.winnerPlayerId,
      policy.influence_per_eligible_win,
      authoritative.contributed_at,
      authoritative.contribution_date,
    ],
  );
}

async function insertExcludedDecision(
  client: TerritoryQueryable,
  input: {
    matchId: string;
    seasonId: string;
    rankedPolicyVersion: string;
    winnerPlayerId: string;
  },
  territoryPolicyVersion: string,
  zoneId: string | null,
  reason: string,
): Promise<void> {
  await client.query(
    `insert into private.territory_contribution_decisions (
       source_match_id, ranked_season_id, ranked_policy_version,
       territory_policy_version, winner_player_id, zone_id,
       outcome, influence_points, exclusion_reason
     ) values (
       $1::uuid, $2::uuid, $3,
       $4, $5::uuid, $6::uuid,
       'excluded', 0, $7
     )`,
    [
      input.matchId,
      input.seasonId,
      input.rankedPolicyVersion,
      territoryPolicyVersion,
      input.winnerPlayerId,
      zoneId,
      reason,
    ],
  );
}
