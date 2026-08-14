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
        count(answer_key.question_id)::int as answer_key_count,
        count(answer.selected_choice_id)::int as answered_count,
        count(*) filter (
          where answer.selected_choice_id is not null
            and selected_choice.source_choice_id =
              answer_key.accepted_choice_id
        )::int as score_correct
      from public.attempt_questions question
      left join public.attempt_answers answer
        on answer.attempt_question_id = question.id
      left join public.attempt_question_choices selected_choice
        on selected_choice.attempt_question_id = question.id
       and selected_choice.id = answer.selected_choice_id
      left join private.challenge_answer_keys answer_key
        on answer_key.question_id = question.source_question_id
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
