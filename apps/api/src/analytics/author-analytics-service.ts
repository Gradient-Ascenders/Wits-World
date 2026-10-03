import type pg from 'pg';

import {
  QUESTION_PERFORMANCE_CTES,
  QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD,
  QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE,
  type QuestionPerformanceService,
} from '../challenges/question-performance-service.js';

export const ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE =
  QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE;
export const ADVANCED_ANALYTICS_EASY_CORRECT_RATE_THRESHOLD = 0.9;
export const ADVANCED_ANALYTICS_MAX_RANGE_DAYS = 366;
export const ADVANCED_ANALYTICS_MAX_PAGE_SIZE = 100;

export type EventLocationAnalyticsMode = 'all' | 'popular' | 'ignored';
export type QuestionAnalyticsClassification =
  'suppressed' | 'easy' | 'problematic' | 'normal';
export type AnalyticsCardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface AnalyticsDatePageFilters {
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
}

export interface EventLocationAnalyticsFilters extends AnalyticsDatePageFilters {
  mode: EventLocationAnalyticsMode;
}

export interface QuestionAnalyticsFilters extends AnalyticsDatePageFilters {
  eventId?: string;
  challengeId?: string;
  format?: 'multiple_choice' | 'ordering';
  difficulty?: 1 | 2 | 3;
}

export type CardIssuanceAnalyticsFilters = AnalyticsDatePageFilters;

export interface EventLocationAnalyticsItem {
  eventId: string;
  eventTitle: string;
  locationKind: 'authored' | 'placement_site';
  locationId: string;
  locationName: string;
  viewCount: number | null;
  eligibleCount: number | null;
  startCount: number | null;
  completionCount: number | null;
  suppressed: boolean;
}

export interface EventLocationAnalyticsPage {
  items: EventLocationAnalyticsItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  minimumSampleSize: number;
}

export interface QuestionAnalyticsItem {
  questionId: string;
  challengeId: string;
  eventId: string;
  eventTitle: string;
  prompt: string;
  format: 'multiple_choice' | 'ordering';
  difficulty: 1 | 2 | 3;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'retired';
  answerCount: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  timeoutCount: number | null;
  correctRate: number | null;
  incorrectRate: number | null;
  classification: QuestionAnalyticsClassification;
  suppressed: boolean;
}

export interface QuestionAnalyticsPage {
  items: QuestionAnalyticsItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  minimumSampleSize: number;
  easyCorrectRate: number;
  problematicIncorrectRate: number;
}

export interface CardIssuanceAnalyticsItem {
  cardDefinitionId: string;
  cardName: string;
  rarity: AnalyticsCardRarity;
  rewardEligible: boolean;
  issuanceCount: number | null;
  issuancesPer100Completions: number | null;
  suppressed: boolean;
}

export interface CardRarityAnalyticsItem {
  rarity: AnalyticsCardRarity;
  issuanceCount: number | null;
  issuancesPer100Completions: number | null;
  suppressed: boolean;
}

export interface CardIssuanceAnalyticsPage {
  items: CardIssuanceAnalyticsItem[];
  rarities: CardRarityAnalyticsItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  minimumSampleSize: number;
}

export interface EventAttentionItem {
  eventId: string;
  eventTitle: string;
  ignoredLocationCount: number;
  easyQuestionCount: number;
  hardQuestionCount: number;
  questionId: string | null;
  challengeId: string | null;
}

export interface EventAttentionPage {
  items: EventAttentionItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  minimumSampleSize: number;
}

export interface AuthorAnalyticsService {
  listAttention(filters: AnalyticsDatePageFilters): Promise<EventAttentionPage>;
  listEventLocations(
    filters: EventLocationAnalyticsFilters,
  ): Promise<EventLocationAnalyticsPage>;
  listQuestions(
    filters: QuestionAnalyticsFilters,
  ): Promise<QuestionAnalyticsPage>;
  listCardIssuance(
    filters: CardIssuanceAnalyticsFilters,
  ): Promise<CardIssuanceAnalyticsPage>;
}

export interface AuthorAnalyticsDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface EventLocationRow extends pg.QueryResultRow {
  event_id: string;
  event_title: string;
  location_kind: EventLocationAnalyticsItem['locationKind'];
  location_id: string;
  location_name: string;
  view_count: number | string;
  eligible_count: number | string;
  start_count: number | string;
  completion_count: number | string;
  total_items: number;
}

interface CardIssuanceRow extends pg.QueryResultRow {
  card_definition_id: string | null;
  card_name: string | null;
  rarity: AnalyticsCardRarity | null;
  reward_eligible: boolean | null;
  issuance_count: number | string | null;
  total_completions: number | string;
  total_items: number;
}

interface CardRarityRow extends pg.QueryResultRow {
  rarity: AnalyticsCardRarity;
  issuance_count: number | string;
  total_completions: number | string;
  has_suppressed_child: boolean;
}

interface NormalizedDateRange {
  from: string | null;
  to: string | null;
}

export class InvalidAdvancedAnalyticsFiltersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAdvancedAnalyticsFiltersError';
  }
}

export function createAuthorAnalyticsService(
  database: AuthorAnalyticsDatabase,
  questionPerformance: QuestionPerformanceService,
): AuthorAnalyticsService {
  return {
    async listAttention(filters) {
      const range = validateCommonFilters(filters);
      const result = await database.query<{
        event_id: string | null;
        event_title: string;
        ignored_location_count: number;
        easy_question_count: number;
        hard_question_count: number;
        question_id: string | null;
        challenge_id: string | null;
        total_items: number;
      }>(EVENT_ATTENTION_QUERY, [
        null,
        null,
        null,
        null,
        range.from,
        range.to,
        ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
        ADVANCED_ANALYTICS_EASY_CORRECT_RATE_THRESHOLD,
        filters.pageSize,
        (filters.page - 1) * filters.pageSize,
      ]);
      const totalItems = result.rows[0]?.total_items ?? 0;
      return {
        items: result.rows.flatMap((row) =>
          row.event_id === null
            ? []
            : [
                {
                  eventId: row.event_id,
                  eventTitle: row.event_title,
                  ignoredLocationCount: row.ignored_location_count,
                  easyQuestionCount: row.easy_question_count,
                  hardQuestionCount: row.hard_question_count,
                  questionId: row.question_id,
                  challengeId: row.challenge_id,
                },
              ],
        ),
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / filters.pageSize),
        minimumSampleSize: ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
      };
    },

    async listEventLocations(filters) {
      const range = validateCommonFilters(filters);
      if (!['all', 'popular', 'ignored'].includes(filters.mode)) {
        throw new InvalidAdvancedAnalyticsFiltersError(
          'mode must be all, popular, or ignored.',
        );
      }

      const offset = (filters.page - 1) * filters.pageSize;
      const result = await database.query<EventLocationRow>(
        EVENT_LOCATION_ANALYTICS_QUERY,
        [
          range.from,
          range.to,
          filters.mode,
          ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
          filters.pageSize,
          offset,
        ],
      );
      const totalItems = result.rows[0]?.total_items ?? 0;

      return {
        items: result.rows
          .filter((row) => row.event_id !== null)
          .map(mapEventLocationItem),
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / filters.pageSize),
        minimumSampleSize: ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
      };
    },

    async listQuestions(filters) {
      const range = validateCommonFilters(filters);
      const performance = await questionPerformance.list({
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
        ...(filters.challengeId ? { challengeId: filters.challengeId } : {}),
        ...(filters.format ? { format: filters.format } : {}),
        ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
        page: filters.page,
        pageSize: filters.pageSize,
      });

      return {
        items: performance.items.map((item) => {
          const suppressed =
            item.answerCount > 0 &&
            item.answerCount < ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE;
          const classification: QuestionAnalyticsClassification = suppressed
            ? 'suppressed'
            : item.correctRate >= ADVANCED_ANALYTICS_EASY_CORRECT_RATE_THRESHOLD
              ? 'easy'
              : item.isProblematic
                ? 'problematic'
                : 'normal';

          return {
            questionId: item.questionId,
            challengeId: item.challengeId,
            eventId: item.eventId,
            eventTitle: item.eventTitle,
            prompt: item.prompt,
            format: item.format,
            difficulty: item.difficulty,
            status: item.status,
            answerCount: suppressPositiveSmallCount(item.answerCount),
            correctCount: suppressed ? null : item.correctCount,
            incorrectCount: suppressed ? null : item.incorrectCount,
            timeoutCount: suppressed ? null : item.timeoutCount,
            correctRate: suppressed ? null : item.correctRate,
            incorrectRate: suppressed ? null : item.incorrectRate,
            classification,
            suppressed,
          };
        }),
        page: performance.page,
        pageSize: performance.pageSize,
        totalItems: performance.totalItems,
        totalPages: performance.totalPages,
        minimumSampleSize: ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
        easyCorrectRate: ADVANCED_ANALYTICS_EASY_CORRECT_RATE_THRESHOLD,
        problematicIncorrectRate: QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD,
      };
    },

    async listCardIssuance(filters) {
      const range = validateCommonFilters(filters);
      const offset = (filters.page - 1) * filters.pageSize;
      const [cards, rarities] = await Promise.all([
        database.query<CardIssuanceRow>(CARD_ISSUANCE_ANALYTICS_QUERY, [
          range.from,
          range.to,
          filters.pageSize,
          offset,
        ]),
        database.query<CardRarityRow>(CARD_RARITY_ANALYTICS_QUERY, [
          range.from,
          range.to,
          ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
        ]),
      ]);
      const totalItems = cards.rows[0]?.total_items ?? 0;

      return {
        items: cards.rows
          .filter((row) => row.card_definition_id !== null)
          .map(mapCardIssuanceItem),
        rarities: rarities.rows.map(mapCardRarityItem),
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / filters.pageSize),
        minimumSampleSize: ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
      };
    },
  };
}

function mapEventLocationItem(
  row: EventLocationRow,
): EventLocationAnalyticsItem {
  const viewCount = Number(row.view_count);
  const eligibleCount = Number(row.eligible_count);
  const startCount = Number(row.start_count);
  const completionCount = Number(row.completion_count);
  const projected = [viewCount, eligibleCount, startCount, completionCount].map(
    suppressPositiveSmallCount,
  );

  return {
    eventId: row.event_id,
    eventTitle: row.event_title,
    locationKind: row.location_kind,
    locationId: row.location_id,
    locationName: row.location_name,
    viewCount: projected[0] ?? null,
    eligibleCount: projected[1] ?? null,
    startCount: projected[2] ?? null,
    completionCount: projected[3] ?? null,
    suppressed: projected.some((value, index) => {
      const raw = [viewCount, eligibleCount, startCount, completionCount][
        index
      ];
      return raw !== value;
    }),
  };
}

function mapCardIssuanceItem(row: CardIssuanceRow): CardIssuanceAnalyticsItem {
  if (
    row.card_definition_id === null ||
    row.card_name === null ||
    row.rarity === null ||
    row.reward_eligible === null
  ) {
    throw new Error('Card issuance analytics query returned an invalid row.');
  }

  const issuanceCount = Number(row.issuance_count ?? 0);
  const totalCompletions = Number(row.total_completions);
  const suppressed =
    isPositiveSmallCount(issuanceCount) ||
    isPositiveSmallCount(totalCompletions);

  return {
    cardDefinitionId: row.card_definition_id,
    cardName: row.card_name,
    rarity: row.rarity,
    rewardEligible: row.reward_eligible,
    issuanceCount: suppressed ? null : issuanceCount,
    issuancesPer100Completions: suppressed
      ? null
      : ratePer100(issuanceCount, totalCompletions),
    suppressed,
  };
}

function mapCardRarityItem(row: CardRarityRow): CardRarityAnalyticsItem {
  const issuanceCount = Number(row.issuance_count);
  const totalCompletions = Number(row.total_completions);
  const suppressed =
    row.has_suppressed_child ||
    isPositiveSmallCount(issuanceCount) ||
    isPositiveSmallCount(totalCompletions);
  return {
    rarity: row.rarity,
    issuanceCount: suppressed ? null : issuanceCount,
    issuancesPer100Completions: suppressed
      ? null
      : ratePer100(issuanceCount, totalCompletions),
    suppressed,
  };
}

function suppressPositiveSmallCount(value: number): number | null {
  return isPositiveSmallCount(value) ? null : value;
}

function isPositiveSmallCount(value: number): boolean {
  return value > 0 && value < ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE;
}

function ratePer100(count: number, total: number): number | null {
  if (total <= 0) return null;
  return (count * 100) / total;
}

function validateCommonFilters(
  filters: AnalyticsDatePageFilters,
): NormalizedDateRange {
  if (!Number.isInteger(filters.page) || filters.page < 1) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      'page must be a positive integer.',
    );
  }
  if (
    !Number.isInteger(filters.pageSize) ||
    filters.pageSize < 1 ||
    filters.pageSize > ADVANCED_ANALYTICS_MAX_PAGE_SIZE
  ) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      `pageSize must be between 1 and ${ADVANCED_ANALYTICS_MAX_PAGE_SIZE}.`,
    );
  }
  if ((filters.fromDate === undefined) !== (filters.toDate === undefined)) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      'fromDate and toDate must be supplied together.',
    );
  }
  if (filters.fromDate === undefined || filters.toDate === undefined) {
    return { from: null, to: null };
  }

  const from = parseUtcDate(filters.fromDate, 'fromDate');
  const to = parseUtcDate(filters.toDate, 'toDate');
  const rangeDays = (to.getTime() - from.getTime()) / 86_400_000;

  if (rangeDays < 1) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      'fromDate must be earlier than toDate by at least one day.',
    );
  }
  if (rangeDays > ADVANCED_ANALYTICS_MAX_RANGE_DAYS) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      `The analytics date range cannot exceed ${ADVANCED_ANALYTICS_MAX_RANGE_DAYS} days.`,
    );
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

function parseUtcDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      `${field} must use YYYY-MM-DD.`,
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new InvalidAdvancedAnalyticsFiltersError(
      `${field} must be a valid UTC calendar date.`,
    );
  }
  return parsed;
}

function eventLocationAnalyticsCtes(
  fromParameter: string,
  toParameter: string,
) {
  return `
  with product as (
    select aggregate.event_id,
           case when aggregate.placement_assignment_id is null
                then 'authored' else 'placement_site' end as location_kind,
           coalesce(assignment.site_id, aggregate.event_id) as location_id,
           sum(aggregate.view_count)::bigint as view_count,
           sum(aggregate.eligible_count)::bigint as eligible_count
      from public.event_product_event_aggregates aggregate
      left join public.event_placement_assignments assignment
        on assignment.id = aggregate.placement_assignment_id
       and assignment.event_id = aggregate.event_id
     where (${fromParameter}::timestamptz is null or aggregate.bucket_start >= ${fromParameter}::timestamptz)
       and (${toParameter}::timestamptz is null or aggregate.bucket_start < ${toParameter}::timestamptz)
     group by aggregate.event_id,
              case when aggregate.placement_assignment_id is null
                   then 'authored' else 'placement_site' end,
              coalesce(assignment.site_id, aggregate.event_id)
  ), starts as (
    select attempt.event_id,
           case when attempt.placement_assignment_id is null
                then 'authored' else 'placement_site' end as location_kind,
           coalesce(assignment.site_id, attempt.event_id) as location_id,
           count(*)::bigint as start_count
      from public.challenge_attempts attempt
      left join public.event_placement_assignments assignment
        on assignment.id = attempt.placement_assignment_id
       and assignment.event_id = attempt.event_id
     where (${fromParameter}::timestamptz is null or attempt.started_at >= ${fromParameter}::timestamptz)
       and (${toParameter}::timestamptz is null or attempt.started_at < ${toParameter}::timestamptz)
     group by attempt.event_id,
              case when attempt.placement_assignment_id is null
                   then 'authored' else 'placement_site' end,
              coalesce(assignment.site_id, attempt.event_id)
  ), completions as (
    select completion.event_id,
           case when attempt.placement_assignment_id is null
                then 'authored' else 'placement_site' end as location_kind,
           coalesce(assignment.site_id, completion.event_id) as location_id,
           count(*)::bigint as completion_count
      from public.event_completions completion
      join public.challenge_attempts attempt on attempt.id = completion.attempt_id
      left join public.event_placement_assignments assignment
        on assignment.id = attempt.placement_assignment_id
       and assignment.event_id = completion.event_id
     where (${fromParameter}::timestamptz is null or completion.completed_at >= ${fromParameter}::timestamptz)
       and (${toParameter}::timestamptz is null or completion.completed_at < ${toParameter}::timestamptz)
     group by completion.event_id,
              case when attempt.placement_assignment_id is null
                   then 'authored' else 'placement_site' end,
              coalesce(assignment.site_id, completion.event_id)
  ), keys as (
    select event_id, location_kind, location_id from product
    union
    select event_id, location_kind, location_id from starts
    union
    select event_id, location_kind, location_id from completions
  ), identified as (
    select keys.event_id,
           event.title as event_title,
           keys.location_kind,
           keys.location_id,
           case when keys.location_kind = 'placement_site'
                then site.name else event.title end as location_name,
           coalesce(product.view_count, 0)::bigint as view_count,
           coalesce(product.eligible_count, 0)::bigint as eligible_count,
           coalesce(starts.start_count, 0)::bigint as start_count,
           coalesce(completions.completion_count, 0)::bigint as completion_count
      from keys
      join public.events event on event.id = keys.event_id
      left join public.event_placement_sites site
        on keys.location_kind = 'placement_site'
       and site.id = keys.location_id
      left join product using (event_id, location_kind, location_id)
      left join starts using (event_id, location_kind, location_id)
      left join completions using (event_id, location_kind, location_id)
  )
`;
}

const EVENT_LOCATION_ANALYTICS_QUERY = `
  ${eventLocationAnalyticsCtes('$1', '$2')}  , filtered as (
    select *
      from identified
     where $3::text = 'all'
        or (
          $3::text = 'popular'
          and (
            view_count >= $4::integer
            or eligible_count >= $4::integer
          )
        )
        or (
          $3::text = 'ignored'
          and view_count >= $4::integer
          and eligible_count = 0
          and start_count = 0
          and completion_count = 0
        )
  ), page as (
    select filtered.*
      from filtered
     order by
       case when $3::text = 'popular' then eligible_count end desc nulls last,
       case when $3::text = 'popular' then start_count end desc nulls last,
       case when $3::text = 'popular' then completion_count end desc nulls last,
       case when $3::text in ('popular', 'ignored') then view_count end desc nulls last,
       event_title,
       location_name,
       event_id,
       location_id
     limit $5 offset $6
  ), metadata as (
    select count(*)::integer as total_items from filtered
  )
  select page.event_id::text,
         page.event_title,
         page.location_kind,
         page.location_id::text,
         page.location_name,
         page.view_count,
         page.eligible_count,
         page.start_count,
         page.completion_count,
         metadata.total_items
    from metadata
    left join page on true
   order by
     case when $3::text = 'popular' then page.eligible_count end desc nulls last,
     case when $3::text = 'popular' then page.start_count end desc nulls last,
     case when $3::text = 'popular' then page.completion_count end desc nulls last,
     case when $3::text in ('popular', 'ignored') then page.view_count end desc nulls last,
     page.event_title nulls last,
     page.location_name nulls last,
     page.event_id nulls last,
     page.location_id nulls last
`;

const CARD_ISSUANCE_ANALYTICS_QUERY = `
  with filtered_rewards as (
    select reward.card_definition_id, reward.awarded_at
      from public.event_completion_card_rewards reward
     where ($1::timestamptz is null or reward.awarded_at >= $1::timestamptz)
       and ($2::timestamptz is null or reward.awarded_at < $2::timestamptz)
  ), issued as (
    select card_definition_id, count(*)::bigint as issuance_count
      from filtered_rewards
     group by card_definition_id
  ), total_completions as (
    select count(*)::bigint as value
      from public.event_completions completion
     where ($1::timestamptz is null or completion.completed_at >= $1::timestamptz)
       and ($2::timestamptz is null or completion.completed_at < $2::timestamptz)
  ), catalogue as (
    select definition.id,
           definition.name,
           definition.rarity,
           definition.reward_eligible
      from public.card_definitions definition
     where definition.reward_eligible = true
        or exists (
          select 1
            from public.event_completion_card_rewards historical
           where historical.card_definition_id = definition.id
        )
  ), identified as (
    select catalogue.id,
           catalogue.name,
           catalogue.rarity,
           catalogue.reward_eligible,
           coalesce(issued.issuance_count, 0)::bigint as issuance_count,
           total_completions.value as total_completions
      from catalogue
      left join issued on issued.card_definition_id = catalogue.id
      cross join total_completions
  ), page as (
    select *
      from identified
     order by issuance_count desc, rarity, name, id
     limit $3 offset $4
  ), metadata as (
    select count(*)::integer as total_items from identified
  )
  select page.id::text as card_definition_id,
         page.name as card_name,
         page.rarity,
         page.reward_eligible,
         page.issuance_count,
         page.total_completions,
         metadata.total_items
    from metadata
    left join page on true
   order by page.issuance_count desc nulls last,
            page.rarity nulls last,
            page.name nulls last,
            page.id nulls last
`;

const CARD_RARITY_ANALYTICS_QUERY = `
  with rarities(rarity) as (
    values ('common'::text), ('rare'::text), ('epic'::text), ('legendary'::text)
  ), issued_by_card as (
    select definition.rarity,
           reward.card_definition_id,
           count(*)::bigint as issuance_count
      from public.event_completion_card_rewards reward
      join public.card_definitions definition on definition.id = reward.card_definition_id
     where ($1::timestamptz is null or reward.awarded_at >= $1::timestamptz)
       and ($2::timestamptz is null or reward.awarded_at < $2::timestamptz)
     group by definition.rarity, reward.card_definition_id
  ), issued as (
    select rarity,
           sum(issuance_count)::bigint as issuance_count,
           bool_or(issuance_count > 0 and issuance_count < $3::integer)
             as has_suppressed_child
      from issued_by_card
     group by rarity
  ), total_completions as (
    select count(*)::bigint as value
      from public.event_completions completion
     where ($1::timestamptz is null or completion.completed_at >= $1::timestamptz)
       and ($2::timestamptz is null or completion.completed_at < $2::timestamptz)
  )
  select rarities.rarity,
         coalesce(issued.issuance_count, 0)::bigint as issuance_count,
         total_completions.value as total_completions,
         coalesce(issued.has_suppressed_child, false) as has_suppressed_child
    from rarities
    left join issued using (rarity)
    cross join total_completions
   order by array_position(array['common', 'rare', 'epic', 'legendary'], rarities.rarity)
`;

// Group the complete disclosed signal set before ordering or paging events.
const EVENT_ATTENTION_QUERY = `
  with ignored as (
    ${eventLocationAnalyticsCtes('$5', '$6')}
    select event_id::text, event_title, count(*)::int as ignored_location_count
    from identified
    where view_count >= $7::integer and eligible_count = 0
      and start_count = 0 and completion_count = 0
    group by event_id, event_title
  ), question_signals as (
    ${QUESTION_PERFORMANCE_CTES}
    select * from identified
    where has_sufficient_sample and (is_problematic or correct_rate >= $8::numeric)
  ), questions as (
    select event_id, event_title,
      count(distinct question_id) filter (where correct_rate >= $8::numeric)::int as easy_question_count,
      count(distinct question_id) filter (where is_problematic)::int as hard_question_count,
      (array_agg(question_id order by is_problematic desc, question_id))[1] as question_id,
      (array_agg(challenge_id order by is_problematic desc, question_id))[1] as challenge_id
    from question_signals group by event_id, event_title
  ), combined as (
    select coalesce(ignored.event_id, questions.event_id) as event_id,
      coalesce(ignored.event_title, questions.event_title) as event_title,
      coalesce(ignored.ignored_location_count, 0) as ignored_location_count,
      coalesce(questions.easy_question_count, 0) as easy_question_count,
      coalesce(questions.hard_question_count, 0) as hard_question_count,
      questions.question_id, questions.challenge_id
    from ignored full join questions using (event_id)
  ), page as (
    select * from combined order by event_title, event_id limit $9 offset $10
  ), metadata as (select count(*)::int as total_items from combined)
  select page.*, metadata.total_items from metadata left join page on true
  order by page.event_title nulls last, page.event_id nulls last
`;
