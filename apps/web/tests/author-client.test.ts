import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthorApiError,
  createAuthorCard,
  createAuthorChallenge,
  createAuthorCampaign,
  createAuthorEvent,
  createAuthorQuestion,
  listAuthorAdvancedQuestionAnalytics,
  listAuthorCampaigns,
  listAuthorCardIssuanceAnalytics,
  listAuthorEventLocationAnalytics,
  listAuthorEvents,
  listAuthorQuestions,
  listAuthorQuestionPerformance,
  listAuthorReviewQueue,
  publishAuthorEvent,
  transitionAuthorContent,
} from '../src/api/author';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('author-access-token');
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('author API client', () => {
  it('loads the protected author event representation with a bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ events: [eventFixture()], requestId: 'request-events' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(
      listAuthorEvents({ apiBaseUrl, getAccessToken, signal }),
    ).resolves.toEqual([eventFixture()]);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/author/events`, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer author-access-token',
      },
      method: 'GET',
      signal,
    });
  });

  it('accepts an automatic event whose authored location is intentionally unset', async () => {
    const portableEvent = {
      ...eventFixture(),
      automaticPlacement: true,
      latitude: null,
      longitude: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          events: [portableEvent],
          requestId: 'request-portable-events',
        }),
      ),
    );

    await expect(
      listAuthorEvents({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual([portableEvent]);
  });

  it('submits only the event definition fields supported by the API', async () => {
    const input = {
      automaticPlacement: false,
      description: 'East Campus history.',
      endsAt: '2026-09-01T12:00:00.000Z',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      startsAt: '2026-09-01T08:00:00.000Z',
      title: 'Great Hall history',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          event: { ...eventFixture(), ...input },
          requestId: 'request-create',
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createAuthorEvent({
      apiBaseUrl,
      getAccessToken,
      input,
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events`,
      expect.objectContaining({
        body: JSON.stringify(input),
        method: 'POST',
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('isPublished');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('actorPlayerId');
  });

  it('keeps accepted-answer data inside the protected author question client', async () => {
    const question = questionFixture();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          questions: [question],
          requestId: 'request-questions',
        }),
      ),
    );

    await expect(
      listAuthorQuestions({
        apiBaseUrl,
        challengeId,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual([question]);
  });

  it('loads only the bounded aggregate question-performance projection', async () => {
    const item = performanceFixture();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [item],
        minimumSampleSize: 10,
        page: 1,
        pageSize: 25,
        problematicIncorrectRate: 0.7,
        requestId: 'request-performance',
        totalItems: 1,
        totalPages: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAuthorQuestionPerformance({
        apiBaseUrl,
        eventId,
        format: 'ordering',
        difficulty: 2,
        from: '2026-09-01T00:00:00.000Z',
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ items: [item], totalItems: 1 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${apiBaseUrl}/author/question-performance?page=1&pageSize=25&eventId=${eventId}&format=ordering&difficulty=2&from=2026-09-01T00%3A00%3A00.000Z`,
    );
    expect(JSON.stringify(item)).not.toMatch(
      /player|selected|latitude|longitude|location/i,
    );
  });

  it('rejects inconsistent aggregate counts from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ ...performanceFixture(), incorrectCount: 8 }],
          minimumSampleSize: 10,
          page: 1,
          pageSize: 25,
          problematicIncorrectRate: 0.7,
          requestId: 'request-performance',
          totalItems: 1,
          totalPages: 1,
        }),
      ),
    );

    await expect(
      listAuthorQuestionPerformance({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('loads all advanced analytics projections with bounded query parameters', async () => {
    const signal = new AbortController().signal;
    const location = {
      eventId,
      eventTitle: 'Great Hall history',
      locationKind: 'authored',
      locationId: eventId,
      locationName: 'Great Hall history',
      viewCount: 20,
      eligibleCount: 12,
      startCount: 10,
      completionCount: 10,
      suppressed: false,
    } as const;
    const question = {
      answerCount: 20,
      challengeId,
      classification: 'easy',
      correctCount: 19,
      correctRate: 0.95,
      difficulty: 2,
      eventId,
      eventTitle: 'Great Hall history',
      format: 'ordering',
      incorrectCount: 1,
      incorrectRate: 0.05,
      prompt: 'Order the milestones.',
      questionId: '40000000-0000-4000-8000-000000000002',
      status: 'published',
      suppressed: false,
      timeoutCount: 0,
    } as const;
    const card = {
      cardDefinitionId: '50000000-0000-4000-8000-000000000001',
      cardName: 'Campus Owl',
      rarity: 'common',
      rewardEligible: true,
      issuanceCount: 25,
      issuancesPer100Completions: 12.5,
      suppressed: false,
    } as const;
    const rarities = [
      rarityAnalyticsFixture('common', 25, 12.5),
      rarityAnalyticsFixture('rare', 20, 10),
      rarityAnalyticsFixture('epic', 10, 5),
      rarityAnalyticsFixture('legendary', 0, 0),
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [location],
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          minimumSampleSize: 10,
          requestId: 'locations',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [question],
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          minimumSampleSize: 10,
          easyCorrectRate: 0.9,
          problematicIncorrectRate: 0.7,
          requestId: 'questions',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [card],
          rarities,
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          minimumSampleSize: 10,
          requestId: 'cards',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAuthorEventLocationAnalytics({
        apiBaseUrl,
        fromDate: '2026-09-01',
        toDate: '2026-09-08',
        mode: 'ignored',
        getAccessToken,
        signal,
      }),
    ).resolves.toMatchObject({ items: [location], minimumSampleSize: 10 });
    await expect(
      listAuthorAdvancedQuestionAnalytics({
        apiBaseUrl,
        eventId,
        challengeId,
        format: 'ordering',
        difficulty: 2,
        fromDate: '2026-09-01',
        toDate: '2026-09-08',
        getAccessToken,
        signal,
      }),
    ).resolves.toMatchObject({ items: [question], easyCorrectRate: 0.9 });
    await expect(
      listAuthorCardIssuanceAnalytics({
        apiBaseUrl,
        fromDate: '2026-09-01',
        toDate: '2026-09-08',
        getAccessToken,
        signal,
      }),
    ).resolves.toMatchObject({
      items: [card],
      rarities,
      minimumSampleSize: 10,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${apiBaseUrl}/author/analytics/event-locations?fromDate=2026-09-01&toDate=2026-09-08&mode=ignored&page=1&pageSize=25`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${apiBaseUrl}/author/analytics/questions?eventId=${eventId}&challengeId=${challengeId}&format=ordering&difficulty=2&fromDate=2026-09-01&toDate=2026-09-08&page=1&pageSize=25`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${apiBaseUrl}/author/analytics/card-issuance?fromDate=2026-09-01&toDate=2026-09-08&page=1&pageSize=25`,
    );
  });

  it('rejects advanced analytics responses that contradict suppression metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              eventId,
              eventTitle: 'Great Hall history',
              locationKind: 'authored',
              locationId: eventId,
              locationName: 'Great Hall history',
              viewCount: null,
              eligibleCount: 0,
              startCount: 0,
              completionCount: 0,
              suppressed: false,
            },
          ],
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          minimumSampleSize: 10,
          requestId: 'locations',
        }),
      ),
    );

    await expect(
      listAuthorEventLocationAnalytics({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('rejects card analytics without exactly one server summary per rarity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [],
          rarities: [
            rarityAnalyticsFixture('common', 0, 0),
            rarityAnalyticsFixture('common', 0, 0),
            rarityAnalyticsFixture('epic', 0, 0),
            rarityAnalyticsFixture('legendary', 0, 0),
          ],
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
          minimumSampleSize: 10,
          requestId: 'cards',
        }),
      ),
    );

    await expect(
      listAuthorCardIssuanceAnalytics({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('creates an ordering challenge and submits its four-item correct sequence', async () => {
    const challenge = {
      challengeId,
      createdAt: '2026-08-16T08:00:00.000Z',
      eventId,
      format: 'ordering',
      publicationProvenance: null,
      reviewedAt: null,
      reviewedBy: null,
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      updatedAt: '2026-08-16T08:00:00.000Z',
      version: 0,
    } as const;
    const question = orderingQuestionFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ challenge, requestId: 'request-challenge' }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ question, requestId: 'request-question' }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);

    await createAuthorChallenge({
      apiBaseUrl,
      eventId,
      format: 'ordering',
      getAccessToken,
      signal: new AbortController().signal,
    });
    await createAuthorQuestion({
      apiBaseUrl,
      challengeId,
      getAccessToken,
      input: {
        difficulty: 2,
        explanation: 'The milestones follow this historical sequence.',
        format: 'ordering',
        items: ['Milestone 1', 'Milestone 2', 'Milestone 3', 'Milestone 4'],
        prompt: 'Order the milestones.',
      },
      signal: new AbortController().signal,
    });

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ format: 'ordering' }),
        method: 'POST',
      }),
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          difficulty: 2,
          explanation: 'The milestones follow this historical sequence.',
          format: 'ordering',
          items: ['Milestone 1', 'Milestone 2', 'Milestone 3', 'Milestone 4'],
          prompt: 'Order the milestones.',
        }),
        method: 'POST',
      }),
    );
  });

  it('keeps review queue parent identifiers for nested detail routes', async () => {
    const item = {
      canReview: true,
      challengeId,
      entityId: questionFixture().questionId,
      entityType: 'question',
      eventId,
      label: 'multiple_choice question',
      status: 'in_review',
      submittedAt: '2026-08-29T08:00:00.000Z',
      submittedBy: '90000000-0000-4000-8000-000000000002',
      submittedByName: 'Other Author',
      version: 2,
    } as const;
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [item],
        page: 1,
        pageSize: 20,
        requestId: 'request-review',
        totalItems: 1,
        totalPages: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAuthorReviewQueue({
        apiBaseUrl,
        entityType: 'question',
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ items: [item] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${apiBaseUrl}/author/review-queue?page=1&pageSize=20&entityType=question`,
    );
  });

  it('sends a required review-return reason with optimistic version control', async () => {
    const returned = {
      ...eventFixture(),
      authoringStatus: 'draft',
      version: 3,
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ event: returned, requestId: 'request-return' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      transitionAuthorContent({
        action: 'return',
        apiBaseUrl,
        entityId: eventId,
        entityType: 'event',
        expectedVersion: 2,
        getAccessToken,
        reason: 'Clarify the player-facing description.',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(returned);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events/${eventId}/return`,
      expect.objectContaining({
        body: JSON.stringify({
          expectedVersion: 2,
          reason: 'Clarify the player-facing description.',
        }),
        method: 'POST',
      }),
    );
  });

  it('parses an Author-only ordering sequence and rejects malformed positions', async () => {
    const question = orderingQuestionFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ questions: [question], requestId: 'request-ordering' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          questions: [
            {
              ...question,
              items: question.items.map((item, index) =>
                index === 3 ? { ...item, position: 3 } : item,
              ),
            },
          ],
          requestId: 'request-malformed-ordering',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAuthorQuestions({
        apiBaseUrl,
        challengeId,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual([question]);
    await expect(
      listAuthorQuestions({
        apiBaseUrl,
        challengeId,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('loads campaign membership and submits only editable campaign fields', async () => {
    const campaign = campaignFixture();
    const input = {
      description: 'Orientation schedule.',
      endsAt: '2026-09-05T16:00:00.000Z',
      eventIds: [eventId],
      startsAt: '2026-09-01T06:00:00.000Z',
      title: 'Welcome Week',
      trailIds: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ campaigns: [campaign], requestId: 'request-campaigns' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ campaign, requestId: 'request-campaign-create' }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAuthorCampaigns({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual([campaign]);
    await createAuthorCampaign({
      apiBaseUrl,
      getAccessToken,
      input,
      signal: new AbortController().signal,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/author/campaigns`,
      expect.objectContaining({ body: JSON.stringify(input), method: 'POST' }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[1])).not.toContain('status');
  });

  it('submits the category-specific Creature card shape without lifecycle authority', async () => {
    const input = {
      affinity: 'wit' as const,
      category: 'creature' as const,
      description: 'A scholarly creature.',
      effects: [],
      hp: 120,
      imageUrl: null,
      moves: [
        {
          effectType: 'damage' as const,
          effectValue: 12,
          modifierDurationTurns: null,
          modifierOperation: null,
          modifierStat: null,
          moveType: 'basic' as const,
          name: 'Quick Peck',
          position: 1,
          powerCost: 1,
        },
      ],
      name: 'Campus Owl',
      power: 20,
      rarity: 'common' as const,
    };
    const card = cardFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ card, requestId: 'request-card' }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createAuthorCard({
        apiBaseUrl,
        getAccessToken,
        input,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(card);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/cards`,
      expect.objectContaining({ body: JSON.stringify(input), method: 'POST' }),
    );
  });

  it.each([
    [401, 'UNAUTHORIZED', 'authorization'],
    [403, 'AUTHOR_REQUIRED', 'forbidden'],
    [404, 'EVENT_NOT_FOUND', 'not-found'],
    [409, 'CONTENT_STATE_CONFLICT', 'conflict'],
    [422, 'CONTENT_NOT_READY', 'not-ready'],
    [500, 'INTERNAL_ERROR', 'unavailable'],
  ] as const)('maps %s %s to %s', async (status, code, failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code,
            detail: 'Safe contract detail.',
            requestId: 'request-error',
            status,
            title: 'Request failed',
            type: 'about:blank',
          },
          status,
        ),
      ),
    );

    await expect(
      publishAuthorEvent({
        apiBaseUrl,
        eventId,
        expectedVersion: 0,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code,
      failure,
      requestId: 'request-error',
    });
  });

  it('preserves field validation details for accessible form mapping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'VALIDATION_ERROR',
            detail: 'One or more request values are invalid.',
            requestId: 'request-validation',
            status: 400,
            title: 'Request validation failed',
            type: 'about:blank',
            validation: [
              {
                field: '/body/title',
                message: 'must NOT have fewer than 1 characters',
              },
            ],
          },
          400,
        ),
      ),
    );

    await expect(
      createAuthorEvent({
        apiBaseUrl,
        getAccessToken,
        input: {
          automaticPlacement: false,
          endsAt: '2026-09-01T12:00:00.000Z',
          latitude: -26.19205,
          longitude: 28.03038,
          radiusMetres: 75,
          startsAt: '2026-09-01T08:00:00.000Z',
          title: '',
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AuthorApiError>>({
        failure: 'validation',
        validation: [
          {
            field: '/body/title',
            message: 'must NOT have fewer than 1 characters',
          },
        ],
      }),
    );
  });

  it('rejects malformed author data rather than inventing content state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          events: [{ ...eventFixture(), authoringStatus: 'queued' }],
          requestId: 'request-malformed',
        }),
      ),
    );

    await expect(
      listAuthorEvents({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('rejects an inconsistent accepted-answer relationship', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          questions: [
            {
              ...questionFixture(),
              acceptedChoiceId: '30000000-0000-4000-8000-000000000004',
              acceptedChoicePosition: 2,
            },
          ],
          requestId: 'request-malformed-question',
        }),
      ),
    );

    await expect(
      listAuthorQuestions({
        apiBaseUrl,
        challengeId,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

function eventFixture() {
  return {
    automaticPlacement: false,
    authoringStatus: 'draft',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'East Campus history.',
    endsAt: '2026-09-01T12:00:00.000Z',
    eventId,
    isPublished: false,
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    retiredAt: null,
    sourceUrls: [],
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    startsAt: '2026-09-01T08:00:00.000Z',
    title: 'Great Hall history',
    updatedAt: '2026-08-16T08:00:00.000Z',
  } as const;
}

function questionFixture() {
  const acceptedChoiceId = '30000000-0000-4000-8000-000000000002';
  return {
    acceptedChoiceId,
    acceptedChoicePosition: 2,
    challengeId,
    choices: [1, 2, 3, 4].map((position) => ({
      choiceId: `30000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      position,
      text: `Choice ${position}`,
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 2,
    explanation: 'Author-only explanation.',
    format: 'multiple_choice',
    prompt: 'Where is the Great Hall?',
    questionId: '40000000-0000-4000-8000-000000000001',
    sourceUrls: [],
    status: 'draft',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    updatedAt: '2026-08-16T08:00:00.000Z',
  } as const;
}

function orderingQuestionFixture() {
  return {
    challengeId,
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 2,
    explanation: 'The milestones follow this historical sequence.',
    format: 'ordering',
    items: [1, 2, 3, 4].map((position) => ({
      itemId: `42000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      position,
      text: `Milestone ${position}`,
    })),
    prompt: 'Order the milestones.',
    publicationProvenance: null,
    questionId: '40000000-0000-4000-8000-000000000002',
    reviewedAt: null,
    reviewedBy: null,
    sourceUrls: [],
    status: 'draft',
    submittedAt: null,
    submittedBy: null,
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
  } as const;
}

function cardFixture() {
  return {
    affinity: 'wit',
    authoringStatus: 'draft',
    category: 'creature',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'A scholarly creature.',
    effects: [],
    hp: 120,
    id: '50000000-0000-4000-8000-000000000001',
    imageUrl: null,
    isActive: false,
    moves: [
      {
        effectType: 'damage',
        effectValue: 12,
        id: '60000000-0000-4000-8000-000000000001',
        modifierDurationTurns: null,
        modifierOperation: null,
        modifierStat: null,
        moveType: 'basic',
        name: 'Quick Peck',
        position: 1,
        powerCost: 1,
      },
    ],
    name: 'Campus Owl',
    power: 20,
    rarity: 'common',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    updatedAt: '2026-08-16T08:00:00.000Z',
  } as const;
}

function performanceFixture() {
  return {
    answerCount: 10,
    challengeId,
    correctCount: 3,
    correctRate: 0.3,
    difficulty: 2,
    eventId,
    eventTitle: 'Great Hall history',
    format: 'ordering',
    hasSufficientSample: true,
    incorrectCount: 7,
    incorrectRate: 0.7,
    isProblematic: true,
    prompt: 'Order the milestones.',
    questionId: '40000000-0000-4000-8000-000000000002',
    status: 'published',
    timeoutCount: 1,
  } as const;
}

function rarityAnalyticsFixture(
  rarity: 'common' | 'rare' | 'epic' | 'legendary',
  issuanceCount: number | null,
  issuancesPer100Completions: number | null,
  suppressed = false,
) {
  return {
    rarity,
    issuanceCount,
    issuancesPer100Completions,
    suppressed,
  } as const;
}

function campaignFixture() {
  return {
    campaignId: '70000000-0000-4000-8000-000000000001',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'Orientation schedule.',
    endsAt: '2026-09-05T16:00:00.000Z',
    events: [
      {
        authoringStatus: 'published',
        endsAt: '2026-09-03T16:00:00.000Z',
        eventId,
        startsAt: '2026-09-01T08:00:00.000Z',
        title: 'Great Hall history',
      },
    ],
    publicationProvenance: null,
    publishedAt: null,
    retiredAt: null,
    reviewedAt: null,
    reviewedBy: null,
    startsAt: '2026-09-01T06:00:00.000Z',
    status: 'draft',
    submittedAt: null,
    submittedBy: null,
    title: 'Welcome Week',
    trails: [],
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
  } as const;
}

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
