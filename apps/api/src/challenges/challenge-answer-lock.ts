import type pg from 'pg';

import { classifyChallengeAnswerTiming } from './challenge-answer-timing.js';

export interface ChallengeAnswerLockQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface LockChallengeAnswerInput {
  playerId: string;
  attemptId: string;
  attemptQuestionId: string;
  choiceId: string;
  receivedAt: Date;
}

export type ChallengeAnswerFinalizationReason = 'answered' | 'timeout';

export type ChallengeAnswerLockResult =
  | {
      outcome: 'accepted';
      answeredCount: number;
      finalizationReason: 'answered' | null;
    }
  | {
      outcome: 'idempotent';
      answeredCount: number;
      finalizationReason: 'answered' | null;
    }
  | {
      outcome: 'completed_retry';
    }
  | {
      outcome: 'expired';
      finalizationReason: 'timeout';
    };

interface AttemptRow extends pg.QueryResultRow {
  deadline: Date;
  status: 'in_progress' | 'completed';
}

interface AnswerBindingRow extends pg.QueryResultRow {
  attempt_question_id: string;
  choice_id: string | null;
  selected_choice_id: string | null;
}

interface AnswerCountRow extends pg.QueryResultRow {
  answered_count: number;
}

export class ChallengeAttemptNotFoundError extends Error {
  constructor() {
    super('The requested challenge attempt was not found.');
    this.name = 'ChallengeAttemptNotFoundError';
  }
}

export class InvalidChallengeAnswerError extends Error {
  constructor() {
    super(
      'The submitted question and choice do not belong to the requested attempt.',
    );
    this.name = 'InvalidChallengeAnswerError';
  }
}

export class ChallengeAnswerLockedError extends Error {
  constructor() {
    super('This challenge question already has a different locked answer.');
    this.name = 'ChallengeAnswerLockedError';
  }
}

export class ChallengeAttemptCompletedError extends Error {
  constructor() {
    super('The challenge attempt is already completed.');
    this.name = 'ChallengeAttemptCompletedError';
  }
}

/**
 * Locks and validates one answer inside a caller-owned transaction.
 *
 * The caller MUST NOT commit a result whose finalizationReason is non-null
 * without first performing the atomic completion/reward finalization in the
 * same transaction.
 */
export async function lockChallengeAnswer(
  database: ChallengeAnswerLockQueryable,
  input: LockChallengeAnswerInput,
): Promise<ChallengeAnswerLockResult> {
  const attemptResult = await database.query<AttemptRow>(
    `
      select
        attempt.status,
        attempt.deadline
      from public.challenge_attempts attempt
      where attempt.id = $1::uuid
        and attempt.player_id = $2::uuid
      for update
    `,
    [input.attemptId, input.playerId],
  );

  const attempt = attemptResult.rows[0];

  if (!attempt) {
    throw new ChallengeAttemptNotFoundError();
  }

  if (attempt.status === 'completed') {
    const existing = await loadAnswerBinding(database, input);

    if (existing && existing.selected_choice_id === input.choiceId) {
      return {
        outcome: 'completed_retry',
      };
    }

    throw new ChallengeAttemptCompletedError();
  }

  if (
    classifyChallengeAnswerTiming(input.receivedAt, attempt.deadline) ===
    'expired'
  ) {
    return {
      outcome: 'expired',
      finalizationReason: 'timeout',
    };
  }

  const binding = await loadAnswerBinding(database, input);

  if (!binding || binding.choice_id === null) {
    throw new InvalidChallengeAnswerError();
  }

  if (binding.selected_choice_id !== null) {
    const answeredCount = await countAnswers(database, input.attemptId);

    if (binding.selected_choice_id === input.choiceId) {
      return {
        outcome: 'idempotent',
        answeredCount,
        finalizationReason: answeredCount === 5 ? 'answered' : null,
      };
    }

    throw new ChallengeAnswerLockedError();
  }

  await database.query(
    `
      insert into public.attempt_answers (
        attempt_question_id,
        selected_choice_id,
        answered_at
      ) values ($1::uuid, $2::uuid, $3::timestamptz)
    `,
    [input.attemptQuestionId, input.choiceId, input.receivedAt.toISOString()],
  );

  const answeredCount = await countAnswers(database, input.attemptId);

  if (answeredCount < 1 || answeredCount > 5) {
    throw new Error('Persisted challenge attempt has an invalid answer count.');
  }

  return {
    outcome: 'accepted',
    answeredCount,
    finalizationReason: answeredCount === 5 ? 'answered' : null,
  };
}

async function loadAnswerBinding(
  database: ChallengeAnswerLockQueryable,
  input: Pick<
    LockChallengeAnswerInput,
    'attemptId' | 'attemptQuestionId' | 'choiceId'
  >,
): Promise<AnswerBindingRow | null> {
  const result = await database.query<AnswerBindingRow>(
    `
      select
        question.id::text as attempt_question_id,
        choice.id::text as choice_id,
        answer.selected_choice_id::text as selected_choice_id
      from public.attempt_questions question
      left join public.attempt_question_choices choice
        on choice.attempt_question_id = question.id
       and choice.id = $3::uuid
      left join public.attempt_answers answer
        on answer.attempt_question_id = question.id
      where question.id = $2::uuid
        and question.attempt_id = $1::uuid
    `,
    [input.attemptId, input.attemptQuestionId, input.choiceId],
  );

  return result.rows[0] ?? null;
}

async function countAnswers(
  database: ChallengeAnswerLockQueryable,
  attemptId: string,
): Promise<number> {
  const result = await database.query<AnswerCountRow>(
    `
      select count(answer.attempt_question_id)::int as answered_count
      from public.attempt_questions question
      join public.attempt_answers answer
        on answer.attempt_question_id = question.id
      where question.attempt_id = $1::uuid
    `,
    [attemptId],
  );

  return result.rows[0]?.answered_count ?? 0;
}
