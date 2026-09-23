import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsWorkspace } from '../src/components/author/AnalyticsWorkspace';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('author-token');
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const questionId = '30000000-0000-4000-8000-000000000001';
const locationId = '40000000-0000-4000-8000-000000000001';
const cardId = '50000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('advanced analytics workspace', () => {
  it('renders privacy-safe location, question, and card analytics with textual chart equivalents', async () => {
    installApi({
      locations: [
        locationItem({
          eligibleCount: 0,
          startCount: 0,
          completionCount: 0,
        }),
        locationItem({
          locationId: '40000000-0000-4000-8000-000000000002',
          locationName: 'Library lawns',
          viewCount: null,
          eligibleCount: 0,
          startCount: 0,
          completionCount: 0,
          suppressed: true,
        }),
      ],
      questions: [
        questionItem(),
        questionItem({
          questionId: '30000000-0000-4000-8000-000000000002',
          prompt: 'Which year was Wits founded?',
          answerCount: 20,
          correctCount: 19,
          incorrectCount: 1,
          timeoutCount: 0,
          correctRate: 0.95,
          incorrectRate: 0.05,
          classification: 'easy',
        }),
        questionItem({
          questionId: '30000000-0000-4000-8000-000000000003',
          prompt: 'Small sample question',
          answerCount: null,
          correctCount: null,
          incorrectCount: null,
          timeoutCount: null,
          correctRate: null,
          incorrectRate: null,
          classification: 'suppressed',
          suppressed: true,
        }),
        questionItem({
          questionId: '30000000-0000-4000-8000-000000000004',
          prompt: 'Unattempted question',
          answerCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          timeoutCount: 0,
          correctRate: 0,
          incorrectRate: 0,
          classification: 'normal',
        }),
      ],
    });

    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(
      (await screen.findAllByText('Great Hall main site')).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Library lawns').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Suppressed \(<10\)/).length).toBeGreaterThan(0);

    expect(
      screen.getByRole('heading', {
        name: /Activity stages for the first 2 locations/i,
      }),
    ).toBeVisible();

    expect(await screen.findByText('Where is the Great Hall?')).toBeVisible();
    expect(screen.getByText('Potentially too hard')).toBeVisible();
    expect(screen.getByText('Potentially too easy')).toBeVisible();
    expect(screen.getByText('No outcomes')).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Open question' }).at(0),
    ).toHaveAttribute(
      'href',
      `/author/events/${eventId}/challenges/${challengeId}/questions/${questionId}`,
    );

    expect(await screen.findByText('Campus Owl')).toBeVisible();
    expect(screen.getAllByText('12.5').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', {
        name: 'Issuances per 100 completions by rarity',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Rarity issuance summary' }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Card issuance results' }),
    ).toBeVisible();

    for (const name of [
      'Location analytics results',
      'Question analytics results',
      'Rarity issuance summary',
      'Card issuance results',
    ]) {
      const region = screen.getByRole('region', { name });
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toHaveAccessibleDescription(/scroll horizontally/i);
    }

    expect(
      screen.queryByText(/selected answer|latitude|longitude|player identity/i),
    ).not.toBeInTheDocument();
  });

  it('sends an inclusive human-facing date range as the API exclusive upper bound', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    await screen.findByText('Campus Owl');
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-09-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply period' }));

    await waitFor(() => {
      const analyticsCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/author/analytics/'),
      );
      const latestByPath = new Map<string, URL>();
      for (const [input] of analyticsCalls) {
        const url = new URL(String(input));
        latestByPath.set(url.pathname, url);
      }
      expect(latestByPath.size).toBe(3);
      for (const url of latestByPath.values()) {
        expect(url.searchParams.get('fromDate')).toBe('2026-09-01');
        expect(url.searchParams.get('toDate')).toBe('2026-09-02');
      }
    });
  });

  it('rejects incomplete and overlong date ranges before changing the report', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );
    await screen.findByText('Campus Owl');
    const initialAnalyticsCalls = analyticsCallCount(fetchMock);

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-09-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply period' }));
    expect(
      screen.getByText('Choose both a start date and an end date.'),
    ).toBeVisible();
    expect(analyticsCallCount(fetchMock)).toBe(initialAnalyticsCalls);

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2027-09-03' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply period' }));
    expect(
      screen.getByText('The reporting period cannot exceed 366 days.'),
    ).toBeVisible();
    expect(analyticsCallCount(fetchMock)).toBe(initialAnalyticsCalls);
  });

  it('composes question content filters without applying them to other reports', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );
    await screen.findByText('Where is the Great Hall?');

    await user.selectOptions(screen.getByLabelText('Event'), eventId);
    await screen.findByRole('option', { name: 'MCQ challenge 1' });
    await user.selectOptions(screen.getByLabelText('Challenge'), challengeId);
    await user.selectOptions(
      screen.getByLabelText('Format'),
      'multiple_choice',
    );
    await user.selectOptions(screen.getByLabelText('Difficulty'), '2');
    await user.click(
      screen.getByRole('button', { name: 'Apply question filters' }),
    );

    await waitFor(() => {
      const questionCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/author/analytics/questions?'),
      );
      const latest = new URL(String(questionCalls.at(-1)?.[0]));
      expect(latest.searchParams.get('eventId')).toBe(eventId);
      expect(latest.searchParams.get('challengeId')).toBe(challengeId);
      expect(latest.searchParams.get('format')).toBe('multiple_choice');
      expect(latest.searchParams.get('difficulty')).toBe('2');
    });

    const locationCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/author/analytics/event-locations?'),
    );
    const cardCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/author/analytics/card-issuance?'),
    );
    expect(String(locationCalls.at(-1)?.[0])).not.toContain('eventId=');
    expect(String(cardCalls.at(-1)?.[0])).not.toContain('eventId=');
  });

  it('uses the server location mode and keeps other analytics usable when that report fails', async () => {
    const user = userEvent.setup();
    let popularAttempts = 0;
    installApi({
      handleRequest(url) {
        if (
          url.pathname.endsWith('/author/analytics/event-locations') &&
          url.searchParams.get('mode') === 'popular'
        ) {
          popularAttempts += 1;
          if (popularAttempts === 1) {
            return problemResponse(
              503,
              'INTERNAL_ERROR',
              'Location analytics are temporarily unavailable.',
            );
          }
        }
        return undefined;
      },
    });
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );
    await screen.findByText('Campus Owl');

    await user.selectOptions(screen.getByLabelText('Location view'), 'popular');
    expect(
      await screen.findByText(
        'The service could not complete this request. Check your connection and try again. No content change was confirmed.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Where is the Great Hall?')).toBeVisible();
    expect(screen.getByText('Campus Owl')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      (await screen.findAllByText('Great Hall main site')).length,
    ).toBeGreaterThan(0);
    expect(popularAttempts).toBe(2);
  });

  it('recovers question pagination to the last valid page when filtered results shrink', async () => {
    const user = userEvent.setup();
    let filteredPageOneRequests = 0;
    const fetchMock = installApi({
      handleRequest(url) {
        if (!url.pathname.endsWith('/author/analytics/questions'))
          return undefined;
        const page = Number(url.searchParams.get('page'));
        const isFiltered = url.searchParams.get('format') === 'multiple_choice';
        if (!isFiltered) return undefined;
        if (page === 2) {
          return jsonResponse(
            analyticsPage([], {
              minimumSampleSize: 10,
              easyCorrectRate: 0.9,
              problematicIncorrectRate: 0.7,
              page: 2,
              totalItems: 1,
              totalPages: 1,
            }),
          );
        }
        filteredPageOneRequests += 1;
        return jsonResponse(
          analyticsPage([questionItem()], {
            minimumSampleSize: 10,
            easyCorrectRate: 0.9,
            problematicIncorrectRate: 0.7,
            totalItems: filteredPageOneRequests === 1 ? 26 : 1,
            totalPages: filteredPageOneRequests === 1 ? 2 : 1,
          }),
        );
      },
    });
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );
    await screen.findByText('Where is the Great Hall?');

    await user.selectOptions(
      screen.getByLabelText('Format'),
      'multiple_choice',
    );
    await user.click(
      screen.getByRole('button', { name: 'Apply question filters' }),
    );
    const pagination = await screen.findByRole('navigation', {
      name: 'Question analytics pages',
    });
    expect(within(pagination).getByText('Page 1 of 2')).toBeVisible();
    await user.click(within(pagination).getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(
        within(
          screen.getByRole('navigation', { name: 'Question analytics pages' }),
        ).getByText('Page 1 of 1'),
      ).toBeVisible();
    });
    const questionCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/author/analytics/questions?'),
    );
    expect(
      questionCalls.map(([input]) =>
        new URL(String(input)).searchParams.get('page'),
      ),
    ).toEqual(['1', '1', '2', '1']);
  });

  it('shows independent empty states for location and question reports', async () => {
    installApi({ locations: [], questions: [] });
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(await screen.findByText('No location activity')).toBeVisible();
    expect(
      await screen.findByText('No completed question outcomes'),
    ).toBeVisible();
    expect(screen.getByText('Campus Owl')).toBeVisible();
  });
});

interface InstallOptions {
  locations?: object[];
  questions?: object[];
  cards?: object[];
  handleRequest?: (url: URL) => Response | undefined;
}

function installApi(options: InstallOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const overridden = options.handleRequest?.(url);
    if (overridden) return overridden;

    if (url.pathname.endsWith('/author/events')) {
      return jsonResponse({ events: [event()], requestId: 'events' });
    }
    if (url.pathname.endsWith(`/author/events/${eventId}/challenges`)) {
      return jsonResponse({
        challenges: [challenge()],
        requestId: 'challenges',
      });
    }
    if (url.pathname.endsWith('/author/analytics/event-locations')) {
      return jsonResponse(
        analyticsPage(options.locations ?? [locationItem()], {
          minimumSampleSize: 10,
        }),
      );
    }
    if (url.pathname.endsWith('/author/analytics/questions')) {
      return jsonResponse(
        analyticsPage(options.questions ?? [questionItem()], {
          minimumSampleSize: 10,
          easyCorrectRate: 0.9,
          problematicIncorrectRate: 0.7,
        }),
      );
    }
    if (url.pathname.endsWith('/author/analytics/card-issuance')) {
      return jsonResponse(
        analyticsPage(options.cards ?? [cardItem()], {
          minimumSampleSize: 10,
          rarities: rarityItems(),
        }),
      );
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function analyticsPage(items: object[], overrides: Record<string, unknown>) {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalItems: items.length,
    totalPages: items.length ? 1 : 0,
    requestId: 'analytics',
    ...overrides,
  };
}

function locationItem(overrides: Record<string, unknown> = {}) {
  return {
    eventId,
    eventTitle: 'Great Hall',
    locationKind: 'authored',
    locationId,
    locationName: 'Great Hall main site',
    viewCount: 40,
    eligibleCount: 24,
    startCount: 18,
    completionCount: 12,
    suppressed: false,
    ...overrides,
  };
}

function questionItem(overrides: Record<string, unknown> = {}) {
  return {
    questionId,
    challengeId,
    eventId,
    eventTitle: 'Great Hall',
    prompt: 'Where is the Great Hall?',
    format: 'multiple_choice',
    difficulty: 2,
    status: 'published',
    answerCount: 10,
    correctCount: 3,
    incorrectCount: 7,
    timeoutCount: 1,
    correctRate: 0.3,
    incorrectRate: 0.7,
    classification: 'problematic',
    suppressed: false,
    ...overrides,
  };
}

function cardItem(overrides: Record<string, unknown> = {}) {
  return {
    cardDefinitionId: cardId,
    cardName: 'Campus Owl',
    rarity: 'common',
    rewardEligible: true,
    issuanceCount: 25,
    issuancesPer100Completions: 12.5,
    suppressed: false,
    ...overrides,
  };
}

function rarityItems() {
  return [
    rarityItem('common', 25, 12.5),
    rarityItem('rare', null, null, true),
    rarityItem('epic', 0, 0),
    rarityItem('legendary', 10, 5),
  ];
}

function rarityItem(
  rarity: string,
  issuanceCount: number | null,
  issuancesPer100Completions: number | null,
  suppressed = false,
) {
  return {
    rarity,
    issuanceCount,
    issuancesPer100Completions,
    suppressed,
  };
}

function event() {
  return {
    authoringStatus: 'published',
    createdAt: '2026-09-01T00:00:00.000Z',
    description: null,
    endsAt: '2026-09-30T00:00:00.000Z',
    eventId,
    isPublished: true,
    latitude: -26.19,
    longitude: 28.03,
    radiusMetres: 50,
    retiredAt: null,
    startsAt: '2026-09-01T00:00:00.000Z',
    title: 'Great Hall',
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: 'reviewed',
  };
}

function challenge() {
  return {
    challengeId,
    createdAt: '2026-09-01T00:00:00.000Z',
    eventId,
    format: 'multiple_choice',
    status: 'published',
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: 'reviewed',
  };
}

function analyticsCallCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).includes('/author/analytics/'),
  ).length;
}

function jsonResponse(payload: object, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problemResponse(status: number, code: string, detail: string) {
  return jsonResponse(
    {
      type: 'about:blank',
      title: 'Analytics unavailable',
      status,
      code,
      detail,
      requestId: 'analytics-error',
    },
    status,
  );
}
