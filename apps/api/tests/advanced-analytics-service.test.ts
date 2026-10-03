import { describe, expect, it, vi } from 'vitest';

import {
  InvalidAdvancedAnalyticsFiltersError,
  createAuthorAnalyticsService,
} from '../src/analytics/author-analytics-service.js';
import type { QuestionPerformanceService } from '../src/challenges/question-performance-service.js';

const EVENT_ID = '10000000-0000-4000-8000-000000000001';
const LOCATION_ID = '20000000-0000-4000-8000-000000000001';
const QUESTION_ID = '30000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '40000000-0000-4000-8000-000000000001';
const CARD_ID = '50000000-0000-4000-8000-000000000001';

describe('advanced analytics service', () => {
  it('projects complete server-grouped attention pages with paired content links and date bounds', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          event_id: EVENT_ID,
          event_title: 'Great Hall',
          ignored_location_count: 2,
          easy_question_count: 1,
          hard_question_count: 3,
          question_id: QUESTION_ID,
          challenge_id: CHALLENGE_ID,
          total_items: 26,
        },
      ],
    });
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );
    const result = await service.listAttention({
      fromDate: '2026-09-01',
      toDate: '2026-10-01',
      page: 2,
      pageSize: 25,
    });
    expect(result).toMatchObject({
      page: 2,
      totalItems: 26,
      totalPages: 2,
      items: [
        {
          eventId: EVENT_ID,
          ignoredLocationCount: 2,
          easyQuestionCount: 1,
          hardQuestionCount: 3,
          questionId: QUESTION_ID,
          challengeId: CHALLENGE_ID,
        },
      ],
    });
    expect(query.mock.calls[0]?.[1]).toEqual([
      null,
      null,
      null,
      null,
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      10,
      0.9,
      25,
      25,
    ]);
    await expect(
      service.listAttention({ page: 1, pageSize: 101 }),
    ).rejects.toThrow(InvalidAdvancedAnalyticsFiltersError);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('suppresses narrow event-location stage counts and composes bounded filters', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          event_id: EVENT_ID,
          event_title: 'Great Hall',
          location_kind: 'placement_site',
          location_id: LOCATION_ID,
          location_name: 'Library lawns',
          view_count: '20',
          eligible_count: '3',
          start_count: '0',
          completion_count: '12',
          total_items: 1,
        },
      ],
    });
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );

    await expect(
      service.listEventLocations({
        fromDate: '2026-09-01',
        toDate: '2026-10-01',
        mode: 'popular',
        page: 2,
        pageSize: 25,
      }),
    ).resolves.toEqual({
      items: [
        {
          eventId: EVENT_ID,
          eventTitle: 'Great Hall',
          locationKind: 'placement_site',
          locationId: LOCATION_ID,
          locationName: 'Library lawns',
          viewCount: 20,
          eligibleCount: null,
          startCount: 0,
          completionCount: 12,
          suppressed: true,
        },
      ],
      page: 2,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
      minimumSampleSize: 10,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('event_product_event_aggregates'),
      [
        '2026-09-01T00:00:00.000Z',
        '2026-10-01T00:00:00.000Z',
        'popular',
        10,
        25,
        25,
      ],
    );
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('assignment.site_id');
    expect(sql).toContain('attempt.started_at');
    expect(sql).toContain('completion.completed_at');
  });

  it('defines ignored locations from a reportable view sample with no downstream activity', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );

    await service.listEventLocations({
      mode: 'ignored',
      page: 1,
      pageSize: 25,
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('view_count >= $4::integer');
    expect(sql).toContain('eligible_count = 0');
    expect(sql).toContain('start_count = 0');
    expect(sql).toContain('completion_count = 0');
  });

  it('reuses authoritative question performance and suppresses samples below ten', async () => {
    const list = vi.fn<QuestionPerformanceService['list']>().mockResolvedValue({
      items: [
        questionPerformanceItem({
          answerCount: 9,
          correctCount: 9,
          incorrectCount: 0,
          correctRate: 1,
          incorrectRate: 0,
          hasSufficientSample: false,
          isProblematic: false,
        }),
        questionPerformanceItem({
          questionId: '30000000-0000-4000-8000-000000000002',
          answerCount: 10,
          correctCount: 9,
          incorrectCount: 1,
          correctRate: 0.9,
          incorrectRate: 0.1,
          hasSufficientSample: true,
          isProblematic: false,
        }),
        questionPerformanceItem({
          questionId: '30000000-0000-4000-8000-000000000003',
          answerCount: 10,
          correctCount: 3,
          incorrectCount: 7,
          correctRate: 0.3,
          incorrectRate: 0.7,
          hasSufficientSample: true,
          isProblematic: true,
        }),
      ],
      page: 1,
      pageSize: 25,
      totalItems: 3,
      totalPages: 1,
      minimumSampleSize: 10,
      problematicIncorrectRate: 0.7,
    });
    const service = createAuthorAnalyticsService({ query: vi.fn() }, { list });

    const result = await service.listQuestions({
      eventId: EVENT_ID,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      page: 1,
      pageSize: 25,
    });

    expect(list).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T00:00:00.000Z',
      page: 1,
      pageSize: 25,
    });
    expect(result.items[0]).toMatchObject({
      answerCount: null,
      correctCount: null,
      incorrectCount: null,
      correctRate: null,
      classification: 'suppressed',
      suppressed: true,
    });
    expect(result.items[1]).toMatchObject({
      answerCount: 10,
      classification: 'easy',
      suppressed: false,
    });
    expect(result.items[2]).toMatchObject({
      classification: 'problematic',
      suppressed: false,
    });
    expect(result).toMatchObject({
      minimumSampleSize: 10,
      easyCorrectRate: 0.9,
      problematicIncorrectRate: 0.7,
    });
  });

  it('uses immutable reward history for card and rarity issuance and suppresses narrow counts', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('with rarities(rarity)')) {
        return {
          rows: [
            {
              rarity: 'common',
              issuance_count: '9',
              total_completions: '20',
              has_suppressed_child: true,
            },
            {
              rarity: 'rare',
              issuance_count: '10',
              total_completions: '20',
              has_suppressed_child: false,
            },
            {
              rarity: 'epic',
              issuance_count: '0',
              total_completions: '20',
              has_suppressed_child: false,
            },
            {
              rarity: 'legendary',
              issuance_count: '0',
              total_completions: '20',
              has_suppressed_child: false,
            },
          ],
        };
      }
      return {
        rows: [
          {
            card_definition_id: CARD_ID,
            card_name: 'Campus Card',
            rarity: 'rare',
            reward_eligible: true,
            issuance_count: '10',
            total_completions: '20',
            total_items: 1,
          },
        ],
      };
    });
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );

    const result = await service.listCardIssuance({
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0]).toMatchObject({
      cardDefinitionId: CARD_ID,
      issuanceCount: 10,
      issuancesPer100Completions: 50,
      suppressed: false,
    });
    expect(result.rarities[0]).toMatchObject({
      rarity: 'common',
      issuanceCount: null,
      issuancesPer100Completions: null,
      suppressed: true,
    });
    expect(result.rarities[1]).toMatchObject({
      rarity: 'rare',
      issuanceCount: 10,
      issuancesPer100Completions: 50,
      suppressed: false,
    });
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'event_completion_card_rewards',
    );
    expect(String(query.mock.calls[0]?.[0])).not.toContain('player_cards');
  });

  it('suppresses a rarity total when one non-zero child card count is suppressed', async () => {
    const suppressedSiblingId = '50000000-0000-4000-8000-000000000002';
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('with rarities(rarity)')) {
        return {
          rows: [
            {
              rarity: 'common',
              issuance_count: '0',
              total_completions: '20',
              has_suppressed_child: false,
            },
            {
              rarity: 'rare',
              issuance_count: '15',
              total_completions: '20',
              has_suppressed_child: true,
            },
            {
              rarity: 'epic',
              issuance_count: '0',
              total_completions: '20',
              has_suppressed_child: false,
            },
            {
              rarity: 'legendary',
              issuance_count: '0',
              total_completions: '20',
              has_suppressed_child: false,
            },
          ],
        };
      }

      return {
        rows: [
          {
            card_definition_id: CARD_ID,
            card_name: 'Disclosed Card',
            rarity: 'rare',
            reward_eligible: true,
            issuance_count: '12',
            total_completions: '20',
            total_items: 2,
          },
          {
            card_definition_id: suppressedSiblingId,
            card_name: 'Suppressed Sibling',
            rarity: 'rare',
            reward_eligible: true,
            issuance_count: '3',
            total_completions: '20',
            total_items: 2,
          },
        ],
      };
    });
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );

    const result = await service.listCardIssuance({
      page: 1,
      pageSize: 25,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardDefinitionId: CARD_ID,
          issuanceCount: 12,
          suppressed: false,
        }),
        expect.objectContaining({
          cardDefinitionId: suppressedSiblingId,
          issuanceCount: null,
          suppressed: true,
        }),
      ]),
    );
    expect(result.rarities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rarity: 'rare',
          issuanceCount: null,
          issuancesPer100Completions: null,
          suppressed: true,
        }),
      ]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('with rarities(rarity)'),
      [null, null, 10],
    );
  });

  it('suppresses card rates when the completion denominator is a small sample', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('with rarities(rarity)')) {
        return {
          rows: [
            {
              rarity: 'common',
              issuance_count: '0',
              total_completions: '5',
              has_suppressed_child: false,
            },
            {
              rarity: 'rare',
              issuance_count: '0',
              total_completions: '5',
              has_suppressed_child: false,
            },
            {
              rarity: 'epic',
              issuance_count: '0',
              total_completions: '5',
              has_suppressed_child: false,
            },
            {
              rarity: 'legendary',
              issuance_count: '0',
              total_completions: '5',
              has_suppressed_child: false,
            },
          ],
        };
      }
      return {
        rows: [
          {
            card_definition_id: CARD_ID,
            card_name: 'Campus Card',
            rarity: 'rare',
            reward_eligible: true,
            issuance_count: '0',
            total_completions: '5',
            total_items: 1,
          },
        ],
      };
    });
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );

    const result = await service.listCardIssuance({
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0]).toMatchObject({
      issuanceCount: null,
      issuancesPer100Completions: null,
      suppressed: true,
    });
    expect(result.rarities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rarity: 'rare',
          issuanceCount: null,
          issuancesPer100Completions: null,
          suppressed: true,
        }),
      ]),
    );
  });

  it.each([
    { fromDate: '2026-09-01' },
    { toDate: '2026-09-02' },
    { fromDate: '2026-09-02', toDate: '2026-09-02' },
    { fromDate: '2026-02-30', toDate: '2026-03-02' },
    { fromDate: '2025-01-01', toDate: '2026-02-01' },
    { page: 0 },
    { pageSize: 101 },
  ])('rejects invalid common analytics filters %#', async (overrides) => {
    const query = vi.fn();
    const service = createAuthorAnalyticsService(
      { query },
      questionPerformanceFixture([]),
    );

    await expect(
      service.listEventLocations({
        mode: 'all',
        page: 1,
        pageSize: 25,
        ...overrides,
      }),
    ).rejects.toBeInstanceOf(InvalidAdvancedAnalyticsFiltersError);
    expect(query).not.toHaveBeenCalled();
  });
});

function questionPerformanceFixture(
  items: Awaited<ReturnType<QuestionPerformanceService['list']>>['items'],
): QuestionPerformanceService {
  return {
    list: vi.fn().mockResolvedValue({
      items,
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      minimumSampleSize: 10,
      problematicIncorrectRate: 0.7,
    }),
  };
}

function questionPerformanceItem(overrides: Record<string, unknown> = {}) {
  return {
    questionId: QUESTION_ID,
    challengeId: CHALLENGE_ID,
    eventId: EVENT_ID,
    eventTitle: 'Great Hall',
    prompt: 'Question?',
    format: 'multiple_choice' as const,
    difficulty: 2 as const,
    status: 'published' as const,
    answerCount: 10,
    correctCount: 5,
    incorrectCount: 5,
    timeoutCount: 0,
    correctRate: 0.5,
    incorrectRate: 0.5,
    hasSufficientSample: true,
    isProblematic: false,
    ...overrides,
  };
}
