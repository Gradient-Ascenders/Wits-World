import type pg from 'pg';

export interface ChallengeAttemptMarkingResult {
  totalQuestions: 5;
  answeredCount: number;
  scoreCorrect: number;
}

export interface ChallengeAttemptMarkingQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface MarkingRow extends pg.QueryResultRow {
  answered_count: number;
  answer_key_count: number;
  question_count: number;
  score_correct: number;
}

export class InvalidChallengeMarkingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChallengeMarkingStateError';
  }
}

export async function calculateChallengeAttemptScore(
  database: ChallengeAttemptMarkingQueryable,
  attemptId: string,
): Promise<ChallengeAttemptMarkingResult> {
  const result = await database.query<MarkingRow>(
    `
      select
        count(question.id)::int as question_count,
        count(*) filter (
          where (
            challenge.format = 'multiple_choice'
            and exists (
              select 1
              from private.challenge_answer_keys answer_key
              where answer_key.question_id = question.source_question_id
            )
          ) or (
            challenge.format = 'ordering'
            and (
              select count(*)
              from private.challenge_ordering_answer_keys answer_key
              where answer_key.question_id = question.source_question_id
            ) = 4
          )
        )::int as answer_key_count,
        count(*) filter (
          where (
            challenge.format = 'multiple_choice'
            and exists (
              select 1
              from public.attempt_answers answer
              where answer.attempt_question_id = question.id
            )
          ) or (
            challenge.format = 'ordering'
            and exists (
              select 1
              from public.attempt_ordering_answers answer
              where answer.attempt_question_id = question.id
            )
          )
        )::int as answered_count,
        count(*) filter (
          where (
            challenge.format = 'multiple_choice'
            and exists (
              select 1
              from public.attempt_answers answer
              join public.attempt_question_choices selected_choice
                on selected_choice.attempt_question_id = question.id
               and selected_choice.id = answer.selected_choice_id
              join private.challenge_answer_keys answer_key
                on answer_key.question_id = question.source_question_id
               and answer_key.accepted_choice_id = selected_choice.source_choice_id
              where answer.attempt_question_id = question.id
            )
          ) or (
            challenge.format = 'ordering'
            and (
              select count(*)
              from public.attempt_ordering_answer_items answer_item
              join public.attempt_question_ordering_items selected_item
                on selected_item.attempt_question_id = question.id
               and selected_item.id = answer_item.selected_item_id
              join private.challenge_ordering_answer_keys answer_key
                on answer_key.question_id = question.source_question_id
               and answer_key.item_id = selected_item.source_item_id
               and answer_key.correct_position = answer_item.submitted_position
              where answer_item.attempt_question_id = question.id
            ) = 4
          )
        )::int as score_correct
      from public.attempt_questions question
      join public.challenge_attempts attempt
        on attempt.id = question.attempt_id
      join public.event_challenges challenge
        on challenge.id = attempt.challenge_id
      where question.attempt_id = $1::uuid
    `,
    [attemptId],
  );

  const row = result.rows[0];

  if (
    !row ||
    row.question_count !== 5 ||
    row.answer_key_count !== 5 ||
    row.answered_count < 0 ||
    row.answered_count > 5 ||
    row.score_correct < 0 ||
    row.score_correct > row.answered_count
  ) {
    throw new InvalidChallengeMarkingStateError(
      'Challenge attempt cannot be marked from its persisted state.',
    );
  }

  return {
    totalQuestions: 5,
    answeredCount: row.answered_count,
    scoreCorrect: row.score_correct,
  };
}
