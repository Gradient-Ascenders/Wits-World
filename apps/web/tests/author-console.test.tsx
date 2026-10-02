import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '../src/App';
import type {
  AuthorCard,
  AuthorChallenge,
  AuthorEvent,
  AuthorMultipleChoiceQuestion,
  AuthorOrderingQuestion,
  AuthorQuestion,
} from '../src/api/author';
import {
  AuthorLocationMap,
  WITS_BRAAMFONTEIN_AUTHORING_BOUNDS,
} from '../src/components/author/AuthorLocationMap';
import { GuardedRouter } from '../src/components/author/AuthorNavigationGuard';
import { EventWorkspace } from '../src/components/author/EventWorkspace';
import { AuthorMutationCoordinator } from '../src/components/author/author-mutation-coordinator';
import { authorPaths } from '../src/components/author/author-routing';
import type {
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';

import { selectOption } from './fixtures/select-option';

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
  it('moves route focus to main when persistent Author navigation stays mounted', async () => {
    const user = userEvent.setup();
    installAuthorApi();
    renderAuthorRoute(authorPaths.events);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Events' }),
    ).toBeVisible();
    const cardsLink = screen.getByRole('link', { name: 'Cards' });
    await user.click(cardsLink);

    expect(
      await screen.findByRole('heading', { name: 'Card catalogue' }),
    ).toBeVisible();
    expect(cardsLink).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('shows seeded source evidence on event and question review screens', async () => {
    const user = userEvent.setup();
    const sourceUrl = 'https://wits100.wits.ac.za/';
    const question = questionFixture(1, 'draft');
    installAuthorApi({
      challenges: [challengeFixture()],
      events: [eventFixture({ sourceUrls: [sourceUrl] })],
      questions: [{ ...question, sourceUrls: [sourceUrl] }],
    });

    const eventView = renderAuthorRoute(authorPaths.event(eventId));
    await user.click(await screen.findByRole('link', { name: 'Details' }));
    expect(screen.getByRole('link', { name: 'Source 1' })).toHaveAttribute(
      'href',
      sourceUrl,
    );

    eventView.unmount();
    renderAuthorRoute(
      authorPaths.question(eventId, challengeId, question.questionId),
    );
    const questionReview = await screen.findByRole('article', {
      name: question.prompt,
    });
    expect(
      within(questionReview).getByRole('link', { name: 'Source 1' }),
    ).toHaveAttribute('href', sourceUrl);
  });

  it('keeps accessible coordinate editing guidance when the author map fails', async () => {
    render(
      <AuthorLocationMap
        coordinate={{ latitude: -26.19205, longitude: 28.03038 }}
        mapboxAccessToken={mapboxAccessToken}
        mapFactory={vi.fn(async () => {
          throw new Error('Expected map failure');
        })}
        onChange={vi.fn()}
        radiusMetres={75}
      />,
    );

    expect(await screen.findByText('The map could not load.')).toBeVisible();
    expect(
      screen.getByText(
        'Use the advanced latitude and longitude fields below to place the event.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/nearby events list/i)).not.toBeInTheDocument();
  });

  it('opens new Event authoring on Wits bounds and keeps map selection and radius synchronized', async () => {
    const coordinateListener = vi.fn();
    const controller: MapController = {
      focusPoint: vi.fn(() => true),
      onError: vi.fn(),
      onLoad(listener) {
        listener();
      },
      remove: vi.fn(),
      setCoordinateSelectionListener: vi.fn((listener) =>
        coordinateListener.mockImplementation((coordinate) =>
          listener?.(coordinate),
        ),
      ),
      setPoints: vi.fn(),
      setReportedLocation: vi.fn(),
      setSelectedPoint: vi.fn(),
    };
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const onChange = vi.fn();
    const view = render(
      <AuthorLocationMap
        coordinate={null}
        mapboxAccessToken={mapboxAccessToken}
        mapFactory={mapFactory}
        onChange={onChange}
        radiusMetres={null}
      />,
    );

    await screen.findByText('Choose a location');
    await vi.waitFor(() =>
      expect(controller.setCoordinateSelectionListener).toHaveBeenCalled(),
    );
    expect(mapFactory).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        initialBounds: WITS_BRAAMFONTEIN_AUTHORING_BOUNDS,
        initialBoundsPadding: 32,
      }),
      [],
      expect.any(AbortSignal),
    );
    coordinateListener({ latitude: -26.1907, longitude: 28.0289 });
    expect(onChange).toHaveBeenCalledWith({
      latitude: -26.1907,
      longitude: 28.0289,
    });

    view.rerender(
      <AuthorLocationMap
        coordinate={{ latitude: -26.1907, longitude: 28.0289 }}
        mapboxAccessToken={mapboxAccessToken}
        mapFactory={mapFactory}
        onChange={onChange}
        radiusMetres={75}
      />,
    );

    await vi.waitFor(() =>
      expect(controller.setPoints).toHaveBeenLastCalledWith([
        expect.objectContaining({
          draggable: true,
          latitude: -26.1907,
          longitude: 28.0289,
          radiusMetres: 75,
        }),
      ]),
    );
    expect(controller.setSelectedPoint).toHaveBeenLastCalledWith(
      expect.objectContaining({
        latitude: -26.1907,
        longitude: 28.0289,
        radiusMetres: 75,
      }),
    );
    expect(screen.getByText(/75 m event area shown/u)).toBeVisible();
  });

  it('shows role-aware navigation and loads protected content for an Author', async () => {
    const fetchMock = installAuthorApi();
    renderAuthorRoute(authorPaths.events);

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Author console' },
        { timeout: 8_000 },
      ),
    ).toBeVisible();
    for (const playerNavigation of screen.getAllByRole('navigation', {
      name: 'Player',
    })) {
      expect(
        within(playerNavigation).getByRole('link', { name: 'Author' }),
      ).toHaveAttribute('aria-current', 'page');
    }
    const navigation = screen.getByRole('navigation', {
      name: 'Author sections',
    });
    expect(
      within(navigation).getByRole('link', { name: 'Events' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(navigation).queryByRole('link', { name: 'Player application' }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).getByRole('link', { name: 'Placement' }),
    ).toHaveAttribute('href', authorPaths.placement);
    expect(
      await screen.findByRole('link', { name: /Great Hall history/ }),
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
          connectionStrategy: 'auth0',
          id: '90000000-0000-4000-8000-000000000001',
          playerName: 'test-player',
          playerNameSetupRequired: false,
          lifecycleStatus: 'active',
          requestId: 'request-me',
          role: 'player',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute(authorPaths.editEvent(eventId));

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

  it('blocks an ordinary Player from player review before any trust-case request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse({
          connectionStrategy: 'auth0',
          id: '90000000-0000-4000-8000-000000000001',
          playerName: 'test-player',
          playerNameSetupRequired: false,
          lifecycleStatus: 'active',
          requestId: 'request-me',
          role: 'player',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute(authorPaths.playerReview);

    expect(
      await screen.findByRole('heading', {
        name: 'Author permission is required',
      }),
    ).toHaveFocus();
    expect(screen.queryByText('Player review')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !String(input).includes('/author/trust-cases'),
      ),
    ).toBe(true);
  });

  it('blocks an ordinary Player from placement controls before any placement request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse({
          connectionStrategy: 'auth0',
          id: '90000000-0000-4000-8000-000000000001',
          playerName: 'test-player',
          playerNameSetupRequired: false,
          lifecycleStatus: 'active',
          requestId: 'request-me',
          role: 'player',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute(authorPaths.placement);

    expect(
      await screen.findByRole('heading', {
        name: 'Author permission is required',
      }),
    ).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Generate preview' }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !String(input).includes('/author/event-placement'),
      ),
    ).toBe(true);
  });

  it('blocks an ordinary Player from the analytics route before any analytics request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse({
          connectionStrategy: 'auth0',
          id: '90000000-0000-4000-8000-000000000001',
          playerName: 'test-player',
          playerNameSetupRequired: false,
          lifecycleStatus: 'active',
          requestId: 'request-me',
          role: 'player',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute(authorPaths.analytics);

    expect(
      await screen.findByRole('heading', {
        name: 'Author permission is required',
      }),
    ).toHaveFocus();
    expect(screen.queryByText('Advanced analytics')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !String(input).includes('/author/analytics/'),
      ),
    ).toBe(true);
  });

  it('opens the exact queued challenge when an event has multiple challenges', async () => {
    const user = userEvent.setup();
    const queuedChallengeId = '20000000-0000-4000-8000-000000000002';
    const queuedChallenge = challengeFixture({
      challengeId: queuedChallengeId,
      status: 'in_review',
      submittedAt: '2026-08-29T08:00:00.000Z',
      submittedBy: '90000000-0000-4000-8000-000000000002',
      version: 2,
    });
    installAuthorApi({
      challenges: [challengeFixture(), queuedChallenge],
      handleRequest: ({ method, path }) => {
        if (path === '/author/review-queue' && method === 'GET')
          return jsonResponse({
            items: [
              {
                canReview: true,
                challengeId: null,
                entityId: queuedChallengeId,
                entityType: 'challenge',
                eventId,
                label: 'Multiple-choice challenge',
                status: 'in_review',
                submittedAt: queuedChallenge.submittedAt,
                submittedBy: queuedChallenge.submittedBy,
                submittedByName: 'Other Author',
                version: queuedChallenge.version,
              },
            ],
            page: 1,
            pageSize: 20,
            requestId: 'request-review-queue',
            totalItems: 1,
            totalPages: 1,
          });
        if (
          path === `/author/challenges/${queuedChallengeId}/questions` &&
          method === 'GET'
        )
          return jsonResponse({
            questions: [],
            requestId: 'request-queued-challenge-questions',
          });
        return undefined;
      },
    });
    renderAuthorRoute(authorPaths.review);

    const reviewLink = await screen.findByRole('link', {
      name: 'Review challenge: Multiple-choice challenge',
    });
    expect(reviewLink).toHaveAttribute(
      'href',
      authorPaths.challengeReview(eventId, queuedChallengeId),
    );
    await user.click(reviewLink);

    expect(await screen.findByLabelText('Challenge')).toHaveTextContent(
      'Challenge 2 · Multiple choice · in_review',
    );
    expect(
      await screen.findByRole('button', { name: 'Approve challenge' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', {
        name: 'Submit for review',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows a recoverable authorization state when the current role cannot be resolved', async () => {
    const fetchMock = vi.fn(async () =>
      problemResponse(401, 'UNAUTHORIZED', 'The access token is not valid.'),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAuthorRoute(authorPaths.editEvent(eventId));

    expect(
      await screen.findByRole('heading', {
        name: 'Your player session could not be restored',
      }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Check session again' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates event fields, focuses the first invalid control, and creates a draft', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ events: [] });
    renderAuthorRoute(authorPaths.newEvent);

    await screen.findByLabelText('Event title');
    await user.click(
      screen.getByRole('button', { name: 'Create draft event' }),
    );
    expect(screen.getByLabelText('Event title')).toHaveFocus();
    expect(screen.getByText('Enter an event title.')).toBeVisible();

    await user.type(screen.getByLabelText('Event title'), 'Library discovery');
    await user.type(screen.getByLabelText('Latitude'), '-26.19205');
    await user.type(screen.getByLabelText('Longitude'), '28.03038');
    await user.click(screen.getByRole('button', { name: '75 m' }));
    expect(screen.getByLabelText('Radius (metres)')).toHaveValue(75);
    await enterEventDateTime(user, 'Starts at', '2026-09-01T08:00');
    await user.click(
      screen.getByRole('button', { name: 'Create draft event' }),
    );
    expect(screen.getByText('Enter a valid end time.')).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Ends at' })).getByRole(
        'spinbutton',
        { name: /^year,/ },
      ),
    ).toHaveFocus();
    await enterEventDateTime(user, 'Ends at', '2026-09-01T12:00');
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
      startsAt: '2026-09-01T06:00:00.000Z',
      endsAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('creates an automatic-placement event without asking for a fixed map point', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ events: [] });
    renderAuthorRoute(authorPaths.newEvent);

    await user.type(
      await screen.findByLabelText('Event title'),
      'Rotating campus quiz',
    );
    await user.click(
      screen.getByRole('checkbox', { name: /Automatic placement/ }),
    );

    expect(screen.queryByText('Event location')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Assign a campus site at publication/u),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: '75 m' }));
    await enterEventDateTime(user, 'Starts at', '2026-09-01T08:00');
    await enterEventDateTime(user, 'Ends at', '2026-09-01T12:00');
    await user.click(
      screen.getByRole('button', { name: 'Create draft event' }),
    );

    expect(await screen.findByText('Draft event created.')).toHaveFocus();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/author/events') && init?.method === 'POST',
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      automaticPlacement: true,
      latitude: null,
      longitude: null,
      radiusMetres: 75,
      title: 'Rotating campus quiz',
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
    renderAuthorRoute(authorPaths.editEvent(eventId));

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

    await user.click(
      await screen.findByRole('button', { name: 'Create challenge' }),
    );

    expect(
      await screen.findByText(
        'Draft multiple choice challenge associated with this event.',
      ),
    ).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events/${eventId}/challenges`,
      expect.objectContaining({
        body: JSON.stringify({ format: 'multiple_choice' }),
        method: 'POST',
      }),
    );
  });

  it('allows a draft event to create a challenge when only a retired challenge remains', async () => {
    installAuthorApi({
      challenges: [challengeFixture({ status: 'retired' })],
      questions: [questionFixture(1, 'retired')],
    });
    renderAuthorRoute(authorPaths.event(eventId));

    expect(
      await screen.findByRole('button', { name: 'Create challenge' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Format')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'New question' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        'This challenge is retired. Questions are read-only.',
      ),
    ).toBeVisible();
  });

  it('selects and creates an ordering challenge format', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ challenges: [] });
    renderAuthorRoute();

    await selectOption(
      user,
      await screen.findByLabelText('Format'),
      'ordering',
    );
    await user.click(screen.getByRole('button', { name: 'Create challenge' }));

    expect(
      await screen.findByText(
        'Draft ordering challenge associated with this event.',
      ),
    ).toHaveFocus();
    expect(screen.getByText('Ordering · draft')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events/${eventId}/challenges`,
      expect.objectContaining({
        body: JSON.stringify({ format: 'ordering' }),
        method: 'POST',
      }),
    );
  });

  it('creates a question with four choices, accepted-answer position, and explanation', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [],
    });
    renderAuthorRoute(authorPaths.newQuestion(eventId, challengeId));

    await screen.findByLabelText('Question prompt');
    await selectOption(user, screen.getByLabelText('Difficulty'), '3');
    for (let index = 1; index <= 4; index += 1) {
      await user.type(
        await screen.findByLabelText(`Choice ${index}`),
        `Answer ${index}`,
      );
    }
    await user.click(await screen.findByLabelText('Mark choice 2 as accepted'));
    await user.type(
      await screen.findByLabelText('Author explanation'),
      'The Great Hall is on East Campus.',
    );
    await user.type(
      screen.getByLabelText('Question prompt'),
      'Where is the Great Hall?',
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
      difficulty: 3,
      explanation: 'The Great Hall is on East Campus.',
      format: 'multiple_choice',
      prompt: 'Where is the Great Hall?',
    });
  });

  it('validates and creates a four-item ordering question in correct sequence', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture({ format: 'ordering' })],
      questions: [],
    });
    renderAuthorRoute(authorPaths.newQuestion(eventId, challengeId));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(4));
    await user.type(
      await screen.findByLabelText('Question prompt'),
      'Order the eras.',
    );
    expect(screen.getByLabelText('Question prompt')).toHaveValue(
      'Order the eras.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Create draft question' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Correct position 1')).toHaveFocus(),
    );
    expect(screen.getByLabelText('Correct position 1')).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    for (let index = 1; index <= 4; index += 1) {
      await user.type(
        screen.getByLabelText(`Correct position ${index}`),
        `Era ${index}`,
      );
    }
    await user.type(
      screen.getByLabelText('Author explanation'),
      'The eras follow this established chronology.',
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
      difficulty: 1,
      explanation: 'The eras follow this established chronology.',
      format: 'ordering',
      items: ['Era 1', 'Era 2', 'Era 3', 'Era 4'],
      prompt: 'Order the eras.',
    });
    expect(
      screen.queryByRole('button', { name: 'Publish question' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Submit for review' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Review' }));
    expect(
      screen.getByRole('button', { name: 'Submit event and questions' }),
    ).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/submit')),
    ).toBe(false);
  });

  it('edits a draft question and updates its accepted answer', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    renderAuthorRoute(
      authorPaths.editQuestion(
        eventId,
        challengeId,
        questionFixture(1, 'draft').questionId,
      ),
    );

    await screen.findByLabelText('Question prompt', {}, { timeout: 5_000 });
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
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));

    await screen.findByLabelText('Card name');
    const description = screen.getByLabelText('Display description (optional)');
    await user.clear(description);
    expect(description).toHaveValue('');
    await user.type(description, 'Updated scholarly creature.');
    expect(description).toHaveValue('Updated scholarly creature.');
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
    renderAuthorRoute(authorPaths.newCard);

    await screen.findByLabelText('Card name');
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

  it('accepts a zero-move Creature draft client-side', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ cards: [] });
    renderAuthorRoute(authorPaths.newCard);

    await screen.findByLabelText('Card name');
    await user.type(screen.getByLabelText('Card name'), 'Move-free draft');
    await user.click(screen.getByRole('button', { name: 'Remove move' }));
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));

    expect(await screen.findByText('Draft card created.')).toHaveFocus();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/author/cards') && init?.method === 'POST',
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      category: 'creature',
      moves: [],
      name: 'Move-free draft',
    });
  });

  it('allows a fourth Creature move and prevents adding a fifth', async () => {
    const user = userEvent.setup();
    installAuthorApi({ cards: [] });
    renderAuthorRoute(authorPaths.newCard);

    await screen.findByLabelText('Card name');
    const addMove = screen.getByRole('button', { name: 'Add move' });
    await user.click(addMove);
    await user.click(addMove);
    await user.click(addMove);

    expect(screen.getAllByLabelText('Move name')).toHaveLength(4);
    expect(addMove).toBeDisabled();
    expect(addMove).toHaveAccessibleDescription(
      'Creature drafts may contain up to four moves. Publication requires exactly four.',
    );
    await user.click(addMove);
    expect(screen.getAllByLabelText('Move name')).toHaveLength(4);
  });

  it('surfaces the API publication rule for a Creature with fewer than four moves', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      cards: [cardFixture({ authoringStatus: 'approved', version: 2 })],
      publishCardError: problemResponse(
        422,
        'CONTENT_NOT_READY',
        'Creature cards require exactly four moves before publication.',
      ),
    });
    renderAuthorRoute(authorPaths.card(cardFixture().id));

    await user.click(
      await screen.findByRole('button', { name: 'Publish card' }),
    );

    expect(
      await screen.findByText(
        'Creature cards require exactly four moves before publication.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Publication requirements are not met'),
    ).toBeVisible();
  });

  it('edits and saves an existing valid four-move Creature', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      cards: [
        cardFixture({
          moves: Array.from({ length: 4 }, (_, index) =>
            cardMoveFixture(index + 1),
          ),
        }),
      ],
    });
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));

    await screen.findByLabelText('Card name');
    await user.click(screen.getByRole('button', { name: /^Move 4 / }));
    const moveNames = screen.getAllByLabelText('Move name');
    await user.clear(moveNames[3]!);
    await user.click(screen.getByRole('button', { name: /^Quick Peck / }));
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(moveNames[3]).toHaveFocus());
    expect(moveNames[3]).toBeVisible();
    await user.type(moveNames[3]!, 'Final Flourish');
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByText('Card changes saved.')).toHaveFocus();
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/author/cards/${cardFixture().id}`) &&
        init?.method === 'PUT',
    );
    expect(JSON.parse(String(updateCall?.[1]?.body)).moves).toHaveLength(4);
    expect(JSON.parse(String(updateCall?.[1]?.body)).moves[3]).toMatchObject({
      name: 'Final Flourish',
      position: 4,
    });
  });

  it('previews card artwork and recovers from invalid or failed image URLs', async () => {
    const user = userEvent.setup();
    installAuthorApi();
    renderAuthorRoute(authorPaths.newCard);

    const artwork = await screen.findByLabelText('Artwork URL (optional)');
    const preview = screen.getByRole('complementary', {
      name: 'Live card preview',
    });
    expect(within(preview).getByText('Unsaved preview')).toBeVisible();
    await user.type(screen.getByLabelText('Card name'), 'Library Fox');
    await selectOption(
      user,
      screen.getByLabelText('Rarity', { selector: '#card-rarity' }),
      'legendary',
    );
    await user.clear(screen.getByLabelText('Hit points (HP)'));
    await user.type(screen.getByLabelText('Hit points (HP)'), '120');
    expect(
      within(preview).getByRole('heading', { name: 'Library Fox' }),
    ).toBeVisible();
    expect(preview.querySelector('.card-frame--legendary')).not.toBeNull();
    expect(within(preview).getByText('120')).toBeVisible();
    await user.type(artwork, 'not-an-image-url');
    expect(
      screen.getByText('Enter an http(s) URL or /cards/ path to preview it.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));
    expect(
      screen.getByText('Use an http(s) URL or a /cards/ artwork path.'),
    ).toBeVisible();

    await user.clear(artwork);
    await user.type(artwork, '/cards/quillip.webp');
    const localImage = await screen.findByAltText(
      'Library Fox artwork preview',
    );
    expect(localImage).toHaveAttribute('src', '/cards/quillip.webp');
    expect(
      screen.queryByText('Use an http(s) URL or a /cards/ artwork path.'),
    ).not.toBeInTheDocument();

    await user.clear(artwork);
    await user.type(artwork, 'https://example.test/cards/broken.png');
    const brokenImage = await screen.findByAltText(
      'Library Fox artwork preview',
    );
    fireEvent.error(brokenImage);
    expect(
      screen.getByText('Image could not load. Check the URL.'),
    ).toBeVisible();

    await user.clear(artwork);
    await user.type(artwork, 'https://example.test/cards/working.png');
    const workingImage = await screen.findByAltText(
      'Library Fox artwork preview',
    );
    fireEvent.load(workingImage);
    expect(workingImage).not.toHaveAttribute('hidden');
    expect(workingImage).toHaveAttribute(
      'src',
      'https://example.test/cards/working.png',
    );
    await selectOption(
      user,
      screen.getByLabelText('Category', { selector: '#card-category' }),
      'power',
    );
    expect(within(preview).getByText('Power · Typeless')).toBeVisible();
    expect(within(preview).queryByRole('definition')).not.toBeInTheDocument();
  });

  it('associates a name conflict with the field, preserves the draft, and retries successfully', async () => {
    const user = userEvent.setup();
    let createAttempts = 0;
    installAuthorApi({
      cards: [
        cardFixture({
          authoringStatus: 'published',
          id: '50000000-0000-4000-8000-000000000099',
          isActive: true,
          name: 'Edge',
        }),
      ],
      handleRequest: ({ init, method, path }) => {
        if (path !== '/author/cards' || method !== 'POST') return undefined;
        createAttempts += 1;
        const body = JSON.parse(String(init?.body));

        if (body.name.trim().toLowerCase() === 'edge') {
          return problemResponse(
            409,
            'CARD_NAME_CONFLICT',
            'Another card definition already uses that name.',
          );
        }

        return jsonResponse(
          {
            card: {
              ...cardFixture(),
              ...body,
              id: '50000000-0000-4000-8000-000000000100',
              moves: body.moves.map((move: object, index: number) => ({
                id: cardMoveFixture(index + 1).id,
                ...move,
              })),
            },
            requestId: 'request-card-retry',
          },
          201,
        );
      },
    });
    renderAuthorRoute(authorPaths.newCard);

    await screen.findByLabelText('Card name');

    const name = screen.getByLabelText('Card name');
    const description = screen.getByLabelText('Display description (optional)');
    const artwork = screen.getByLabelText('Artwork URL (optional)');
    const moveName = screen.getByLabelText('Move name');

    await user.type(name, 'edge');
    await user.type(description, 'Preserve this complete draft.');
    await user.type(artwork, 'https://example.test/cards/edge-draft.png');
    await user.type(moveName, 'Careful Step');
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));

    expect(
      await screen.findByText('This card name is already in use.'),
    ).toBeVisible();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'card-name-error');
    expect(name).toHaveFocus();
    expect(description).toHaveValue('Preserve this complete draft.');
    expect(artwork).toHaveValue('https://example.test/cards/edge-draft.png');
    expect(moveName).toHaveValue('Careful Step');

    await user.clear(name);
    await user.type(name, 'Unique Edge Successor');
    expect(
      screen.queryByText('This card name is already in use.'),
    ).not.toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'false');
    expect(description).toHaveValue('Preserve this complete draft.');
    expect(moveName).toHaveValue('Careful Step');

    await user.click(screen.getByRole('button', { name: 'Create draft card' }));

    expect(await screen.findByText('Draft card created.')).toHaveFocus();
    expect(createAttempts).toBe(2);
  });

  it('shows incomplete associations and the API publication rejection', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      events: [eventFixture({ authoringStatus: 'approved', version: 2 })],
      publishEventError: problemResponse(
        422,
        'CONTENT_NOT_READY',
        'An event requires one published challenge before publication.',
      ),
    });
    renderAuthorRoute();

    expect(
      await screen.findByText(/published Common reward is needed/),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Publish event package' }),
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
      events: [eventFixture({ authoringStatus: 'approved', version: 2 })],
      questions: Array.from({ length: 5 }, (_, index) =>
        questionFixture(index + 1, 'published'),
      ),
    });
    renderAuthorRoute();

    expect(
      await screen.findByText('Published Common reward available'),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Publish event package' }),
    );
    expect(
      await screen.findByText(
        'Event published and available to the player API according to its active times.',
      ),
    ).toHaveFocus();
  });

  it('submits the event and all five draft questions for review together', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: Array.from({ length: 5 }, (_, index) =>
        questionFixture(index + 1, 'draft'),
      ),
    });
    renderAuthorRoute(authorPaths.eventReview(eventId));

    const submit = await screen.findByRole('button', {
      name: 'Submit event and questions',
    });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(
      screen.queryByRole('button', { name: 'Submit question' }),
    ).not.toBeInTheDocument();
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events/${eventId}/package/submit`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      await screen.findByText('Another author must review this submission.'),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        /\/author\/questions\/[^/]+\/submit$/u.test(String(input)),
      ),
    ).toBe(false);
  });

  it('requires event retirement first, then persists challenge retirement after refresh', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture({ status: 'published' })],
      events: [
        eventFixture({ authoringStatus: 'published', isPublished: true }),
      ],
      questions: Array.from({ length: 5 }, (_, index) =>
        questionFixture(index + 1, 'published'),
      ),
    });
    const view = renderAuthorRoute();

    await screen.findByRole('button', { name: 'Retire event' });
    expect(
      screen.queryByRole('button', { name: 'Retire challenge' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retire event' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Retire event',
      }),
    );

    expect(await screen.findByText('Event retired.')).toHaveFocus();
    const availableRetireChallenge = await screen.findByRole('button', {
      name: 'Retire challenge',
    });
    expect(availableRetireChallenge).toBeEnabled();

    await user.click(availableRetireChallenge);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Retire challenge',
      }),
    );

    expect(await screen.findByText('Challenge retired.')).toHaveFocus();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith(`/author/challenges/${challengeId}/retire`),
      ),
    ).toHaveLength(1);

    view.unmount();
    renderAuthorRoute(authorPaths.eventChallenge(eventId));

    expect(await screen.findByText('Multiple choice · retired')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retire challenge' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retire event' }),
    ).not.toBeInTheDocument();
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
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'Changed elsewhere');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    expect(await screen.findByText('This content changed state')).toBeVisible();
    expect(screen.queryByText(/version|etag/i)).not.toBeInTheDocument();
  });

  it('reloads authoritative event detail after a lifecycle state conflict', async () => {
    const user = userEvent.setup();
    const draft = eventFixture();
    const serverEvent = eventFixture({
      authoringStatus: 'in_review',
      submittedAt: '2026-08-30T10:00:00.000Z',
      submittedBy: '90000000-0000-4000-8000-000000000002',
      version: 1,
    });
    let eventLoads = 0;
    installAuthorApi({
      challenges: [challengeFixture()],
      questions: Array.from({ length: 5 }, (_, index) =>
        questionFixture(index + 1, 'draft'),
      ),
      handleRequest: ({ method, path }) => {
        if (path === '/author/events' && method === 'GET') {
          eventLoads += 1;
          return jsonResponse({
            events: [eventLoads === 1 ? draft : serverEvent],
            requestId: `request-events-${eventLoads}`,
          });
        }
        if (
          path === `/author/events/${eventId}/package/submit` &&
          method === 'POST'
        )
          return problemResponse(
            409,
            'CONTENT_STATE_CONFLICT',
            'The event is already in review.',
          );
        return undefined;
      },
    });
    renderAuthorRoute(authorPaths.eventReview(eventId));

    const submit = await screen.findByRole('button', {
      name: 'Submit event and questions',
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(eventLoads).toBe(2));
    expect(
      screen.queryByRole('button', { name: 'Submit event and questions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve event package' }),
    ).toBeEnabled();
  });

  it('renders a recoverable generic author API loading failure', async () => {
    installAuthorApi({
      eventsError: problemResponse(500, 'INTERNAL_ERROR', 'Try again later.'),
    });
    renderAuthorRoute(authorPaths.events);

    expect(await screen.findByText('Events are unavailable.')).toBeVisible();
    expect(
      screen.getByText(
        'The service could not complete this request. Check your connection and try again. No content change was confirmed.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('clears Event A content while Event B challenges are loading', async () => {
    const user = userEvent.setup();
    const eventB = eventFixture({
      eventId: '10000000-0000-4000-8000-000000000002',
      title: 'Library trail',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [challengeFixture()],
      events: [eventFixture(), eventB],
      questions: [questionFixture(1, 'draft')],
      handleRequest: ({ path }) =>
        path === `/author/events/${eventB.eventId}/challenges`
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.questions(eventId, challengeId));

    expect(
      await screen.findByRole(
        'link',
        { name: /Question 1/ },
        { timeout: 8_000 },
      ),
    ).toBeVisible();
    await openEvent(user, /Library trail/);
    expect(screen.getByText('Loading challenge…')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Question 1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish challenge' }),
    ).not.toBeInTheDocument();

    await openEvent(user, /Great Hall history/);
    expect(
      await screen.findByRole('link', { name: /Question 1/ }),
    ).toBeVisible();

    await act(async () => {
      pending.resolve(
        jsonResponse({ challenges: [], requestId: 'request-event-b' }),
      );
      await pending.promise;
    });
    expect(screen.getByRole('link', { name: /Question 1/ })).toBeVisible();
  });

  it('does not leave Event A content actionable when Event B challenges fail', async () => {
    const user = userEvent.setup();
    const eventB = eventFixture({
      eventId: '10000000-0000-4000-8000-000000000002',
      title: 'Library trail',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [challengeFixture()],
      events: [eventFixture(), eventB],
      questions: [questionFixture(1, 'draft')],
      handleRequest: ({ path }) =>
        path === `/author/events/${eventB.eventId}/challenges`
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.questions(eventId, challengeId));

    expect(
      await screen.findByRole(
        'link',
        { name: /Question 1/ },
        { timeout: 8_000 },
      ),
    ).toBeVisible();
    await openEvent(user, /Library trail/);
    await act(async () => {
      pending.resolve(
        problemResponse(500, 'INTERNAL_ERROR', 'Event B failed to load.'),
      );
      await pending.promise;
    });

    expect(
      await screen.findByText(
        'The service could not complete this request. Check your connection and try again. No content change was confirmed.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Question 1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish challenge' }),
    ).not.toBeInTheDocument();
  });

  it('clears Challenge A questions while Challenge B questions are loading', async () => {
    const user = userEvent.setup();
    const challengeB = challengeFixture({
      challengeId: '20000000-0000-4000-8000-000000000002',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [challengeFixture(), challengeB],
      questions: [questionFixture(1, 'draft')],
      handleRequest: ({ path }) =>
        path === `/author/challenges/${challengeB.challengeId}/questions`
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.questions(eventId, challengeId));

    expect(
      await screen.findByRole('link', { name: /Question 1/ }),
    ).toBeVisible();
    await selectOption(
      user,
      screen.getByLabelText('Challenge'),
      challengeB.challengeId,
    );

    expect(screen.getByText('Loading questions…')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Question 1/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Question prompt')).not.toBeInTheDocument();

    await selectOption(user, screen.getByLabelText('Challenge'), challengeId);
    expect(
      await screen.findByRole('link', { name: /Question 1/ }),
    ).toBeVisible();

    await act(async () => {
      pending.resolve(
        jsonResponse({
          questions: [questionFixture(2, 'draft', challengeB.challengeId)],
          requestId: 'request-challenge-b',
        }),
      );
      await pending.promise;
    });
    await user.click(screen.getByRole('link', { name: /Question 1/ }));
    expect(screen.getByRole('heading', { name: 'Question 1' })).toBeVisible();
  });

  it('does not leave Challenge A questions actionable when Challenge B questions fail', async () => {
    const user = userEvent.setup();
    const challengeB = challengeFixture({
      challengeId: '20000000-0000-4000-8000-000000000002',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [challengeFixture(), challengeB],
      questions: [questionFixture(1, 'draft')],
      handleRequest: ({ path }) =>
        path === `/author/challenges/${challengeB.challengeId}/questions`
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.questions(eventId, challengeId));

    expect(
      await screen.findByRole('link', { name: /Question 1/ }),
    ).toBeVisible();
    await selectOption(
      user,
      screen.getByLabelText('Challenge'),
      challengeB.challengeId,
    );
    await act(async () => {
      pending.resolve(
        problemResponse(500, 'INTERNAL_ERROR', 'Challenge B failed to load.'),
      );
      await pending.promise;
    });

    await waitFor(() =>
      expect(screen.getByRole('main').textContent).toContain(
        'Questions unavailable.',
      ),
    );
    expect(
      screen.getByText(
        'The service could not complete this request. Check your connection and try again. No content change was confirmed.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Question 1/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Question prompt')).not.toBeInTheDocument();
  });

  it('protects an unsaved event when changing Author sections', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi();
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const title = await screen.findByLabelText('Event title');
    await user.type(title, ' unsaved');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    const cardsLink = screen.getByRole('link', { name: 'Cards' });
    await user.click(cardsLink);

    const dialog = screen.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    expect(dialog).toHaveTextContent('unsaved event draft changes');
    expect(window.location.pathname).toBe(authorPaths.editEvent(eventId));
    expect(title).toHaveValue('Great Hall history unsaved');

    await user.click(
      within(dialog).getByRole('button', { name: 'Keep editing' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cardsLink).toHaveFocus();
    await user.click(cardsLink);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Card catalogue' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe(authorPaths.cards);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/publish'),
      ),
    ).toBe(false);
  });

  it('forwards the event version when saving a draft', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi();
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const title = await screen.findByLabelText('Event title');
    await user.type(title, ' unsaved');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await screen.findByText('Event changes saved.');
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/author/events/${eventId}`) &&
        init?.method === 'PUT',
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      expectedVersion: 0,
    });
  });

  it('protects an unsaved question when leaving its editor', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    const question = questionFixture(1, 'draft');
    renderAuthorRoute(
      authorPaths.editQuestion(eventId, challengeId, question.questionId),
    );

    const prompt = await screen.findByLabelText('Question prompt');
    await user.type(prompt, ' unsaved');
    await user.click(screen.getByRole('link', { name: 'Question detail' }));

    expect(
      screen.getByRole('dialog', { name: 'Discard unsaved changes?' }),
    ).toHaveTextContent('unsaved question draft changes');
    expect(prompt).toHaveValue('Question 1 unsaved');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/publish'),
      ),
    ).toBe(false);
  });

  it('forwards the question version when saving a draft', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    const question = questionFixture(1, 'draft');
    renderAuthorRoute(
      authorPaths.editQuestion(eventId, challengeId, question.questionId),
    );

    await user.type(
      await screen.findByLabelText('Question prompt'),
      ' updated',
    );
    await user.click(screen.getByRole('button', { name: 'Save question' }));
    await screen.findByText('Question changes saved.');
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/author/questions/${question.questionId}`) &&
        init?.method === 'PUT',
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      expectedVersion: 0,
    });
  });

  it('protects an unsaved card when leaving its editor', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ cards: [cardFixture()] });
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));

    const name = await screen.findByLabelText('Card name');
    await user.type(name, ' unsaved');
    await user.click(screen.getByRole('link', { name: 'Events' }));

    expect(
      screen.getByRole('dialog', { name: 'Discard unsaved changes?' }),
    ).toHaveTextContent('unsaved card draft changes');
    expect(name).toHaveValue('Campus Owl unsaved');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/publish'),
      ),
    ).toBe(false);
  });

  it('forwards the card version when saving a draft', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ cards: [cardFixture()] });
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));

    await user.type(await screen.findByLabelText('Card name'), ' updated');
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await screen.findByText('Card changes saved.');
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/author/cards/${cardFixture().id}`) &&
        init?.method === 'PUT',
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      expectedVersion: 0,
    });
  });

  it('returns saved records to focused read-only detail before lifecycle actions', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      cards: [cardFixture()],
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const eventTitle = await screen.findByLabelText('Event title');
    await user.clear(eventTitle);
    await user.type(eventTitle, 'Saved event title');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await screen.findByText('Event changes saved.');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Saved event title' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Event title')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('link', { name: /Question 1/ }));
    await user.click(screen.getByRole('link', { name: 'Edit question' }));
    const prompt = await screen.findByLabelText('Question prompt');
    await user.clear(prompt);
    await user.type(prompt, 'Saved question prompt');
    await user.click(screen.getByRole('button', { name: 'Save question' }));
    await screen.findByText('Question changes saved.');
    expect(
      await screen.findByRole('heading', {
        level: 5,
        name: 'Saved question prompt',
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Question prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Submit for review' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(await screen.findByRole('link', { name: /Campus Owl/ }));
    await user.click(screen.getByRole('link', { name: 'Edit card' }));
    const cardName = await screen.findByLabelText('Card name');
    await user.clear(cardName);
    await user.type(cardName, 'Saved card name');
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await screen.findByText('Card changes saved.');
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Saved card name',
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Card name')).not.toBeInTheDocument();
  });

  it('keeps reviewed questions and approved cards in read-only detail', async () => {
    installAuthorApi({
      cards: [cardFixture({ authoringStatus: 'approved', version: 2 })],
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'in_review')],
    });
    const question = questionFixture(1, 'in_review');
    const view = renderAuthorRoute(
      authorPaths.editQuestion(eventId, challengeId, question.questionId),
    );

    expect(
      await screen.findByRole('heading', { level: 5, name: 'Question 1' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Question prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Edit question' }),
    ).not.toBeInTheDocument();

    view.unmount();
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Campus Owl' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Card name')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Edit card' }),
    ).not.toBeInTheDocument();
  });

  it('keeps Event B selected and edited when a delayed Event A save completes', async () => {
    const user = userEvent.setup();
    const eventB = eventFixture({
      eventId: '10000000-0000-4000-8000-000000000002',
      title: 'Library trail',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      events: [eventFixture(), eventB],
      handleRequest: ({ method, path }) => {
        if (path === `/author/events/${eventId}` && method === 'PUT')
          return pending.promise;
        if (path === `/author/events/${eventB.eventId}/challenges`)
          return jsonResponse({ challenges: [], requestId: 'request-event-b' });
        return undefined;
      },
    });
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'Delayed Event A');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await openEvent(user, /Library trail/, true);
    await user.click(await screen.findByRole('link', { name: 'Edit event' }));
    const eventBTitle = await screen.findByLabelText('Event title');
    await user.type(eventBTitle, ' local edit');

    await act(async () => {
      pending.resolve(
        jsonResponse({
          event: eventFixture({ title: 'Delayed Event A' }),
          requestId: 'request-event-a-save',
        }),
      );
      await pending.promise;
    });

    expect(screen.getByLabelText('Event title')).toHaveValue(
      'Library trail local edit',
    );
    expect(screen.getByLabelText('Event title')).toHaveFocus();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Library trail' }),
    ).toBeVisible();
    expect(screen.queryByText('Event changes saved.')).not.toBeInTheDocument();

    await openEvent(user, /Delayed Event A/, true);
    await user.click(await screen.findByRole('link', { name: 'Edit event' }));
    expect(await screen.findByLabelText('Event title')).toHaveValue(
      'Delayed Event A',
    );
  });

  it('keeps Card B selected and edited when a delayed Card A save completes', async () => {
    const user = userEvent.setup();
    const cardB = cardFixture({
      id: '50000000-0000-4000-8000-000000000002',
      name: 'Library Fox',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      cards: [cardFixture(), cardB],
      handleRequest: ({ method, path }) =>
        path === `/author/cards/${cardFixture().id}` && method === 'PUT'
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));

    await user.type(await screen.findByLabelText('Card name'), ' delayed');
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(await screen.findByRole('link', { name: /Library Fox/ }));
    await user.click(await screen.findByRole('link', { name: 'Edit card' }));
    await user.type(await screen.findByLabelText('Card name'), ' local edit');

    await act(async () => {
      pending.resolve(
        jsonResponse({
          card: cardFixture({ name: 'Campus Owl delayed' }),
          requestId: 'request-card-a-save',
        }),
      );
      await pending.promise;
    });

    expect(screen.getByLabelText('Card name')).toHaveValue(
      'Library Fox local edit',
    );
    expect(screen.getByLabelText('Card name')).toHaveFocus();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Library Fox' }),
    ).toBeVisible();
    expect(screen.queryByText('Card changes saved.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(
      await screen.findByRole('link', { name: /Campus Owl delayed/ }),
    );
    await user.click(await screen.findByRole('link', { name: 'Edit card' }));
    expect(await screen.findByLabelText('Card name')).toHaveValue(
      'Campus Owl delayed',
    );
  });

  it('keeps Question B selected and edited when a delayed Question A save completes', async () => {
    const user = userEvent.setup();
    const questionA = questionFixture(1, 'draft');
    const questionB = questionFixture(2, 'draft');
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [challengeFixture()],
      questions: [questionA, questionB],
      handleRequest: ({ method, path }) =>
        path === `/author/questions/${questionA.questionId}` && method === 'PUT'
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(
      authorPaths.editQuestion(eventId, challengeId, questionA.questionId),
    );

    await user.type(
      await screen.findByLabelText('Question prompt'),
      ' delayed',
    );
    await user.click(screen.getByRole('button', { name: 'Save question' }));
    await user.click(screen.getByRole('link', { name: 'Next' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(
      await screen.findByRole('link', { name: 'Edit question' }),
    );
    await user.type(
      await screen.findByLabelText('Question prompt'),
      ' local edit',
    );

    await act(async () => {
      pending.resolve(
        jsonResponse({
          question: { ...questionA, prompt: 'Question 1 delayed' },
          requestId: 'request-question-a-save',
        }),
      );
      await pending.promise;
    });

    expect(screen.getByLabelText('Question prompt')).toHaveValue(
      'Question 2 local edit',
    );
    expect(screen.getByLabelText('Question prompt')).toHaveFocus();
    expect(screen.getByText('Question 2 of 2')).toBeVisible();
    expect(
      screen.queryByText('Question changes saved.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Previous' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(
      await screen.findByRole('link', { name: 'Edit question' }),
    );
    expect(await screen.findByLabelText('Question prompt')).toHaveValue(
      'Question 1 delayed',
    );
  });

  it('keeps the newer same-record event response when A2 completes before A1', async () => {
    const user = userEvent.setup();
    const eventB = eventFixture({
      eventId: '10000000-0000-4000-8000-000000000002',
      title: 'Library trail',
    });
    const firstSave = deferred<Response>();
    const secondSave = deferred<Response>();
    let saveCount = 0;
    installAuthorApi({
      events: [eventFixture(), eventB],
      handleRequest: ({ method, path }) => {
        if (path === `/author/events/${eventId}` && method === 'PUT') {
          saveCount += 1;
          return saveCount === 1 ? firstSave.promise : secondSave.promise;
        }
        if (path === `/author/events/${eventB.eventId}/challenges`)
          return jsonResponse({ challenges: [], requestId: 'request-event-b' });
        return undefined;
      },
    });
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'Event A version 1');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await openEvent(user, /Library trail/, true);
    await openEvent(user, /Great Hall history/);
    await user.click(await screen.findByRole('link', { name: 'Edit event' }));
    const secondTitle = await screen.findByLabelText('Event title');
    await user.clear(secondTitle);
    await user.type(secondTitle, 'Event A version 2');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await openEvent(user, /Library trail/, true);

    await act(async () => {
      secondSave.resolve(
        jsonResponse({
          event: eventFixture({
            title: 'Event A version 2',
            updatedAt: '2026-08-16T10:02:00.000Z',
          }),
          requestId: 'request-event-a2',
        }),
      );
      await secondSave.promise;
      firstSave.resolve(
        jsonResponse({
          event: eventFixture({
            title: 'Event A version 1',
            updatedAt: '2026-08-16T10:01:00.000Z',
          }),
          requestId: 'request-event-a1',
        }),
      );
      await firstSave.promise;
    });

    expect(
      screen.getByRole('heading', { level: 3, name: 'Library trail' }),
    ).toBeVisible();
    await openEvent(user, /Event A version 2/);
    await user.click(await screen.findByRole('link', { name: 'Edit event' }));
    expect(await screen.findByLabelText('Event title')).toHaveValue(
      'Event A version 2',
    );
    expect(screen.queryByText('Event A version 1')).not.toBeInTheDocument();
  });

  it('protects a newer Card draft from a completion owned by an old workspace', async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    installAuthorApi({
      cards: [cardFixture()],
      handleRequest: ({ method, path }) =>
        path === `/author/cards/${cardFixture().id}` && method === 'PUT'
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.editCard(cardFixture().id));

    await user.type(await screen.findByLabelText('Card name'), ' version 1');
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await user.click(screen.getByRole('link', { name: 'Events' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(await screen.findByRole('link', { name: /Campus Owl/ }));
    await user.click(await screen.findByRole('link', { name: 'Edit card' }));
    await user.type(await screen.findByLabelText('Card name'), ' version 2');

    await act(async () => {
      pending.resolve(
        jsonResponse({
          card: cardFixture({
            name: 'Campus Owl version 1',
            updatedAt: '2026-08-16T10:01:00.000Z',
          }),
          requestId: 'request-card-old-workspace',
        }),
      );
      await pending.promise;
    });

    expect(screen.getByLabelText('Card name')).toHaveValue(
      'Campus Owl version 2',
    );
    expect(screen.getByLabelText('Card name')).toHaveFocus();

    await user.click(screen.getByRole('link', { name: 'Events' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(
      await screen.findByRole('link', { name: /Campus Owl version 1/ }),
    );
    await user.click(await screen.findByRole('link', { name: 'Edit card' }));
    expect(await screen.findByLabelText('Card name')).toHaveValue(
      'Campus Owl version 1',
    );
  });

  it('does not offer a second challenge while the event has one active challenge', async () => {
    installAuthorApi({ challenges: [challengeFixture()] });
    renderAuthorRoute();

    expect(await screen.findByText('Multiple choice · draft')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create challenge' }),
    ).not.toBeInTheDocument();
  });

  it('reloads authoritative Event state after a stale unconfirmed failure', async () => {
    const user = userEvent.setup();
    const eventB = eventFixture({
      eventId: '10000000-0000-4000-8000-000000000002',
      title: 'Library trail',
    });
    const pending = deferred<Response>();
    let eventLoadCount = 0;
    installAuthorApi({
      events: [eventFixture(), eventB],
      handleRequest: ({ method, path }) => {
        if (path === '/author/events' && method === 'GET') {
          eventLoadCount += 1;
          if (eventLoadCount > 1)
            return jsonResponse({
              events: [
                eventFixture({ title: 'Server-confirmed Event A' }),
                eventB,
              ],
              requestId: 'request-events-reconciled',
            });
        }
        if (path === `/author/events/${eventId}` && method === 'PUT')
          return pending.promise;
        if (path === `/author/events/${eventB.eventId}/challenges`)
          return jsonResponse({ challenges: [], requestId: 'request-event-b' });
        return undefined;
      },
    });
    renderAuthorRoute(authorPaths.editEvent(eventId));

    const title = await screen.findByLabelText('Event title');
    await user.type(title, ' uncertain');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await openEvent(user, /Library trail/, true);
    await act(async () => {
      pending.reject(new TypeError('Response connection lost'));
      await pending.promise.catch(() => undefined);
    });

    expect(
      screen.queryByText('No content change was confirmed.'),
    ).not.toBeInTheDocument();
    await openEvent(user, /Server-confirmed Event A/);
    await user.click(await screen.findByRole('link', { name: 'Edit event' }));
    expect(await screen.findByLabelText('Event title')).toHaveValue(
      'Server-confirmed Event A',
    );
    expect(eventLoadCount).toBe(2);
  });

  it('does not announce or focus delayed Event publication after a newer Challenge interaction', async () => {
    const user = userEvent.setup();
    const challengeB = challengeFixture({
      challengeId: '20000000-0000-4000-8000-000000000002',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [challengeFixture(), challengeB],
      events: [eventFixture({ authoringStatus: 'approved', version: 2 })],
      handleRequest: ({ path }) => {
        if (path === `/author/events/${eventId}/package/publish`)
          return pending.promise;
        if (path === `/author/challenges/${challengeB.challengeId}/questions`)
          return jsonResponse({
            questions: [],
            requestId: 'request-questions-b',
          });
        return undefined;
      },
    });
    renderAuthorRoute();

    const selector = await screen.findByLabelText('Challenge');
    await user.click(
      screen.getByRole('button', { name: 'Publish event package' }),
    );
    await selectOption(user, selector, challengeB.challengeId);
    await waitFor(() => expect(selector).toHaveFocus());

    await act(async () => {
      pending.resolve(
        jsonResponse({
          event: eventFixture({
            authoringStatus: 'published',
            isPublished: true,
          }),
          requestId: 'request-event-publish-delayed',
        }),
      );
      await pending.promise;
    });

    expect(selector).toHaveTextContent('Challenge 2 · Multiple choice');
    await waitFor(() => expect(selector).toHaveFocus());
    expect(
      screen.queryByText(
        'Event published and available to the player API according to its active times.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows an in-review event without lifecycle action controls', async () => {
    installAuthorApi({
      events: [eventFixture({ authoringStatus: 'in_review', version: 1 })],
    });
    renderAuthorRoute(authorPaths.event(eventId));

    expect((await screen.findAllByText('in review'))[0]).toBeVisible();
    expect(screen.queryByLabelText('Event title')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Edit event' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish event package' }),
    ).not.toBeInTheDocument();
  });

  it('reconciles a delayed card lifecycle response without touching the newer editor', async () => {
    const user = userEvent.setup();
    const cardB = cardFixture({
      id: '50000000-0000-4000-8000-000000000002',
      name: 'Library Fox',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      cards: [cardFixture({ authoringStatus: 'approved', version: 2 }), cardB],
      handleRequest: ({ path }) =>
        path === `/author/cards/${cardFixture().id}/publish`
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute(authorPaths.card(cardFixture().id));

    await user.click(
      await screen.findByRole('button', { name: 'Publish card' }),
    );
    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(await screen.findByRole('link', { name: /Library Fox/ }));
    await user.click(await screen.findByRole('link', { name: 'Edit card' }));
    await user.type(await screen.findByLabelText('Card name'), ' local edit');

    await act(async () => {
      pending.resolve(
        jsonResponse({
          card: cardFixture({
            authoringStatus: 'published',
            isActive: true,
          }),
          requestId: 'request-card-a-publish',
        }),
      );
      await pending.promise;
    });

    expect(screen.getByLabelText('Card name')).toHaveValue(
      'Library Fox local edit',
    );
    expect(screen.getByLabelText('Card name')).toHaveFocus();
    expect(
      screen.queryByText('Card published and active.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Cards' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await user.click(await screen.findByRole('link', { name: /Campus Owl/ }));
    expect(screen.queryByLabelText('Card name')).not.toBeInTheDocument();
    expect(
      within(
        screen
          .getByRole('heading', { level: 3, name: 'Campus Owl' })
          .closest('article')!,
      ).getByText('Published'),
    ).toBeVisible();
  });

  it('reconciles a delayed challenge lifecycle response without changing the newer challenge', async () => {
    const user = userEvent.setup();
    const challengeB = challengeFixture({
      challengeId: '20000000-0000-4000-8000-000000000002',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [
        challengeFixture({ status: 'approved', version: 2 }),
        challengeB,
      ],
      handleRequest: ({ path }) => {
        if (path === `/author/challenges/${challengeId}/publish`)
          return pending.promise;
        if (path === `/author/challenges/${challengeB.challengeId}/questions`)
          return jsonResponse({
            questions: [],
            requestId: 'request-questions-b',
          });
        return undefined;
      },
    });
    renderAuthorRoute();

    const selector = await screen.findByLabelText('Challenge');
    await user.click(screen.getByRole('button', { name: 'Publish challenge' }));
    await selectOption(user, selector, challengeB.challengeId);
    await waitFor(() => expect(selector).toHaveFocus());

    await act(async () => {
      pending.resolve(
        jsonResponse({
          challenge: { ...challengeFixture(), status: 'published' },
          requestId: 'request-challenge-a-publish',
        }),
      );
      await pending.promise;
    });

    expect(selector).toHaveTextContent('Challenge 2 · Multiple choice');
    await waitFor(() => expect(selector).toHaveFocus());
    expect(screen.queryByText('Challenge published.')).not.toBeInTheDocument();

    await selectOption(user, selector, challengeId);
    expect(selector).toHaveTextContent('Challenge 1 · Multiple choice');
    expect(
      screen.queryByRole('button', { name: 'Publish challenge' }),
    ).not.toBeInTheDocument();
    expect(selector).toHaveTextContent(
      'Challenge 1 · Multiple choice · published',
    );
  });

  it('shows an approved card with a publish action but no edit control', async () => {
    installAuthorApi({
      cards: [cardFixture({ authoringStatus: 'approved', version: 2 })],
    });
    renderAuthorRoute(authorPaths.card(cardFixture().id));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Campus Owl' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Card name')).not.toBeInTheDocument();
    expect(
      within(
        screen
          .getByRole('heading', { level: 3, name: 'Campus Owl' })
          .closest('article')!,
      ).getByText('Approved'),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Edit card' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish card' })).toBeEnabled();
  });

  it('shows an approved challenge in the expanded status enum', async () => {
    installAuthorApi({
      challenges: [challengeFixture({ status: 'approved', version: 2 })],
    });
    renderAuthorRoute();

    expect(await screen.findByText('Multiple choice · approved')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Publish challenge' }),
    ).toBeEnabled();
  });

  it('preserves challenge selection when switching between existing records', async () => {
    const user = userEvent.setup();
    const challengeB = challengeFixture({
      challengeId: '20000000-0000-4000-8000-000000000002',
    });
    installAuthorApi({
      challenges: [challengeFixture(), challengeB],
    });
    renderAuthorRoute();

    const selector = await screen.findByLabelText('Challenge');
    expect(
      screen.queryByRole('button', { name: 'Create challenge' }),
    ).not.toBeInTheDocument();
    await selectOption(user, selector, challengeB.challengeId);
    expect(selector).toHaveTextContent('Challenge 2 · Multiple choice');
    await waitFor(() => expect(selector).toHaveFocus());
    await selectOption(user, selector, challengeId);
    expect(selector).toHaveTextContent('Challenge 1 · Multiple choice');
  });

  it('focuses challenge-create feedback when the request fails in the same context', async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [],
      handleRequest: ({ method, path }) =>
        method === 'POST' && path === `/author/events/${eventId}/challenges`
          ? pending.promise
          : undefined,
    });
    renderAuthorRoute();

    await user.click(
      await screen.findByRole('button', { name: 'Create challenge' }),
    );
    await act(async () => {
      pending.resolve(
        problemResponse(500, 'INTERNAL_ERROR', 'Challenge creation failed.'),
      );
      await pending.promise;
    });

    const feedback = await screen.findByRole('alert');
    expect(feedback).toHaveTextContent('No content change was confirmed.');
    expect(feedback).not.toHaveTextContent('Challenge creation failed.');
    expect(feedback).toHaveFocus();
  });

  it('does not focus obsolete challenge-create errors after changing event context', async () => {
    const user = userEvent.setup();
    const eventB = eventFixture({
      eventId: '10000000-0000-4000-8000-000000000002',
      title: 'Library trail',
    });
    const pending = deferred<Response>();
    installAuthorApi({
      challenges: [],
      events: [eventFixture(), eventB],
      handleRequest: ({ method, path }) => {
        if (
          method === 'POST' &&
          path === `/author/events/${eventId}/challenges`
        )
          return pending.promise;
        if (path === `/author/events/${eventB.eventId}/challenges`)
          return jsonResponse({ challenges: [], requestId: 'request-event-b' });
        return undefined;
      },
    });
    renderAuthorRoute();

    await user.click(
      await screen.findByRole('button', { name: 'Create challenge' }),
    );
    await openEvent(user, /Library trail/);
    const eventBEdit = await screen.findByRole('link', { name: 'Edit event' });
    eventBEdit.focus();

    await act(async () => {
      pending.resolve(
        problemResponse(500, 'INTERNAL_ERROR', 'Obsolete challenge failure.'),
      );
      await pending.promise;
    });

    expect(eventBEdit).toHaveFocus();
    expect(
      screen.queryByText('Obsolete challenge failure.'),
    ).not.toBeInTheDocument();
  });

  it('associates nested card validation messages with each affected control', async () => {
    const user = userEvent.setup();
    installAuthorApi({ cards: [] });
    renderAuthorRoute(authorPaths.newCard);

    await user.type(
      await screen.findByLabelText('Card name'),
      'Validation card',
    );
    await user.clear(screen.getByLabelText('Power cost'));
    await user.type(screen.getByLabelText('Power cost'), '-1');
    await user.clear(screen.getByLabelText('Effect value (optional)'));
    await user.type(screen.getByLabelText('Effect value (optional)'), '-1');
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));

    expect(screen.getByLabelText('Move name')).toHaveAccessibleDescription(
      'Enter a move name.',
    );
    expect(screen.getByLabelText('Power cost')).toHaveAccessibleDescription(
      'Enter a non-negative whole number.',
    );
    expect(
      screen.getByLabelText('Effect value (optional)'),
    ).toHaveAccessibleDescription('Enter a non-negative whole number.');

    await user.type(screen.getByLabelText('Move name'), 'Study');
    await user.clear(screen.getByLabelText('Power cost'));
    await user.type(screen.getByLabelText('Power cost'), '0');
    await user.clear(screen.getByLabelText('Effect value (optional)'));
    await user.type(screen.getByLabelText('Effect value (optional)'), '0');
    await selectOption(user, screen.getByLabelText('Effect type'), 'buff');
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));
    expect(screen.getByLabelText('Modifier stat')).toHaveAccessibleDescription(
      'Buff and debuff effects require modifier metadata.',
    );

    await selectOption(
      user,
      screen.getByLabelText('Modifier stat'),
      'damage_multiplier',
    );
    await user.type(screen.getByLabelText('Duration in turns (optional)'), '0');
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));
    expect(
      screen.getByLabelText('Duration in turns (optional)'),
    ).toHaveAccessibleDescription('Enter a positive whole number.');
  });

  it('reports Common catalogue readiness only for a successful authoritative load', async () => {
    installAuthorApi();
    const cards = [
      cardFixture({ authoringStatus: 'published', isActive: true }),
    ];
    const props = {
      apiBaseUrl,
      cards,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      mapboxAccessToken,
      mutationCoordinator: new AuthorMutationCoordinator(),
      navigate: vi.fn(),
      onOpenCards: vi.fn(),
      onReloadCards: vi.fn(),
      route: {
        eventId,
        mode: 'challenge' as const,
        section: 'events' as const,
        tab: 'review' as const,
      },
    };
    const view = render(<EventWorkspace {...props} cardsState="loading" />);

    expect(await screen.findByText('Loading reward catalogue…')).toBeVisible();
    expect(
      screen.queryByText('Published Common reward available'),
    ).not.toBeInTheDocument();

    view.rerender(<EventWorkspace {...props} cardsState="error" />);
    expect(screen.getByRole('button', { name: 'Retry cards' })).toBeVisible();
    expect(
      screen.queryByText('Published Common reward available'),
    ).not.toBeInTheDocument();

    view.rerender(<EventWorkspace {...props} cardsState="ready" />);
    expect(screen.getByText('Published Common reward available')).toBeVisible();
  });
});

interface ApiOptions {
  cards?: AuthorCard[];
  challenges?: AuthorChallenge[];
  events?: AuthorEvent[];
  eventsError?: Response;
  handleRequest?: (
    request: RequestDetails,
  ) => Promise<Response> | Response | undefined;
  publishCardError?: Response;
  publishEventError?: Response;
  questions?: AuthorQuestion[];
  updateEventError?: Response;
}

interface RequestDetails {
  init?: RequestInit;
  method: string;
  path: string;
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
      const overridden = options.handleRequest?.({ init, method, path });
      if (overridden !== undefined) return overridden;

      if (path === '/auth/me') {
        return jsonResponse({
          connectionStrategy: 'auth0',
          id: '90000000-0000-4000-8000-000000000001',
          playerName: 'test-player',
          playerNameSetupRequired: false,
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
          moves: body.moves.map((move: object, index: number) => ({
            id: cardMoveFixture(index + 1).id,
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
        const event = { ...eventFixture(), ...body };
        events.splice(
          events.findIndex((item) => item.eventId === eventId),
          1,
          event,
        );
        return jsonResponse({
          event,
          requestId: 'request-event-update',
        });
      }
      if (path === `/author/events/${eventId}/package/publish`) {
        if (options.publishEventError) return options.publishEventError.clone();
        return jsonResponse({
          event: {
            ...(events.find((item) => item.eventId === eventId) ??
              eventFixture()),
            authoringStatus: 'published',
            isPublished: true,
          },
          requestId: 'request-event-publish',
        });
      }
      if (path === `/author/events/${eventId}/package/submit`) {
        const index = events.findIndex((item) => item.eventId === eventId);
        const event = {
          ...(events[index] ?? eventFixture()),
          authoringStatus: 'in_review' as const,
          submittedAt: '2026-08-20T10:00:00.000Z',
          submittedBy: '90000000-0000-4000-8000-000000000001',
        };
        events.splice(index, 1, event);
        for (const challenge of challenges) {
          if (challenge.status === 'draft') challenge.status = 'in_review';
        }
        for (const question of questions) {
          if (question.status === 'draft') question.status = 'in_review';
        }
        return jsonResponse({ event, requestId: 'request-event-submit' });
      }
      if (path === `/author/events/${eventId}/retire`) {
        const index = events.findIndex((item) => item.eventId === eventId);
        const event = {
          ...(events[index] ?? eventFixture()),
          authoringStatus: 'retired' as const,
          isPublished: false,
          retiredAt: '2026-08-20T10:00:00.000Z',
        };
        events.splice(index, 1, event);
        return jsonResponse({ event, requestId: 'request-event-retire' });
      }
      if (path === `/author/events/${eventId}/challenges` && method === 'GET') {
        return jsonResponse({ challenges, requestId: 'request-challenges' });
      }
      if (
        path === `/author/events/${eventId}/challenges` &&
        method === 'POST'
      ) {
        const body = JSON.parse(String(init?.body));
        const challenge = challengeFixture({ format: body.format });
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

        if (body.format === 'ordering') {
          const baseQuestion = orderingQuestionFixture(1, 'draft');
          const question = {
            ...baseQuestion,
            ...body,
            items: body.items.map((text: string, index: number) => ({
              itemId: baseQuestion.items[index]!.itemId,
              position: index + 1,
              text,
            })),
          };
          questions.push(question);
          return jsonResponse(
            { question, requestId: 'request-question-create' },
            201,
          );
        }

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
      if (
        path === `/author/challenges/${challengeId}/retire` &&
        method === 'POST'
      ) {
        const index = challenges.findIndex(
          (item) => item.challengeId === challengeId,
        );
        const challenge = {
          ...(challenges[index] ?? challengeFixture()),
          status: 'retired' as const,
        };
        challenges.splice(index, 1, challenge);
        return jsonResponse({
          challenge,
          requestId: 'request-challenge-retire',
        });
      }
      if (
        path === `/author/challenges/${challengeId}/submit` &&
        method === 'POST'
      ) {
        const index = challenges.findIndex(
          (item) => item.challengeId === challengeId,
        );
        const challenge = {
          ...(challenges[index] ?? challengeFixture()),
          status: 'in_review' as const,
          submittedAt: '2026-08-20T10:00:00.000Z',
          submittedBy: '90000000-0000-4000-8000-000000000001',
        };
        challenges.splice(index, 1, challenge);
        return jsonResponse({
          challenge,
          requestId: 'request-challenge-submit',
        });
      }
      if (path.startsWith('/author/questions/') && method === 'PUT') {
        const body = JSON.parse(String(init?.body));

        if (body.format === 'ordering') {
          const baseQuestion = orderingQuestionFixture(1, 'draft');
          const question = {
            ...baseQuestion,
            ...body,
            items: body.items.map((text: string, index: number) => ({
              itemId: baseQuestion.items[index]!.itemId,
              position: index + 1,
              text,
            })),
          };
          questions.splice(
            questions.findIndex(
              (item) => item.questionId === question.questionId,
            ),
            1,
            question,
          );
          return jsonResponse({
            question,
            requestId: 'request-question-update',
          });
        }

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
        questions.splice(
          questions.findIndex(
            (item) => item.questionId === question.questionId,
          ),
          1,
          question,
        );
        return jsonResponse({
          question,
          requestId: 'request-question-update',
        });
      }
      if (path.startsWith('/author/questions/') && path.endsWith('/publish')) {
        const questionId = path.split('/')[3]!;
        const question = {
          ...(questions.find((item) => item.questionId === questionId) ??
            questionFixture(1, 'draft')),
          status: 'published',
        };
        return jsonResponse({
          question,
          requestId: 'request-question-publish',
        });
      }
      if (path.startsWith('/author/questions/') && path.endsWith('/submit')) {
        const submittedQuestionId = path.split('/')[3]!;
        const index = questions.findIndex(
          (item) => item.questionId === submittedQuestionId,
        );
        const question = {
          ...(questions[index] ?? questionFixture(1, 'draft')),
          status: 'in_review' as const,
          submittedAt: '2026-08-20T10:00:00.000Z',
          submittedBy: '90000000-0000-4000-8000-000000000001',
        };
        questions.splice(index, 1, question);
        return jsonResponse({
          question,
          requestId: 'request-question-submit',
        });
      }
      if (path === `/author/cards/${cardFixture().id}` && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        const card = {
          ...cardFixture(),
          ...body,
          moves: body.moves.map((move: object, index: number) => ({
            id: cardMoveFixture(index + 1).id,
            ...move,
          })),
        };
        cards.splice(
          cards.findIndex((item) => item.id === card.id),
          1,
          card,
        );
        return jsonResponse({
          card,
          requestId: 'request-card-update',
        });
      }
      if (path === `/author/cards/${cardFixture().id}/publish`) {
        if (options.publishCardError) return options.publishCardError.clone();
        const card = {
          ...(cards.find((item) => item.id === cardFixture().id) ??
            cardFixture()),
          authoringStatus: 'published',
          isActive: true,
        };
        return jsonResponse({ card, requestId: 'request-card-publish' });
      }
      if (path === `/author/cards/${cardFixture().id}/submit`) {
        const index = cards.findIndex((item) => item.id === cardFixture().id);
        const card = {
          ...(cards[index] ?? cardFixture()),
          authoringStatus: 'in_review' as const,
          submittedAt: '2026-08-20T10:00:00.000Z',
          submittedBy: '90000000-0000-4000-8000-000000000001',
        };
        cards.splice(index, 1, card);
        return jsonResponse({ card, requestId: 'request-card-submit' });
      }

      throw new Error(`Unexpected ${method} request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openEvent(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  discard = false,
) {
  if (!screen.queryByRole('link', { name })) {
    await user.click(screen.getAllByRole('link', { name: 'Events' })[0]!);
    if (discard) {
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Discard changes',
        }),
      );
    }
  }
  await user.click(await screen.findByRole('link', { name }));
}

function renderAuthorRoute(
  pathname = authorPaths.eventReview(eventId),
  authValue = authenticatedAuthor(),
) {
  window.history.replaceState({}, '', pathname);
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

function authenticatedAuthor(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    user: { name: 'Author Test', sub: 'auth0|author' },
  } as Auth0ContextInterface;
}

function eventFixture(overrides: Partial<AuthorEvent> = {}): AuthorEvent {
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
    sourceUrls: [],
    retiredAt: null,
    startsAt: '2026-09-01T08:00:00.000Z',
    title: 'Great Hall history',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
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
    status: 'draft',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
  };
}

function questionFixture(
  position: number,
  status:
    'draft' | 'in_review' | 'approved' | 'published' | 'retired' = 'draft',
  parentChallengeId = challengeId,
): AuthorMultipleChoiceQuestion {
  const questionId = `40000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
  return {
    acceptedChoiceId: `41000000-0000-4000-8000-${String(position * 10 + 2).padStart(12, '0')}`,
    acceptedChoicePosition: 2,
    challengeId: parentChallengeId,
    choices: [1, 2, 3, 4].map((choicePosition) => ({
      choiceId: `41000000-0000-4000-8000-${String(position * 10 + choicePosition).padStart(12, '0')}`,
      position: choicePosition,
      text: `Answer ${choicePosition}`,
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 1,
    explanation: 'Author-only explanation.',
    sourceUrls: [],
    format: 'multiple_choice',
    prompt: `Question ${position}`,
    questionId,
    status,
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
  };
}

function orderingQuestionFixture(
  position: number,
  status:
    'draft' | 'in_review' | 'approved' | 'published' | 'retired' = 'draft',
  parentChallengeId = challengeId,
): AuthorOrderingQuestion {
  const questionId = `42000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
  return {
    challengeId: parentChallengeId,
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 1,
    explanation: 'The eras follow this established chronology.',
    sourceUrls: [],
    format: 'ordering',
    items: [1, 2, 3, 4].map((itemPosition) => ({
      itemId: `43000000-0000-4000-8000-${String(position * 10 + itemPosition).padStart(12, '0')}`,
      position: itemPosition,
      text: `Era ${itemPosition}`,
    })),
    prompt: `Ordering question ${position}`,
    publicationProvenance: null,
    questionId,
    reviewedAt: null,
    reviewedBy: null,
    status,
    submittedAt: null,
    submittedBy: null,
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
  };
}

function cardFixture(overrides: Partial<AuthorCard> = {}): AuthorCard {
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
    moves: [cardMoveFixture(1)],
    name: 'Campus Owl',
    power: 20,
    rarity: 'common',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
  };
}

function cardMoveFixture(position: number): AuthorCard['moves'][number] {
  return {
    effectType: 'damage',
    effectValue: 12,
    id: `60000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    modifierDurationTurns: null,
    modifierOperation: null,
    modifierStat: null,
    moveType: 'basic',
    name: position === 1 ? 'Quick Peck' : `Move ${position}`,
    position,
    powerCost: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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

async function enterEventDateTime(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const [year, month, day, hour, minute] = value.split(/[-T:]/);
  const field = within(screen.getByRole('group', { name: label }));
  for (const [part, digits] of Object.entries({
    year,
    month,
    day,
    hour,
    minute,
  })) {
    if (!digits) throw new Error('Incomplete date-time test value');
    await user.type(
      field.getByRole('spinbutton', { name: new RegExp(`^${part},`) }),
      digits,
    );
  }
}
