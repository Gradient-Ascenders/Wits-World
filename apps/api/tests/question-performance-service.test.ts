import { describe, expect, it, vi } from 'vitest';

import {
  InvalidQuestionPerformanceFiltersError,
  createQuestionPerformanceService,
} from '../src/challenges/question-performance-service.js';

const QUESTION_ID = '10000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '20000000-0000-4000-8000-000000000001';
const EVENT_ID = '30000000-0000-4000-8000-000000000001';

describe('question performance service', () => {
  it.each([
    {
      answers: 9,
      incorrect: 9,
      expected: false,
      label: 'below sample minimum',
    },
    {
      answers: 10,
      incorrect: 7,
      expected: true,
      label: 'exact 70 percent boundary',
    },
    {
      answers: 10,
      incorrect: 6,
      expected: false,
      label: 'just below 70 percent',
    },
    {
      answers: 50,
      incorrect: 35,
      expected: true,
      label: 'larger qualifying sample',
    },
  ])(
    'classifies $label deterministically',
    async ({ answers, incorrect, expected }) => {
      const { database } = fixture([
        row({
          answer_count: answers,
          correct_count: answers - incorrect,
          incorrect_count: incorrect,
        }),
      ]);
      const result =
        await createQuestionPerformanceService(database).list(defaultFilters());

      expect(result.items[0]).toMatchObject({
        answerCount: answers,
        correctCount: answers - incorrect,
        incorrectCount: incorrect,
        hasSufficientSample: answers >= 10,
        isProblematic: expected,
      });
    },
  );

  it.each(['multiple_choice', 'ordering'] as const)(
    'maps correct, incorrect, and timeout aggregates for %s',
    async (format) => {
      const { database } = fixture([
        row({
          answer_count: 12,
          correct_count: 3,
          format,
          incorrect_count: 9,
          timeout_count: 2,
        }),
      ]);
      const result =
        await createQuestionPerformanceService(database).list(defaultFilters());

      expect(result.items[0]).toMatchObject({
        answerCount: 12,
        correctCount: 3,
        correctRate: 0.25,
        format,
        incorrectCount: 9,
        incorrectRate: 0.75,
        timeoutCount: 2,
      });
    },
  );

  it('composes all filters and returns a bounded page', async () => {
    const { database, query } = fixture([row({ total_items: 101 })]);
    const filters = {
      page: 2,
      pageSize: 100,
      eventId: EVENT_ID,
      challengeId: CHALLENGE_ID,
      format: 'ordering' as const,
      difficulty: 3 as const,
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-05T00:00:00.000Z',
    };

    const result =
      await createQuestionPerformanceService(database).list(filters);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("attempt.status = 'completed'"),
      [
        EVENT_ID,
        CHALLENGE_ID,
        'ordering',
        3,
        filters.from,
        filters.to,
        100,
        100,
      ],
    );
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("challenge.format = 'multiple_choice'");
    expect(sql).toContain('private.challenge_ordering_answer_keys');
    expect(sql).toContain("completion_reason = 'timeout'");
    expect(sql).toContain('position = current_unanswered_position');
    expect(result).toMatchObject({
      page: 2,
      pageSize: 100,
      totalItems: 101,
      totalPages: 2,
    });
  });

  it('handles an empty aggregate result', async () => {
    const { database } = fixture([]);
    await expect(
      createQuestionPerformanceService(database).list(defaultFilters()),
    ).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
      minimumSampleSize: 10,
      problematicIncorrectRate: 0.7,
    });
  });

  it('keeps totals when an out-of-range page has no items', async () => {
    const { database } = fixture([
      row({
        answer_count: null,
        challenge_id: null,
        correct_count: null,
        difficulty: null,
        event_id: null,
        event_title: null,
        format: null,
        has_sufficient_sample: null,
        incorrect_count: null,
        incorrect_rate: null,
        is_problematic: null,
        prompt: null,
        question_id: null,
        status: null,
        timeout_count: null,
        total_items: 26,
      }),
    ]);

    await expect(
      createQuestionPerformanceService(database).list({
        page: 3,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({
      items: [],
      page: 3,
      totalItems: 26,
      totalPages: 2,
    });
  });

  it.each([
    { ...defaultFilters(), page: 0 },
    { ...defaultFilters(), pageSize: 101 },
    {
      ...defaultFilters(),
      from: '2026-09-05T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    },
    {
      ...defaultFilters(),
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    },
  ])('rejects invalid filters %#', async (filters) => {
    const { database, query } = fixture([]);
    await expect(
      createQuestionPerformanceService(database).list(filters),
    ).rejects.toBeInstanceOf(InvalidQuestionPerformanceFiltersError);
    expect(query).not.toHaveBeenCalled();
  });
});

function defaultFilters() {
  return { page: 1, pageSize: 25 };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    question_id: QUESTION_ID,
    challenge_id: CHALLENGE_ID,
    event_id: EVENT_ID,
    event_title: 'Great Hall history',
    prompt: 'Where is the Great Hall?',
    format: 'multiple_choice',
    difficulty: 2,
    status: 'published',
    answer_count: 10,
    correct_count: 3,
    incorrect_count: 7,
    timeout_count: 0,
    correct_rate: '0.3',
    incorrect_rate: '0.7',
    has_sufficient_sample: true,
    is_problematic: true,
    total_items: 1,
    ...overrides,
  };
}

function fixture(rows: Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  const release = vi.fn();
  return {
    database: { connect: vi.fn().mockResolvedValue({ query, release }) },
    query,
    release,
  };
}
