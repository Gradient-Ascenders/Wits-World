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

export interface PlayerSafeOrderingItem {
  itemId: string;
  text: string;
}

export interface PlayerSafeOrderingQuestion {
  attemptQuestionId: string;
  position: number;
  prompt: string;
  items: PlayerSafeOrderingItem[];
  selectedItemIds: string[] | null;
  answeredAt: string | null;
}

export interface InProgressOrderingChallengeAttempt {
  attemptId: string;
  eventId: string;
  format: 'ordering';
  status: 'in_progress';
  startedAt: string;
  deadline: string;
  totalQuestions: 5;
  answeredCount: number;
  questions: PlayerSafeOrderingQuestion[];
}

export interface CompletedChallengeCard {
  ownedCardId: string;
  cardDefinitionId: string;
  name: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface CompletedChallengeReviewEntry {
  attemptQuestionId: string;
  position: number;
  prompt: string;
  selectedChoice: PlayerSafeChallengeChoice | null;
  correctChoice: PlayerSafeChallengeChoice;
  isCorrect: boolean;
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
    cards: CompletedChallengeCard[];
  };
  review: CompletedChallengeReviewEntry[];
}

export interface CompletedOrderingReviewEntry {
  attemptQuestionId: string;
  position: number;
  prompt: string;
  selectedItems: PlayerSafeOrderingItem[] | null;
  correctItems: PlayerSafeOrderingItem[];
  isCorrect: boolean;
  explanation: string;
}

export interface CompletedOrderingChallengeAttempt {
  attemptId: string;
  eventId: string;
  format: 'ordering';
  status: 'completed';
  completedAt: string;
  completionReason: 'answered' | 'timeout';
  totalQuestions: 5;
  scoreCorrect: number;
  reward: CompletedChallengeAttempt['reward'];
  review: CompletedOrderingReviewEntry[];
}

export type PlayerSafeChallengeAttempt =
  | InProgressChallengeAttempt
  | InProgressOrderingChallengeAttempt
  | CompletedChallengeAttempt
  | CompletedOrderingChallengeAttempt;

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
  format: 'multiple_choice' | 'ordering';
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
}

interface RewardCardRow extends pg.QueryResultRow {
  affinity: CompletedChallengeCard['affinity'];
  card_definition_id: string;
  category: CompletedChallengeCard['category'];
  name: string;
  owned_card_id: string;
  rarity: CompletedChallengeCard['rarity'];
}

interface CompletedReviewRow extends pg.QueryResultRow {
  attempt_question_id: string;
  correct_choice_id: string;
  correct_choice_text: string;
  is_correct: boolean;
  position: number;
  prompt_snapshot: string;
  selected_choice_id: string | null;
  selected_choice_text: string | null;
}

interface OrderingQuestionRow extends pg.QueryResultRow {
  answered_at: Date | null;
  attempt_question_id: string;
  position: number;
  prompt_snapshot: string;
}

interface OrderingItemRow extends pg.QueryResultRow {
  attempt_question_id: string;
  display_position: number;
  item_id: string;
  item_text_snapshot: string;
}

interface OrderingAnswerItemRow extends pg.QueryResultRow {
  attempt_question_id: string;
  item_id: string;
  submitted_position: number;
}

interface CompletedOrderingItemRow extends pg.QueryResultRow {
  attempt_question_id: string;
  correct_position: number;
  explanation_snapshot: string;
  item_id: string;
  item_text_snapshot: string;
  position: number;
  prompt_snapshot: string;
  submitted_position: number | null;
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
): Promise<InProgressChallengeAttempt | InProgressOrderingChallengeAttempt> {
  if (attempt.format === 'ordering') {
    return loadInProgressOrderingAttempt(database, attempt);
  }

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

async function loadInProgressOrderingAttempt(
  database: ChallengeAttemptQueryable,
  attempt: AttemptRow,
): Promise<InProgressOrderingChallengeAttempt> {
  const questionResult = await database.query<OrderingQuestionRow>(
    `
      select
        question.id::text as attempt_question_id,
        question.position,
        question.prompt_snapshot,
        answer.answered_at
      from public.attempt_questions question
      left join public.attempt_ordering_answers answer
        on answer.attempt_question_id = question.id
      where question.attempt_id = $1::uuid
      order by question.position
    `,
    [attempt.attempt_id],
  );

  const itemResult = await database.query<OrderingItemRow>(
    `
      select
        item.attempt_question_id::text as attempt_question_id,
        item.id::text as item_id,
        item.display_position,
        item.item_text_snapshot
      from public.attempt_question_ordering_items item
      join public.attempt_questions question
        on question.id = item.attempt_question_id
      where question.attempt_id = $1::uuid
      order by question.position, item.display_position
    `,
    [attempt.attempt_id],
  );

  const answerItemResult = await database.query<OrderingAnswerItemRow>(
    `
      select
        answer_item.attempt_question_id::text as attempt_question_id,
        answer_item.selected_item_id::text as item_id,
        answer_item.submitted_position
      from public.attempt_ordering_answer_items answer_item
      join public.attempt_questions question
        on question.id = answer_item.attempt_question_id
      where question.attempt_id = $1::uuid
      order by question.position, answer_item.submitted_position
    `,
    [attempt.attempt_id],
  );

  const itemsByQuestion = new Map<string, PlayerSafeOrderingItem[]>();
  const selectedIdsByQuestion = new Map<string, string[]>();

  for (const item of itemResult.rows) {
    const items = itemsByQuestion.get(item.attempt_question_id) ?? [];
    items.push({ itemId: item.item_id, text: item.item_text_snapshot });
    itemsByQuestion.set(item.attempt_question_id, items);
  }

  for (const item of answerItemResult.rows) {
    const selected = selectedIdsByQuestion.get(item.attempt_question_id) ?? [];
    selected.push(item.item_id);
    selectedIdsByQuestion.set(item.attempt_question_id, selected);
  }

  const questions = questionResult.rows.map((question) => ({
    attemptQuestionId: question.attempt_question_id,
    position: question.position,
    prompt: question.prompt_snapshot,
    items: itemsByQuestion.get(question.attempt_question_id) ?? [],
    selectedItemIds:
      selectedIdsByQuestion.get(question.attempt_question_id) ?? null,
    answeredAt: question.answered_at?.toISOString() ?? null,
  }));

  if (
    questions.length !== 5 ||
    questions.some(
      (question) =>
        question.items.length !== 4 ||
        (question.selectedItemIds !== null &&
          question.selectedItemIds.length !== 4),
    )
  ) {
    throw new Error('Persisted ordering attempt snapshot is incomplete.');
  }

  return {
    attemptId: attempt.attempt_id,
    eventId: attempt.event_id,
    format: 'ordering',
    status: 'in_progress',
    startedAt: attempt.started_at.toISOString(),
    deadline: attempt.deadline.toISOString(),
    totalQuestions: 5,
    answeredCount: questions.filter(
      (question) => question.selectedItemIds !== null,
    ).length,
    questions,
  };
}

async function loadCompletedAttempt(
  database: ChallengeAttemptQueryable,
  playerId: string,
  attempt: AttemptRow,
): Promise<CompletedChallengeAttempt | CompletedOrderingChallengeAttempt> {
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
        completion.id::text as completion_id
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

  const reward = {
    cards: cardResult.rows.map((card) => ({
      ownedCardId: card.owned_card_id,
      cardDefinitionId: card.card_definition_id,
      name: card.name,
      category: card.category,
      affinity: card.affinity,
      rarity: card.rarity,
    })),
  };

  if (attempt.format === 'ordering') {
    const review = await loadCompletedOrderingReview(database, attempt);

    return {
      attemptId: attempt.attempt_id,
      eventId: attempt.event_id,
      format: 'ordering',
      status: 'completed',
      completedAt: attempt.completed_at.toISOString(),
      completionReason: attempt.completion_reason,
      totalQuestions: 5,
      scoreCorrect: attempt.score_correct,
      reward,
      review,
    };
  }

  const reviewResult = await database.query<CompletedReviewRow>(
    `
      select
        question.id::text as attempt_question_id,
        question.position,
        question.prompt_snapshot,
        selected_choice.id::text as selected_choice_id,
        selected_choice.choice_text_snapshot as selected_choice_text,
        correct_choice.id::text as correct_choice_id,
        correct_choice.choice_text_snapshot as correct_choice_text,
        coalesce(
          selected_choice.source_choice_id = answer_key.accepted_choice_id,
          false
        ) as is_correct
      from public.attempt_questions question
      left join public.attempt_answers answer
        on answer.attempt_question_id = question.id
      left join public.attempt_question_choices selected_choice
        on selected_choice.attempt_question_id = question.id
       and selected_choice.id = answer.selected_choice_id
      join private.challenge_answer_keys answer_key
        on answer_key.question_id = question.source_question_id
      join public.attempt_question_choices correct_choice
        on correct_choice.attempt_question_id = question.id
       and correct_choice.source_choice_id = answer_key.accepted_choice_id
      where question.attempt_id = $1::uuid
      order by question.position
    `,
    [attempt.attempt_id],
  );

  const review = reviewResult.rows.map((entry) => ({
    attemptQuestionId: entry.attempt_question_id,
    position: entry.position,
    prompt: entry.prompt_snapshot,
    selectedChoice:
      entry.selected_choice_id === null
        ? null
        : {
            choiceId: entry.selected_choice_id,
            text: requireSelectedChoiceText(entry),
          },
    correctChoice: {
      choiceId: entry.correct_choice_id,
      text: entry.correct_choice_text,
    },
    isCorrect: entry.is_correct,
  }));

  if (
    review.length !== 5 ||
    review.some((entry, index) => entry.position !== index + 1) ||
    review.filter((entry) => entry.isCorrect).length !==
      attempt.score_correct ||
    (attempt.completion_reason === 'answered' &&
      review.some((entry) => entry.selectedChoice === null))
  ) {
    throw new Error('Completed challenge attempt review is inconsistent.');
  }

  return {
    attemptId: attempt.attempt_id,
    eventId: attempt.event_id,
    format: attempt.format,
    status: 'completed',
    completedAt: attempt.completed_at.toISOString(),
    completionReason: attempt.completion_reason,
    totalQuestions: 5,
    scoreCorrect: attempt.score_correct,
    reward,
    review,
  };
}

async function loadCompletedOrderingReview(
  database: ChallengeAttemptQueryable,
  attempt: AttemptRow,
): Promise<CompletedOrderingReviewEntry[]> {
  if (attempt.completion_reason === null || attempt.score_correct === null) {
    throw new Error('Completed ordering attempt is missing final state.');
  }
  const result = await database.query<CompletedOrderingItemRow>(
    `
      select
        question.id::text as attempt_question_id,
        question.position,
        question.prompt_snapshot,
        question.explanation_snapshot,
        item.id::text as item_id,
        item.item_text_snapshot,
        answer_item.submitted_position,
        answer_key.correct_position
      from public.attempt_questions question
      join public.attempt_question_ordering_items item
        on item.attempt_question_id = question.id
      join private.challenge_ordering_answer_keys answer_key
        on answer_key.question_id = question.source_question_id
       and answer_key.item_id = item.source_item_id
      left join public.attempt_ordering_answer_items answer_item
        on answer_item.attempt_question_id = question.id
       and answer_item.selected_item_id = item.id
      where question.attempt_id = $1::uuid
      order by question.position, answer_key.correct_position
    `,
    [attempt.attempt_id],
  );

  const reviewByQuestion = new Map<
    string,
    CompletedOrderingReviewEntry & {
      selectedWithPositions: Array<
        PlayerSafeOrderingItem & { position: number }
      >;
    }
  >();

  for (const row of result.rows) {
    let entry = reviewByQuestion.get(row.attempt_question_id);

    if (!entry) {
      entry = {
        attemptQuestionId: row.attempt_question_id,
        position: row.position,
        prompt: row.prompt_snapshot,
        selectedItems: null,
        correctItems: [],
        isCorrect: false,
        explanation: row.explanation_snapshot,
        selectedWithPositions: [],
      };
      reviewByQuestion.set(row.attempt_question_id, entry);
    }

    const item = { itemId: row.item_id, text: row.item_text_snapshot };
    entry.correctItems.push(item);

    if (row.submitted_position !== null) {
      entry.selectedWithPositions.push({
        ...item,
        position: row.submitted_position,
      });
    }
  }

  const review = [...reviewByQuestion.values()].map((entry) => {
    const selectedItems =
      entry.selectedWithPositions.length === 0
        ? null
        : [...entry.selectedWithPositions]
            .sort((left, right) => left.position - right.position)
            .map(({ itemId, text }) => ({ itemId, text }));
    const isCorrect =
      selectedItems !== null &&
      selectedItems.length === 4 &&
      selectedItems.every(
        (item, index) => item.itemId === entry.correctItems[index]?.itemId,
      );

    return {
      attemptQuestionId: entry.attemptQuestionId,
      position: entry.position,
      prompt: entry.prompt,
      selectedItems,
      correctItems: entry.correctItems,
      isCorrect,
      explanation: entry.explanation,
    };
  });

  if (
    review.length !== 5 ||
    review.some(
      (entry, index) =>
        entry.position !== index + 1 || entry.correctItems.length !== 4,
    ) ||
    review.filter((entry) => entry.isCorrect).length !==
      attempt.score_correct ||
    (attempt.completion_reason === 'answered' &&
      review.some((entry) => entry.selectedItems === null))
  ) {
    throw new Error('Completed ordering attempt review is inconsistent.');
  }

  return review;
}

function requireSelectedChoiceText(entry: CompletedReviewRow): string {
  if (entry.selected_choice_text === null) {
    throw new Error('Completed challenge attempt review is inconsistent.');
  }

  return entry.selected_choice_text;
}
