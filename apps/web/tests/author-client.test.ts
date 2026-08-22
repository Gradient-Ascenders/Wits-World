import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthorApiError,
  createAuthorCard,
  createAuthorEvent,
  listAuthorEvents,
  listAuthorQuestions,
  publishAuthorEvent,
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

  it('submits only the event definition fields supported by the API', async () => {
    const input = {
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
          events: [{ ...eventFixture(), authoringStatus: 'approved' }],
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
    prompt: 'Where is the Great Hall?',
    questionId: '40000000-0000-4000-8000-000000000001',
    status: 'draft',
    updatedAt: '2026-08-16T08:00:00.000Z',
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
    updatedAt: '2026-08-16T08:00:00.000Z',
  } as const;
}

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
