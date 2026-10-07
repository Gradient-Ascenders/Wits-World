import { selectOption } from './fixtures/select-option';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
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
function renderWorkspace(path = '/author/analytics') {
  window.history.replaceState({}, '', path);
  return render(
    <Router>
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />
    </Router>,
  );
}

describe('desktop analytics workspace', () => {
  it('opens on server-grouped attention signals and loads other reports only when visited', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    renderWorkspace();
    const table = await screen.findByRole('region', {
      name: 'Event attention results',
    });
    expect(
      within(table).getByRole('link', { name: 'Great Hall' }),
    ).toHaveAttribute('href', `/author/events/${eventId}`);
    expect(
      within(table).getByRole('link', { name: 'Review question' }),
    ).toHaveAttribute(
      'href',
      `/author/events/${eventId}/challenges/${challengeId}/questions/${questionId}`,
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(analyticsCallCount(fetchMock)).toBe(1);
    expect(
      screen.queryByRole('navigation', { name: 'Event attention pages' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Locations' }));
    expect(
      await screen.findByRole('region', { name: 'Location analytics results' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Event attention results' }),
    ).not.toBeInTheDocument();
    expect(analyticsCallCount(fetchMock)).toBe(2);
  });

  it('keeps hidden values distinct from zero in comparison charts and textual tables', async () => {
    const user = userEvent.setup();
    installApi({
      locations: [
        locationItem({ eligibleCount: 0 }),
        locationItem({
          locationId: '40000000-0000-4000-8000-000000000002',
          locationName: 'Library lawns',
          viewCount: null,
          suppressed: true,
        }),
      ],
      questions: [
        questionItem(),
        questionItem({
          questionId: '30000000-0000-4000-8000-000000000002',
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
          questionId: '30000000-0000-4000-8000-000000000003',
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
    renderWorkspace('/author/analytics/locations');
    const table = await screen.findByRole('region', {
      name: 'Location analytics results',
    });
    expect(within(table).getByText('Hidden')).toBeVisible();
    expect(within(table).getAllByText('0').length).toBeGreaterThan(0);
    const hiddenRow = screen.getByRole('img', {
      name: /Library lawns: Hidden/,
    });
    expect(hiddenRow.querySelector('.analytics-plot__mark')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Questions' }));
    const questions = await screen.findByRole('region', {
      name: 'Question analytics results',
    });
    expect(within(questions).getByText('May be too hard')).toBeVisible();
    expect(within(questions).getByText('Hidden (<10)')).toBeVisible();
    expect(within(questions).getByText('No outcomes')).toBeVisible();
    expect(
      screen
        .getByRole('img', { name: /Unattempted question: No outcomes/ })
        .querySelector('.analytics-plot__mark'),
    ).toBeNull();
    expect(
      within(questions).getByRole('link', { name: 'Where is the Great Hall?' }),
    ).toHaveAttribute(
      'href',
      `/author/events/${eventId}/challenges/${challengeId}/questions/${questionId}`,
    );
    await user.click(screen.getByRole('link', { name: 'Rewards' }));
    const cards = await screen.findByRole('region', {
      name: 'Card issuance results',
    });
    expect(
      within(cards).getByRole('link', { name: 'Campus Owl' }),
    ).toHaveAttribute('href', `/author/cards/${cardId}`);
    expect(
      screen
        .getByRole('img', { name: /Rare: Hidden/ })
        .querySelector('.analytics-plot__mark'),
    ).toBeNull();
    await user.click(screen.getByText('Rarity values', { exact: true }));
    expect(
      screen.getByRole('region', { name: 'Rarity issuance summary' }),
    ).toBeVisible();
    expect(
      screen.queryByText(/player identity|latitude|longitude/i),
    ).not.toBeInTheDocument();
  });

  it('shares an inclusive UTC period across report navigation and resets pages before fetching', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    renderWorkspace();
    await screen.findByRole('region', { name: 'Event attention results' });
    await selectOption(
      user,
      screen.getByLabelText('Reporting period'),
      'custom',
    );
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-09-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply period' }));
    await user.click(screen.getByRole('link', { name: 'Locations' }));
    await screen.findByRole('region', { name: 'Location analytics results' });
    const requests = fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/author/analytics/'))
      .map(([input]) => new URL(String(input)));
    for (const request of requests.slice(1)) {
      expect(request.searchParams.get('fromDate')).toBe('2026-09-01');
      expect(request.searchParams.get('toDate')).toBe('2026-09-02');
      expect(request.searchParams.get('page')).toBe('1');
    }
    expect(screen.getByRole('button', { name: /Custom dates/ })).toBeVisible();
  });

  it('rejects incomplete and overlong dates without changing the applied report', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    renderWorkspace();
    await screen.findByRole('region', { name: 'Event attention results' });
    const initial = analyticsCallCount(fetchMock);
    await selectOption(
      user,
      screen.getByLabelText('Reporting period'),
      'custom',
    );
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-09-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply period' }));
    expect(screen.getByText('Choose a start and end date.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2027-09-03' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply period' }));
    expect(
      screen.getByText('Choose a period of 366 days or less.'),
    ).toBeVisible();
    expect(analyticsCallCount(fetchMock)).toBe(initial);
  });

  it('retains question filters across report switches and does not send them to other reports', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi();
    renderWorkspace('/author/analytics/questions');
    await screen.findByRole('region', { name: 'Question analytics results' });
    await selectOption(user, screen.getByLabelText('Event'), eventId);
    await user.click(screen.getByText('More filters', { exact: true }));
    await selectOption(user, screen.getByLabelText('Challenge'), challengeId);
    await selectOption(
      user,
      screen.getByLabelText('Format'),
      'multiple_choice',
    );
    await selectOption(user, screen.getByLabelText('Difficulty'), '2');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => {
      const latest = new URL(
        String(
          fetchMock.mock.calls
            .filter(([input]) =>
              String(input).includes('/analytics/questions?'),
            )
            .at(-1)?.[0],
        ),
      );
      expect(latest.searchParams.get('eventId')).toBe(eventId);
      expect(latest.searchParams.get('challengeId')).toBe(challengeId);
      expect(latest.searchParams.get('format')).toBe('multiple_choice');
      expect(latest.searchParams.get('difficulty')).toBe('2');
    });
    await user.click(screen.getByRole('link', { name: 'Locations' }));
    await screen.findByRole('region', { name: 'Location analytics results' });
    expect(
      String(
        fetchMock.mock.calls
          .filter(([input]) =>
            String(input).includes('/analytics/event-locations?'),
          )
          .at(-1)?.[0],
      ),
    ).not.toContain('eventId=');
    await user.click(screen.getByRole('link', { name: 'Questions' }));
    expect(screen.getByLabelText('Event')).toHaveTextContent('Great Hall');
    expect(screen.getByLabelText('Difficulty')).toHaveTextContent('2');
  });

  it('keeps failed reports independently recoverable with their filters', async () => {
    const user = userEvent.setup();
    let popularAttempts = 0;
    installApi({
      handleRequest(url) {
        if (
          url.pathname.endsWith('/analytics/event-locations') &&
          url.searchParams.get('mode') === 'popular' &&
          ++popularAttempts === 1
        )
          return problemResponse(
            503,
            'INTERNAL_ERROR',
            'Location analytics temporarily unavailable.',
          );
        return undefined;
      },
    });
    renderWorkspace('/author/analytics/locations');
    await screen.findByRole('region', { name: 'Location analytics results' });
    await selectOption(user, screen.getByLabelText('Location view'), 'popular');
    await screen.findByRole('button', { name: 'Retry update' });
    expect(
      screen.getByRole('region', { name: 'Location analytics results' }),
    ).toBeVisible();
    expect(screen.getByText(/Showing previous results/)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Rewards' }));
    expect(
      await screen.findByRole('region', { name: 'Card issuance results' }),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Locations' }));
    expect(screen.getByLabelText('Location view')).toHaveTextContent(
      'Popular locations',
    );
    await user.click(screen.getByRole('button', { name: 'Retry update' }));
    expect(
      await screen.findByRole('region', { name: 'Location analytics results' }),
    ).toBeVisible();
    expect(popularAttempts).toBe(2);
  });

  it('recovers pagination when results shrink and hides single-page navigation', async () => {
    const user = userEvent.setup();
    let requests = 0;
    const fetchMock = installApi({
      handleRequest(url) {
        if (!url.pathname.endsWith('/analytics/questions')) return undefined;
        requests += 1;
        return jsonResponse(
          analyticsPage(requests === 2 ? [] : [questionItem()], {
            minimumSampleSize: 10,
            easyCorrectRate: 0.9,
            problematicIncorrectRate: 0.7,
            page: requests === 2 ? 2 : 1,
            totalItems: requests === 1 ? 26 : 1,
            totalPages: requests === 1 ? 2 : 1,
          }),
        );
      },
    });
    renderWorkspace('/author/analytics/questions');
    const navigation = await screen.findByRole('navigation', {
      name: 'Question analytics pages',
    });
    await user.click(within(navigation).getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Question analytics pages' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('region', { name: 'Question analytics results' }),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls
        .filter(([input]) => String(input).includes('/analytics/questions?'))
        .map(([input]) => new URL(String(input)).searchParams.get('page')),
    ).toEqual(['1', '2', '1']);
  });

  it('distinguishes empty reports from a lack of reportable attention signals', async () => {
    const user = userEvent.setup();
    installApi({ attention: [], locations: [], questions: [] });
    renderWorkspace();
    expect(await screen.findByText('No attention signals')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Locations' }));
    expect(await screen.findByText('No location activity')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Questions' }));
    expect(await screen.findByText('No question outcomes')).toBeVisible();
  });
});

interface InstallOptions {
  attention?: object[];
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

    if (url.pathname.endsWith('/author/analytics/attention')) {
      return jsonResponse(
        analyticsPage(
          options.attention ?? [
            {
              eventId,
              eventTitle: 'Great Hall',
              ignoredLocationCount: 1,
              easyQuestionCount: 0,
              hardQuestionCount: 1,
              questionId,
              challengeId,
            },
          ],
          { minimumSampleSize: 10 },
        ),
      );
    }
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
    automaticPlacement: false,
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
