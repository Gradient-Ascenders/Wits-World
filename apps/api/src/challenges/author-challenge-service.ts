import type pg from 'pg';

export type AuthorChallengeStatus = 'draft' | 'published' | 'retired';
export type AuthorQuestionStatus = 'draft' | 'published' | 'retired';
export type ChallengeFormat = 'multiple_choice' | 'ordering';

export interface AuthorChallenge {
  challengeId: string;
  eventId: string;
  format: ChallengeFormat;
  status: AuthorChallengeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorQuestionChoice {
  choiceId: string;
  position: number;
  text: string;
}

interface AuthorChallengeQuestionBase {
  questionId: string;
  challengeId: string;
  format: ChallengeFormat;
  prompt: string;
  difficulty: 1 | 2 | 3;
  explanation: string | null;
  status: AuthorQuestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorMultipleChoiceQuestion extends AuthorChallengeQuestionBase {
  format: 'multiple_choice';
  choices: AuthorQuestionChoice[];
  acceptedChoiceId: string | null;
  acceptedChoicePosition: number | null;
}

export interface AuthorOrderingItem {
  itemId: string;
  position: number;
  text: string;
}

export interface AuthorOrderingQuestion extends AuthorChallengeQuestionBase {
  format: 'ordering';
  items: AuthorOrderingItem[];
}

export type AuthorChallengeQuestion =
  AuthorMultipleChoiceQuestion | AuthorOrderingQuestion;

export interface CreateAuthorChallengeInput {
  actorPlayerId: string;
  eventId: string;
  format?: ChallengeFormat;
}

interface AuthorQuestionInputBase {
  actorPlayerId: string;
  prompt: string;
  difficulty: 1 | 2 | 3;
  explanation: string;
}

export interface AuthorMultipleChoiceQuestionInput extends AuthorQuestionInputBase {
  format?: 'multiple_choice';
  choices: readonly string[];
  acceptedChoicePosition: number;
}

export interface AuthorOrderingQuestionInput extends AuthorQuestionInputBase {
  format: 'ordering';
  items: readonly string[];
}

export type AuthorQuestionInput =
  AuthorMultipleChoiceQuestionInput | AuthorOrderingQuestionInput;

type NormalizedAuthorQuestionInput =
  | (Omit<AuthorMultipleChoiceQuestionInput, 'format'> & {
      format: 'multiple_choice';
    })
  | AuthorOrderingQuestionInput;

export type CreateAuthorQuestionInput = AuthorQuestionInput & {
  challengeId: string;
};

export type UpdateAuthorQuestionInput = AuthorQuestionInput & {
  questionId: string;
};

export interface AuthorChallengeService {
  listChallenges(eventId: string): Promise<AuthorChallenge[]>;
  createChallenge(input: CreateAuthorChallengeInput): Promise<AuthorChallenge>;

  listQuestions(challengeId: string): Promise<AuthorChallengeQuestion[]>;
  createQuestion(
    input: CreateAuthorQuestionInput,
  ): Promise<AuthorChallengeQuestion>;
  updateQuestion(
    input: UpdateAuthorQuestionInput,
  ): Promise<AuthorChallengeQuestion>;

  publishQuestion(
    actorPlayerId: string,
    questionId: string,
  ): Promise<AuthorChallengeQuestion>;
  retireQuestion(
    actorPlayerId: string,
    questionId: string,
  ): Promise<AuthorChallengeQuestion>;

  publishChallenge(
    actorPlayerId: string,
    challengeId: string,
  ): Promise<AuthorChallenge>;
  retireChallenge(
    actorPlayerId: string,
    challengeId: string,
  ): Promise<AuthorChallenge>;
}

export interface AuthorChallengeDatabase {
  connect(): Promise<AuthorChallengeTransactionClient>;
}

export interface AuthorChallengeTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{
    rows: T[];
    rowCount?: number | null;
  }>;

  release(): void;
}

interface ChallengeRow extends pg.QueryResultRow {
  challenge_id: string;
  event_id: string;
  format: ChallengeFormat;
  status: AuthorChallengeStatus;
  created_at: Date;
  updated_at: Date;
}

interface ChallengeWithEventLockRow extends ChallengeRow {
  event_is_published: boolean;
}

interface QuestionRow extends pg.QueryResultRow {
  question_id: string;
  challenge_id: string;
  format: ChallengeFormat;
  prompt: string;
  difficulty: 1 | 2 | 3;
  explanation: string | null;
  status: AuthorQuestionStatus;
  created_at: Date;
  updated_at: Date;
  choice_id: string | null;
  choice_position: number | null;
  choice_text: string | null;
  accepted_choice_id: string | null;
  ordering_item_id: string | null;
  ordering_item_position: number | null;
  ordering_item_text: string | null;
}

interface QuestionLockRow extends pg.QueryResultRow {
  challenge_id: string;
  challenge_format: ChallengeFormat;
  challenge_status: AuthorChallengeStatus;
  question_status: AuthorQuestionStatus;
}

interface ChoiceInsertRow extends pg.QueryResultRow {
  choice_id: string;
}

interface OrderingItemInsertRow extends pg.QueryResultRow {
  item_id: string;
}

interface ReadinessRow extends pg.QueryResultRow {
  question_id: string;
  explanation: string | null;
  choice_count: number;
  answer_key_count: number;
  ordering_item_count: number;
  ordering_answer_key_count: number;
}

export class AuthorChallengeEventNotFoundError extends Error {
  constructor() {
    super('The requested event was not found.');
    this.name = 'AuthorChallengeEventNotFoundError';
  }
}

export class AuthorChallengeNotFoundError extends Error {
  constructor() {
    super('The requested challenge was not found.');
    this.name = 'AuthorChallengeNotFoundError';
  }
}

export class AuthorQuestionNotFoundError extends Error {
  constructor() {
    super('The requested question was not found.');
    this.name = 'AuthorQuestionNotFoundError';
  }
}

export class InvalidAuthorQuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthorQuestionError';
  }
}

export class AuthorContentStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorContentStateConflictError';
  }
}

export class AuthorContentNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorContentNotReadyError';
  }
}

export function createAuthorChallengeService(
  database: AuthorChallengeDatabase,
): AuthorChallengeService {
  return {
    async listChallenges(eventId) {
      const client = await database.connect();

      try {
        await requireEvent(client, eventId);

        const result = await client.query<ChallengeRow>(
          `
            select
              challenge.id::text as challenge_id,
              challenge.event_id::text as event_id,
              challenge.format,
              challenge.status,
              challenge.created_at,
              challenge.updated_at
            from public.event_challenges challenge
            where challenge.event_id = $1::uuid
            order by challenge.created_at, challenge.id
          `,
          [eventId],
        );

        return result.rows.map(mapChallenge);
      } finally {
        client.release();
      }
    },

    async createChallenge(input) {
      return withTransaction(database, async (client) => {
        await lockEvent(client, input.eventId);

        const result = await client.query<ChallengeRow>(
          `
            insert into public.event_challenges (
              event_id,
              format
            )
            values ($1::uuid, $2)
            returning
              id::text as challenge_id,
              event_id::text as event_id,
              format,
              status,
              created_at,
              updated_at
          `,
          [input.eventId, input.format ?? 'multiple_choice'],
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error(
            'Challenge creation did not return the created challenge.',
          );
        }

        await insertAudit(
          client,
          input.actorPlayerId,
          'challenge',
          row.challenge_id,
          'create',
        );

        return mapChallenge(row);
      });
    },

    async listQuestions(challengeId) {
      const client = await database.connect();

      try {
        await requireChallenge(client, challengeId);

        return loadQuestions(client, challengeId);
      } finally {
        client.release();
      }
    },

    async createQuestion(input) {
      const validated = validateQuestionInput(input);

      return withTransaction(database, async (client) => {
        const challenge = await lockChallenge(client, input.challengeId);

        if (challenge.status === 'retired') {
          throw new AuthorContentStateConflictError(
            'Questions cannot be added to a retired challenge.',
          );
        }

        if (challenge.format !== validated.format) {
          throw new InvalidAuthorQuestionError(
            'Question format must match its challenge format.',
          );
        }

        const result = await client.query<{
          question_id: string;
        }>(
          `
            insert into public.challenge_questions (
              challenge_id,
              prompt,
              difficulty,
              explanation
            )
            values (
              $1::uuid,
              $2,
              $3,
              $4
            )
            returning id::text as question_id
          `,
          [
            input.challengeId,
            validated.prompt,
            validated.difficulty,
            validated.explanation,
          ],
        );

        const questionId = result.rows[0]?.question_id;

        if (!questionId) {
          throw new Error(
            'Question creation did not return the created question.',
          );
        }

        if (validated.format === 'multiple_choice') {
          await replaceQuestionChoices(
            client,
            questionId,
            validated.choices,
            validated.acceptedChoicePosition,
          );
        } else {
          await replaceQuestionOrderingItems(
            client,
            questionId,
            validated.items,
          );
        }

        await insertAudit(
          client,
          input.actorPlayerId,
          'question',
          questionId,
          'create',
        );

        return requireLoadedQuestion(client, questionId);
      });
    },

    async updateQuestion(input) {
      const validated = validateQuestionInput(input);

      return withTransaction(database, async (client) => {
        const locked = await lockQuestion(client, input.questionId);

        if (locked.question_status !== 'draft') {
          throw new AuthorContentStateConflictError(
            'Published or retired questions cannot be edited; create a replacement question instead.',
          );
        }

        if (locked.challenge_status === 'retired') {
          throw new AuthorContentStateConflictError(
            'Questions in a retired challenge cannot be edited.',
          );
        }

        if (locked.challenge_format !== validated.format) {
          throw new InvalidAuthorQuestionError(
            'Question format must match its challenge format.',
          );
        }

        await client.query(
          `
            update public.challenge_questions
            set
              prompt = $2,
              difficulty = $3,
              explanation = $4,
              updated_at = now()
            where id = $1::uuid
          `,
          [
            input.questionId,
            validated.prompt,
            validated.difficulty,
            validated.explanation,
          ],
        );

        if (validated.format === 'multiple_choice') {
          await client.query(
            `delete from private.challenge_answer_keys
             where question_id = $1::uuid`,
            [input.questionId],
          );
          await client.query(
            `delete from public.challenge_choices
             where question_id = $1::uuid`,
            [input.questionId],
          );
          await replaceQuestionChoices(
            client,
            input.questionId,
            validated.choices,
            validated.acceptedChoicePosition,
          );
        } else {
          await client.query(
            `delete from private.challenge_ordering_answer_keys
             where question_id = $1::uuid`,
            [input.questionId],
          );
          await client.query(
            `delete from public.challenge_ordering_items
             where question_id = $1::uuid`,
            [input.questionId],
          );
          await replaceQuestionOrderingItems(
            client,
            input.questionId,
            validated.items,
          );
        }

        await insertAudit(
          client,
          input.actorPlayerId,
          'question',
          input.questionId,
          'edit',
        );

        return requireLoadedQuestion(client, input.questionId);
      });
    },

    async publishQuestion(actorPlayerId, questionId) {
      return withTransaction(database, async (client) => {
        const locked = await lockQuestion(client, questionId);

        if (locked.question_status !== 'draft') {
          throw new AuthorContentStateConflictError(
            'Only a draft question can be published.',
          );
        }

        if (locked.challenge_status === 'retired') {
          throw new AuthorContentStateConflictError(
            'A question in a retired challenge cannot be published.',
          );
        }

        const readiness = await loadQuestionReadiness(client, questionId);

        if (
          !isQuestionReady(locked.challenge_format, readiness) ||
          readiness.explanation === null ||
          readiness.explanation.trim().length === 0
        ) {
          throw new AuthorContentNotReadyError(
            'A question requires four format-appropriate items, a complete private answer, and an explanation before publication.',
          );
        }

        await client.query(
          `
            update public.challenge_questions
            set
              status = 'published',
              updated_at = now()
            where id = $1::uuid
          `,
          [questionId],
        );

        await insertAudit(
          client,
          actorPlayerId,
          'question',
          questionId,
          'publish',
        );

        return requireLoadedQuestion(client, questionId);
      });
    },

    async retireQuestion(actorPlayerId, questionId) {
      return withTransaction(database, async (client) => {
        const locked = await lockQuestion(client, questionId);

        if (locked.question_status === 'retired') {
          throw new AuthorContentStateConflictError(
            'The question is already retired.',
          );
        }

        if (
          locked.challenge_status === 'published' &&
          locked.question_status === 'published'
        ) {
          const remaining = await client.query<{
            published_count: number;
          }>(
            `
              select count(*)::int as published_count
              from public.challenge_questions
              where challenge_id = $1::uuid
                and status = 'published'
                and id <> $2::uuid
            `,
            [locked.challenge_id, questionId],
          );

          if ((remaining.rows[0]?.published_count ?? 0) < 5) {
            throw new AuthorContentNotReadyError(
              'Retiring this question would leave the published challenge with fewer than five published questions.',
            );
          }
        }

        await client.query(
          `
            update public.challenge_questions
            set
              status = 'retired',
              updated_at = now()
            where id = $1::uuid
          `,
          [questionId],
        );

        await insertAudit(
          client,
          actorPlayerId,
          'question',
          questionId,
          'retire',
        );

        return requireLoadedQuestion(client, questionId);
      });
    },

    async publishChallenge(actorPlayerId, challengeId) {
      return withTransaction(database, async (client) => {
        const challenge = await lockChallengeWithEvent(client, challengeId);

        if (challenge.status !== 'draft') {
          throw new AuthorContentStateConflictError(
            'Only a draft challenge can be published.',
          );
        }

        const existingPublished = await client.query<{
          challenge_id: string;
        }>(
          `
            select id::text as challenge_id
            from public.event_challenges
            where event_id = $1::uuid
              and status = 'published'
              and id <> $2::uuid
          `,
          [challenge.event_id, challengeId],
        );

        if (existingPublished.rows.length > 0) {
          throw new AuthorContentStateConflictError(
            'The event already has a published challenge.',
          );
        }

        const readiness = await loadChallengeReadiness(client, challengeId);

        if (readiness.length < 5) {
          throw new AuthorContentNotReadyError(
            'A challenge requires at least five published questions before publication.',
          );
        }

        if (
          readiness.some(
            (question) =>
              !isQuestionReady(challenge.format, question) ||
              question.explanation === null ||
              question.explanation.trim().length === 0,
          )
        ) {
          throw new AuthorContentNotReadyError(
            'Every published question requires four format-appropriate items, a complete private answer, and an explanation.',
          );
        }

        const result = await client.query<ChallengeRow>(
          `
            update public.event_challenges
            set
              status = 'published',
              updated_at = now()
            where id = $1::uuid
            returning
              id::text as challenge_id,
              event_id::text as event_id,
              format,
              status,
              created_at,
              updated_at
          `,
          [challengeId],
        );

        const row = result.rows[0];

        if (!row) {
          throw new AuthorChallengeNotFoundError();
        }

        await insertAudit(
          client,
          actorPlayerId,
          'challenge',
          challengeId,
          'publish',
        );

        return mapChallenge(row);
      });
    },

    async retireChallenge(actorPlayerId, challengeId) {
      return withTransaction(database, async (client) => {
        const challenge = await lockChallengeWithEvent(client, challengeId);

        if (challenge.status === 'retired') {
          throw new AuthorContentStateConflictError(
            'The challenge is already retired.',
          );
        }

        if (challenge.status === 'published' && challenge.event_is_published) {
          throw new AuthorContentStateConflictError(
            'Retire the event before retiring its published challenge.',
          );
        }

        const result = await client.query<ChallengeRow>(
          `
            update public.event_challenges
            set
              status = 'retired',
              updated_at = now()
            where id = $1::uuid
            returning
              id::text as challenge_id,
              event_id::text as event_id,
              format,
              status,
              created_at,
              updated_at
          `,
          [challengeId],
        );

        const row = result.rows[0];

        if (!row) {
          throw new AuthorChallengeNotFoundError();
        }

        await insertAudit(
          client,
          actorPlayerId,
          'challenge',
          challengeId,
          'retire',
        );

        return mapChallenge(row);
      });
    },
  };
}

async function requireEvent(
  client: AuthorChallengeTransactionClient,
  eventId: string,
): Promise<void> {
  const result = await client.query(
    `
      select id
      from public.events
      where id = $1::uuid
    `,
    [eventId],
  );

  if (result.rows.length === 0) {
    throw new AuthorChallengeEventNotFoundError();
  }
}

async function lockEvent(
  client: AuthorChallengeTransactionClient,
  eventId: string,
): Promise<void> {
  const result = await client.query(
    `
      select id
      from public.events
      where id = $1::uuid
      for update
    `,
    [eventId],
  );

  if (result.rows.length === 0) {
    throw new AuthorChallengeEventNotFoundError();
  }
}

async function requireChallenge(
  client: AuthorChallengeTransactionClient,
  challengeId: string,
): Promise<void> {
  const result = await client.query(
    `
      select id
      from public.event_challenges
      where id = $1::uuid
    `,
    [challengeId],
  );

  if (result.rows.length === 0) {
    throw new AuthorChallengeNotFoundError();
  }
}

async function lockChallenge(
  client: AuthorChallengeTransactionClient,
  challengeId: string,
): Promise<ChallengeRow> {
  const result = await client.query<ChallengeRow>(
    `
      select
        challenge.id::text as challenge_id,
        challenge.event_id::text as event_id,
        challenge.format,
        challenge.status,
        challenge.created_at,
        challenge.updated_at
      from public.event_challenges challenge
      where challenge.id = $1::uuid
      for update
    `,
    [challengeId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorChallengeNotFoundError();
  }

  return row;
}

async function lockChallengeWithEvent(
  client: AuthorChallengeTransactionClient,
  challengeId: string,
): Promise<ChallengeWithEventLockRow> {
  const result = await client.query<ChallengeWithEventLockRow>(
    `
      select
        challenge.id::text as challenge_id,
        challenge.event_id::text as event_id,
        challenge.format,
        challenge.status,
        challenge.created_at,
        challenge.updated_at,
        event.is_published as event_is_published
      from public.event_challenges challenge
      join public.events event
        on event.id = challenge.event_id
      where challenge.id = $1::uuid
      for update of event, challenge
    `,
    [challengeId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorChallengeNotFoundError();
  }

  return row;
}

async function lockQuestion(
  client: AuthorChallengeTransactionClient,
  questionId: string,
): Promise<QuestionLockRow> {
  const result = await client.query<QuestionLockRow>(
    `
      select
        question.challenge_id::text as challenge_id,
        challenge.format as challenge_format,
        question.status as question_status,
        challenge.status as challenge_status
      from public.challenge_questions question
      join public.event_challenges challenge
        on challenge.id = question.challenge_id
      where question.id = $1::uuid
      for update of challenge, question
    `,
    [questionId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorQuestionNotFoundError();
  }

  return row;
}

async function replaceQuestionChoices(
  client: AuthorChallengeTransactionClient,
  questionId: string,
  choices: readonly string[],
  acceptedChoicePosition: number,
): Promise<void> {
  const choiceIds: string[] = [];

  for (const [index, choice] of choices.entries()) {
    const result = await client.query<ChoiceInsertRow>(
      `
        insert into public.challenge_choices (
          question_id,
          authoring_position,
          choice_text
        )
        values (
          $1::uuid,
          $2,
          $3
        )
        returning id::text as choice_id
      `,
      [questionId, index + 1, choice],
    );

    const choiceId = result.rows[0]?.choice_id;

    if (!choiceId) {
      throw new Error(
        'Question choice creation did not return its identifier.',
      );
    }

    choiceIds.push(choiceId);
  }

  const acceptedChoiceId = choiceIds[acceptedChoicePosition - 1];

  if (!acceptedChoiceId) {
    throw new Error('Accepted choice position could not be resolved.');
  }

  await client.query(
    `
      insert into private.challenge_answer_keys (
        question_id,
        accepted_choice_id
      )
      values (
        $1::uuid,
        $2::uuid
      )
    `,
    [questionId, acceptedChoiceId],
  );
}

async function replaceQuestionOrderingItems(
  client: AuthorChallengeTransactionClient,
  questionId: string,
  items: readonly string[],
): Promise<void> {
  for (const [index, item] of items.entries()) {
    const result = await client.query<OrderingItemInsertRow>(
      `
        insert into public.challenge_ordering_items (
          question_id,
          item_text
        )
        values ($1::uuid, $2)
        returning id::text as item_id
      `,
      [questionId, item],
    );

    const itemId = result.rows[0]?.item_id;

    if (!itemId) {
      throw new Error('Ordering item creation did not return its identifier.');
    }

    await client.query(
      `
        insert into private.challenge_ordering_answer_keys (
          question_id,
          item_id,
          correct_position
        )
        values ($1::uuid, $2::uuid, $3)
      `,
      [questionId, itemId, index + 1],
    );
  }
}

async function loadQuestions(
  client: AuthorChallengeTransactionClient,
  challengeId: string,
): Promise<AuthorChallengeQuestion[]> {
  const result = await client.query<QuestionRow>(
    `
      select
        question.id::text as question_id,
        question.challenge_id::text as challenge_id,
        challenge.format,
        question.prompt,
        question.difficulty,
        question.explanation,
        question.status,
        question.created_at,
        question.updated_at,
        choice.id::text as choice_id,
        choice.authoring_position as choice_position,
        choice.choice_text,
        answer_key.accepted_choice_id::text as accepted_choice_id,
        ordering_item.id::text as ordering_item_id,
        ordering_key.correct_position as ordering_item_position,
        ordering_item.item_text as ordering_item_text
      from public.challenge_questions question
      join public.event_challenges challenge
        on challenge.id = question.challenge_id
      left join public.challenge_choices choice
        on choice.question_id = question.id
      left join private.challenge_answer_keys answer_key
        on answer_key.question_id = question.id
      left join public.challenge_ordering_items ordering_item
        on ordering_item.question_id = question.id
      left join private.challenge_ordering_answer_keys ordering_key
        on ordering_key.question_id = question.id
       and ordering_key.item_id = ordering_item.id
      where question.challenge_id = $1::uuid
      order by
        question.created_at,
        question.id,
        coalesce(choice.authoring_position, ordering_key.correct_position)
    `,
    [challengeId],
  );

  return mapQuestionRows(result.rows);
}

async function requireLoadedQuestion(
  client: AuthorChallengeTransactionClient,
  questionId: string,
): Promise<AuthorChallengeQuestion> {
  const result = await client.query<QuestionRow>(
    `
      select
        question.id::text as question_id,
        question.challenge_id::text as challenge_id,
        challenge.format,
        question.prompt,
        question.difficulty,
        question.explanation,
        question.status,
        question.created_at,
        question.updated_at,
        choice.id::text as choice_id,
        choice.authoring_position as choice_position,
        choice.choice_text,
        answer_key.accepted_choice_id::text as accepted_choice_id,
        ordering_item.id::text as ordering_item_id,
        ordering_key.correct_position as ordering_item_position,
        ordering_item.item_text as ordering_item_text
      from public.challenge_questions question
      join public.event_challenges challenge
        on challenge.id = question.challenge_id
      left join public.challenge_choices choice
        on choice.question_id = question.id
      left join private.challenge_answer_keys answer_key
        on answer_key.question_id = question.id
      left join public.challenge_ordering_items ordering_item
        on ordering_item.question_id = question.id
      left join private.challenge_ordering_answer_keys ordering_key
        on ordering_key.question_id = question.id
       and ordering_key.item_id = ordering_item.id
      where question.id = $1::uuid
      order by coalesce(choice.authoring_position, ordering_key.correct_position)
    `,
    [questionId],
  );

  const question = mapQuestionRows(result.rows)[0];

  if (!question) {
    throw new AuthorQuestionNotFoundError();
  }

  return question;
}

function mapQuestionRows(
  rows: readonly QuestionRow[],
): AuthorChallengeQuestion[] {
  const questions = new Map<string, AuthorChallengeQuestion>();

  for (const row of rows) {
    let question = questions.get(row.question_id);

    if (!question) {
      const common = {
        questionId: row.question_id,
        challengeId: row.challenge_id,
        format: row.format,
        prompt: row.prompt,
        difficulty: row.difficulty,
        explanation: row.explanation,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };

      question =
        row.format === 'multiple_choice'
          ? {
              ...common,
              format: 'multiple_choice',
              choices: [],
              acceptedChoiceId: row.accepted_choice_id,
              acceptedChoicePosition: null,
            }
          : {
              ...common,
              format: 'ordering',
              items: [],
            };

      questions.set(row.question_id, question);
    }

    if (
      question.format === 'multiple_choice' &&
      row.choice_id !== null &&
      row.choice_position !== null &&
      row.choice_text !== null
    ) {
      question.choices.push({
        choiceId: row.choice_id,
        position: row.choice_position,
        text: row.choice_text,
      });

      if (row.choice_id === row.accepted_choice_id) {
        question.acceptedChoicePosition = row.choice_position;
      }
    }

    if (
      question.format === 'ordering' &&
      row.ordering_item_id !== null &&
      row.ordering_item_position !== null &&
      row.ordering_item_text !== null
    ) {
      question.items.push({
        itemId: row.ordering_item_id,
        position: row.ordering_item_position,
        text: row.ordering_item_text,
      });
    }
  }

  return [...questions.values()];
}

async function loadQuestionReadiness(
  client: AuthorChallengeTransactionClient,
  questionId: string,
): Promise<ReadinessRow> {
  const result = await client.query<ReadinessRow>(
    `
      select
        question.id::text as question_id,
        question.explanation,
        (
          select count(*)::int
          from public.challenge_choices choice
          where choice.question_id = question.id
        ) as choice_count,
        (
          select count(*)::int
          from private.challenge_answer_keys answer_key
          where answer_key.question_id = question.id
        ) as answer_key_count,
        (
          select count(*)::int
          from public.challenge_ordering_items item
          where item.question_id = question.id
        ) as ordering_item_count,
        (
          select count(*)::int
          from private.challenge_ordering_answer_keys answer_key
          where answer_key.question_id = question.id
        ) as ordering_answer_key_count
      from public.challenge_questions question
      where question.id = $1::uuid
    `,
    [questionId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorQuestionNotFoundError();
  }

  return row;
}

async function loadChallengeReadiness(
  client: AuthorChallengeTransactionClient,
  challengeId: string,
): Promise<ReadinessRow[]> {
  const result = await client.query<ReadinessRow>(
    `
      select
        question.id::text as question_id,
        question.explanation,
        (
          select count(*)::int
          from public.challenge_choices choice
          where choice.question_id = question.id
        ) as choice_count,
        (
          select count(*)::int
          from private.challenge_answer_keys answer_key
          where answer_key.question_id = question.id
        ) as answer_key_count,
        (
          select count(*)::int
          from public.challenge_ordering_items item
          where item.question_id = question.id
        ) as ordering_item_count,
        (
          select count(*)::int
          from private.challenge_ordering_answer_keys answer_key
          where answer_key.question_id = question.id
        ) as ordering_answer_key_count
      from public.challenge_questions question
      where question.challenge_id = $1::uuid
        and question.status = 'published'
      order by question.id
    `,
    [challengeId],
  );

  return result.rows;
}

function validateQuestionInput(
  input: AuthorQuestionInput,
): NormalizedAuthorQuestionInput {
  const prompt = input.prompt.trim();

  if (prompt.length === 0) {
    throw new InvalidAuthorQuestionError('Question prompt must not be blank.');
  }

  if (
    !Number.isInteger(input.difficulty) ||
    input.difficulty < 1 ||
    input.difficulty > 3
  ) {
    throw new InvalidAuthorQuestionError(
      'Question difficulty must be 1, 2, or 3.',
    );
  }

  const explanation = input.explanation.trim();

  if (explanation.length === 0) {
    throw new InvalidAuthorQuestionError(
      'Question explanation must not be blank.',
    );
  }

  if (input.format !== 'ordering') {
    if (input.choices.length !== 4) {
      throw new InvalidAuthorQuestionError(
        'A multiple-choice question must define exactly four choices.',
      );
    }

    const choices = input.choices.map((choice) => choice.trim());

    if (choices.some((choice) => choice.length === 0)) {
      throw new InvalidAuthorQuestionError(
        'Question choices must not be blank.',
      );
    }

    if (
      !Number.isInteger(input.acceptedChoicePosition) ||
      input.acceptedChoicePosition < 1 ||
      input.acceptedChoicePosition > 4
    ) {
      throw new InvalidAuthorQuestionError(
        'Accepted choice position must be between 1 and 4.',
      );
    }

    return {
      ...input,
      format: 'multiple_choice',
      prompt,
      explanation,
      choices,
    };
  }

  if (input.items.length !== 4) {
    throw new InvalidAuthorQuestionError(
      'An ordering question must define exactly four items.',
    );
  }

  const items = input.items.map((item) => item.trim());

  if (items.some((item) => item.length === 0)) {
    throw new InvalidAuthorQuestionError(
      'Ordering question items must not be blank.',
    );
  }

  return { ...input, prompt, explanation, items };
}

function isQuestionReady(
  format: ChallengeFormat,
  readiness: ReadinessRow,
): boolean {
  return format === 'multiple_choice'
    ? readiness.choice_count === 4 &&
        readiness.answer_key_count === 1 &&
        readiness.ordering_item_count === 0 &&
        readiness.ordering_answer_key_count === 0
    : readiness.choice_count === 0 &&
        readiness.answer_key_count === 0 &&
        readiness.ordering_item_count === 4 &&
        readiness.ordering_answer_key_count === 4;
}

async function insertAudit(
  client: AuthorChallengeTransactionClient,
  actorPlayerId: string,
  entityType: 'challenge' | 'question',
  entityId: string,
  action: 'create' | 'edit' | 'publish' | 'retire',
): Promise<void> {
  await client.query(
    `
      insert into public.author_content_audit (
        actor_player_id,
        entity_type,
        entity_id,
        action
      )
      values (
        $1::uuid,
        $2,
        $3::uuid,
        $4
      )
    `,
    [actorPlayerId, entityType, entityId, action],
  );
}

function mapChallenge(row: ChallengeRow): AuthorChallenge {
  return {
    challengeId: row.challenge_id,
    eventId: row.event_id,
    format: row.format,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function withTransaction<T>(
  database: AuthorChallengeDatabase,
  operation: (client: AuthorChallengeTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();

  try {
    await client.query('begin');

    const result = await operation(client);

    await client.query('commit');

    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original operation failure.
    }

    throw error;
  } finally {
    client.release();
  }
}
