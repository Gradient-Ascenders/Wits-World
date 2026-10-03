import type pg from 'pg';

export const QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE = 10;
export const QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD = 0.7;

export interface QuestionPerformanceFilters {
  eventId?: string;
  challengeId?: string;
  format?: 'multiple_choice' | 'ordering';
  difficulty?: 1 | 2 | 3;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface QuestionPerformanceItem {
  questionId: string;
  challengeId: string;
  eventId: string;
  eventTitle: string;
  prompt: string;
  format: 'multiple_choice' | 'ordering';
  difficulty: 1 | 2 | 3;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'retired';
  answerCount: number;
  correctCount: number;
  incorrectCount: number;
  timeoutCount: number;
  correctRate: number;
  incorrectRate: number;
  hasSufficientSample: boolean;
  isProblematic: boolean;
}

export interface QuestionPerformancePage {
  items: QuestionPerformanceItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  minimumSampleSize: typeof QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE;
  problematicIncorrectRate: typeof QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD;
}

export interface QuestionPerformanceService {
  list(filters: QuestionPerformanceFilters): Promise<QuestionPerformancePage>;
}

export interface QuestionPerformanceDatabase {
  connect(): Promise<{
    query<T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ): Promise<{ rows: T[] }>;
    release(): void;
  }>;
}

interface PerformanceRow extends pg.QueryResultRow {
  question_id: string;
  challenge_id: string;
  event_id: string;
  event_title: string;
  prompt: string;
  format: QuestionPerformanceItem['format'];
  difficulty: QuestionPerformanceItem['difficulty'];
  status: QuestionPerformanceItem['status'];
  answer_count: number;
  correct_count: number;
  incorrect_count: number;
  timeout_count: number;
  correct_rate: string | number;
  incorrect_rate: string | number;
  has_sufficient_sample: boolean;
  is_problematic: boolean;
  total_items: number;
}

export class InvalidQuestionPerformanceFiltersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuestionPerformanceFiltersError';
  }
}

// Shared authoritative outcome projection for paginated reports and event attention.
export const QUESTION_PERFORMANCE_CTES = `
            with classified_snapshots as (
              select
                attempt.id as attempt_id,
                snapshot.source_question_id as question_id,
                snapshot.position,
                attempt.event_id,
                attempt.challenge_id,
                attempt.completion_reason,
                challenge.format,
                snapshot.difficulty_snapshot as difficulty,
                exists (
                  select 1 from public.attempt_answers answer
                  where answer.attempt_question_id = snapshot.id
                ) or exists (
                  select 1 from public.attempt_ordering_answers answer
                  where answer.attempt_question_id = snapshot.id
                ) as has_answer,
                case
                  when challenge.format = 'multiple_choice' then exists (
                    select 1
                    from public.attempt_answers answer
                    join public.attempt_question_choices selected_choice
                      on selected_choice.attempt_question_id = snapshot.id
                     and selected_choice.id = answer.selected_choice_id
                    join private.challenge_answer_keys answer_key
                      on answer_key.question_id = snapshot.source_question_id
                     and answer_key.accepted_choice_id = selected_choice.source_choice_id
                    where answer.attempt_question_id = snapshot.id
                  )
                  else (
                    select count(*)
                    from public.attempt_ordering_answer_items answer_item
                    join public.attempt_question_ordering_items selected_item
                      on selected_item.attempt_question_id = snapshot.id
                     and selected_item.id = answer_item.selected_item_id
                    join private.challenge_ordering_answer_keys answer_key
                      on answer_key.question_id = snapshot.source_question_id
                     and answer_key.item_id = selected_item.source_item_id
                     and answer_key.correct_position = answer_item.submitted_position
                    where answer_item.attempt_question_id = snapshot.id
                  ) = 4
                end as is_correct
              from public.challenge_attempts attempt
              join public.attempt_questions snapshot on snapshot.attempt_id = attempt.id
              join public.event_challenges challenge on challenge.id = attempt.challenge_id
              where attempt.status = 'completed'
                and ($1::uuid is null or attempt.event_id = $1::uuid)
                and ($2::uuid is null or attempt.challenge_id = $2::uuid)
                and ($3::text is null or challenge.format = $3::text)
                and ($5::timestamptz is null or attempt.completed_at >= $5::timestamptz)
                and ($6::timestamptz is null or attempt.completed_at < $6::timestamptz)
            ), ranked_snapshots as (
              select
                classified_snapshots.*,
                min(position) filter (where not has_answer) over (
                  partition by attempt_id
                ) as current_unanswered_position
              from classified_snapshots
            ), outcomes as (
              select
                question_id,
                event_id,
                challenge_id,
                format,
                difficulty,
                is_correct,
                not has_answer as is_timeout
              from ranked_snapshots
              where (
                has_answer
                or (
                  completion_reason = 'timeout'
                  and position = current_unanswered_position
                )
              )
                and ($4::smallint is null or difficulty = $4::smallint)
            ), aggregate as (
              select
                outcome.question_id,
                outcome.challenge_id,
                outcome.event_id,
                outcome.format,
                outcome.difficulty,
                count(*)::int as answer_count,
                count(*) filter (where outcome.is_correct)::int as correct_count,
                count(*) filter (where not outcome.is_correct)::int as incorrect_count,
                count(*) filter (where outcome.is_timeout)::int as timeout_count
              from outcomes outcome
              group by outcome.question_id, outcome.challenge_id, outcome.event_id,
                       outcome.format, outcome.difficulty
            ), projected as (
              select
                aggregate.*,
                aggregate.correct_count::numeric / aggregate.answer_count as correct_rate,
                aggregate.incorrect_count::numeric / aggregate.answer_count as incorrect_rate,
                aggregate.answer_count >= ${QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE} as has_sufficient_sample,
                aggregate.answer_count >= ${QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE}
                  and aggregate.incorrect_count::numeric / aggregate.answer_count >= ${QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD}
                  as is_problematic
              from aggregate
            ), identified as (
              select
              projected.question_id::text,
              projected.challenge_id::text,
              projected.event_id::text,
              event.title as event_title,
              question.prompt,
              projected.format,
              projected.difficulty,
              question.status,
              projected.answer_count,
              projected.correct_count,
              projected.incorrect_count,
              projected.timeout_count,
              projected.correct_rate,
              projected.incorrect_rate,
              projected.has_sufficient_sample,
              projected.is_problematic
            from projected
            join public.challenge_questions question on question.id = projected.question_id
            join public.events event on event.id = projected.event_id
            )
`;

export function createQuestionPerformanceService(
  database: QuestionPerformanceDatabase,
): QuestionPerformanceService {
  return {
    async list(filters) {
      validateFilters(filters);
      const client = await database.connect();
      try {
        const offset = (filters.page - 1) * filters.pageSize;
        const result = await client.query<PerformanceRow>(
          `
            ${QUESTION_PERFORMANCE_CTES}            , page as (
              select identified.*
              from identified
              order by is_problematic desc, incorrect_rate desc,
                       answer_count desc, question_id
              limit $7 offset $8
            ), metadata as (
              select count(*)::int as total_items from identified
            )
            select page.*, metadata.total_items
            from metadata
            left join page on true
            order by page.is_problematic desc nulls last,
                     page.incorrect_rate desc nulls last,
                     page.answer_count desc nulls last,
                     page.question_id nulls last
          `,
          [
            filters.eventId ?? null,
            filters.challengeId ?? null,
            filters.format ?? null,
            filters.difficulty ?? null,
            filters.from ?? null,
            filters.to ?? null,
            filters.pageSize,
            offset,
          ],
        );
        const totalItems = result.rows[0]?.total_items ?? 0;
        return {
          items: result.rows
            .filter((row) => row.question_id !== null)
            .map(mapItem),
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / filters.pageSize),
          minimumSampleSize: QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE,
          problematicIncorrectRate:
            QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD,
        };
      } finally {
        client.release();
      }
    },
  };
}

function mapItem(row: PerformanceRow): QuestionPerformanceItem {
  const correctRate = row.correct_count / row.answer_count;
  const incorrectRate = row.incorrect_count / row.answer_count;
  const hasSufficientSample =
    row.answer_count >= QUESTION_PERFORMANCE_MINIMUM_SAMPLE_SIZE;
  return {
    questionId: row.question_id,
    challengeId: row.challenge_id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    prompt: row.prompt,
    format: row.format,
    difficulty: row.difficulty,
    status: row.status,
    answerCount: row.answer_count,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    timeoutCount: row.timeout_count,
    correctRate,
    incorrectRate,
    hasSufficientSample,
    isProblematic:
      hasSufficientSample &&
      incorrectRate >= QUESTION_PERFORMANCE_INCORRECT_RATE_THRESHOLD,
  };
}

function validateFilters(filters: QuestionPerformanceFilters): void {
  if (!Number.isInteger(filters.page) || filters.page < 1) {
    throw new InvalidQuestionPerformanceFiltersError(
      'page must be a positive integer.',
    );
  }
  if (
    !Number.isInteger(filters.pageSize) ||
    filters.pageSize < 1 ||
    filters.pageSize > 100
  ) {
    throw new InvalidQuestionPerformanceFiltersError(
      'pageSize must be between 1 and 100.',
    );
  }
  if (
    filters.from !== undefined &&
    filters.to !== undefined &&
    Date.parse(filters.from) >= Date.parse(filters.to)
  ) {
    throw new InvalidQuestionPerformanceFiltersError(
      'from must be earlier than to.',
    );
  }
}
