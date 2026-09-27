import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import {
  InvalidCursorError,
  type SignedCursorCodec,
} from '../security/signed-cursor.js';
import {
  rankedDatabaseNow,
  rankedTransaction,
  RankedError,
  type RankedDatabase,
} from './ranked-database.js';

const MAX_PAGE_SIZE = 100;
const SNAPSHOT_CLEANUP_BATCH_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SeasonRow extends pg.QueryResultRow {
  id: string;
  name: string;
  status: string;
  policy_version: string;
  activated_at: Date | null;
  active_ends_at: Date | null;
  closed_at: Date | null;
}

interface RatingRow extends pg.QueryResultRow {
  rating: number;
  wins: number;
  losses: number;
  settled_match_count: number;
}

interface StandingRow extends pg.QueryResultRow {
  ordinal: number;
  rank: number;
  rating: number;
  wins: number;
  losses: number;
  settled_match_count: number;
  player_name: string | null;
  lifecycle_status: string;
}

interface SettlementRow extends pg.QueryResultRow {
  season_id: string;
  status: string;
  completion_reason: string | null;
  outcome: 'win' | 'loss' | null;
  rating_before: number | null;
  rating_after: number | null;
  applied_delta: number | null;
  settled_at: Date | null;
  territory_zone_id: string | null;
  territory_zone_name: string | null;
  territory_outcome: 'accepted' | 'excluded' | null;
  territory_influence_points: number | null;
  territory_exclusion_reason: string | null;
}

export interface RankedSeasonView {
  seasonId: string;
  name: string;
  status: string;
  policyVersion: string;
  activatedAt: string | null;
  activeEndsAt: string | null;
  closedAt: string | null;
}

export interface RankedProfileView {
  season: RankedSeasonView | null;
  rating: number | null;
  wins: number;
  losses: number;
  settledMatchCount: number;
  placementMatchesRemaining: number;
  provisional: boolean;
}

export interface RankedStandingView {
  playerName: string;
  rank: number;
  rating: number;
  wins: number;
  losses: number;
  settledMatchCount: number;
}

export interface RankedStandingsPage {
  season: RankedSeasonView;
  entries: RankedStandingView[];
  nextCursor: string | null;
}

export interface RankedSettlementView {
  matchId: string;
  seasonId: string;
  status: 'pending' | 'settled';
  completionReason: string | null;
  outcome: 'win' | 'loss' | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
  appliedDelta: number | null;
  settledAt: string | null;
  territory: RankedTerritoryContributionView | null;
}

export type RankedTerritoryExclusionReason =
  | 'daily_cap_reached'
  | 'placement_matches_remaining'
  | 'player_unavailable'
  | 'result_not_eligible'
  | 'zone_unavailable';

export interface RankedTerritoryContributionView {
  zoneId: string;
  zoneName: string;
  outcome: 'pending' | 'lost' | 'accepted' | 'excluded';
  influencePoints: number;
  exclusionReason: RankedTerritoryExclusionReason | null;
}

export interface RankedReadService {
  currentSeason(): Promise<RankedSeasonView | null>;
  profile(playerId: string): Promise<RankedProfileView>;
  settlement(playerId: string, matchId: string): Promise<RankedSettlementView>;
  currentStandings(
    playerId: string,
    limit: number,
    cursor?: string,
  ): Promise<RankedStandingsPage>;
  archivedStandings(
    playerId: string,
    seasonId: string,
    limit: number,
    cursor?: string,
  ): Promise<RankedStandingsPage>;
  cleanupExpiredSnapshots(): Promise<number>;
}

interface CurrentCursor {
  kind: 'ranked-current';
  snapshotId: string;
  afterOrdinal: number;
}

interface ArchiveCursor {
  kind: 'ranked-archive';
  seasonId: string;
  afterOrdinal: number;
}

export function createRankedReadService(
  database: RankedDatabase,
  cursorCodec: SignedCursorCodec,
): RankedReadService {
  async function currentSeason(): Promise<RankedSeasonView | null> {
    const result = await database.query<SeasonRow>(
      `select id::text, name, status, policy_version,
              activated_at, active_ends_at, closed_at
         from public.ranked_seasons
        where status in ('active', 'closing') limit 1`,
    );
    return result.rows[0] ? seasonView(result.rows[0]) : null;
  }

  async function profile(playerId: string): Promise<RankedProfileView> {
    const season = await currentSeason();
    if (!season) return emptyProfile(null);
    const result = await database.query<RatingRow>(
      `select rating, wins, losses, settled_match_count
         from public.ranked_player_season_ratings
        where season_id = $1::uuid and player_id = $2::uuid`,
      [season.seasonId, playerId],
    );
    const rating = result.rows[0];
    if (rating) {
      return {
        season,
        rating: rating.rating,
        wins: rating.wins,
        losses: rating.losses,
        settledMatchCount: rating.settled_match_count,
        placementMatchesRemaining: Math.max(0, 5 - rating.settled_match_count),
        provisional: rating.settled_match_count < 5,
      };
    }
    // A player created after activation gets the same seed on their first join.
    const seed = await database.query<{ rating: number }>(
      `select case when prior.rating is null then 1000
                   else greatest(100, 1000 + round(
                     (prior.rating - 1000)::numeric * 0.5
                   )::integer) end as rating
         from public.ranked_seasons previous
         left join public.ranked_player_season_ratings prior
           on prior.season_id = previous.id and prior.player_id = $1::uuid
        where previous.status = 'closed'
          and previous.closed_at <= $2::timestamptz
        order by previous.closed_at desc, previous.id desc limit 1`,
      [playerId, season.activatedAt],
    );
    return { ...emptyProfile(season), rating: seed.rows[0]?.rating ?? 1000 };
  }

  async function settlement(
    playerId: string,
    matchId: string,
  ): Promise<RankedSettlementView> {
    const result = await database.query<SettlementRow>(
      `select receipt.season_id::text,
              case when settlement.match_id is null then 'pending' else 'settled' end as status,
              settlement.completion_reason, ledger.outcome,
              ledger.rating_before, ledger.rating_after, ledger.applied_delta,
              settlement.settled_at,
              territory_snapshot.zone_id::text as territory_zone_id,
              territory_zone.name as territory_zone_name,
              territory_decision.outcome as territory_outcome,
              territory_decision.influence_points as territory_influence_points,
              territory_decision.exclusion_reason as territory_exclusion_reason
         from private.ranked_matchmaking_receipts receipt
         join public.live_pvp_match_participants participant
           on participant.match_id = receipt.match_id
          and participant.player_id = $2::uuid
         left join private.ranked_rating_settlements settlement
           on settlement.match_id = receipt.match_id
         left join private.ranked_rating_ledger_entries ledger
           on ledger.match_id = receipt.match_id
          and ledger.player_id = $2::uuid
         left join private.territory_ranked_match_snapshots territory_snapshot
           on territory_snapshot.match_id = receipt.match_id
          and territory_snapshot.player_id = $2::uuid
         left join public.territory_zones territory_zone
           on territory_zone.id = territory_snapshot.zone_id
         left join private.territory_contribution_decisions territory_decision
           on territory_decision.source_match_id = receipt.match_id
          and territory_decision.winner_player_id = $2::uuid
        where receipt.match_id = $1::uuid`,
      [matchId, playerId],
    );
    const row = result.rows[0];
    if (!row)
      throw new RankedError(
        404,
        'RANKED_MATCH_UNAVAILABLE',
        'The ranked match is unavailable.',
      );
    return {
      matchId,
      seasonId: row.season_id,
      status: row.status === 'settled' ? 'settled' : 'pending',
      completionReason: row.completion_reason,
      outcome: row.outcome,
      ratingBefore: row.rating_before,
      ratingAfter: row.rating_after,
      appliedDelta: row.applied_delta,
      settledAt: row.settled_at?.toISOString() ?? null,
      territory: territoryContributionView(row),
    };
  }

  async function currentStandings(
    playerId: string,
    limit: number,
    cursor?: string,
  ): Promise<RankedStandingsPage> {
    assertPageLimit(limit);
    let snapshotId: string;
    let afterOrdinal = 0;
    if (cursor) {
      const decoded = cursorCodec.decode<CurrentCursor>(playerId, cursor);
      if (
        decoded.kind !== 'ranked-current' ||
        !UUID_PATTERN.test(decoded.snapshotId) ||
        !isOrdinal(decoded.afterOrdinal)
      )
        throw new InvalidCursorError();
      snapshotId = decoded.snapshotId;
      afterOrdinal = decoded.afterOrdinal;
    } else {
      snapshotId = await rankedTransaction(database, async (client) => {
        const season = await client.query<{ id: string }>(
          `select id::text from public.ranked_seasons
            where status in ('active', 'closing') limit 1 for share`,
        );
        const seasonId = season.rows[0]?.id;
        if (!seasonId)
          throw new RankedError(
            409,
            'RANKED_UNAVAILABLE',
            'Ranked standings are currently unavailable.',
          );
        const now = await rankedDatabaseNow(client);
        const id = randomUUID();
        await client.query(
          `insert into private.ranked_standings_snapshots (
             id, season_id, viewer_player_id, created_at, expires_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4,
             $4::timestamptz + interval '10 minutes'
           )`,
          [id, seasonId, playerId, now],
        );
        await client.query(
          `insert into private.ranked_standings_snapshot_rows (
             snapshot_id, ordinal, player_id, rank, rating, wins, losses,
             settled_match_count
           )
           select $1::uuid,
                  row_number() over (
                    order by rating.rating desc,
                             rating.rating_first_reached_at,
                             rating.player_id
                  )::integer,
                  rating.player_id,
                  rank() over (order by rating.rating desc)::integer,
                  rating.rating, rating.wins, rating.losses,
                  rating.settled_match_count
             from public.ranked_player_season_ratings rating
             join public.players player on player.id = rating.player_id
            where rating.season_id = $2::uuid
              and rating.settled_match_count >= 5
              and player.lifecycle_status = 'active'
              and player.player_name is not null`,
          [id, seasonId],
        );
        return id;
      });
    }
    const snapshot = await database.query<SeasonRow>(
      `select season.id::text, season.name, season.status,
              season.policy_version, season.activated_at,
              season.active_ends_at, season.closed_at
         from private.ranked_standings_snapshots snapshot
         join public.ranked_seasons season on season.id = snapshot.season_id
        where snapshot.id = $1::uuid
          and snapshot.viewer_player_id = $2::uuid
          and snapshot.expires_at > clock_timestamp()`,
      [snapshotId, playerId],
    );
    if (!snapshot.rows[0]) throw new InvalidCursorError();
    const rows = await database.query<StandingRow>(
      `select row.ordinal, row.rank, row.rating, row.wins, row.losses,
              row.settled_match_count, player.player_name,
              player.lifecycle_status
         from private.ranked_standings_snapshot_rows row
         join public.players player on player.id = row.player_id
        where row.snapshot_id = $1::uuid and row.ordinal > $2
        order by row.ordinal limit $3`,
      [snapshotId, afterOrdinal, limit + 1],
    );
    const page = rows.rows.slice(0, limit);
    const lastOrdinal = page.at(-1)?.ordinal ?? afterOrdinal;
    return {
      season: seasonView(snapshot.rows[0]),
      entries: page
        .filter(
          (row) =>
            row.lifecycle_status === 'active' && row.player_name !== null,
        )
        .map(standingView),
      nextCursor:
        rows.rows.length > limit
          ? cursorCodec.encode(playerId, {
              kind: 'ranked-current',
              snapshotId,
              afterOrdinal: lastOrdinal,
            } satisfies CurrentCursor)
          : null,
    };
  }

  async function archivedStandings(
    playerId: string,
    seasonId: string,
    limit: number,
    cursor?: string,
  ): Promise<RankedStandingsPage> {
    assertPageLimit(limit);
    const season = await database.query<SeasonRow>(
      `select id::text, name, status, policy_version,
              activated_at, active_ends_at, closed_at
         from public.ranked_seasons
        where id = $1::uuid and status = 'closed'`,
      [seasonId],
    );
    if (!season.rows[0])
      throw new RankedError(
        404,
        'RANKED_SEASON_UNAVAILABLE',
        'The ranked season is unavailable.',
      );
    let afterOrdinal = 0;
    if (cursor) {
      const decoded = cursorCodec.decode<ArchiveCursor>(playerId, cursor);
      if (
        decoded.kind !== 'ranked-archive' ||
        decoded.seasonId !== seasonId ||
        !isOrdinal(decoded.afterOrdinal)
      ) {
        throw new InvalidCursorError();
      }
      afterOrdinal = decoded.afterOrdinal;
    }
    const rows = await database.query<StandingRow>(
      `with ordered as (
         select row_number() over (
                  order by archive.rating desc, archive.player_id
                )::integer as ordinal,
                archive.rank, archive.rating, archive.wins,
                archive.losses, archive.settled_match_count,
                archive.player_id
           from public.ranked_season_standing_archives archive
          where archive.season_id = $1::uuid
       )
       select ordered.ordinal, ordered.rank, ordered.rating,
              ordered.wins, ordered.losses, ordered.settled_match_count,
              player.player_name, player.lifecycle_status
         from ordered
         join public.players player on player.id = ordered.player_id
        where ordered.ordinal > $2
        order by ordered.ordinal limit $3`,
      [seasonId, afterOrdinal, limit + 1],
    );
    const page = rows.rows.slice(0, limit);
    return {
      season: seasonView(season.rows[0]),
      entries: page.map((row) => ({
        ...standingView(row),
        playerName:
          row.lifecycle_status === 'active'
            ? (row.player_name ?? 'Deleted player')
            : 'Deleted player',
      })),
      nextCursor:
        rows.rows.length > limit
          ? cursorCodec.encode(playerId, {
              kind: 'ranked-archive',
              seasonId,
              afterOrdinal: page.at(-1)!.ordinal,
            } satisfies ArchiveCursor)
          : null,
    };
  }

  async function cleanupExpiredSnapshots(): Promise<number> {
    let deleted = 0;
    for (;;) {
      const result = await database.query<{ id: string }>(
        `with due as (
           select id from private.ranked_standings_snapshots
            where expires_at <= clock_timestamp()
            order by expires_at, id limit $1 for update skip locked
         )
         delete from private.ranked_standings_snapshots snapshot
          using due where snapshot.id = due.id
         returning snapshot.id::text`,
        [SNAPSHOT_CLEANUP_BATCH_SIZE],
      );
      deleted += result.rows.length;
      if (result.rows.length < SNAPSHOT_CLEANUP_BATCH_SIZE) return deleted;
    }
  }

  return {
    currentSeason,
    profile,
    settlement,
    currentStandings,
    archivedStandings,
    cleanupExpiredSnapshots,
  };
}

function emptyProfile(season: RankedSeasonView | null): RankedProfileView {
  return {
    season,
    rating: season ? 1000 : null,
    wins: 0,
    losses: 0,
    settledMatchCount: 0,
    placementMatchesRemaining: 5,
    provisional: true,
  };
}

function seasonView(row: SeasonRow): RankedSeasonView {
  return {
    seasonId: row.id,
    name: row.name,
    status: row.status,
    policyVersion: row.policy_version,
    activatedAt: row.activated_at?.toISOString() ?? null,
    activeEndsAt: row.active_ends_at?.toISOString() ?? null,
    closedAt: row.closed_at?.toISOString() ?? null,
  };
}

function standingView(row: StandingRow): RankedStandingView {
  return {
    playerName: row.player_name ?? 'Deleted player',
    rank: row.rank,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
    settledMatchCount: row.settled_match_count,
  };
}

function territoryContributionView(
  row: SettlementRow,
): RankedTerritoryContributionView | null {
  if (!row.territory_zone_id || !row.territory_zone_name) return null;

  if (row.status !== 'settled') {
    return {
      zoneId: row.territory_zone_id,
      zoneName: row.territory_zone_name,
      outcome: 'pending',
      influencePoints: 0,
      exclusionReason: null,
    };
  }

  if (row.outcome === 'loss') {
    return {
      zoneId: row.territory_zone_id,
      zoneName: row.territory_zone_name,
      outcome: 'lost',
      influencePoints: 0,
      exclusionReason: null,
    };
  }

  if (row.territory_outcome === 'accepted') {
    return {
      zoneId: row.territory_zone_id,
      zoneName: row.territory_zone_name,
      outcome: 'accepted',
      influencePoints: row.territory_influence_points ?? 0,
      exclusionReason: null,
    };
  }

  if (row.outcome !== 'win' || row.territory_outcome !== 'excluded') {
    throw new Error('The territory contribution outcome is unavailable.');
  }

  return {
    zoneId: row.territory_zone_id,
    zoneName: row.territory_zone_name,
    outcome: 'excluded',
    influencePoints: 0,
    exclusionReason: publicTerritoryExclusionReason(
      row.territory_exclusion_reason,
    ),
  };
}

function publicTerritoryExclusionReason(
  reason: string | null,
): RankedTerritoryExclusionReason {
  switch (reason) {
    case 'winner_provisional':
      return 'placement_matches_remaining';
    case 'daily_cap_reached':
      return 'daily_cap_reached';
    case 'zone_inactive':
      return 'zone_unavailable';
    case 'result_not_eligible':
      return 'result_not_eligible';
    case 'winner_unavailable':
      return 'player_unavailable';
    default:
      throw new Error('The territory contribution exclusion is unavailable.');
  }
}

function assertPageLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RankedError(
      400,
      'RANKED_PAGE_INVALID',
      'The ranked page size is invalid.',
    );
  }
}

function isOrdinal(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
