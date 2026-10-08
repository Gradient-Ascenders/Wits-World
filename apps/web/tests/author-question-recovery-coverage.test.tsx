import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '../src/App';
import type {
  AuthorChallenge,
  AuthorEvent,
  AuthorMultipleChoiceQuestion,
} from '../src/api/author';
import { EventWorkspace } from '../src/components/author/EventWorkspace';
import { GuardedRouter } from '../src/components/author/AuthorNavigationGuard';
import {
  authorPaths,
  type AuthorWorkspaceRoute,
} from '../src/components/author/author-routing';
import { AuthorMutationCoordinator } from '../src/components/author/author-mutation-coordinator';

const apiBaseUrl = 'https://api.example.test/api/v1';
const eventId = '10000000-0000-4000-8000-000000000001';
const firstChallengeId = '20000000-0000-4000-8000-000000000001';
const secondChallengeId = '20000000-0000-4000-8000-000000000002';
const questionId = '40000000-0000-4000-8000-000000000001';
const authorId = '90000000-0000-4000-8000-000000000001';
const otherAuthorId = '90000000-0000-4000-8000-000000000002';
const mapboxAccessToken = 'pk.test-token';

afterEach(() => vi.unstubAllGlobals());

describe('author question recovery coverage', () => {
  it('reloads the authoritative question after an approval conflict', async () => {
    const user = userEvent.setup();
    let conflictOccurred = false;
    const approved = questionFixture({
      reviewedAt: '2026-09-01T10:00:00.000Z',
      reviewedBy: authorId,
      status: 'approved',
      version: 8,
    });
    const fetchMock = installAuthorApi({
      questionReads: () => [
        conflictOccurred
          ? approved
          : questionFixture({ status: 'in_review', version: 7 }),
      ],
      transition: async ({ path, init }) => {
        expect(path).toBe(`/author/questions/${questionId}/approve`);
        expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 7 });
        conflictOccurred = true;
        return problemResponse(
          409,
          'STALE_CONTENT_VERSION',
          'Question changed on the server.',
        );
      },
    });
    renderAuthorRoute(
      authorPaths.question(eventId, firstChallengeId, questionId),
    );

    expect(
      await screen.findByRole('article', { name: 'Where is the Great Hall?' }),
    ).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Approve question' }),
    );

    expect(await screen.findByText('Question state reloaded.')).toBeVisible();
    expect(await screen.findByText('approved', { exact: true })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve question' }),
    ).not.toBeInTheDocument();
    expect(conflictOccurred).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith(
          `/author/challenges/${firstChallengeId}/questions`,
        ),
      ),
    ).toHaveLength(2);
  });

  it('follows a questions URL change to a different loaded challenge', async () => {
    const firstChallenge = challengeFixture(firstChallengeId);
    const secondChallenge = challengeFixture(secondChallengeId);
    const fetchMock = installAuthorApi({
      challenges: [firstChallenge, secondChallenge],
      questionsByChallenge: {
        [firstChallengeId]: [
          questionFixture({ prompt: 'First challenge question' }),
        ],
        [secondChallengeId]: [
          questionFixture({
            challengeId: secondChallengeId,
            prompt: 'Second challenge question',
            questionId: '40000000-0000-4000-8000-000000000002',
          }),
        ],
      },
    });
    const props = {
      apiBaseUrl,
      cards: [],
      cardsState: 'ready' as const,
      getAccessToken: vi.fn().mockResolvedValue('author-access-token'),
      mapboxAccessToken,
      mutationCoordinator: new AuthorMutationCoordinator(),
      navigate: vi.fn(),
      onOpenCards: vi.fn(),
      onReloadCards: vi.fn(),
      route: questionsRoute(firstChallengeId),
    };
    const view = render(<EventWorkspace {...props} />);

    expect(await screen.findByText('First challenge question')).toBeVisible();
    view.rerender(
      <EventWorkspace {...props} route={questionsRoute(secondChallengeId)} />,
    );

    expect(await screen.findByText('Second challenge question')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/challenges/${secondChallengeId}/questions`,
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

interface TransitionRequest {
  init?: RequestInit;
  path: string;
}

interface ApiOptions {
  challenges?: AuthorChallenge[];
  questionReads?: () => AuthorMultipleChoiceQuestion[];
  questionsByChallenge?: Record<string, AuthorMultipleChoiceQuestion[]>;
  transition?: (request: TransitionRequest) => Promise<Response> | Response;
}

function installAuthorApi(options: ApiOptions = {}) {
  let questionsReadCount = 0;
  const events = [eventFixture()];
  const challenges = options.challenges ?? [challengeFixture(firstChallengeId)];
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
      if (path === `/author/events/${eventId}/challenges` && method === 'GET')
        return jsonResponse({ challenges, requestId: 'author-challenges' });
      const questionCollection = path.match(
        /^\/author\/challenges\/([^/]+)\/questions$/u,
      );
      if (questionCollection && method === 'GET') {
        const challengeQuestions =
          options.questionsByChallenge?.[questionCollection[1]!];
        const questions = challengeQuestions ?? options.questionReads?.() ?? [];
        questionsReadCount += 1;
        return jsonResponse({
          questions,
          requestId: `author-questions-${questionsReadCount}`,
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

function questionsRoute(
  challengeId: string,
): Extract<AuthorWorkspaceRoute, { mode: 'questions' }> {
  return {
    challengeId,
    eventId,
    mode: 'questions',
    questionMode: 'list',
    section: 'events',
  };
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

function challengeFixture(challengeId: string): AuthorChallenge {
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
    version: 1,
  };
}

function questionFixture(
  overrides: Partial<AuthorMultipleChoiceQuestion> = {},
): AuthorMultipleChoiceQuestion {
  return {
    acceptedChoiceId: '41000000-0000-4000-8000-000000000002',
    acceptedChoicePosition: 2,
    challengeId: firstChallengeId,
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
      requestId: 'author-question-conflict',
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
