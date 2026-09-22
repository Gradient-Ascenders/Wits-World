import type pg from 'pg';

import {
  evaluateLocationTiming,
  InvalidLocationClaimError,
} from '../events/location-claim.js';
import { InvalidEventCoordinatesError } from '../events/event-eligibility.js';

export const TERRITORY_POLICY_VERSION = 'territory-v1';

export interface TerritoryClaim {
  zoneId: string;
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  acquiredAt: string;
}

export class TerritoryClaimError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code:
      | 'TERRITORY_LOCATION_REFRESH_REQUIRED'
      | 'TERRITORY_NOT_ELIGIBLE'
      | 'TERRITORY_CONFIGURATION_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'TerritoryClaimError';
  }
}

export class TerritoryGrantUnavailableError extends Error {
  constructor() {
    super('The territory contender grant is no longer available.');
    this.name = 'TerritoryGrantUnavailableError';
  }
}

export interface TerritoryQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

interface PolicyRow extends pg.QueryResultRow {
  maximum_claim_age_ms: number;
  grant_lifetime_ms: number;
}

interface ZoneEvaluationRow extends pg.QueryResultRow {
  requested_zone_active: boolean;
  point_inside_requested: boolean;
  envelope_inside_requested: boolean;
  envelope_intersects_other: boolean;
  point_active_zone_count: number;
  zone_lifecycle_version: number | null;
}

export interface TerritoryGrantRow extends pg.QueryResultRow {
  id: string;
  queue_entry_id: string;
  ranked_season_id: string;
  player_id: string;
  zone_id: string;
  territory_policy_version: string;
  zone_lifecycle_version: number;
  device_acquired_at: Date;
  issued_at: Date;
  expires_at: Date;
  used_at: Date | null;
  used_match_id: string | null;
}

export interface TerritoryMatchSnapshot {
  territoryPolicyVersion: string;
  zoneId: string | null;
  sourceGrantId: string | null;
  zoneLifecycleVersion: number | null;
  snapshottedAt: Date;
}

export async function createTerritoryQueueGrant(
  client: TerritoryQueryable,
  input: {
    queueEntryId: string;
    seasonId: string;
    playerId: string;
    claim: TerritoryClaim;
    now: Date;
  },
): Promise<TerritoryGrantRow> {
  validateClaimShape(input.claim);

  const policy = await loadTerritoryPolicy(client);
  const timing = evaluateLocationTiming(
    input.claim.acquiredAt,
    input.now,
    policy.maximum_claim_age_ms,
  );
  if (timing.outcome === 'retry') {
    throw new TerritoryClaimError(
      409,
      'TERRITORY_LOCATION_REFRESH_REQUIRED',
      'A fresh location claim is required before contesting a zone.',
    );
  }

  const evaluation = await client.query<ZoneEvaluationRow>(
    `with claim as (
       select st_setsrid(
                st_makepoint($2::double precision, $3::double precision),
                4326
              ) as point_geometry,
              case
                when $4::double precision = 0 then
                  st_setsrid(
                    st_makepoint($2::double precision, $3::double precision),
                    4326
                  )
                else
                  st_buffer(
                    st_setsrid(
                      st_makepoint($2::double precision, $3::double precision),
                      4326
                    )::geography,
                    $4::double precision
                  )::geometry
              end as accuracy_envelope
     ), requested as (
       select zone.id, zone.lifecycle_version, zone.area, zone.status
         from public.territory_zones zone
        where zone.id = $1::uuid
          and zone.policy_version = $5
     )
     select
       coalesce((select status = 'active' from requested), false)
         as requested_zone_active,
       coalesce((
         select status = 'active' and st_contains(area, claim.point_geometry)
           from requested cross join claim
       ), false) as point_inside_requested,
       coalesce((
         select status = 'active'
                and st_containsproperly(area, claim.accuracy_envelope)
           from requested cross join claim
       ), false) as envelope_inside_requested,
       exists (
         select 1
           from public.territory_zones other
           cross join claim
          where other.policy_version = $5
            and other.status = 'active'
            and other.id <> $1::uuid
            and st_intersects(other.area, claim.accuracy_envelope)
       ) as envelope_intersects_other,
       (
         select count(*)::integer
           from public.territory_zones zone
           cross join claim
          where zone.policy_version = $5
            and zone.status = 'active'
            and st_contains(zone.area, claim.point_geometry)
       ) as point_active_zone_count,
       (select lifecycle_version from requested) as zone_lifecycle_version`,
    [
      input.claim.zoneId,
      input.claim.longitude,
      input.claim.latitude,
      input.claim.accuracyMetres,
      TERRITORY_POLICY_VERSION,
    ],
  );
  const row = evaluation.rows[0];
  if (!row) {
    throw new Error('Territory location evaluation returned no result.');
  }

  if (row.point_active_zone_count > 1) {
    throw new TerritoryClaimError(
      503,
      'TERRITORY_CONFIGURATION_UNAVAILABLE',
      'Territory contesting is temporarily unavailable.',
    );
  }
  if (!row.requested_zone_active || !row.point_inside_requested) {
    throw new TerritoryClaimError(
      409,
      'TERRITORY_NOT_ELIGIBLE',
      'The submitted location is not eligible for the requested territory zone.',
    );
  }
  if (!row.envelope_inside_requested || row.envelope_intersects_other) {
    throw new TerritoryClaimError(
      409,
      'TERRITORY_LOCATION_REFRESH_REQUIRED',
      'A more precise location claim is required before contesting a zone.',
    );
  }
  if (row.zone_lifecycle_version === null) {
    throw new TerritoryClaimError(
      503,
      'TERRITORY_CONFIGURATION_UNAVAILABLE',
      'Territory contesting is temporarily unavailable.',
    );
  }

  const acquiredAt = new Date(input.claim.acquiredAt);
  const expiresAt = new Date(input.now.getTime() + policy.grant_lifetime_ms);
  const insert = await client.query<TerritoryGrantRow>(
    `insert into private.territory_zone_grants (
       queue_entry_id, ranked_season_id, player_id, zone_id,
       territory_policy_version, zone_lifecycle_version,
       device_acquired_at, issued_at, expires_at
     ) values (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid,
       $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz
     )
     returning id::text, queue_entry_id::text, ranked_season_id::text,
               player_id::text, zone_id::text, territory_policy_version,
               zone_lifecycle_version, device_acquired_at, issued_at,
               expires_at, used_at, used_match_id::text`,
    [
      input.queueEntryId,
      input.seasonId,
      input.playerId,
      input.claim.zoneId,
      TERRITORY_POLICY_VERSION,
      row.zone_lifecycle_version,
      acquiredAt,
      input.now,
      expiresAt,
    ],
  );
  const grant = insert.rows[0];
  if (!grant) throw new Error('Territory grant insertion returned no row.');
  return grant;
}

export async function loadTerritoryGrantForQueue(
  client: TerritoryQueryable,
  queueEntryId: string,
  lock = false,
): Promise<TerritoryGrantRow | null> {
  const result = await client.query<TerritoryGrantRow>(
    `select id::text, queue_entry_id::text, ranked_season_id::text,
            player_id::text, zone_id::text, territory_policy_version,
            zone_lifecycle_version, device_acquired_at, issued_at,
            expires_at, used_at, used_match_id::text
       from private.territory_zone_grants
      where queue_entry_id = $1::uuid
      ${lock ? 'for update' : ''}`,
    [queueEntryId],
  );
  return result.rows[0] ?? null;
}

export async function assertTerritoryQueueGrantAvailable(
  client: TerritoryQueryable,
  input: {
    queueEntryId: string;
    playerId: string;
    territoryContender: boolean;
    now: Date;
    lock?: boolean;
  },
): Promise<TerritoryGrantRow | null> {
  if (!input.territoryContender) return null;

  const grant = await loadTerritoryGrantForQueue(
    client,
    input.queueEntryId,
    input.lock ?? false,
  );
  if (
    !grant ||
    grant.player_id !== input.playerId ||
    grant.used_at !== null ||
    input.now >= grant.expires_at
  ) {
    throw new TerritoryGrantUnavailableError();
  }

  const zone = await client.query<{
    status: string;
    lifecycle_version: number;
  }>(
    `select status, lifecycle_version
       from public.territory_zones
      where id = $1::uuid and policy_version = $2
      ${input.lock ? 'for share' : ''}`,
    [grant.zone_id, grant.territory_policy_version],
  );
  const current = zone.rows[0];
  if (
    !current ||
    current.status !== 'active' ||
    current.lifecycle_version !== grant.zone_lifecycle_version ||
    grant.territory_policy_version !== TERRITORY_POLICY_VERSION
  ) {
    throw new TerritoryGrantUnavailableError();
  }
  return grant;
}

export async function consumeTerritoryGrantForMatch(
  client: TerritoryQueryable,
  input: {
    queueEntryId: string;
    playerId: string;
    territoryContender: boolean;
    matchId: string;
    now: Date;
  },
): Promise<TerritoryMatchSnapshot> {
  if (!input.territoryContender) {
    return {
      territoryPolicyVersion: TERRITORY_POLICY_VERSION,
      zoneId: null,
      sourceGrantId: null,
      zoneLifecycleVersion: null,
      snapshottedAt: input.now,
    };
  }

  const grant = await assertTerritoryQueueGrantAvailable(client, {
    ...input,
    lock: true,
  });
  if (!grant) throw new TerritoryGrantUnavailableError();

  const updated = await client.query<{ id: string; used_at: Date }>(
    `with sampled as (
       select clock_timestamp() as used_at
     ), updated as (
       update private.territory_zone_grants grant
          set used_at = sampled.used_at, used_match_id = $3::uuid
         from sampled
        where grant.id = $1::uuid
          and grant.player_id = $2::uuid
          and grant.used_at is null
          and grant.expires_at > sampled.used_at
       returning grant.id::text, grant.used_at
     )
     select id, used_at from updated`,
    [grant.id, input.playerId, input.matchId],
  );
  const consumed = updated.rows[0];
  if (!consumed) throw new TerritoryGrantUnavailableError();

  return {
    territoryPolicyVersion: grant.territory_policy_version,
    zoneId: grant.zone_id,
    sourceGrantId: grant.id,
    zoneLifecycleVersion: grant.zone_lifecycle_version,
    snapshottedAt: consumed.used_at,
  };
}

export async function cleanupExpiredTerritoryGrants(
  database: TerritoryQueryable,
): Promise<number> {
  const result = await database.query<{ deleted_count: number }>(
    `with policy as (
       select grant_cleanup_deadline
         from private.territory_policy_versions
        where policy_version = $1
     ), deleted as (
       delete from private.territory_zone_grants grant
        using policy
        where grant.territory_policy_version = $1
          and grant.expires_at + policy.grant_cleanup_deadline <= clock_timestamp()
       returning grant.id
     )
     select count(*)::integer as deleted_count from deleted`,
    [TERRITORY_POLICY_VERSION],
  );
  return result.rows[0]?.deleted_count ?? 0;
}

export async function cancelExpiredTerritoryContenders(
  database: TerritoryQueryable,
): Promise<number> {
  const result = await database.query<{ cancelled_count: number }>(
    `with expired as (
       select queue.id
         from private.ranked_queue_entries queue
         left join private.territory_zone_grants grant
           on grant.queue_entry_id = queue.id
        where queue.territory_contender = true
          and queue.status = 'searching'
          and (
            grant.id is null
            or grant.used_at is not null
            or grant.expires_at <= clock_timestamp()
            or not exists (
              select 1
                from public.territory_zones zone
               where zone.id = grant.zone_id
                 and zone.policy_version = grant.territory_policy_version
                 and zone.status = 'active'
                 and zone.lifecycle_version = grant.zone_lifecycle_version
            )
          )
        order by queue.id
        for update of queue skip locked
     ), cancelled as (
       update private.ranked_queue_entries queue
          set status = 'cancelled', version = version + 1,
              lease_expires_at = null, active_proposal_id = null,
              terminal_at = clock_timestamp(), updated_at = clock_timestamp()
         from expired
        where queue.id = expired.id
          and queue.status = 'searching'
       returning queue.id
     )
     select count(*)::integer as cancelled_count from cancelled`,
  );
  return result.rows[0]?.cancelled_count ?? 0;
}

async function loadTerritoryPolicy(
  client: TerritoryQueryable,
): Promise<PolicyRow> {
  const result = await client.query<PolicyRow>(
    `select (extract(epoch from maximum_location_claim_age) * 1000)::integer
              as maximum_claim_age_ms,
            (extract(epoch from zone_grant_lifetime) * 1000)::integer
              as grant_lifetime_ms
       from private.territory_policy_versions
      where policy_version = $1`,
    [TERRITORY_POLICY_VERSION],
  );
  const policy = result.rows[0];
  if (!policy) {
    throw new TerritoryClaimError(
      503,
      'TERRITORY_CONFIGURATION_UNAVAILABLE',
      'Territory contesting is temporarily unavailable.',
    );
  }
  return policy;
}

function validateClaimShape(claim: TerritoryClaim): void {
  if (
    !Number.isFinite(claim.latitude) ||
    claim.latitude < -90 ||
    claim.latitude > 90
  ) {
    throw new InvalidEventCoordinatesError(
      'latitude',
      'Latitude must be a finite number between -90 and 90 degrees.',
    );
  }
  if (
    !Number.isFinite(claim.longitude) ||
    claim.longitude < -180 ||
    claim.longitude > 180
  ) {
    throw new InvalidEventCoordinatesError(
      'longitude',
      'Longitude must be a finite number between -180 and 180 degrees.',
    );
  }
  if (!Number.isFinite(claim.accuracyMetres) || claim.accuracyMetres < 0) {
    throw new InvalidLocationClaimError(
      'accuracyMetres',
      'Reported accuracy must be a finite non-negative number.',
    );
  }
  if (!Number.isFinite(Date.parse(claim.acquiredAt))) {
    throw new InvalidLocationClaimError(
      'acquiredAt',
      'Acquisition timestamp must be a valid date-time.',
    );
  }
}
