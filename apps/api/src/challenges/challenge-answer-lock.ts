import type pg from 'pg';

import { classifyChallengeAnswerTiming } from './challenge-answer-timing.js';

export interface ChallengeAnswerLockQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface LockChallengeAnswerInputBase {
  playerId: string;
  attemptId: string;
  attemptQuestionId: string;
  receivedAt: Date;
}

export type LockChallengeAnswerInput =
  | (LockChallengeAnswerInputBase & {
      format?: 'multiple_choice';
      choiceId: string;
    })
  | (LockChallengeAnswerInputBase & {
      format: 'ordering';
      itemIds: readonly string[];
    });

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
  format: 'multiple_choice' | 'ordering';
  status: 'in_progress' | 'completed';
}

interface OrderingBindingRow extends pg.QueryResultRow {
  attempt_question_id: string;
  matched_item_count: number;
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
        attempt.deadline,
        challenge.format
      from public.challenge_attempts attempt
      join public.event_challenges challenge
        on challenge.id = attempt.challenge_id
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

  const submittedFormat =
    input.format === 'ordering' ? 'ordering' : 'multiple_choice';

  if (attempt.format !== submittedFormat) {
    throw new InvalidChallengeAnswerError();
  }

  if (attempt.status === 'completed') {
    const matches =
      input.format === 'ordering'
        ? await orderingAnswerMatches(database, input)
        : await multipleChoiceAnswerMatches(database, input);

    if (matches) {
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

  if (input.format === 'ordering') {
    return lockOrderingAnswer(database, input);
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

async function lockOrderingAnswer(
  database: ChallengeAnswerLockQueryable,
  input: Extract<LockChallengeAnswerInput, { format: 'ordering' }>,
): Promise<ChallengeAnswerLockResult> {
  if (input.itemIds.length !== 4 || new Set(input.itemIds).size !== 4) {
    throw new InvalidChallengeAnswerError();
  }

  const bindingResult = await database.query<OrderingBindingRow>(
    `
      select
        question.id::text as attempt_question_id,
        count(item.id)::int as matched_item_count
      from public.attempt_questions question
      left join public.attempt_question_ordering_items item
        on item.attempt_question_id = question.id
       and item.id = any($3::uuid[])
      where question.id = $2::uuid
        and question.attempt_id = $1::uuid
      group by question.id
    `,
    [input.attemptId, input.attemptQuestionId, input.itemIds],
  );

  const binding = bindingResult.rows[0];

  if (!binding || binding.matched_item_count !== 4) {
    throw new InvalidChallengeAnswerError();
  }

  const existingIds = await loadOrderingAnswerIds(
    database,
    input.attemptId,
    input.attemptQuestionId,
  );

  if (existingIds !== null) {
    const answeredCount = await countAnswers(database, input.attemptId);

    if (arraysEqual(existingIds, input.itemIds)) {
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
      insert into public.attempt_ordering_answers (
        attempt_question_id,
        answered_at
      ) values ($1::uuid, $2::timestamptz)
    `,
    [input.attemptQuestionId, input.receivedAt.toISOString()],
  );

  for (const [index, itemId] of input.itemIds.entries()) {
    await database.query(
      `
        insert into public.attempt_ordering_answer_items (
          attempt_question_id,
          selected_item_id,
          submitted_position
        ) values ($1::uuid, $2::uuid, $3)
      `,
      [input.attemptQuestionId, itemId, index + 1],
    );
  }

  const answeredCount = await countAnswers(database, input.attemptId);

  return {
    outcome: 'accepted',
    answeredCount,
    finalizationReason: answeredCount === 5 ? 'answered' : null,
  };
}

async function multipleChoiceAnswerMatches(
  database: ChallengeAnswerLockQueryable,
  input: Extract<LockChallengeAnswerInput, { choiceId: string }>,
): Promise<boolean> {
  const existing = await loadAnswerBinding(database, input);
  return existing?.selected_choice_id === input.choiceId;
}

async function orderingAnswerMatches(
  database: ChallengeAnswerLockQueryable,
  input: Extract<LockChallengeAnswerInput, { format: 'ordering' }>,
): Promise<boolean> {
  const existingIds = await loadOrderingAnswerIds(
    database,
    input.attemptId,
    input.attemptQuestionId,
  );
  return existingIds !== null && arraysEqual(existingIds, input.itemIds);
}

async function loadOrderingAnswerIds(
  database: ChallengeAnswerLockQueryable,
  attemptId: string,
  attemptQuestionId: string,
): Promise<string[] | null> {
  const result = await database.query<{
    selected_item_id: string;
  }>(
    `
      select selected_item_id::text
      from public.attempt_ordering_answer_items answer_item
      join public.attempt_questions question
        on question.id = answer_item.attempt_question_id
      where question.attempt_id = $1::uuid
        and answer_item.attempt_question_id = $2::uuid
      order by answer_item.submitted_position
    `,
    [attemptId, attemptQuestionId],
  );

  return result.rows.length === 0
    ? null
    : result.rows.map((row) => row.selected_item_id);
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function loadAnswerBinding(
  database: ChallengeAnswerLockQueryable,
  input: {
    attemptId: string;
    attemptQuestionId: string;
    choiceId: string;
  },
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
      select count(*)::int as answered_count
      from public.attempt_questions question
      where question.attempt_id = $1::uuid
        and (
          exists (
            select 1
            from public.attempt_answers answer
            where answer.attempt_question_id = question.id
          )
          or exists (
            select 1
            from public.attempt_ordering_answers answer
            where answer.attempt_question_id = question.id
          )
        )
    `,
    [attemptId],
  );

  return result.rows[0]?.answered_count ?? 0;
}
