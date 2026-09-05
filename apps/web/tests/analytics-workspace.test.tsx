import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsWorkspace } from '../src/components/author/AnalyticsWorkspace';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('author-token');
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const questionId = '30000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('question performance workspace', () => {
  it('shows aggregate counts, threshold status, and an editable-content link', async () => {
    const fetchMock = installApi([performanceItem()]);
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(await screen.findByText('Where is the Great Hall?')).toBeVisible();
    expect(screen.getByText('Problematic')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText('(70.0%)')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open question' })).toHaveAttribute(
      'href',
      `/author/events/${eventId}/challenges/${challengeId}/questions/${questionId}`,
    );
    const resultsRegion = screen.getByRole('region', {
      name: 'Question performance results',
    });
    expect(resultsRegion).toHaveAttribute('tabindex', '0');
    expect(resultsRegion).toHaveAccessibleDescription(
      /focus the results and scroll horizontally/i,
    );
    expect(
      screen.queryByText(/player|selected answer|location/i),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/author/question-performance?page=1&pageSize=25',
      ),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('applies composable filters and distinguishes an insufficient sample', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi([
      performanceItem({
        answerCount: 9,
        correctCount: 0,
        incorrectCount: 9,
        correctRate: 0,
        hasSufficientSample: false,
        incorrectRate: 1,
        isProblematic: false,
      }),
    ]);
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(await screen.findByText('Need 1 more')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Event'), eventId);
    await screen.findByRole('option', { name: 'MCQ challenge 1' });
    await user.selectOptions(screen.getByLabelText('Challenge'), challengeId);
    await user.selectOptions(
      screen.getByLabelText('Format'),
      'multiple_choice',
    );
    await user.selectOptions(screen.getByLabelText('Difficulty'), '2');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => {
      const analyticsCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/author/question-performance?'),
      );
      expect(String(analyticsCalls.at(-1)?.[0])).toContain(
        `eventId=${eventId}`,
      );
      expect(String(analyticsCalls.at(-1)?.[0])).toContain(
        `challengeId=${challengeId}`,
      );
      expect(String(analyticsCalls.at(-1)?.[0])).toContain(
        'format=multiple_choice',
      );
      expect(String(analyticsCalls.at(-1)?.[0])).toContain('difficulty=2');
    });
  });

  it('renders a useful empty state', async () => {
    installApi([]);
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );
    expect(
      await screen.findByText('No completed question outcomes'),
    ).toBeVisible();
  });

  it('recovers to the last valid page when matching results shrink', async () => {
    const user = userEvent.setup();
    let filteredPageOneRequests = 0;
    const fetchMock = installApi([performanceItem()], (url) => {
      const page = Number(url.searchParams.get('page'));
      const isFiltered = url.searchParams.get('format') === 'multiple_choice';

      if (!isFiltered) return analyticsPage([performanceItem()]);
      if (page === 2) {
        return analyticsPage([], {
          page: 2,
          totalItems: 1,
          totalPages: 1,
        });
      }

      filteredPageOneRequests += 1;
      return analyticsPage([performanceItem()], {
        totalItems: filteredPageOneRequests === 1 ? 26 : 1,
        totalPages: filteredPageOneRequests === 1 ? 2 : 1,
      });
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
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('Page 1 of 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page 1 of 1')).toBeVisible();
    expect(screen.getByText('Where is the Great Hall?')).toBeVisible();
    expect(
      screen.queryByText('No completed question outcomes'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Format')).toHaveValue('multiple_choice');

    const analyticsCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/author/question-performance?'),
    );
    expect(
      analyticsCalls.map(([url]) =>
        new URL(String(url)).searchParams.get('page'),
      ),
    ).toEqual(['1', '1', '2', '1']);
  });

  it('shows decimal precision on both sides of the flagging boundary', async () => {
    installApi([
      performanceItem({
        answerCount: 200,
        correctCount: 61,
        incorrectCount: 139,
        correctRate: 0.305,
        incorrectRate: 0.695,
        timeoutCount: 0,
        isProblematic: false,
      }),
    ]);
    render(
      <AnalyticsWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(await screen.findByText('(30.5%)')).toBeVisible();
    expect(screen.getByText('(69.5%)')).toBeVisible();
    expect(screen.getByText('Not flagged')).toBeVisible();
    expect(screen.queryByText('(70.0%)')).not.toBeInTheDocument();
  });
});

function installApi(items: object[], analyticsResponse?: (url: URL) => object) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith('/author/events')) {
      return jsonResponse({ events: [event()], requestId: 'events' });
    }
    if (path.endsWith(`/author/events/${eventId}/challenges`)) {
      return jsonResponse({
        challenges: [challenge()],
        requestId: 'challenges',
      });
    }
    if (path.endsWith('/author/question-performance')) {
      return jsonResponse(analyticsResponse?.(url) ?? analyticsPage(items));
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function analyticsPage(
  items: object[],
  overrides: Record<string, unknown> = {},
) {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalItems: items.length,
    totalPages: items.length ? 1 : 0,
    minimumSampleSize: 10,
    problematicIncorrectRate: 0.7,
    requestId: 'analytics',
    ...overrides,
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

function performanceItem(overrides: Record<string, unknown> = {}) {
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
    hasSufficientSample: true,
    isProblematic: true,
    ...overrides,
  };
}

function jsonResponse(payload: object) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}
