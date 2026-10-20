import { describe, expect, it, vi } from 'vitest';

import {
  ChallengeEventNotReachableError,
  ChallengeLocationRetryRequiredError,
  ChallengeEventNotActiveError,
  ChallengeEventNotFoundError,
  createChallengeAttemptStartService,
  type ChallengeAttemptDatabase,
  type ChallengeAttemptTransactionClient,
} from '../src/challenges/challenge-attempt-start.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const CHALLENGE_ID = '30000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000001';

const startedAt = new Date('2026-09-01T10:00:00.000Z');
const acceptingMovementEvidenceService = {
  evaluateJourneyWithinTransaction: vi.fn(async () => ({
    outcome: 'baseline' as const,
  })),
};

describe('challenge attempt start service', () => {
  it.each(['multiple_choice', 'ordering'] as const)(
    'batches the five %s questions and twenty options without exposing answer keys',
    async (format) => {
      const fixture = createDatabaseFixture({ format });
      const result = await createChallengeAttemptStartService(
        fixture.database,
        {
          clock: () => startedAt,
          movementEvidenceService: acceptingMovementEvidenceService,
          randomIndex: () => 0,
        },
      ).startOrResume(validInput());
      if (result.attempt.status !== 'in_progress')
        throw new Error('Expected an active attempt');
      expect(result.attempt.questions).toHaveLength(5);
      const optionReads = fixture.query.mock.calls.filter(([sql]) =>
        /from public.challenge_(choices|ordering_items)/.test(sql),
      );
      const snapshotWrites = fixture.query.mock.calls.filter(([sql]) =>
        sql.includes('insert into public.attempt_questions'),
      );
      expect(optionReads).toHaveLength(1);
      expect(optionReads[0]![1]![0]).toHaveLength(5);
      expect(snapshotWrites).toHaveLength(1);
      expect(JSON.parse(String(snapshotWrites[0]![1]![1]))).toHaveLength(5);
      expect(JSON.parse(String(snapshotWrites[0]![1]![2]))).toHaveLength(20);
      expect(JSON.stringify(result.attempt)).not.toContain('sourceQuestionId');
      expect(JSON.stringify(result.attempt)).not.toContain('explanation');
    },
  );

  it('starts at the event boundary with the maximum tolerated accuracy', async () => {
    const fixture = createDatabaseFixture({ distanceMetres: 75 });
    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });
    await service.startOrResume({ ...validInput(), accuracyMetres: 150 });
    expect(executedSql(fixture.query)).toContain(
      'insert into public.challenge_attempts',
    );
  });

  it('requires retry above the accuracy bound before loading challenge content', async () => {
    const fixture = createDatabaseFixture();
    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });
    await expect(
      service.startOrResume({ ...validInput(), accuracyMetres: 150.01 }),
    ).rejects.toMatchObject({ reason: 'location_accuracy' });
    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.challenge_attempts',
    );
  });

  it('resumes an existing attempt without re-evaluating location or rerolling content', async () => {
    const fixture = createDatabaseFixture({
      existingAttempt: true,
    });

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    const result = await service.startOrResume(validInput());

    expect(result.outcome).toBe('resumed');
    expect(result.attempt).toMatchObject({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      status: 'in_progress',
      deadline: '2026-09-01T10:02:00.000Z',
    });

    if (result.attempt.format !== 'multiple_choice') {
      throw new Error('Expected a multiple-choice challenge attempt.');
    }

    const sql = executedSql(fixture.query);

    expect(sql).not.toContain('with claim as');
    expect(sql).not.toContain('from public.challenge_questions question');
    expect(sql).not.toContain('insert into public.challenge_attempts');
  });

  it('checks a reward-challenge restriction only before creating a new attempt', async () => {
    const fixture = createDatabaseFixture();
    const assertAllowed = vi.fn().mockRejectedValue(new Error('restricted'));
    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
      trustRestrictions: { assertAllowed },
    });

    await expect(service.startOrResume(validInput())).rejects.toThrow(
      'restricted',
    );

    expect(assertAllowed).toHaveBeenCalledWith(
      PLAYER_ID,
      'location_reward_challenge_hold',
      expect.anything(),
    );
    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.challenge_attempts',
    );
  });

  it('lets an already-started challenge resume without a later trust restriction check', async () => {
    const fixture = createDatabaseFixture({ existingAttempt: true });
    const assertAllowed = vi.fn().mockRejectedValue(new Error('restricted'));
    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
      trustRestrictions: { assertAllowed },
    });

    const result = await service.startOrResume(validInput());

    expect(result.outcome).toBe('resumed');
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('requires a new location claim when the submitted claim is stale', async () => {
    const fixture = createDatabaseFixture();

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    await expect(
      service.startOrResume({
        ...validInput(),
        acquiredAt: '2026-09-01T09:57:59.000Z',
      }),
    ).rejects.toMatchObject({
      name: 'ChallengeLocationRetryRequiredError',
      reason: 'stale_location',
    } satisfies Partial<ChallengeLocationRetryRequiredError>);

    expect(executedSql(fixture.query)).not.toContain('with claim as');

    expect(fixture.query).toHaveBeenCalledWith('rollback', []);
  });

  it('rejects a clearly unreachable event before challenge content is loaded', async () => {
    const fixture = createDatabaseFixture({
      distanceMetres: 100,
      withinRadius: false,
    });

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    await expect(service.startOrResume(validInput())).rejects.toBeInstanceOf(
      ChallengeEventNotReachableError,
    );

    const sql = executedSql(fixture.query);

    expect(sql).toContain('with claim as');
    expect(sql).not.toContain('from public.challenge_questions question');
    expect(sql).not.toContain('insert into public.challenge_attempts');
  });

  it('rejects a too-fast journey before challenge content is loaded', async () => {
    const fixture = createDatabaseFixture();
    const evaluateJourneyWithinTransaction = vi.fn().mockResolvedValue({
      outcome: 'too_fast' as const,
    });
    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: { evaluateJourneyWithinTransaction },
      randomIndex: () => 0,
    });

    await expect(service.startOrResume(validInput())).rejects.toMatchObject({
      name: 'ChallengeLocationRetryRequiredError',
      reason: 'journey_too_fast',
    } satisfies Partial<ChallengeLocationRetryRequiredError>);

    expect(evaluateJourneyWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      {
        ...validInput(),
        acquiredAt: new Date(validInput().acquiredAt),
        receivedAt: startedAt,
      },
      'reachable',
    );
    expect(executedSql(fixture.query)).not.toContain(
      'from public.challenge_questions question',
    );
    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.challenge_attempts',
    );
    expect(fixture.query).toHaveBeenCalledWith('commit', []);
    expect(fixture.query).not.toHaveBeenCalledWith('rollback', []);
  });

  it('creates and reloads one player-safe persisted attempt', async () => {
    const fixture = createDatabaseFixture();

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    const result = await service.startOrResume(validInput());

    expect(result.outcome).toBe('created');

    if (result.outcome !== 'created') {
      throw new Error('Expected a newly created challenge attempt.');
    }

    if (result.attempt.format !== 'multiple_choice') {
      throw new Error('Expected a multiple-choice challenge attempt.');
    }

    expect(result.attempt).toMatchObject({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      format: 'multiple_choice',
      status: 'in_progress',
      startedAt: '2026-09-01T10:00:00.000Z',
      deadline: '2026-09-01T10:02:00.000Z',
      totalQuestions: 5,
      answeredCount: 0,
    });

    expect(result.attempt.questions).toHaveLength(5);
    expect(result.attempt.questions.map((question) => question.prompt)).toEqual(
      ['Question 2', 'Question 3', 'Question 4', 'Question 5', 'Question 1'],
    );

    for (const question of result.attempt.questions) {
      expect(question.choices).toHaveLength(4);
    }

    const attemptInsert = fixture.query.mock.calls.find(([statement]) =>
      String(statement)
        .toLowerCase()
        .includes('insert into public.challenge_attempts'),
    );

    expect(attemptInsert?.[1]).toEqual([
      PLAYER_ID,
      EVENT_ID,
      CHALLENGE_ID,
      startedAt,
      new Date('2026-09-01T10:02:00.000Z'),
      120,
      1.8,
      null,
    ]);

    expect(fixture.snapshotQuestions).toHaveLength(5);
    expect(fixture.snapshotChoices).toHaveLength(20);

    const sql = executedSql(fixture.query);

    expect(sql).not.toContain('challenge_answer_keys');
    expect(sql).not.toContain('accepted_choice');
    expect(sql).not.toContain('private.');
  });

  it('creates ordering snapshots without loading private answer positions', async () => {
    const fixture = createDatabaseFixture({ format: 'ordering' });
    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    const result = await service.startOrResume(validInput());

    expect(result.outcome).toBe('created');

    if (result.outcome !== 'created' || result.attempt.format !== 'ordering') {
      throw new Error('Expected a newly created ordering attempt.');
    }

    expect(result.attempt.questions).toHaveLength(5);
    expect(fixture.snapshotOrderingItems).toHaveLength(20);
    expect(fixture.snapshotChoices).toHaveLength(0);

    for (const question of result.attempt.questions) {
      expect(question.items).toHaveLength(4);
      expect(question).not.toHaveProperty('explanation');
      expect(question).not.toHaveProperty('correctItems');
      expect(question).not.toHaveProperty('sourceUrls');
    }

    const sql = executedSql(fixture.query);
    expect(sql).toContain('from public.challenge_ordering_items item');
    expect(sql).not.toContain('challenge_ordering_answer_keys');
    expect(sql).not.toContain('correct_position');
    expect(sql).not.toContain('source_urls');
    expect(sql).not.toContain('private.');
  });

  it('returns the concurrent winner instead of creating conflicting snapshots', async () => {
    const fixture = createDatabaseFixture({
      conflictOnAttemptInsert: true,
    });

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    const result = await service.startOrResume(validInput());

    expect(result.outcome).toBe('resumed');
    expect(result.attempt).toMatchObject({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      status: 'in_progress',
    });

    expect(fixture.snapshotQuestions).toHaveLength(5);
    expect(fixture.snapshotChoices).toHaveLength(20);

    const snapshotInsertCalls = fixture.query.mock.calls.filter(([statement]) =>
      String(statement)
        .toLowerCase()
        .includes('insert into public.attempt_questions'),
    );

    expect(snapshotInsertCalls).toHaveLength(0);
  });

  it('treats an unpublished event as not found before loading challenge content', async () => {
    const fixture = createDatabaseFixture({
      eventAvailability: 'unpublished',
    });

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    await expect(service.startOrResume(validInput())).rejects.toBeInstanceOf(
      ChallengeEventNotFoundError,
    );

    const sql = executedSql(fixture.query);

    expect(sql).toContain('with claim as');
    expect(sql).not.toContain('from public.challenge_questions question');
    expect(sql).not.toContain('insert into public.challenge_attempts');
  });

  it('rejects an ended event before loading challenge content', async () => {
    const fixture = createDatabaseFixture({
      eventAvailability: 'ended',
    });

    const service = createChallengeAttemptStartService(fixture.database, {
      clock: () => startedAt,
      movementEvidenceService: acceptingMovementEvidenceService,
      randomIndex: () => 0,
    });

    await expect(service.startOrResume(validInput())).rejects.toMatchObject({
      name: 'ChallengeEventNotActiveError',
      reason: 'ended',
    } satisfies Partial<ChallengeEventNotActiveError>);

    const sql = executedSql(fixture.query);

    expect(sql).toContain('with claim as');
    expect(sql).not.toContain('from public.challenge_questions question');
    expect(sql).not.toContain('insert into public.challenge_attempts');
  });
});

function validInput() {
  return {
    playerId: PLAYER_ID,
    eventId: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: '2026-09-01T09:59:30.000Z',
  };
}

interface DatabaseFixtureOptions {
  existingAttempt?: boolean;
  conflictOnAttemptInsert?: boolean;
  distanceMetres?: number;
  withinRadius?: boolean;
  eventAvailability?: 'available' | 'unpublished' | 'not_started' | 'ended';
  format?: 'multiple_choice' | 'ordering';
}

function createDatabaseFixture({
  existingAttempt = false,
  conflictOnAttemptInsert = false,
  distanceMetres = 0,
  withinRadius = true,
  eventAvailability = 'available',
  format = 'multiple_choice',
}: DatabaseFixtureOptions = {}) {
  let attemptAvailable = existingAttempt;
  const release = vi.fn();

  const snapshotQuestions: Array<{
    id: string;
    sourceQuestionId: string;
    position: number;
    prompt: string;
    difficulty: number;
    explanation: string | null;
  }> = [];

  const snapshotChoices: Array<{
    id: string;
    attemptQuestionId: string;
    sourceQuestionId: string;
    sourceChoiceId: string;
    displayPosition: number;
    text: string;
  }> = [];

  const snapshotOrderingItems: Array<{
    id: string;
    attemptQuestionId: string;
    sourceQuestionId: string;
    sourceItemId: string;
    displayPosition: number;
    text: string;
  }> = [];

  if (existingAttempt || conflictOnAttemptInsert) {
    populateExistingSnapshots(snapshotQuestions, snapshotChoices);
  }

  const query = vi.fn(async (statement: string, values: unknown[] = []) => {
    const sql = normalizeSql(statement);

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return { rows: [] };
    }

    if (sql.includes('from public.challenge_attempts attempt')) {
      if (!attemptAvailable) {
        return { rows: [] };
      }

      return {
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format,
            status: 'in_progress',
            started_at: startedAt,
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: null,
            completion_reason: null,
            score_correct: null,
          },
        ],
      };
    }

    if (sql.includes('left join public.attempt_ordering_answers answer')) {
      return {
        rows: snapshotQuestions
          .sort((left, right) => left.position - right.position)
          .map((question) => ({
            attempt_question_id: question.id,
            position: question.position,
            prompt_snapshot: question.prompt,
            answered_at: null,
          })),
      };
    }

    if (sql.includes('from public.attempt_question_ordering_items item')) {
      return {
        rows: snapshotOrderingItems.map((item) => ({
          attempt_question_id: item.attemptQuestionId,
          item_id: item.id,
          display_position: item.displayPosition,
          item_text_snapshot: item.text,
        })),
      };
    }

    if (sql.includes('from public.attempt_ordering_answer_items answer_item')) {
      return { rows: [] };
    }

    if (sql.includes('left join public.attempt_answers answer')) {
      return {
        rows: snapshotQuestions
          .sort((left, right) => left.position - right.position)
          .map((question) => ({
            attempt_question_id: question.id,
            position: question.position,
            prompt_snapshot: question.prompt,
            selected_choice_id: null,
            answered_at: null,
          })),
      };
    }

    if (sql.includes('from public.attempt_question_choices choice')) {
      return {
        rows: snapshotChoices
          .sort((left, right) => {
            const questionDifference =
              questionPosition(snapshotQuestions, left.attemptQuestionId) -
              questionPosition(snapshotQuestions, right.attemptQuestionId);

            return (
              questionDifference || left.displayPosition - right.displayPosition
            );
          })
          .map((choice) => ({
            attempt_question_id: choice.attemptQuestionId,
            choice_id: choice.id,
            display_position: choice.displayPosition,
            choice_text_snapshot: choice.text,
          })),
      };
    }

    if (
      sql.includes('from public.event_placement_state') &&
      sql.includes('for share')
    ) {
      return { rows: [{ version: '0' }] };
    }

    if (sql.includes('with claim as')) {
      return {
        rows: [
          {
            event_id: EVENT_ID,
            radius_metres: 75,
            availability: eventAvailability,
            distance_metres: distanceMetres,
            within_radius: withinRadius,
          },
        ],
      };
    }

    if (
      sql.includes('from public.event_challenges challenge') &&
      sql.includes("challenge.status = 'published'")
    ) {
      return {
        rows: [
          {
            challenge_id: CHALLENGE_ID,
            format,
          },
        ],
      };
    }

    if (sql.includes('from public.challenge_questions question')) {
      return {
        rows: [
          questionFixture(1, 1),
          questionFixture(2, 1),
          questionFixture(3, 2),
          questionFixture(4, 2),
          questionFixture(5, 3),
        ],
      };
    }

    if (sql.includes('from public.challenge_choices choice')) {
      return {
        rows: (values[0] as string[]).flatMap((questionId) =>
          Array.from({ length: 4 }, (_, index) => ({
            question_id: questionId,
            choice_id: sourceChoiceId(questionId, index + 1),
            choice_text: `Choice ${questionNumber(questionId)}.${index + 1}`,
          })),
        ),
      };
    }

    if (sql.includes('from public.challenge_ordering_items item')) {
      return {
        rows: (values[0] as string[]).flatMap((questionId) =>
          Array.from({ length: 4 }, (_, index) => ({
            question_id: questionId,
            item_id: sourceOrderingItemId(questionId, index + 1),
            item_text: `Item ${questionNumber(questionId)}.${index + 1}`,
          })),
        ),
      };
    }

    if (sql.includes('insert into public.challenge_attempts')) {
      attemptAvailable = true;

      if (conflictOnAttemptInsert) {
        return {
          rows: [],
        };
      }

      return {
        rows: [
          {
            attempt_id: ATTEMPT_ID,
          },
        ],
      };
    }

    if (sql.includes('insert into public.attempt_questions')) {
      const questions = JSON.parse(String(values[1])) as Array<{
        source_question_id: string;
        position: number;
        prompt: string;
        difficulty: number;
        explanation: string | null;
      }>;
      const items = JSON.parse(String(values[2])) as Array<{
        source_question_id: string;
        source_id: string;
        position: number;
        text: string;
      }>;
      for (const question of questions) {
        const id = attemptQuestionId(question.position);
        snapshotQuestions.push({
          id,
          sourceQuestionId: question.source_question_id,
          position: question.position,
          prompt: question.prompt,
          difficulty: question.difficulty,
          explanation: question.explanation,
        });
        for (const item of items.filter(
          (item) => item.source_question_id === question.source_question_id,
        )) {
          if (format === 'multiple_choice') {
            snapshotChoices.push({
              id: attemptChoiceId(question.position, item.position),
              attemptQuestionId: id,
              sourceQuestionId: item.source_question_id,
              sourceChoiceId: item.source_id,
              displayPosition: item.position,
              text: item.text,
            });
          } else {
            snapshotOrderingItems.push({
              id: attemptOrderingItemId(question.position, item.position),
              attemptQuestionId: id,
              sourceQuestionId: item.source_question_id,
              sourceItemId: item.source_id,
              displayPosition: item.position,
              text: item.text,
            });
          }
        }
      }
      return {
        rows: [{ question_count: questions.length, item_count: items.length }],
      };
    }

    throw new Error(`Unexpected SQL in test fixture: ${sql}`);
  });

  const database: ChallengeAttemptDatabase = {
    async connect() {
      return {
        query: query as ChallengeAttemptTransactionClient['query'],
        release,
      };
    },
  };

  return {
    database,
    query,
    release,
    snapshotQuestions,
    snapshotChoices,
    snapshotOrderingItems,
  };
}

function populateExistingSnapshots(
  questions: Array<{
    id: string;
    sourceQuestionId: string;
    position: number;
    prompt: string;
    difficulty: number;
    explanation: string | null;
  }>,
  choices: Array<{
    id: string;
    attemptQuestionId: string;
    sourceQuestionId: string;
    sourceChoiceId: string;
    displayPosition: number;
    text: string;
  }>,
) {
  for (let position = 1; position <= 5; position += 1) {
    const questionId = sourceQuestionId(position);
    const questionSnapshotId = attemptQuestionId(position);

    questions.push({
      id: questionSnapshotId,
      sourceQuestionId: questionId,
      position,
      prompt: `Question ${position}`,
      difficulty: position <= 2 ? 1 : position <= 4 ? 2 : 3,
      explanation: null,
    });

    for (let choicePosition = 1; choicePosition <= 4; choicePosition += 1) {
      choices.push({
        id: attemptChoiceId(position, choicePosition),
        attemptQuestionId: questionSnapshotId,
        sourceQuestionId: questionId,
        sourceChoiceId: sourceChoiceId(questionId, choicePosition),
        displayPosition: choicePosition,
        text: `Choice ${position}.${choicePosition}`,
      });
    }
  }
}

function questionFixture(number: number, difficulty: 1 | 2 | 3) {
  return {
    question_id: sourceQuestionId(number),
    prompt: `Question ${number}`,
    difficulty,
    explanation: `Explanation ${number}`,
  };
}

function sourceQuestionId(number: number) {
  return `30000000-0000-4000-8001-${String(number).padStart(12, '0')}`;
}

function sourceChoiceId(questionId: string, choice: number) {
  return `30000000-0000-4001-${String(questionNumber(questionId)).padStart(
    4,
    '0',
  )}-${String(choice).padStart(12, '0')}`;
}

function sourceOrderingItemId(questionId: string, item: number) {
  return `30000000-0000-4002-${String(questionNumber(questionId)).padStart(
    4,
    '0',
  )}-${String(item).padStart(12, '0')}`;
}

function attemptQuestionId(position: number) {
  return `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function attemptChoiceId(questionPosition: number, choicePosition: number) {
  return `33000000-0000-4000-${String(questionPosition).padStart(
    4,
    '0',
  )}-${String(choicePosition).padStart(12, '0')}`;
}

function attemptOrderingItemId(questionPosition: number, itemPosition: number) {
  return `34000000-0000-4000-${String(questionPosition).padStart(
    4,
    '0',
  )}-${String(itemPosition).padStart(12, '0')}`;
}

function questionNumber(questionId: string) {
  return Number(questionId.slice(-12));
}

function questionPosition(
  questions: Array<{ id: string; position: number }>,
  attemptQuestionIdToFind: string,
) {
  const question = questions.find(
    (candidate) => candidate.id === attemptQuestionIdToFind,
  );

  if (!question) {
    throw new Error('Expected persisted question fixture.');
  }

  return question.position;
}

function executedSql(query: ReturnType<typeof vi.fn>) {
  return query.mock.calls
    .map(([statement]) => normalizeSql(String(statement)))
    .join('\n');
}

function normalizeSql(statement: string) {
  return statement.replace(/\s+/g, ' ').trim().toLowerCase();
}
