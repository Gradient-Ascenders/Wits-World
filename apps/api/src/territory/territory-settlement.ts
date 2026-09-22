import { createHash } from 'node:crypto';
import type pg from 'pg';

import type {
  RankedClient,
  RankedDatabase,
} from '../matches/ranked-database.js';
import {
  rankedDatabaseNow,
  rankedTransaction,
} from '../matches/ranked-database.js';
import { TERRITORY_POLICY_VERSION } from './territory-grants.js';

export interface TerritorySettlementTotal {
  playerId: string;
  acceptedInfluenceCount: number;
  earliestContributionAt: string;
  earliestContributionKey: string;
  accountEligible: boolean;
}

interface PolicyRow extends pg.QueryResultRow {
  settlement_cadence_ms: number;
  minimum_ownership_influence: number;
  daily_cap_timezone: string;
}

interface OwnershipRow extends pg.QueryResultRow {
  state_version: string;
  owner_player_id: string | null;
}

interface TotalRow extends pg.QueryResultRow {
  player_id: string;
  accepted_influence_count: number;
  earliest_contribution_at: string;
  earliest_contribution_key: string;
  account_eligible: boolean;
}

interface CursorRow extends pg.QueryResultRow {
  window_start: Date;
}

export interface TerritorySettlementResult {
  receiptId: string;
  zoneId: string;
  seasonId: string;
  kind: 'hourly' | 'season_final';
  windowStart: Date;
  windowEnd: Date;
  ownerBeforePlayerId: string | null;
  ownerAfterPlayerId: string | null;
  inputDigest: string;
}

export interface TerritoryMaintenanceResult {
  settledWindows: number;
  finalizedSeason: boolean;
}

class TerritorySettlementRetryError extends Error {
  constructor() {
    super(
      'Territory settlement state changed while acquiring the zone boundary.',
    );
    this.name = 'TerritorySettlementRetryError';
  }
}

export function selectTerritoryOwner(
  currentOwnerPlayerId: string | null,
  totals: readonly TerritorySettlementTotal[],
  minimumInfluence: number,
): string | null {
  const eligible = totals.filter(
    (total) =>
      total.accountEligible && total.acceptedInfluenceCount >= minimumInfluence,
  );
  if (eligible.length === 0) {
    return currentOwnerPlayerId;
  }

  const maximum = Math.max(
    ...eligible.map((total) => total.acceptedInfluenceCount),
  );
  const leaders = eligible.filter(
    (total) => total.acceptedInfluenceCount === maximum,
  );
  if (
    currentOwnerPlayerId &&
    leaders.some((leader) => leader.playerId === currentOwnerPlayerId)
  ) {
    return currentOwnerPlayerId;
  }

  return [...leaders].sort((left, right) => {
    const timestamp = left.earliestContributionKey.localeCompare(
      right.earliestContributionKey,
    );
    if (timestamp !== 0) return timestamp;
    return left.playerId.localeCompare(right.playerId);
  })[0]!.playerId;
}

export function territorySettlementDigest(input: {
  zoneId: string;
  seasonId: string;
  policyVersion: string;
  kind: 'hourly' | 'season_final';
  windowStart: string;
  windowEnd: string;
  expectedStateVersion: string;
  ownerBeforePlayerId: string | null;
  totals: readonly TerritorySettlementTotal[];
}): string {
  const canonical = JSON.stringify({
    zoneId: input.zoneId,
    seasonId: input.seasonId,
    policyVersion: input.policyVersion,
    kind: input.kind,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    expectedStateVersion: input.expectedStateVersion,
    ownerBeforePlayerId: input.ownerBeforePlayerId,
    totals: [...input.totals]
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .map((total) => ({
        playerId: total.playerId,
        acceptedInfluenceCount: total.acceptedInfluenceCount,
        earliestContributionAt: total.earliestContributionKey,
        accountEligible: total.accountEligible,
      })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export async function settleTerritoryWindow(
  client: RankedClient,
  input: {
    zoneId: string;
    seasonId: string;
    policyVersion?: string;
    windowStart: Date;
    windowEnd: Date;
    kind: 'hourly' | 'season_final';
  },
): Promise<TerritorySettlementResult> {
  const policyVersion = input.policyVersion ?? TERRITORY_POLICY_VERSION;
  const existing = await client.query<{
    id: string;
    owner_before_player_id: string | null;
    owner_after_player_id: string | null;
    input_digest: string;
  }>(
    `select id::text, owner_before_player_id::text,
            owner_after_player_id::text, input_digest
       from private.territory_settlement_receipts
      where zone_id = $1::uuid
        and ranked_season_id = $2::uuid
        and window_start = $3::timestamptz
        and window_end = $4::timestamptz`,
    [input.zoneId, input.seasonId, input.windowStart, input.windowEnd],
  );
  const prior = existing.rows[0];
  if (prior) {
    return {
      receiptId: prior.id,
      zoneId: input.zoneId,
      seasonId: input.seasonId,
      kind: input.kind,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      ownerBeforePlayerId: prior.owner_before_player_id,
      ownerAfterPlayerId: prior.owner_after_player_id,
      inputDigest: prior.input_digest,
    };
  }

  const policyResult = await client.query<PolicyRow>(
    `select (extract(epoch from settlement_cadence) * 1000)::integer
              as settlement_cadence_ms,
            minimum_ownership_influence,
            daily_cap_timezone
       from private.territory_policy_versions
      where policy_version = $1`,
    [policyVersion],
  );
  const policy = policyResult.rows[0];
  if (!policy) throw new Error('Territory settlement policy is unavailable.');

  const initialOwnership = await loadCurrentOwnership(client, input.zoneId);
  if (!initialOwnership) {
    throw new Error('Territory zone has no ownership history.');
  }

  const contributorIds = await client.query<{ player_id: string }>(
    `select distinct contribution.player_id::text as player_id
       from private.territory_influence_contributions contribution
      where contribution.zone_id = $1::uuid
        and contribution.ranked_season_id = $2::uuid
        and contribution.territory_policy_version = $3
        and contribution.contributed_at >= $4::timestamptz
        and contribution.contributed_at < $5::timestamptz
      order by player_id`,
    [
      input.zoneId,
      input.seasonId,
      policyVersion,
      input.windowStart,
      input.windowEnd,
    ],
  );
  const playerIds = new Set(contributorIds.rows.map((row) => row.player_id));
  if (initialOwnership.owner_player_id) {
    playerIds.add(initialOwnership.owner_player_id);
  }
  if (playerIds.size > 0) {
    await client.query(
      `select id
         from public.players
        where id = any($1::uuid[])
        order by id
        for update`,
      [[...playerIds].sort()],
    );
  }

  // Player rows are locked first, then the shared zone boundary. Contribution
  // recording follows the same player -> zone order and samples its authoritative
  // timestamp only after obtaining this zone lock. Once this lock is held, the
  // half-open window cannot gain a contribution that settlement silently misses.
  await client.query(
    `select id
       from public.territory_zones
      where id = $1::uuid
        and policy_version = $2
        and status = 'active'
      for update`,
    [input.zoneId, policyVersion],
  );

  // A contribution can commit between the initial contributor scan and the
  // zone lock. If that introduced a previously unseen player, retry so every
  // contributor row is locked in player -> zone order before eligibility is
  // snapshotted. Once the zone lock is held no further contribution can enter
  // this window until the settlement transaction completes.
  const stableContributors = await client.query<{ player_id: string }>(
    `select distinct contribution.player_id::text as player_id
       from private.territory_influence_contributions contribution
      where contribution.zone_id = $1::uuid
        and contribution.ranked_season_id = $2::uuid
        and contribution.territory_policy_version = $3
        and contribution.contributed_at >= $4::timestamptz
        and contribution.contributed_at < $5::timestamptz
      order by player_id`,
    [
      input.zoneId,
      input.seasonId,
      policyVersion,
      input.windowStart,
      input.windowEnd,
    ],
  );
  if (stableContributors.rows.some((row) => !playerIds.has(row.player_id))) {
    throw new TerritorySettlementRetryError();
  }

  const ownership = await loadCurrentOwnership(client, input.zoneId);
  if (!ownership) throw new Error('Territory ownership disappeared.');
  if (
    ownership.state_version !== initialOwnership.state_version ||
    ownership.owner_player_id !== initialOwnership.owner_player_id
  ) {
    throw new TerritorySettlementRetryError();
  }
  const totals = await loadSettlementTotals(client, {
    zoneId: input.zoneId,
    seasonId: input.seasonId,
    policyVersion,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });
  const ownerAfter = selectTerritoryOwner(
    ownership.owner_player_id,
    totals,
    policy.minimum_ownership_influence,
  );
  const digest = territorySettlementDigest({
    zoneId: input.zoneId,
    seasonId: input.seasonId,
    policyVersion,
    kind: input.kind,
    windowStart: input.windowStart.toISOString(),
    windowEnd: input.windowEnd.toISOString(),
    expectedStateVersion: ownership.state_version,
    ownerBeforePlayerId: ownership.owner_player_id,
    totals,
  });

  const receiptResult = await client.query<{ id: string }>(
    `insert into private.territory_settlement_receipts (
       zone_id, ranked_season_id, territory_policy_version,
       settlement_kind, window_start, window_end,
       expected_state_version, resulting_state_version,
       owner_before_player_id, owner_after_player_id, input_digest
     ) values (
       $1::uuid, $2::uuid, $3,
       $4, $5::timestamptz, $6::timestamptz,
       $7::bigint, $7::bigint + 1,
       $8::uuid, $9::uuid, $10
     )
     returning id::text`,
    [
      input.zoneId,
      input.seasonId,
      policyVersion,
      input.kind,
      input.windowStart,
      input.windowEnd,
      ownership.state_version,
      ownership.owner_player_id,
      ownerAfter,
      digest,
    ],
  );
  const receipt = receiptResult.rows[0];
  if (!receipt)
    throw new Error('Territory settlement receipt was not created.');

  for (const total of totals) {
    await client.query(
      `insert into private.territory_settlement_totals (
         settlement_receipt_id, player_id, accepted_influence_count,
         earliest_contribution_at, account_eligible
       ) values ($1::uuid, $2::uuid, $3, $4::timestamptz, $5)`,
      [
        receipt.id,
        total.playerId,
        total.acceptedInfluenceCount,
        total.earliestContributionAt,
        total.accountEligible,
      ],
    );
  }

  return {
    receiptId: receipt.id,
    zoneId: input.zoneId,
    seasonId: input.seasonId,
    kind: input.kind,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    ownerBeforePlayerId: ownership.owner_player_id,
    ownerAfterPlayerId: ownerAfter,
    inputDigest: digest,
  };
}

export async function maintainTerritorySettlements(
  database: RankedDatabase,
  maximumWindows = 24,
): Promise<TerritoryMaintenanceResult> {
  let settledWindows = 0;

  // Settle at most one window per transaction. A successful settlement holds
  // player and zone row locks until commit; attempting a later window in the
  // same transaction could otherwise acquire a new player lock while already
  // holding a zone lock, reversing the shared player -> zone lock order used
  // by contribution recording and account deletion. Separate transactions keep
  // catch-up deterministic without creating that cross-window deadlock cycle.
  while (settledWindows < maximumWindows) {
    const settledThisTransaction = await rankedTransaction(
      database,
      async (client) => {
        const season = await client.query<{ id: string }>(
          `select id::text
             from public.ranked_seasons
            where status in ('active', 'closing')
            limit 1`,
        );
        const seasonId = season.rows[0]?.id;
        if (!seasonId) return 0;

        const now = await rankedDatabaseNow(client);
        return settleDueWindowsWithinTransaction(client, seasonId, now, 1);
      },
    );
    if (settledThisTransaction === 0) break;
    settledWindows += settledThisTransaction;
  }

  return { settledWindows, finalizedSeason: false };
}

/** Called by ranked season maintenance after the last ranked match settles. */
export async function finalizeTerritorySeason(
  client: RankedClient,
  seasonId: string,
): Promise<boolean> {
  const existing = await client.query<{ ranked_season_id: string }>(
    `select ranked_season_id::text
       from private.territory_season_close_receipts
      where ranked_season_id = $1::uuid`,
    [seasonId],
  );
  if (existing.rows[0]) return false;

  const season = await client.query<{ status: string }>(
    `select status
       from public.ranked_seasons
      where id = $1::uuid
      for update`,
    [seasonId],
  );
  if (season.rows[0]?.status !== 'closing') {
    throw new Error(
      'Territory season finalization requires a closing ranked season.',
    );
  }

  // Freeze one authoritative close instant before settling. Reusing the same
  // timestamp for full-window catch-up and the final partial window prevents a
  // boundary crossing between two clock samples from producing a >cadence
  // season-final window.
  const closeAt = await rankedDatabaseNow(client);

  // Finalization intentionally remains in the ranked season-close transaction.
  // No ranked source match remains unsettled at this point, so the set of
  // territory contributors is closed. Lock every contributor/current owner in
  // stable UUID order before taking any zone lock; later per-window settlement
  // then only re-locks rows already owned by this transaction and preserves the
  // global player -> zone order across the multi-zone finalization batch.
  await lockTerritorySeasonPlayers(client, seasonId);
  await settleDueWindowsWithinTransaction(client, seasonId, closeAt, 10_000);

  const zones = await client.query<{ id: string }>(
    `select id::text
       from public.territory_zones
      where policy_version = $1 and status = 'active'
      order by id`,
    [TERRITORY_POLICY_VERSION],
  );

  // No ranked matches remain, so the frozen close instant is the common end of
  // every zone's final window and the season archive boundary.
  for (const zone of zones.rows) {
    const cursor = await loadWindowCursor(client, zone.id, seasonId, closeAt);
    if (cursor.getTime() < closeAt.getTime()) {
      await settleWithSavepointRetry(client, {
        zoneId: zone.id,
        seasonId,
        windowStart: cursor,
        windowEnd: closeAt,
        kind: 'season_final',
      });
    }
  }

  const contributionCount = await client.query<{ count: number }>(
    `select count(*)::integer as count
       from private.territory_influence_contributions
      where ranked_season_id = $1::uuid
        and territory_policy_version = $2`,
    [seasonId, TERRITORY_POLICY_VERSION],
  );
  await client.query(
    `insert into private.territory_season_close_receipts (
       ranked_season_id, territory_policy_version,
       finalized_zone_count, accepted_contribution_count, closed_at
     ) values ($1::uuid, $2, $3, $4, $5::timestamptz)`,
    [
      seasonId,
      TERRITORY_POLICY_VERSION,
      zones.rows.length,
      contributionCount.rows[0]?.count ?? 0,
      closeAt,
    ],
  );

  for (const zone of zones.rows) {
    const ownership = await loadCurrentOwnership(client, zone.id);
    if (!ownership) continue;
    if (ownership.owner_player_id) {
      await client.query(
        `select id
           from public.players
          where id = $1::uuid
          for update`,
        [ownership.owner_player_id],
      );
    }
    const fresh = await loadCurrentOwnership(client, zone.id);
    if (!fresh) continue;
    await client.query(
      `insert into private.territory_ownership_versions (
         zone_id, policy_version, state_version, ranked_season_id,
         previous_owner_player_id, owner_player_id,
         transition_kind, effective_at
       ) values (
         $1::uuid, $2, $3::bigint + 1, $4::uuid,
         $5::uuid, null,
         'season_reset', $6::timestamptz
       )`,
      [
        zone.id,
        TERRITORY_POLICY_VERSION,
        fresh.state_version,
        seasonId,
        fresh.owner_player_id,
        closeAt,
      ],
    );
  }
  return true;
}

async function lockTerritorySeasonPlayers(
  client: RankedClient,
  seasonId: string,
): Promise<void> {
  await client.query(
    `with relevant_players as (
       select contribution.player_id
         from private.territory_influence_contributions contribution
        where contribution.ranked_season_id = $1::uuid
          and contribution.territory_policy_version = $2
       union
       select version.owner_player_id
         from private.territory_current_ownership current_state
         join private.territory_ownership_versions version
           on version.id = current_state.ownership_version_id
         join public.territory_zones zone
           on zone.id = current_state.zone_id
        where zone.policy_version = $2
          and zone.status = 'active'
          and version.owner_player_id is not null
     )
     select player.id
       from public.players player
       join relevant_players relevant on relevant.player_id = player.id
      order by player.id
      for update of player`,
    [seasonId, TERRITORY_POLICY_VERSION],
  );
}

async function settleDueWindowsWithinTransaction(
  client: RankedClient,
  seasonId: string,
  now: Date,
  maximumWindows: number,
): Promise<number> {
  const zones = await client.query<{ id: string }>(
    `select id::text
       from public.territory_zones
      where policy_version = $1 and status = 'active'
      order by id`,
    [TERRITORY_POLICY_VERSION],
  );
  const policyResult = await client.query<PolicyRow>(
    `select (extract(epoch from settlement_cadence) * 1000)::integer
              as settlement_cadence_ms,
            minimum_ownership_influence,
            daily_cap_timezone
       from private.territory_policy_versions
      where policy_version = $1`,
    [TERRITORY_POLICY_VERSION],
  );
  const policy = policyResult.rows[0];
  if (!policy) throw new Error('Territory settlement policy is unavailable.');

  const boundaryResult = await client.query<{ boundary: Date }>(
    `select (
       date_trunc('hour', timezone($1, $2::timestamptz)) at time zone $1
     ) as boundary`,
    [policy.daily_cap_timezone, now],
  );
  const boundary = boundaryResult.rows[0]?.boundary;
  if (!boundary) throw new Error('Territory settlement boundary failed.');

  let settled = 0;
  for (const zone of zones.rows) {
    while (settled < maximumWindows) {
      const cursor = await loadWindowCursor(client, zone.id, seasonId, now);
      const windowEnd = new Date(
        cursor.getTime() + policy.settlement_cadence_ms,
      );
      if (windowEnd.getTime() > boundary.getTime()) break;
      await settleWithSavepointRetry(client, {
        zoneId: zone.id,
        seasonId,
        windowStart: cursor,
        windowEnd,
        kind: 'hourly',
      });
      settled += 1;
    }
    if (settled >= maximumWindows) break;
  }
  return settled;
}

async function loadWindowCursor(
  client: RankedClient,
  zoneId: string,
  seasonId: string,
  now: Date,
): Promise<Date> {
  const result = await client.query<CursorRow>(
    `with policy as (
       select daily_cap_timezone
         from private.territory_policy_versions
        where policy_version = $3
     ), season as (
       select activated_at
         from public.ranked_seasons
        where id = $2::uuid
     ), latest_receipt as (
       select max(window_end) as window_end
         from private.territory_settlement_receipts
        where zone_id = $1::uuid
          and ranked_season_id = $2::uuid
     ), latest_activation as (
       select max(effective_at) as effective_at
         from private.territory_ownership_versions
        where zone_id = $1::uuid
          and transition_kind in ('activated', 'reactivated')
          and effective_at <= $4::timestamptz
     )
     select greatest(
       coalesce(
         latest_receipt.window_end,
         date_trunc('hour', timezone(policy.daily_cap_timezone, season.activated_at))
           at time zone policy.daily_cap_timezone
       ),
       coalesce(
         date_trunc('hour', timezone(policy.daily_cap_timezone, latest_activation.effective_at))
           at time zone policy.daily_cap_timezone,
         '-infinity'::timestamptz
       )
     ) as window_start
       from policy, season, latest_receipt, latest_activation`,
    [zoneId, seasonId, TERRITORY_POLICY_VERSION, now],
  );
  const cursor = result.rows[0]?.window_start;
  if (!cursor || Number.isNaN(cursor.getTime())) {
    throw new Error('Territory settlement cursor is unavailable.');
  }
  return cursor;
}

async function loadCurrentOwnership(
  client: RankedClient,
  zoneId: string,
): Promise<OwnershipRow | null> {
  const result = await client.query<OwnershipRow>(
    `select version.state_version::text,
            version.owner_player_id::text
       from private.territory_current_ownership current_state
       join private.territory_ownership_versions version
         on version.id = current_state.ownership_version_id
      where current_state.zone_id = $1::uuid`,
    [zoneId],
  );
  return result.rows[0] ?? null;
}

async function loadSettlementTotals(
  client: RankedClient,
  input: {
    zoneId: string;
    seasonId: string;
    policyVersion: string;
    windowStart: Date;
    windowEnd: Date;
  },
): Promise<TerritorySettlementTotal[]> {
  const result = await client.query<TotalRow>(
    `select contribution.player_id::text,
            count(*)::integer as accepted_influence_count,
            min(contribution.contributed_at)::text as earliest_contribution_at,
            to_char(
              min(contribution.contributed_at) at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as earliest_contribution_key,
            bool_and(player.lifecycle_status = 'active') as account_eligible
       from private.territory_influence_contributions contribution
       join public.players player on player.id = contribution.player_id
      where contribution.zone_id = $1::uuid
        and contribution.ranked_season_id = $2::uuid
        and contribution.territory_policy_version = $3
        and contribution.contributed_at >= $4::timestamptz
        and contribution.contributed_at < $5::timestamptz
      group by contribution.player_id
      order by contribution.player_id`,
    [
      input.zoneId,
      input.seasonId,
      input.policyVersion,
      input.windowStart,
      input.windowEnd,
    ],
  );
  return result.rows.map((row) => ({
    playerId: row.player_id,
    acceptedInfluenceCount: row.accepted_influence_count,
    earliestContributionAt: row.earliest_contribution_at,
    earliestContributionKey: row.earliest_contribution_key,
    accountEligible: row.account_eligible,
  }));
}

async function settleWithSavepointRetry(
  client: RankedClient,
  input: Parameters<typeof settleTerritoryWindow>[1],
): Promise<TerritorySettlementResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const savepoint = `territory_settle_${attempt}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      const result = await settleTerritoryWindow(client, input);
      await client.query(`release savepoint ${savepoint}`);
      return result;
    } catch (error) {
      await client.query(`rollback to savepoint ${savepoint}`);
      await client.query(`release savepoint ${savepoint}`);
      if (!isRetryableSettlementError(error) || attempt === 2) throw error;
    }
  }
  throw new Error('Territory settlement retry loop exhausted unexpectedly.');
}

function isRetryableSettlementError(error: unknown): boolean {
  if (error instanceof TerritorySettlementRetryError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === '40001') return true;
  return (
    candidate.code === '23514' &&
    typeof candidate.message === 'string' &&
    candidate.message.includes(
      'Territory settlement totals must match authoritative contributions',
    )
  );
}
