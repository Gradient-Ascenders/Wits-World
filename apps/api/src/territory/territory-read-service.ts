import type pg from 'pg';

import { TERRITORY_POLICY_VERSION } from './territory-grants.js';

export interface TerritoryReadDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export class TerritoryZoneNotFoundError extends Error {
  constructor() {
    super('The requested territory zone was not found.');
    this.name = 'TerritoryZoneNotFoundError';
  }
}

export interface TerritoryOwnerSummary {
  playerName: string;
}

export interface TerritoryZoneSummary {
  zoneId: string;
  name: string;
  status: 'active' | 'suspended';
  geometry: unknown;
  owner: TerritoryOwnerSummary | null;
  seasonId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface TerritoryZoneDetail extends TerritoryZoneSummary {
  lifecycleVersion: number;
  lastSettledAt: string | null;
}

export interface TerritoryStandings {
  zoneId: string;
  seasonId: string | null;
  top: Array<{ rank: number; influence: number }>;
  activity: { influence: number; contributors: number };
  viewer: {
    influence: number;
    todayInfluence: number;
    dailyCap: number;
    remainingDailyInfluence: number;
  };
}

export interface TerritoryHistoryEntry {
  seasonId: string | null;
  owner: TerritoryOwnerSummary | null;
  transitionKind: string;
  effectiveAt: string;
}

export interface TerritoryReadService {
  listZones(playerId: string): Promise<{ zones: TerritoryZoneSummary[] }>;
  getZone(playerId: string, zoneId: string): Promise<TerritoryZoneDetail>;
  standings(playerId: string, zoneId: string): Promise<TerritoryStandings>;
  history(
    playerId: string,
    zoneId: string,
  ): Promise<{ zoneId: string; entries: TerritoryHistoryEntry[] }>;
}

interface ZoneRow extends pg.QueryResultRow {
  zone_id: string;
  name: string;
  status: 'active' | 'suspended';
  lifecycle_version: number;
  geometry: unknown;
  owner_player_name: string | null;
  owner_player_id: string | null;
  season_id: string | null;
  window_start: Date | null;
  window_end: Date | null;
  last_settled_at: Date | null;
}

interface PolicyRow extends pg.QueryResultRow {
  daily_influence_cap: number;
  daily_cap_timezone: string;
}

interface StandingRow extends pg.QueryResultRow {
  player_id: string;
  influence: number;
  earliest_contribution_at: Date;
}

interface ViewerRow extends pg.QueryResultRow {
  current_influence: number;
  today_influence: number;
  activity_influence: number;
  contributors: number;
}

interface HistoryRow extends pg.QueryResultRow {
  ranked_season_id: string | null;
  owner_player_id: string | null;
  owner_player_name: string | null;
  transition_kind: string;
  effective_at: Date;
}

export function createTerritoryReadService(
  database: TerritoryReadDatabase,
): TerritoryReadService {
  return {
    async listZones() {
      const rows = await loadZones(database);
      return { zones: rows.map(mapZoneSummary) };
    },

    async getZone(_playerId, zoneId) {
      const rows = await loadZones(database, zoneId);
      const row = rows[0];
      if (!row) throw new TerritoryZoneNotFoundError();
      return {
        ...mapZoneSummary(row),
        lifecycleVersion: row.lifecycle_version,
        lastSettledAt: row.last_settled_at?.toISOString() ?? null,
      };
    },

    async standings(playerId, zoneId) {
      await requireVisibleZone(database, zoneId);
      const season = await database.query<{ season_id: string }>(
        `select id::text as season_id
           from public.ranked_seasons
          where status in ('active', 'closing')
          limit 1`,
      );
      const seasonId = season.rows[0]?.season_id ?? null;
      const policyResult = await database.query<PolicyRow>(
        `select daily_influence_cap, daily_cap_timezone
           from private.territory_policy_versions
          where policy_version = $1`,
        [TERRITORY_POLICY_VERSION],
      );
      const policy = policyResult.rows[0];
      if (!policy) throw new Error('Territory policy is unavailable.');

      if (!seasonId) {
        return {
          zoneId,
          seasonId: null,
          top: [],
          activity: { influence: 0, contributors: 0 },
          viewer: {
            influence: 0,
            todayInfluence: 0,
            dailyCap: policy.daily_influence_cap,
            remainingDailyInfluence: policy.daily_influence_cap,
          },
        };
      }

      const top = await database.query<StandingRow>(
        `with sampled as (
           select clock_timestamp() as now
         ), current_window as (
           select date_trunc(
                    'hour',
                    timezone($3, sampled.now)
                  ) at time zone $3 as window_start,
                  (
                    date_trunc('hour', timezone($3, sampled.now))
                    + interval '1 hour'
                  ) at time zone $3 as window_end
             from sampled
         )
         select contribution.player_id::text,
                count(*)::integer as influence,
                min(contribution.contributed_at) as earliest_contribution_at
           from private.territory_influence_contributions contribution
           cross join current_window window
          where contribution.zone_id = $1::uuid
            and contribution.ranked_season_id = $2::uuid
            and contribution.contributed_at >= window.window_start
            and contribution.contributed_at < window.window_end
          group by contribution.player_id
          order by count(*) desc, min(contribution.contributed_at), contribution.player_id
          limit 3`,
        [zoneId, seasonId, policy.daily_cap_timezone],
      );
      const viewer = await database.query<ViewerRow>(
        `with sampled as (
           select clock_timestamp() as now
         ), current_window as (
           select date_trunc(
                    'hour',
                    timezone($4, sampled.now)
                  ) at time zone $4 as window_start,
                  (
                    date_trunc('hour', timezone($4, sampled.now))
                    + interval '1 hour'
                  ) at time zone $4 as window_end,
                  timezone($4, sampled.now)::date as local_date
             from sampled
         )
         select
           count(*) filter (
             where contribution.player_id = $3::uuid
               and contribution.ranked_season_id = $2::uuid
               and contribution.contributed_at >= window.window_start
               and contribution.contributed_at < window.window_end
           )::integer as current_influence,
           count(*) filter (
             where contribution.player_id = $3::uuid
               and contribution.contribution_date = window.local_date
           )::integer as today_influence,
           count(*) filter (
             where contribution.ranked_season_id = $2::uuid
               and contribution.contributed_at >= window.window_start
               and contribution.contributed_at < window.window_end
           )::integer as activity_influence,
           count(distinct contribution.player_id) filter (
             where contribution.ranked_season_id = $2::uuid
               and contribution.contributed_at >= window.window_start
               and contribution.contributed_at < window.window_end
           )::integer as contributors
         from private.territory_influence_contributions contribution
         cross join current_window window
        where contribution.zone_id = $1::uuid`,
        [zoneId, seasonId, playerId, policy.daily_cap_timezone],
      );
      const aggregate = viewer.rows[0] ?? {
        current_influence: 0,
        today_influence: 0,
        activity_influence: 0,
        contributors: 0,
      };
      return {
        zoneId,
        seasonId,
        top: top.rows.map((row, index) => ({
          rank: index + 1,
          influence: row.influence,
        })),
        activity: {
          influence: aggregate.activity_influence,
          contributors: aggregate.contributors,
        },
        viewer: {
          influence: aggregate.current_influence,
          todayInfluence: aggregate.today_influence,
          dailyCap: policy.daily_influence_cap,
          remainingDailyInfluence: Math.max(
            0,
            policy.daily_influence_cap - aggregate.today_influence,
          ),
        },
      };
    },

    async history(_playerId, zoneId) {
      await requireVisibleZone(database, zoneId);
      const result = await database.query<HistoryRow>(
        `select version.ranked_season_id::text,
                version.owner_player_id::text,
                case
                  when version.owner_player_id is null then null
                  else coalesce(player.player_name, 'Deleted player')
                end as owner_player_name,
                version.transition_kind,
                version.effective_at
           from private.territory_ownership_versions version
           left join public.players player on player.id = version.owner_player_id
          where version.zone_id = $1::uuid
            and (
              version.transition_kind <> 'settlement'
              or version.owner_player_id is distinct from version.previous_owner_player_id
            )
          order by version.state_version desc
          limit 50`,
        [zoneId],
      );
      return {
        zoneId,
        entries: result.rows.map((row) => ({
          seasonId: row.ranked_season_id,
          owner:
            row.owner_player_id === null
              ? null
              : { playerName: row.owner_player_name ?? 'Deleted player' },
          transitionKind: row.transition_kind,
          effectiveAt: row.effective_at.toISOString(),
        })),
      };
    },
  };
}

async function loadZones(
  database: TerritoryReadDatabase,
  zoneId?: string,
): Promise<ZoneRow[]> {
  const result = await database.query<ZoneRow>(
    `with current_season as (
       select id, activated_at
         from public.ranked_seasons
        where status in ('active', 'closing')
        limit 1
     ), current_policy as (
       select daily_cap_timezone
         from private.territory_policy_versions
        where policy_version = $1
     ), sampled as (
       select clock_timestamp() as now
     )
     select zone.id::text as zone_id,
            zone.name,
            zone.status,
            zone.lifecycle_version,
            st_asgeojson(zone.area)::json as geometry,
            version.owner_player_id::text,
            case
              when version.owner_player_id is null then null
              else coalesce(owner.player_name, 'Deleted player')
            end as owner_player_name,
            season.id::text as season_id,
            case when season.id is null then null else
              date_trunc(
                'hour',
                timezone(policy.daily_cap_timezone, sampled.now)
              ) at time zone policy.daily_cap_timezone
            end as window_start,
            case when season.id is null then null else
              (
                date_trunc(
                  'hour',
                  timezone(policy.daily_cap_timezone, sampled.now)
                ) + interval '1 hour'
              ) at time zone policy.daily_cap_timezone
            end as window_end,
            latest.settled_at as last_settled_at
       from public.territory_zones zone
       left join private.territory_current_ownership current_state
         on current_state.zone_id = zone.id
       left join private.territory_ownership_versions version
         on version.id = current_state.ownership_version_id
       left join public.players owner on owner.id = version.owner_player_id
       left join current_season season on true
       cross join current_policy policy
       cross join sampled
       left join lateral (
         select receipt.settled_at
           from private.territory_settlement_receipts receipt
          where receipt.zone_id = zone.id
          order by receipt.window_end desc, receipt.id desc
          limit 1
       ) latest on true
      where zone.policy_version = $1
        and zone.status in ('active', 'suspended')
        and ($2::uuid is null or zone.id = $2::uuid)
      order by zone.name, zone.id`,
    [TERRITORY_POLICY_VERSION, zoneId ?? null],
  );
  return result.rows;
}

async function requireVisibleZone(
  database: TerritoryReadDatabase,
  zoneId: string,
): Promise<void> {
  const result = await database.query<{ id: string }>(
    `select id::text
       from public.territory_zones
      where id = $1::uuid
        and policy_version = $2
        and status in ('active', 'suspended')`,
    [zoneId, TERRITORY_POLICY_VERSION],
  );
  if (!result.rows[0]) throw new TerritoryZoneNotFoundError();
}

function mapZoneSummary(row: ZoneRow): TerritoryZoneSummary {
  return {
    zoneId: row.zone_id,
    name: row.name,
    status: row.status,
    geometry: row.geometry,
    owner:
      row.owner_player_id === null
        ? null
        : { playerName: row.owner_player_name ?? 'Deleted player' },
    seasonId: row.season_id,
    windowStart: row.window_start?.toISOString() ?? null,
    windowEnd: row.window_end?.toISOString() ?? null,
  };
}
