import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '../src/App';
import type {
  AuthorChallenge,
  AuthorEvent,
  AuthorMultipleChoiceQuestion,
} from '../src/api/author';
import { GuardedRouter } from '../src/components/author/AuthorNavigationGuard';
import { authorPaths } from '../src/components/author/author-routing';

const apiBaseUrl = 'https://api.example.test/api/v1';
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const questionId = '40000000-0000-4000-8000-000000000001';
const authorId = '90000000-0000-4000-8000-000000000001';
const otherAuthorId = '90000000-0000-4000-8000-000000000002';
const mapboxAccessToken = 'pk.test-token';

afterEach(() => vi.unstubAllGlobals());

describe('author lifecycle coverage regressions', () => {
  it('approves a question from its routed detail and reconciles the server record', async () => {
    const user = userEvent.setup();
    const question = questionFixture({ status: 'in_review', version: 7 });
    const approved = questionFixture({
      reviewedAt: '2026-09-01T10:00:00.000Z',
      reviewedBy: authorId,
      status: 'approved',
      version: 8,
    });
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [question],
      transition: async ({ path, init }) => {
        expect(path).toBe(`/author/questions/${questionId}/approve`);
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 7 });
        return jsonResponse({
          question: approved,
          requestId: 'approve-question',
        });
      },
    });
    renderAuthorRoute(authorPaths.question(eventId, challengeId, questionId));

    expect(
      await screen.findByRole('article', { name: question.prompt }),
    ).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Approve question' }),
    );

    expect(await screen.findByText('Question approved.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Publish question' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Approve question' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/questions/${questionId}/approve`,
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 7 }),
        method: 'POST',
      }),
    );
  });

  it('reloads authoritative challenge state after a version conflict', async () => {
    const user = userEvent.setup();
    let conflictOccurred = false;
    const fetchMock = installAuthorApi({
      challengeReads: () => [
        challengeFixture(
          conflictOccurred
            ? { status: 'approved', version: 5, reviewedBy: authorId }
            : { status: 'in_review', version: 4 },
        ),
      ],
      transition: async ({ path, init }) => {
        expect(path).toBe(`/author/challenges/${challengeId}/approve`);
        expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 4 });
        conflictOccurred = true;
        return problemResponse(
          409,
          'STALE_CONTENT_VERSION',
          'Challenge changed on the server.',
        );
      },
    });
    renderAuthorRoute(authorPaths.challengeReview(eventId, challengeId));

    expect(
      await screen.findByText('Multiple choice · in review'),
    ).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Approve challenge' }),
    );

    await waitFor(() => expect(conflictOccurred).toBe(true));
    expect(
      await screen.findByRole('button', { name: 'Publish challenge' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Approve challenge' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/authoritative state was reloaded/u)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/challenges/${challengeId}/approve`,
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 4 }),
        method: 'POST',
      }),
    );
  });

  it('keeps challenge review actionable after a server error and retries against the same version', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture({ status: 'in_review', version: 6 })],
      transition: async ({ path, init }) => {
        expect(path).toBe(`/author/challenges/${challengeId}/approve`);
        expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 6 });
        attempts += 1;
        return attempts === 1
          ? problemResponse(
              500,
              'INTERNAL_ERROR',
              'Review service is temporarily unavailable.',
            )
          : jsonResponse({
              challenge: challengeFixture({
                reviewedAt: '2026-09-01T10:00:00.000Z',
                reviewedBy: authorId,
                status: 'approved',
                version: 7,
              }),
              requestId: 'approve-challenge-retry',
            });
      },
    });
    renderAuthorRoute(authorPaths.challengeReview(eventId, challengeId));

    await user.click(
      await screen.findByRole('button', { name: 'Approve challenge' }),
    );
    expect(
      await screen.findByText(
        'The service could not complete this request. Check your connection and try again. No content change was confirmed.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Approve challenge' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Approve challenge' }));

    expect(
      await screen.findByRole('button', { name: 'Publish challenge' }),
    ).toBeEnabled();
    expect(
      screen.queryByText(/service could not complete this request/u),
    ).not.toBeInTheDocument();
    expect(attempts).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/approve'),
      ),
    ).toHaveLength(2);
  });
});

interface TransitionRequest {
  init?: RequestInit;
  path: string;
}

interface ApiOptions {
  challenges?: AuthorChallenge[];
  challengeReads?: () => AuthorChallenge[];
  questions?: AuthorMultipleChoiceQuestion[];
  transition?: (request: TransitionRequest) => Promise<Response> | Response;
}

function installAuthorApi(options: ApiOptions = {}) {
  const events = [eventFixture()];
  let challenges = [...(options.challenges ?? [challengeFixture()])];
  const questions = [...(options.questions ?? [])];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace('/api/v1', '');
      const method = init?.method ?? 'GET';

      if (path === '/auth/me')
        return jsonResponse({
          connectionStrategy: 'auth0',
          id: authorId,
          lifecycleStatus: 'active',
          playerName: 'test-author',
          playerNameSetupRequired: false,
          requestId: 'author-me',
          role: 'author',
        });
      if (path === '/author/cards' && method === 'GET')
        return jsonResponse({ cards: [], requestId: 'author-cards' });
      if (path === '/author/events' && method === 'GET')
        return jsonResponse({ events, requestId: 'author-events' });
      if (path === `/author/events/${eventId}/challenges` && method === 'GET') {
        challenges = options.challengeReads?.() ?? challenges;
        return jsonResponse({ challenges, requestId: 'author-challenges' });
      }
      if (
        path === `/author/challenges/${challengeId}/questions` &&
        method === 'GET'
      )
        return jsonResponse({ questions, requestId: 'author-questions' });
      if (
        path.startsWith('/author/challenges/') &&
        path.endsWith('/approve') &&
        method === 'POST'
      ) {
        if (options.transition) return options.transition({ init, path });
        const approved = {
          ...challenges[0]!,
          reviewedAt: '2026-09-01T10:00:00.000Z',
          reviewedBy: authorId,
          status: 'approved' as const,
          version: challenges[0]!.version + 1,
        };
        challenges = [approved];
        return jsonResponse({
          challenge: approved,
          requestId: 'approve-challenge',
        });
      }
      if (
        path.startsWith('/author/questions/') &&
        path.endsWith('/approve') &&
        method === 'POST'
      ) {
        if (options.transition) return options.transition({ init, path });
        throw new Error(`Unexpected question transition: ${path}`);
      }
      throw new Error(`Unexpected ${method} request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAuthorRoute(pathname: string) {
  window.history.replaceState({}, '', pathname);
  const authValue = {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    user: { name: 'Author Test', sub: 'auth0|author' },
  } as Auth0ContextInterface;
  return render(
    <Auth0Context.Provider value={authValue}>
      <GuardedRouter>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
          mapboxAccessToken={mapboxAccessToken}
        />
      </GuardedRouter>
    </Auth0Context.Provider>,
  );
}

function eventFixture(): AuthorEvent {
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
    publicationProvenance: null,
    radiusMetres: 75,
    retiredAt: null,
    reviewedAt: null,
    reviewedBy: null,
    sourceUrls: [],
    startsAt: '2026-09-01T08:00:00.000Z',
    submittedAt: null,
    submittedBy: null,
    title: 'Great Hall history',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 3,
  };
}

function challengeFixture(
  overrides: Partial<AuthorChallenge> = {},
): AuthorChallenge {
  return {
    challengeId,
    createdAt: '2026-08-16T08:00:00.000Z',
    eventId,
    format: 'multiple_choice',
    publicationProvenance: null,
    reviewedAt: null,
    reviewedBy: null,
    status: 'draft',
    submittedAt: '2026-08-30T10:00:00.000Z',
    submittedBy: otherAuthorId,
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    ...overrides,
  };
}

function questionFixture(
  overrides: Partial<AuthorMultipleChoiceQuestion> = {},
): AuthorMultipleChoiceQuestion {
  return {
    acceptedChoiceId: '41000000-0000-4000-8000-000000000002',
    acceptedChoicePosition: 2,
    challengeId,
    choices: [1, 2, 3, 4].map((position) => ({
      choiceId: `41000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      position,
      text: `Answer ${position}`,
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 1,
    explanation: 'Author-only explanation.',
    format: 'multiple_choice',
    publicationProvenance: null,
    prompt: 'Where is the Great Hall?',
    questionId,
    reviewedAt: null,
    reviewedBy: null,
    sourceUrls: [],
    status: 'draft',
    submittedAt: '2026-08-30T10:00:00.000Z',
    submittedBy: otherAuthorId,
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    ...overrides,
  };
}

function problemResponse(
  status: number,
  code: string,
  detail: string,
): Response {
  return jsonResponse(
    {
      code,
      detail,
      requestId: 'author-lifecycle-error',
      status,
      title: 'Request failed',
      type: 'about:blank',
    },
    status,
  );
}

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
