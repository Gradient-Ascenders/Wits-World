import type pg from 'pg';

export type StandingsPeriod = 'all_time' | 'monthly';

export const PROGRESSION_STANDINGS_MAX_PAGE = 10_000;
export const PROGRESSION_STANDINGS_MAX_PAGE_SIZE = 100;
export const PROGRESSION_MONTH_PATTERN = '^(?!0000)\\d{4}-(0[1-9]|1[0-2])$';

const progressionMonthExpression = new RegExp(PROGRESSION_MONTH_PATTERN);

export interface ProgressionAchievement {
  code: string;
  title: string;
  description: string;
  earned: boolean;
  progress: number;
  target: number;
}

export interface CurrentProgressionProfile {
  playerName: string;
  points: number;
  rank: number;
  currentStreak: number;
  longestStreak: number;
  achievements: readonly ProgressionAchievement[];
}

export interface StandingsEntry {
  playerName: string | null;
  points: number;
  rank: number;
  currentStreak: number;
  longestStreak: number;
  isCurrentPlayer: boolean;
}

export interface ProgressionStandings {
  period: StandingsPeriod;
  month: string | null;
  entries: readonly StandingsEntry[];
  currentPlayer: StandingsEntry;
  pagination: {
    page: number;
    pageSize: number;
    totalPlayers: number;
    totalPages: number;
  };
}

export interface ListProgressionStandingsInput {
  playerId: string;
  period: StandingsPeriod;
  month?: string;
  page: number;
  pageSize: number;
}

export interface ProgressionReadService {
  getCurrentProfile(playerId: string): Promise<CurrentProgressionProfile>;
  listStandings(
    input: ListProgressionStandingsInput,
  ): Promise<ProgressionStandings>;
}

export interface ProgressionReadDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export class ProgressionProfileUnavailableError extends Error {
  constructor() {
    super('The current player progression profile is unavailable.');
    this.name = 'ProgressionProfileUnavailableError';
  }
}

interface ProfileRow extends pg.QueryResultRow {
  player_name: string;
  total_points: number;
  standing_rank: number;
  current_streak: number;
  longest_streak: number;
  achievements: ProgressionAchievement[];
}

interface StandingsRow extends pg.QueryResultRow {
  entries: StandingsEntry[];
  current_player: StandingsEntry | null;
  total_players: number;
}

const PROFILE_QUERY = `
  with metrics as (
    select
      count(*) filter (
        where award.event_completion_id is not null
      )::integer as challenge_completions,
      count(*) filter (
        where completion.score_correct = 5
      )::integer as perfect_challenges,
      count(*) filter (
        where award.cpu_match_id is not null
      )::integer as cpu_matches,
      count(*) filter (
        where match.winner = 'player'
      )::integer as cpu_wins
    from public.player_point_awards award
    left join public.event_completions completion
      on completion.id = award.event_completion_id
    left join public.cpu_matches match
      on match.id = award.cpu_match_id
    where award.player_id = $1::uuid
  ),
  achievements as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', definition.code,
          'title', definition.title,
          'description', definition.description,
          'earned', unlock.achievement_code is not null,
          'progress', case definition.metric
            when 'challenge_completions' then metrics.challenge_completions
            when 'perfect_challenges' then metrics.perfect_challenges
            when 'cpu_matches' then metrics.cpu_matches
            when 'cpu_wins' then metrics.cpu_wins
            when 'longest_streak' then standings.longest_streak
          end,
          'target', definition.threshold
        )
        order by definition.display_order
      ),
      '[]'::jsonb
    ) as values
    from public.achievement_definitions definition
    cross join metrics
    cross join public.player_progression_all_time_standings standings
    left join public.player_achievement_unlocks unlock
      on unlock.player_id = standings.player_id
     and unlock.achievement_code = definition.code
    where standings.player_id = $1::uuid
      and definition.is_active = true
  )
  select
    standings.player_name,
    standings.total_points,
    standings.standing_rank::integer,
    standings.current_streak,
    standings.longest_streak,
    achievements.values as achievements
  from public.player_progression_all_time_standings standings
  cross join achievements
  where standings.player_id = $1::uuid
`;

export function createProgressionReadService(
  database: ProgressionReadDatabase,
): ProgressionReadService {
  return {
    async getCurrentProfile(playerId) {
      const result = await database.query<ProfileRow>(PROFILE_QUERY, [
        playerId,
      ]);
      const profile = result.rows[0];

      if (!profile) {
        throw new ProgressionProfileUnavailableError();
      }

      return {
        playerName: profile.player_name,
        points: profile.total_points,
        rank: profile.standing_rank,
        currentStreak: profile.current_streak,
        longestStreak: profile.longest_streak,
        achievements: profile.achievements,
      };
    },

    async listStandings(input) {
      assertStandingsInput(input);

      const offset = (input.page - 1) * input.pageSize;
      const query = buildStandingsQuery(input.period);
      const values =
        input.period === 'monthly'
          ? [input.playerId, input.pageSize, offset, input.month]
          : [input.playerId, input.pageSize, offset];
      const result = await database.query<StandingsRow>(query, values);
      const row = result.rows[0];

      if (!row?.current_player) {
        throw new ProgressionProfileUnavailableError();
      }

      return {
        period: input.period,
        month: input.period === 'monthly' ? input.month! : null,
        entries: row.entries,
        currentPlayer: row.current_player,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          totalPlayers: row.total_players,
          totalPages: Math.ceil(row.total_players / input.pageSize),
        },
      };
    },
  };
}

function buildStandingsQuery(period: StandingsPeriod): string {
  const source =
    period === 'monthly'
      ? `public.player_progression_monthly_standings(
          to_date($4 || '-01', 'YYYY-MM-DD')
        )`
      : 'public.player_progression_all_time_standings';

  return `
    with ranked as (
      select
        player_id,
        player_name,
        total_points,
        current_streak,
        longest_streak,
        standing_rank::integer,
        row_number() over (
          order by
            total_points desc,
            player_name asc nulls last,
            player_id asc
        )::integer as listing_position
      from ${source}
    ),
    requested_page as (
      select *
      from ranked
      order by listing_position
      limit $2
      offset $3
    )
    select
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'playerName', page.player_name,
              'points', page.total_points,
              'rank', page.standing_rank,
              'currentStreak', page.current_streak,
              'longestStreak', page.longest_streak,
              'isCurrentPlayer', page.player_id = $1::uuid
            )
            order by page.listing_position
          )
          from requested_page page
        ),
        '[]'::jsonb
      ) as entries,
      (
        select jsonb_build_object(
          'playerName', current_player.player_name,
          'points', current_player.total_points,
          'rank', current_player.standing_rank,
          'currentStreak', current_player.current_streak,
          'longestStreak', current_player.longest_streak,
          'isCurrentPlayer', true
        )
        from ranked current_player
        where current_player.player_id = $1::uuid
      ) as current_player,
      (select count(*)::integer from ranked) as total_players
  `;
}

function assertStandingsInput(input: ListProgressionStandingsInput): void {
  if (
    !Number.isInteger(input.page) ||
    input.page < 1 ||
    input.page > PROGRESSION_STANDINGS_MAX_PAGE ||
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > PROGRESSION_STANDINGS_MAX_PAGE_SIZE
  ) {
    throw new Error('Progression standings pagination is invalid.');
  }

  if (
    input.period === 'monthly' &&
    !progressionMonthExpression.test(input.month ?? '')
  ) {
    throw new Error('Monthly progression standings require a valid month.');
  }

  if (input.period === 'all_time' && input.month !== undefined) {
    throw new Error('All-time progression standings do not accept a month.');
  }
}
