import type pg from 'pg';

export interface PlayerSafeChallengeChoice {
  choiceId: string;
  text: string;
}

export interface PlayerSafeChallengeQuestion {
  attemptQuestionId: string;
  position: number;
  prompt: string;
  choices: PlayerSafeChallengeChoice[];
  selectedChoiceId: string | null;
  answeredAt: string | null;
}

export interface InProgressChallengeAttempt {
  attemptId: string;
  eventId: string;
  format: 'multiple_choice';
  status: 'in_progress';
  startedAt: string;
  deadline: string;
  totalQuestions: 5;
  answeredCount: number;
  questions: PlayerSafeChallengeQuestion[];
}

export interface CompletedChallengeCard {
  ownedCardId: string;
  cardDefinitionId: string;
  name: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface CompletedChallengeAttempt {
  attemptId: string;
  eventId: string;
  format: 'multiple_choice';
  status: 'completed';
  completedAt: string;
  completionReason: 'answered' | 'timeout';
  totalQuestions: 5;
  scoreCorrect: number;
  reward: {
    coinsAwarded: number;
    cards: CompletedChallengeCard[];
  };
}

export type PlayerSafeChallengeAttempt =
  InProgressChallengeAttempt | CompletedChallengeAttempt;

export interface ChallengeAttemptReader {
  findByPlayerAndEvent(
    playerId: string,
    eventId: string,
  ): Promise<PlayerSafeChallengeAttempt | null>;

  findByPlayerAndAttempt(
    playerId: string,
    attemptId: string,
  ): Promise<PlayerSafeChallengeAttempt | null>;
}

export interface ChallengeAttemptQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface AttemptRow extends pg.QueryResultRow {
  attempt_id: string;
  completed_at: Date | null;
  completion_reason: 'answered' | 'timeout' | null;
  deadline: Date;
  event_id: string;
  format: 'multiple_choice';
  score_correct: number | null;
  started_at: Date;
  status: 'in_progress' | 'completed';
}

interface AttemptQuestionRow extends pg.QueryResultRow {
  answered_at: Date | null;
  attempt_question_id: string;
  position: number;
  prompt_snapshot: string;
  selected_choice_id: string | null;
}

interface AttemptChoiceRow extends pg.QueryResultRow {
  attempt_question_id: string;
  choice_id: string;
  choice_text_snapshot: string;
  display_position: number;
}

interface CompletionRow extends pg.QueryResultRow {
  completion_id: string;
  coins_awarded: number;
}

interface RewardCardRow extends pg.QueryResultRow {
  affinity: CompletedChallengeCard['affinity'];
  card_definition_id: string;
  category: CompletedChallengeCard['category'];
  name: string;
  owned_card_id: string;
  rarity: CompletedChallengeCard['rarity'];
}

export function createChallengeAttemptReader(
  database: ChallengeAttemptQueryable,
): ChallengeAttemptReader {
  return {
    async findByPlayerAndEvent(playerId, eventId) {
      const attempt = await findAttemptByPlayerAndEvent(
        database,
        playerId,
        eventId,
      );

      if (!attempt) {
        return null;
      }

      return loadPlayerSafeAttempt(database, playerId, attempt);
    },

    async findByPlayerAndAttempt(playerId, attemptId) {
      const attempt = await findAttemptByPlayerAndAttempt(
        database,
        playerId,
        attemptId,
      );

      if (!attempt) {
        return null;
      }

      return loadPlayerSafeAttempt(database, playerId, attempt);
    },
  };
}

async function findAttemptByPlayerAndEvent(
  database: ChallengeAttemptQueryable,
  playerId: string,
  eventId: string,
): Promise<AttemptRow | null> {
  const result = await database.query<AttemptRow>(
    `
      select
        attempt.id::text as attempt_id,
        attempt.event_id::text as event_id,
        challenge.format,
        attempt.status,
        attempt.started_at,
        attempt.deadline,
        attempt.completed_at,
        attempt.completion_reason,
        attempt.score_correct
      from public.challenge_attempts attempt
      join public.event_challenges challenge
        on challenge.id = attempt.challenge_id
      where attempt.player_id = $1::uuid
        and attempt.event_id = $2::uuid
    `,
    [playerId, eventId],
  );

  return result.rows[0] ?? null;
}

async function findAttemptByPlayerAndAttempt(
  database: ChallengeAttemptQueryable,
  playerId: string,
  attemptId: string,
): Promise<AttemptRow | null> {
  const result = await database.query<AttemptRow>(
    `
      select
        attempt.id::text as attempt_id,
        attempt.event_id::text as event_id,
        challenge.format,
        attempt.status,
        attempt.started_at,
        attempt.deadline,
        attempt.completed_at,
        attempt.completion_reason,
        attempt.score_correct
      from public.challenge_attempts attempt
      join public.event_challenges challenge
        on challenge.id = attempt.challenge_id
      where attempt.player_id = $1::uuid
        and attempt.id = $2::uuid
    `,
    [playerId, attemptId],
  );

  return result.rows[0] ?? null;
}

function loadPlayerSafeAttempt(
  database: ChallengeAttemptQueryable,
  playerId: string,
  attempt: AttemptRow,
): Promise<PlayerSafeChallengeAttempt> {
  if (attempt.status === 'completed') {
    return loadCompletedAttempt(database, playerId, attempt);
  }

  return loadInProgressAttempt(database, attempt);
}

async function loadInProgressAttempt(
  database: ChallengeAttemptQueryable,
  attempt: AttemptRow,
): Promise<InProgressChallengeAttempt> {
  const questionResult = await database.query<AttemptQuestionRow>(
    `
      select
        question.id::text as attempt_question_id,
        question.position,
        question.prompt_snapshot,
        answer.selected_choice_id::text as selected_choice_id,
        answer.answered_at
      from public.attempt_questions question
      left join public.attempt_answers answer
        on answer.attempt_question_id = question.id
      where question.attempt_id = $1::uuid
      order by question.position
    `,
    [attempt.attempt_id],
  );

  const choiceResult = await database.query<AttemptChoiceRow>(
    `
      select
        choice.attempt_question_id::text as attempt_question_id,
        choice.id::text as choice_id,
        choice.display_position,
        choice.choice_text_snapshot
      from public.attempt_question_choices choice
      join public.attempt_questions question
        on question.id = choice.attempt_question_id
      where question.attempt_id = $1::uuid
      order by question.position, choice.display_position
    `,
    [attempt.attempt_id],
  );

  const choicesByQuestion = new Map<string, PlayerSafeChallengeChoice[]>();

  for (const choice of choiceResult.rows) {
    const choices = choicesByQuestion.get(choice.attempt_question_id) ?? [];

    choices.push({
      choiceId: choice.choice_id,
      text: choice.choice_text_snapshot,
    });

    choicesByQuestion.set(choice.attempt_question_id, choices);
  }

  const questions = questionResult.rows.map((question) => ({
    attemptQuestionId: question.attempt_question_id,
    position: question.position,
    prompt: question.prompt_snapshot,
    choices: choicesByQuestion.get(question.attempt_question_id) ?? [],
    selectedChoiceId: question.selected_choice_id,
    answeredAt: question.answered_at?.toISOString() ?? null,
  }));

  if (
    questions.length !== 5 ||
    questions.some((question) => question.choices.length !== 4)
  ) {
    throw new Error('Persisted challenge attempt snapshot is incomplete.');
  }

  return {
    attemptId: attempt.attempt_id,
    eventId: attempt.event_id,
    format: attempt.format,
    status: 'in_progress',
    startedAt: attempt.started_at.toISOString(),
    deadline: attempt.deadline.toISOString(),
    totalQuestions: 5,
    answeredCount: questions.filter(
      (question) => question.selectedChoiceId !== null,
    ).length,
    questions,
  };
}

async function loadCompletedAttempt(
  database: ChallengeAttemptQueryable,
  playerId: string,
  attempt: AttemptRow,
): Promise<CompletedChallengeAttempt> {
  if (
    attempt.completed_at === null ||
    attempt.completion_reason === null ||
    attempt.score_correct === null
  ) {
    throw new Error('Completed challenge attempt is missing final state.');
  }

  const completionResult = await database.query<CompletionRow>(
    `
      select
        completion.id::text as completion_id,
        completion.coins_awarded
      from public.event_completions completion
      where completion.attempt_id = $1::uuid
        and completion.player_id = $2::uuid
    `,
    [attempt.attempt_id, playerId],
  );

  const completion = completionResult.rows[0];

  if (!completion) {
    throw new Error('Completed challenge attempt is missing its completion.');
  }

  const cardResult = await database.query<RewardCardRow>(
    `
      select
        owned.id::text as owned_card_id,
        definition.id::text as card_definition_id,
        definition.name,
        definition.category,
        definition.affinity,
        definition.rarity
      from public.player_cards owned
      join public.card_definitions definition
        on definition.id = owned.card_definition_id
      where owned.player_id = $1::uuid
        and owned.source_completion_id = $2::uuid
        and owned.acquisition_kind = 'event_reward'
      order by owned.acquired_at, owned.id
    `,
    [playerId, completion.completion_id],
  );

  return {
    attemptId: attempt.attempt_id,
    eventId: attempt.event_id,
    format: attempt.format,
    status: 'completed',
    completedAt: attempt.completed_at.toISOString(),
    completionReason: attempt.completion_reason,
    totalQuestions: 5,
    scoreCorrect: attempt.score_correct,
    reward: {
      coinsAwarded: completion.coins_awarded,
      cards: cardResult.rows.map((card) => ({
        ownedCardId: card.owned_card_id,
        cardDefinitionId: card.card_definition_id,
        name: card.name,
        category: card.category,
        affinity: card.affinity,
        rarity: card.rarity,
      })),
    },
  };
}
