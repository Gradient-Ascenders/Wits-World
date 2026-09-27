import { describe, expect, it, vi } from 'vitest';

import {
  createAuthorChallengeService,
  InvalidAuthorQuestionError,
  type AuthorChallengeDatabase,
  type AuthorChallengeTransactionClient,
} from '../src/challenges/author-challenge-service.js';

const AUTHOR_ID = 'e1000000-0000-4000-8000-000000000001';
const EVENT_ID = 'e2000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = 'e3000000-0000-4000-8000-000000000001';
const QUESTION_ID = 'e4000000-0000-4000-8000-000000000001';

describe('author challenge service persistence', () => {
  it('creates, lists and edits a multiple-choice challenge package', async () => {
    let prompt = 'Where is the Great Hall?';
    let questionVersion = 0;
    let choiceSequence = 0;
    const { database, query, release } = challengeDatabase(
      async (statement) => {
        const sql = normalizedSql(statement);
        if (sql.includes('from public.events')) {
          return { rows: [{ id: EVENT_ID }] };
        }
        if (sql.includes('insert into public.event_challenges')) {
          return { rows: [challengeRow()] };
        }
        if (
          sql.includes('from public.event_challenges challenge') &&
          sql.includes('for update')
        ) {
          return { rows: [challengeRow()] };
        }
        if (
          sql.includes('from public.event_challenges challenge') &&
          !sql.includes('join public.challenge_questions')
        ) {
          return { rows: [challengeRow()] };
        }
        if (
          sql.includes('select id') &&
          sql.includes('from public.event_challenges')
        ) {
          return { rows: [{ id: CHALLENGE_ID }] };
        }
        if (sql.includes('insert into public.challenge_questions')) {
          return { rows: [{ question_id: QUESTION_ID }] };
        }
        if (sql.includes('insert into public.challenge_choices')) {
          choiceSequence += 1;
          return { rows: [{ choice_id: choiceId(choiceSequence) }] };
        }
        if (
          sql.includes('from public.challenge_questions question') &&
          sql.includes('for update of challenge, question')
        ) {
          return {
            rows: [
              {
                challenge_id: CHALLENGE_ID,
                challenge_format: 'multiple_choice',
                challenge_status: 'draft',
                question_status: 'draft',
                question_version: questionVersion,
              },
            ],
          };
        }
        if (sql.includes('update public.challenge_questions')) {
          prompt = 'Which campus contains the Great Hall?';
          questionVersion += 1;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('from public.challenge_questions question')) {
          return { rows: questionRows({ prompt, version: questionVersion }) };
        }
        return { rows: [] };
      },
    );
    const service = createAuthorChallengeService(database);

    await expect(service.listChallenges(EVENT_ID)).resolves.toEqual([
      expect.objectContaining({ challengeId: CHALLENGE_ID, status: 'draft' }),
    ]);
    await expect(
      service.createChallenge({ actorPlayerId: AUTHOR_ID, eventId: EVENT_ID }),
    ).resolves.toMatchObject({
      challengeId: CHALLENGE_ID,
      format: 'multiple_choice',
    });
    await expect(service.listQuestions(CHALLENGE_ID)).resolves.toEqual([
      expect.objectContaining({
        questionId: QUESTION_ID,
        acceptedChoicePosition: 2,
      }),
    ]);
    await expect(
      service.createQuestion({
        ...multipleChoiceInput(),
        actorPlayerId: AUTHOR_ID,
        challengeId: CHALLENGE_ID,
      }),
    ).resolves.toMatchObject({
      prompt: 'Where is the Great Hall?',
      choices: expect.any(Array),
    });
    await expect(
      service.updateQuestion({
        ...multipleChoiceInput(),
        actorPlayerId: AUTHOR_ID,
        questionId: QUESTION_ID,
        expectedVersion: 0,
        prompt: ' Which campus contains the Great Hall? ',
      }),
    ).resolves.toMatchObject({
      prompt: 'Which campus contains the Great Hall?',
      version: 1,
    });

    expect(
      query.mock.calls.filter(([statement]) =>
        String(statement).includes('insert into public.challenge_choices'),
      ),
    ).toHaveLength(8);
    expect(query).toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledTimes(5);
  });

  it('creates and maps ordered questions without exposing an answer key', async () => {
    let itemSequence = 0;
    const { database } = challengeDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (
        sql.includes('from public.event_challenges challenge') &&
        sql.includes('for update')
      ) {
        return { rows: [challengeRow({ format: 'ordering' })] };
      }
      if (sql.includes('insert into public.challenge_questions')) {
        return { rows: [{ question_id: QUESTION_ID }] };
      }
      if (sql.includes('insert into public.challenge_ordering_items')) {
        itemSequence += 1;
        return {
          rows: [
            {
              item_id: `e5000000-0000-4000-8000-${String(itemSequence).padStart(12, '0')}`,
            },
          ],
        };
      }
      if (sql.includes('from public.challenge_questions question')) {
        return { rows: orderingRows() };
      }
      return { rows: [] };
    });

    await expect(
      createAuthorChallengeService(database).createQuestion({
        actorPlayerId: AUTHOR_ID,
        challengeId: CHALLENGE_ID,
        format: 'ordering',
        prompt: 'Order these buildings by opening date.',
        difficulty: 3,
        explanation: 'The archive supplies the dates.',
        items: ['Oldest', 'Second', 'Third', 'Newest'],
      }),
    ).resolves.toMatchObject({
      format: 'ordering',
      items: expect.arrayContaining([
        expect.objectContaining({ position: 1, text: 'Oldest' }),
        expect.objectContaining({ position: 4, text: 'Newest' }),
      ]),
    });
  });

  it('rejects invalid question content before opening a transaction', async () => {
    const connect = vi.fn<AuthorChallengeDatabase['connect']>();
    const service = createAuthorChallengeService({ connect });

    await expect(
      service.createQuestion({
        ...multipleChoiceInput(),
        actorPlayerId: AUTHOR_ID,
        challengeId: CHALLENGE_ID,
        choices: ['Only one'],
      }),
    ).rejects.toBeInstanceOf(InvalidAuthorQuestionError);
    await expect(
      service.createQuestion({
        actorPlayerId: AUTHOR_ID,
        challengeId: CHALLENGE_ID,
        format: 'ordering',
        prompt: 'Order these.',
        difficulty: 2,
        explanation: 'Use the dates.',
        items: ['One', 'Two'],
      }),
    ).rejects.toBeInstanceOf(InvalidAuthorQuestionError);
    expect(connect).not.toHaveBeenCalled();
  });
});

function challengeDatabase(
  implementation: (
    statement: string,
    values?: unknown[],
  ) => Promise<{
    rows: Record<string, unknown>[];
    rowCount?: number | null;
  }>,
) {
  const query = vi.fn(implementation);
  const release = vi.fn();
  const client = {
    query,
    release,
  } as unknown as AuthorChallengeTransactionClient;
  const database: AuthorChallengeDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { database, query, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function challengeRow(
  overrides: Partial<{ format: 'multiple_choice' | 'ordering' }> = {},
) {
  const timestamp = new Date('2026-09-28T08:00:00.000Z');
  return {
    challenge_id: CHALLENGE_ID,
    event_id: EVENT_ID,
    format: 'multiple_choice',
    status: 'draft',
    version: 0,
    submitted_by_player_id: null,
    submitted_at: null,
    reviewed_by_player_id: null,
    reviewed_at: null,
    publication_provenance: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function multipleChoiceInput() {
  return {
    format: 'multiple_choice' as const,
    prompt: ' Where is the Great Hall? ',
    difficulty: 2 as const,
    explanation: ' It is on East Campus. ',
    choices: ['West Campus', 'East Campus', 'Parktown', 'Braamfontein'],
    acceptedChoicePosition: 2,
  };
}

function questionRows({
  prompt,
  version,
}: {
  prompt: string;
  version: number;
}) {
  return ['West Campus', 'East Campus', 'Parktown', 'Braamfontein'].map(
    (choice, index) => ({
      ...questionBase({ format: 'multiple_choice', prompt, version }),
      choice_id: choiceId(index + 1),
      choice_position: index + 1,
      choice_text: choice,
      accepted_choice_id: choiceId(2),
      ordering_item_id: null,
      ordering_item_position: null,
      ordering_item_text: null,
    }),
  );
}

function orderingRows() {
  return ['Oldest', 'Second', 'Third', 'Newest'].map((item, index) => ({
    ...questionBase({
      format: 'ordering',
      prompt: 'Order these buildings by opening date.',
      version: 0,
    }),
    choice_id: null,
    choice_position: null,
    choice_text: null,
    accepted_choice_id: null,
    ordering_item_id: `e5000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    ordering_item_position: index + 1,
    ordering_item_text: item,
  }));
}

function questionBase({
  format,
  prompt,
  version,
}: {
  format: 'multiple_choice' | 'ordering';
  prompt: string;
  version: number;
}) {
  const timestamp = new Date('2026-09-28T08:00:00.000Z');
  return {
    question_id: QUESTION_ID,
    challenge_id: CHALLENGE_ID,
    format,
    prompt,
    difficulty: 2,
    explanation: 'It is on East Campus.',
    source_urls: [],
    status: 'draft',
    version,
    submitted_by_player_id: null,
    submitted_at: null,
    reviewed_by_player_id: null,
    reviewed_at: null,
    publication_provenance: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function choiceId(index: number) {
  return `e6000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
