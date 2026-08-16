import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';
import type {
  AuthorCard,
  AuthorChallenge,
  AuthorEvent,
  AuthorQuestion,
} from '../src/api/author';
import { EventWorkspace } from '../src/components/author/EventWorkspace';

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
    renderAuthorRoute();

    expect(await screen.findByRole('button', { name: /Q1/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Library trail/ }));

    expect(screen.getByText('Loading event challenges…')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Q1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish challenge' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Great Hall history/ }),
    );
    expect(await screen.findByRole('button', { name: /Q1/ })).toBeVisible();

    await act(async () => {
      pending.resolve(
        jsonResponse({ challenges: [], requestId: 'request-event-b' }),
      );
      await pending.promise;
    });
    expect(screen.getByRole('button', { name: /Q1/ })).toBeVisible();
    expect(screen.getByLabelText('Event title')).toHaveValue(
      'Great Hall history',
    );
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
    renderAuthorRoute();

    expect(await screen.findByRole('button', { name: /Q1/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Library trail/ }));
    await act(async () => {
      pending.resolve(
        problemResponse(500, 'INTERNAL_ERROR', 'Event B failed to load.'),
      );
      await pending.promise;
    });

    expect(await screen.findByText('Event B failed to load.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Q1/ }),
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
    renderAuthorRoute();

    expect(await screen.findByRole('button', { name: /Q1/ })).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText('Challenge'),
      challengeB.challengeId,
    );

    expect(screen.getByText('Loading challenge questions…')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Q1/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Question prompt')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Challenge'), challengeId);
    expect(await screen.findByRole('button', { name: /Q1/ })).toBeVisible();

    await act(async () => {
      pending.resolve(
        jsonResponse({
          questions: [questionFixture(2, 'draft', challengeB.challengeId)],
          requestId: 'request-challenge-b',
        }),
      );
      await pending.promise;
    });
    await user.click(screen.getByRole('button', { name: /Q1/ }));
    expect(screen.getByLabelText('Question prompt')).toHaveValue('Question 1');
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
    renderAuthorRoute();

    expect(await screen.findByRole('button', { name: /Q1/ })).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText('Challenge'),
      challengeB.challengeId,
    );
    await act(async () => {
      pending.resolve(
        problemResponse(500, 'INTERNAL_ERROR', 'Challenge B failed to load.'),
      );
      await pending.promise;
    });

    expect(await screen.findByText('Questions are unavailable.')).toBeVisible();
    expect(screen.getByText('Challenge B failed to load.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Q1/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Question prompt')).not.toBeInTheDocument();
  });

  it('requires unsaved event changes to be saved before publication', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi();
    renderAuthorRoute();

    const title = await screen.findByLabelText('Event title');
    await user.type(title, ' unsaved');
    const publish = screen.getByRole('button', {
      name: 'Ask API to publish event',
    });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Save event changes before publishing.',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/publish'),
      ),
    ).toBe(false);
  });

  it('requires unsaved question changes to be saved before publication', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    renderAuthorRoute();

    await user.click(await screen.findByRole('button', { name: /Q1/ }));
    await user.type(screen.getByLabelText('Question prompt'), ' unsaved');
    const publish = screen.getByRole('button', { name: 'Publish question' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Unsaved question changes. Save before publishing.',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/publish'),
      ),
    ).toBe(false);
  });

  it('requires unsaved card changes to be saved before publication', async () => {
    const user = userEvent.setup();
    const fetchMock = installAuthorApi({ cards: [cardFixture()] });
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Author console' });
    await user.click(screen.getByRole('button', { name: 'Card catalogue' }));
    await user.click(screen.getByRole('button', { name: /Campus Owl/ }));
    await user.type(screen.getByLabelText('Card name'), ' unsaved');
    const publish = screen.getByRole('button', { name: 'Publish card' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Unsaved card changes. Save before publishing.',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/publish'),
      ),
    ).toBe(false);
  });

  it('resets event, question, and card forms to lifecycle response data after save and publish', async () => {
    const user = userEvent.setup();
    installAuthorApi({
      cards: [cardFixture()],
      challenges: [challengeFixture()],
      questions: [questionFixture(1, 'draft')],
    });
    renderAuthorRoute();

    const eventTitle = await screen.findByLabelText('Event title');
    await user.clear(eventTitle);
    await user.type(eventTitle, 'Saved event title');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await screen.findByText('Event changes saved.');
    await user.click(
      screen.getByRole('button', { name: 'Ask API to publish event' }),
    );
    expect(await screen.findByLabelText('Event title')).toHaveValue(
      'Saved event title',
    );
    expect(screen.getByLabelText('Event title')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Q1/ }));
    const prompt = screen.getByLabelText('Question prompt');
    await user.clear(prompt);
    await user.type(prompt, 'Saved question prompt');
    await user.click(screen.getByRole('button', { name: 'Save question' }));
    await screen.findByText('Question changes saved.');
    await user.click(screen.getByRole('button', { name: 'Publish question' }));
    expect(await screen.findByLabelText('Question prompt')).toHaveValue(
      'Saved question prompt',
    );
    expect(screen.getByLabelText('Question prompt')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Card catalogue' }));
    await user.click(screen.getByRole('button', { name: /Campus Owl/ }));
    const cardName = screen.getByLabelText('Card name');
    await user.clear(cardName);
    await user.type(cardName, 'Saved card name');
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await screen.findByText('Card changes saved.');
    await user.click(screen.getByRole('button', { name: 'Publish card' }));
    expect(await screen.findByLabelText('Card name')).toHaveValue(
      'Saved card name',
    );
    expect(screen.getByLabelText('Card name')).toBeDisabled();
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
    renderAuthorRoute();

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'Delayed Event A');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    await user.click(screen.getByRole('button', { name: /Library trail/ }));
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
      screen.getByRole('button', { name: /Library trail/ }),
    ).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText('Event changes saved.')).not.toBeInTheDocument();
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
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Author console' });
    await user.click(screen.getByRole('button', { name: 'Card catalogue' }));
    await user.click(screen.getByRole('button', { name: /Campus Owl/ }));
    await user.type(screen.getByLabelText('Card name'), ' delayed');
    await user.click(screen.getByRole('button', { name: 'Save card' }));
    await user.click(screen.getByRole('button', { name: /Library Fox/ }));
    await user.type(screen.getByLabelText('Card name'), ' local edit');

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
    expect(screen.getByRole('button', { name: /Library Fox/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.queryByText('Card changes saved.')).not.toBeInTheDocument();
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
    renderAuthorRoute();

    await user.click(await screen.findByRole('button', { name: /Q1/ }));
    await user.type(screen.getByLabelText('Question prompt'), ' delayed');
    await user.click(screen.getByRole('button', { name: 'Save question' }));
    await user.click(screen.getByRole('button', { name: /Q2/ }));
    await user.type(screen.getByLabelText('Question prompt'), ' local edit');

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
    expect(screen.getByRole('button', { name: /Q2/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      screen.queryByText('Question changes saved.'),
    ).not.toBeInTheDocument();
  });

  it('associates nested card validation messages with each affected control', async () => {
    const user = userEvent.setup();
    installAuthorApi({ cards: [] });
    renderAuthorRoute();

    await screen.findByRole('heading', { name: 'Author console' });
    await user.click(screen.getByRole('button', { name: 'Card catalogue' }));
    await user.type(screen.getByLabelText('Card name'), 'Validation card');
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
    await user.selectOptions(screen.getByLabelText('Effect type'), 'buff');
    await user.click(screen.getByRole('button', { name: 'Create draft card' }));
    expect(screen.getByLabelText('Modifier stat')).toHaveAccessibleDescription(
      'Buff and debuff effects require modifier metadata.',
    );

    await user.selectOptions(
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
      onOpenCards: vi.fn(),
      onReloadCards: vi.fn(),
    };
    const view = render(<EventWorkspace {...props} cardsState="loading" />);

    expect(
      await screen.findByText('Incomplete — Common reward catalogue'),
    ).toBeVisible();
    expect(
      screen.queryByText('Ready — Common reward catalogue'),
    ).not.toBeInTheDocument();

    view.rerender(<EventWorkspace {...props} cardsState="error" />);
    expect(screen.getByText('Catalogue could not be checked.')).toBeVisible();
    expect(
      screen.queryByText('Ready — Common reward catalogue'),
    ).not.toBeInTheDocument();

    view.rerender(<EventWorkspace {...props} cardsState="ready" />);
    expect(screen.getByText('Ready — Common reward catalogue')).toBeVisible();
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
      if (path === `/author/events/${eventId}/publish`) {
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
      if (path === `/author/cards/${cardFixture().id}` && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        const card = {
          ...cardFixture(),
          ...body,
          moves: body.moves.map((move: object) => ({
            id: cardFixture().moves[0]!.id,
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
        const card = {
          ...(cards.find((item) => item.id === cardFixture().id) ??
            cardFixture()),
          authoringStatus: 'published',
          isActive: true,
        };
        return jsonResponse({ card, requestId: 'request-card-publish' });
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

function eventFixture(overrides: Partial<AuthorEvent> = {}): AuthorEvent {
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
    ...overrides,
  };
}

function questionFixture(
  position: number,
  status: 'draft' | 'published',
  parentChallengeId = challengeId,
): AuthorQuestion {
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
    prompt: `Question ${position}`,
    questionId,
    status,
    updatedAt: '2026-08-16T08:00:00.000Z',
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
    ...overrides,
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
