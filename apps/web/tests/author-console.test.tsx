import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';

vi.mock(
  '../src/components/exploration/map-provider',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../src/components/exploration/map-provider')
      >();

    return {
      ...actual,
      createMapboxMap: vi.fn(async () => ({
        onError: vi.fn(),
        onLoad(listener: () => void) {
          listener();
        },
        remove: vi.fn(),
        setCoordinateSelectionListener: vi.fn(),
        setPoints: vi.fn(),
        setReportedLocation: vi.fn(),
      })),
    };
  },
);

afterEach(() => vi.unstubAllGlobals());

describe('Basic author console', () => {
  it('shows role-aware navigation and loads protected content for an Author', async () => {
    const fetchMock = installAuthorApi();
    renderAuthorRoute();

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Author console' },
        { timeout: 8_000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Author' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      await screen.findByRole('button', { name: /Great Hall history/ }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/auth/me`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  }, 10_000);

  it('shows a forbidden state to an ordinary Player without calling author APIs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse({
          id: '90000000-0000-4000-8000-000000000001',
          lifecycleStatus: 'active',
          requestId: 'request-me',
          role: 'player',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute();

    expect(
      await screen.findByRole('heading', {
        name: 'Author permission is required',
      }),
    ).toHaveFocus();
    expect(screen.queryByText('Accepted answer')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !String(input).includes('/author/'),
      ),
    ).toBe(true);
  });

  it('shows a recoverable authorization state when the current role cannot be resolved', async () => {
    const fetchMock = vi.fn(async () =>
      problemResponse(401, 'UNAUTHORIZED', 'The access token is not valid.'),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute();

    expect(
      await screen.findByRole('heading', {
        name: 'Author access could not be checked',
      }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Check access again' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates event fields, focuses the first invalid control, and creates a draft', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ events: [] });
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Author console' });
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.click(
      screen.getByRole('button', { name: 'Create draft event' }),
    );
    expect(screen.getByLabelText('Event title')).toHaveFocus();
    expect(screen.getByText('Enter an event title.')).toBeVisible();

    await user.type(screen.getByLabelText('Event title'), 'Library discovery');
    await user.type(screen.getByLabelText('Latitude'), '-26.19205');
    await user.type(screen.getByLabelText('Longitude'), '28.03038');
    await user.type(screen.getByLabelText('Radius (metres)'), '75');
    await user.type(screen.getByLabelText('Starts at'), '2026-09-01T08:00');
    await user.type(screen.getByLabelText('Ends at'), '2026-09-01T12:00');
    await user.click(
      screen.getByRole('button', { name: 'Create draft event' }),
    );

    expect(await screen.findByText('Draft event created.')).toHaveFocus();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/author/events') && init?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      description: null,
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      title: 'Library discovery',
    });
  });

  it('edits an event definition and preserves API field validation on its control', async () => {
    const user = userEvent.setup();
    const validationResponse = problemResponse(
      400,
      'VALIDATION_ERROR',
      'One or more request values are invalid.',
      [
        {
          field: '/body/title',
          message: 'The event title is already in use.',
        },
      ],
    );
    installAuthorApi({ updateEventError: validationResponse });
    renderAuthorRoute();

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'A valid but conflicting title');
    await user.click(screen.getByRole('button', { name: 'Save event' }));

    expect(
      await screen.findByText('The event title is already in use.'),
    ).toBeVisible();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveFocus();
  });

  it('creates and associates the API-defined challenge for an event', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ challenges: [] });
    renderAuthorRoute();

    await screen.findByText('No challenge is associated.');
    await user.click(screen.getByRole('button', { name: 'Create challenge' }));

    expect(
      await screen.findByText('Draft challenge associated with this event.'),
    ).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events/${eventId}/challenges`,
      expect.objectContaining({ body: '{}', method: 'POST' }),
    );
  });

  it('creates a question with four choices, accepted-answer position, and explanation', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [],
    });
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Questions' });
    await user.type(
      screen.getByLabelText('Question prompt'),
      'Where is the Great Hall?',
    );
    for (let index = 1; index <= 4; index += 1) {
      await user.type(
        screen.getByLabelText(`Choice ${index}`),
        `Answer ${index}`,
      );
    }
    await user.click(screen.getByLabelText('Mark choice 2 as accepted'));
    await user.type(
      screen.getByLabelText('Author explanation'),
      'The Great Hall is on East Campus.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Create draft question' }),
    );

    expect(await screen.findByText('Draft question created.')).toHaveFocus();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes(`/author/challenges/${challengeId}/questions`) &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      acceptedChoicePosition: 2,
      choices: ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'],
      difficulty: 1,
      explanation: 'The Great Hall is on East Campus.',
      prompt: 'Where is the Great Hall?',
    });
  });

  it('edits a draft question and updates its accepted answer', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    renderAuthorRoute();

    await user.click(
      await screen.findByRole('button', { name: /Q1/ }, { timeout: 5_000 }),
    );
    await user.click(screen.getByLabelText('Mark choice 3 as accepted'));
    await user.clear(screen.getByLabelText('Author explanation'));
    await user.type(
      screen.getByLabelText('Author explanation'),
      'Updated author-only explanation.',
    );
    await user.click(screen.getByRole('button', { name: 'Save question' }));

    expect(await screen.findByText('Question changes saved.')).toHaveFocus();
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes('/author/questions/') && init?.method === 'PUT',
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      acceptedChoicePosition: 3,
      explanation: 'Updated author-only explanation.',
    });
  });

  it('edits Basic card display metadata and sends the complete card definition', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ cards: [cardFixture()] });
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Author console' });
    await user.click(screen.getByRole('button', { name: 'Card catalogue' }));
    await user.click(screen.getByRole('button', { name: /Campus Owl/ }));
    const description = screen.getByLabelText('Display description (optional)');
    await user.clear(description);
    await user.type(description, 'Updated scholarly creature.');
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByText('Card changes saved.')).toHaveFocus();
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/author/cards/${cardFixture().id}`) &&
        init?.method === 'PUT',
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      category: 'creature',
      description: 'Updated scholarly creature.',
      effects: [],
      hp: 120,
      moves: [expect.objectContaining({ name: 'Quick Peck', position: 1 })],
      power: 20,
    });
  });

  it('creates a valid Basic Creature card for the global reward catalogue', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ cards: [] });
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Author console' });
    await user.click(screen.getByRole('button', { name: 'Card catalogue' }));
    await user.type(screen.getByLabelText('Card name'), 'Library Fox');
    await user.type(screen.getByLabelText('Move name'), 'Quiet Step');
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));

    expect(await screen.findByText('Draft card created.')).toHaveFocus();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/author/cards') && init?.method === 'POST',
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      category: 'creature',
      effects: [],
      hp: 1,
      moves: [expect.objectContaining({ name: 'Quiet Step', position: 1 })],
      name: 'Library Fox',
      power: 0,
      rarity: 'common',
    });
  });

  it('shows incomplete associations and the API publication rejection', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      publishEventError: problemResponse(
        422,
        'CONTENT_NOT_READY',
        'An event requires one published challenge before publication.',
      ),
    });
    renderAuthorRoute();

    expect(
      await screen.findByText('Incomplete — Published challenge'),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Ask API to publish event' }),
    );
    expect(
      await screen.findByText('Publication requirements are not met'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'An event requires one published challenge before publication.',
      ),
    ).toBeVisible();
  });

  it('publishes a complete event after challenge, questions, and Common reward readiness', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      cards: [
        { ...cardFixture(), authoringStatus: 'published', isActive: true },
      ],
      challenges: [{ ...challengeFixture(), status: 'published' }],
      questions: Array.from({ length: 5 }, (_, index) =>
        questionFixture(index + 1, 'published'),
      ),
    });
    renderAuthorRoute();

    expect(
      await screen.findByText('Ready — Published challenge'),
    ).toBeVisible();
    expect(
      await screen.findByText('Ready — Published questions'),
    ).toBeVisible();
    expect(
      await screen.findByText('Ready — Common reward catalogue'),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Ask API to publish event' }),
    );
    expect(
      await screen.findByText(
        'Event published and available to the player API according to its active times.',
      ),
    ).toHaveFocus();
  });

  it('reports a lifecycle conflict without inventing stale-version semantics', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      updateEventError: problemResponse(
        409,
        'CONTENT_STATE_CONFLICT',
        'Published events cannot be edited; retire the event and create a replacement instead.',
      ),
    });
    renderAuthorRoute();

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'Changed elsewhere');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    expect(await screen.findByText('This content changed state')).toBeVisible();
    expect(screen.queryByText(/version|etag/i)).not.toBeInTheDocument();
  });

  it('renders a recoverable generic author API loading failure', async () => {
    installAuthorApi({
      eventsError: problemResponse(500, 'INTERNAL_ERROR', 'Try again later.'),
    });
    renderAuthorRoute();

    expect(await screen.findByText('Events are unavailable.')).toBeVisible();
    expect(screen.getByText('Try again later.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});

interface ApiOptions {
  cards?: object[];
  challenges?: object[];
  events?: object[];
  eventsError?: Response;
  publishEventError?: Response;
  questions?: object[];
  updateEventError?: Response;
}

function installAuthorApi(options: ApiOptions = {}) {
  const events = [...(options.events ?? [eventFixture()])];
  const cards = [...(options.cards ?? [])];
  const challenges = [...(options.challenges ?? [])];
  const questions = [...(options.questions ?? [])];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const path = url.pathname.replace('/api/v1', '');
      const method = init?.method ?? 'GET';

      if (path === '/auth/me') {
        return jsonResponse({
          id: '90000000-0000-4000-8000-000000000001',
          lifecycleStatus: 'active',
          requestId: 'request-me',
          role: 'author',
        });
      }
      if (path === '/author/cards' && method === 'GET') {
        return jsonResponse({ cards, requestId: 'request-cards' });
      }
      if (path === '/author/cards' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        const card = {
          ...cardFixture(),
          ...body,
          moves: body.moves.map((move: object) => ({
            id: cardFixture().moves[0]!.id,
            ...move,
          })),
        };
        cards.unshift(card);
        return jsonResponse({ card, requestId: 'request-card-create' }, 201);
      }
      if (path === '/author/events' && method === 'GET') {
        if (options.eventsError) return options.eventsError.clone();
        return jsonResponse({ events, requestId: 'request-events' });
      }
      if (path === '/author/events' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        const event = { ...eventFixture(), ...body, title: body.title };
        events.unshift(event);
        return jsonResponse({ event, requestId: 'request-event-create' }, 201);
      }
      if (path === `/author/events/${eventId}` && method === 'PUT') {
        if (options.updateEventError) return options.updateEventError.clone();
        const body = JSON.parse(String(init?.body));
        return jsonResponse({
          event: { ...eventFixture(), ...body },
          requestId: 'request-event-update',
        });
      }
      if (path === `/author/events/${eventId}/publish`) {
        if (options.publishEventError) return options.publishEventError.clone();
        return jsonResponse({
          event: {
            ...eventFixture(),
            authoringStatus: 'published',
            isPublished: true,
          },
          requestId: 'request-event-publish',
        });
      }
      if (path === `/author/events/${eventId}/challenges` && method === 'GET') {
        return jsonResponse({ challenges, requestId: 'request-challenges' });
      }
      if (
        path === `/author/events/${eventId}/challenges` &&
        method === 'POST'
      ) {
        const challenge = challengeFixture();
        challenges.push(challenge);
        return jsonResponse(
          { challenge, requestId: 'request-challenge-create' },
          201,
        );
      }
      if (
        path === `/author/challenges/${challengeId}/questions` &&
        method === 'GET'
      ) {
        return jsonResponse({ questions, requestId: 'request-questions' });
      }
      if (
        path === `/author/challenges/${challengeId}/questions` &&
        method === 'POST'
      ) {
        const body = JSON.parse(String(init?.body));
        const baseQuestion = questionFixture(1, 'draft');
        const choices = body.choices.map((text: string, index: number) => ({
          choiceId: baseQuestion.choices[index]!.choiceId,
          position: index + 1,
          text,
        }));
        const question = {
          ...baseQuestion,
          ...body,
          acceptedChoiceId: choices[body.acceptedChoicePosition - 1].choiceId,
          choices,
        };
        questions.push(question);
        return jsonResponse(
          { question, requestId: 'request-question-create' },
          201,
        );
      }
      if (path.startsWith('/author/questions/') && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        const baseQuestion = questionFixture(1, 'draft');
        const choices = body.choices.map((text: string, index: number) => ({
          choiceId: baseQuestion.choices[index]!.choiceId,
          position: index + 1,
          text,
        }));
        return jsonResponse({
          question: {
            ...baseQuestion,
            ...body,
            acceptedChoiceId: choices[body.acceptedChoicePosition - 1].choiceId,
            choices,
          },
          requestId: 'request-question-update',
        });
      }
      if (path === `/author/cards/${cardFixture().id}` && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        return jsonResponse({
          card: {
            ...cardFixture(),
            ...body,
            moves: body.moves.map((move: object) => ({
              id: cardFixture().moves[0]!.id,
              ...move,
            })),
          },
          requestId: 'request-card-update',
        });
      }

      throw new Error(`Unexpected ${method} request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAuthorRoute(authValue = authenticatedAuthor()) {
  window.history.replaceState({}, '', '/author');
  return render(
    <Auth0Context.Provider value={authValue}>
      <Router>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
          mapboxAccessToken={mapboxAccessToken}
        />
      </Router>
    </Auth0Context.Provider>,
  );
}

function authenticatedAuthor(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    user: { name: 'Author Test', sub: 'auth0|author' },
  } as Auth0ContextInterface;
}

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
  };
}

function challengeFixture() {
  return {
    challengeId,
    createdAt: '2026-08-16T08:00:00.000Z',
    eventId,
    format: 'multiple_choice',
    status: 'draft',
    updatedAt: '2026-08-16T08:00:00.000Z',
  };
}

function questionFixture(position: number, status: 'draft' | 'published') {
  const questionId = `40000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
  return {
    acceptedChoiceId: `41000000-0000-4000-8000-${String(position * 10 + 2).padStart(12, '0')}`,
    acceptedChoicePosition: 2,
    challengeId,
    choices: [1, 2, 3, 4].map((choicePosition) => ({
      choiceId: `41000000-0000-4000-8000-${String(position * 10 + choicePosition).padStart(12, '0')}`,
      position: choicePosition,
      text: `Answer ${choicePosition}`,
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 1,
    explanation: 'Author-only explanation.',
    prompt: `Question ${position}`,
    questionId,
    status,
    updatedAt: '2026-08-16T08:00:00.000Z',
  };
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
  };
}

function problemResponse(
  status: number,
  code: string,
  detail: string,
  validation?: { field: string; message: string }[],
) {
  return jsonResponse(
    {
      code,
      detail,
      requestId: 'request-problem',
      status,
      title: 'Request failed',
      type: 'about:blank',
      ...(validation ? { validation } : {}),
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
