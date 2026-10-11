import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';
import {
  BrowserLocationError,
  type LocationClaim,
} from '../src/browser-location';
import {
  OfflineAttemptPage,
  OfflineExplorePage,
} from '../src/offline/OfflinePages';
import { OfflineProvider } from '../src/offline/OfflineProvider';
import type {
  CachedPack,
  LocalAttempt,
  OfflineReceipt,
} from '../src/offline/store';

const mocks = vi.hoisted(() => ({
  requestLocation: vi.fn(),
  readState: vi.fn(),
  createAttempt: vi.fn(),
  saveAnswer: vi.fn(),
  finishAttempt: vi.fn(),
}));

vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({
    state: { status: 'signed-out' },
    reload: vi.fn(),
  }),
}));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => vi.fn(),
}));
vi.mock('../src/browser-location', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/browser-location')>()),
  requestBrowserLocation: mocks.requestLocation,
}));
vi.mock('../src/offline/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/offline/store')>()),
  boundOfflinePlayer: () => 'player',
  readOfflineState: mocks.readState,
  createLocalAttempt: mocks.createAttempt,
  saveLocalAnswer: mocks.saveAnswer,
  finishLocalAttempt: mocks.finishAttempt,
}));

const location: LocationClaim = {
  latitude: -26.19205,
  longitude: 28.03038,
  accuracyMetres: 12,
  acquiredAt: new Date().toISOString(),
};

function makePack(
  format: CachedPack['pack']['format'] = 'multiple_choice',
): CachedPack {
  const now = Date.now();
  return {
    packToken: 'signed-offline-pack',
    pack: {
      version: 1,
      playerId: 'player',
      packId: `pack-${format}`,
      issuedAt: new Date(now - 60 * 60_000).toISOString(),
      validFrom: new Date(now - 60_000).toISOString(),
      validUntil: new Date(now + 4 * 60 * 60_000).toISOString(),
      challengeId: 'challenge',
      challengeVersion: 1,
      format,
      timeLimitSeconds: 120,
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `question-${index + 1}`,
        version: 1,
        prompt: `Question ${index + 1}: campus knowledge?`,
        difficulty: 1 as const,
        options: [
          { id: 'first', text: 'First answer' },
          { id: 'second', text: 'Second answer' },
          { id: 'third', text: 'Third answer' },
          { id: 'fourth', text: 'Fourth answer' },
        ],
      })),
      event: {
        eventId: 'event-1',
        version: 1,
        title: 'Great Hall Quest',
        description: 'A saved campus challenge.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
      },
    },
  };
}

function makeAttempt(
  cached = makePack(),
  overrides: Partial<LocalAttempt> = {},
): LocalAttempt {
  return {
    clientAttemptId: 'local-attempt-1',
    playerId: 'player',
    cached,
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    answers: [],
    startLocation: location,
    status: 'active',
    ...overrides,
  };
}

let localState: {
  session: { playerId: string; playerName: string };
  packs: CachedPack[];
  attempts: LocalAttempt[];
  receipts: OfflineReceipt[];
};

function renderPage(page: 'explore' | 'attempt', id = 'local-attempt-1') {
  window.history.replaceState(
    {},
    '',
    page === 'explore' ? '/offline' : `/offline-attempts/${id}`,
  );
  return render(
    <Router>
      <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
        {page === 'explore' ? (
          <Route path="/offline">
            <OfflineExplorePage />
          </Route>
        ) : (
          <Route path="/offline-attempts/:clientAttemptId">
            <OfflineAttemptPage />
          </Route>
        )}
      </OfflineProvider>
    </Router>,
  );
}

beforeEach(() => {
  localState = {
    session: { playerId: 'player', playerName: 'Ari' },
    packs: [makePack()],
    attempts: [],
    receipts: [],
  };
  location.acquiredAt = new Date().toISOString();
  mocks.requestLocation.mockResolvedValue(location);
  mocks.readState.mockImplementation(async () => localState);
  mocks.createAttempt.mockImplementation(async (cached: CachedPack) => {
    const attempt = makeAttempt(cached);
    localState.attempts = [attempt];
    return attempt;
  });
  mocks.saveAnswer.mockImplementation(
    async (id: string, questionId: string, optionIds: string[]) => {
      const attempt = localState.attempts.find(
        (item) => item.clientAttemptId === id,
      )!;
      attempt.answers.push({
        questionId,
        optionIds,
        answeredAt: new Date().toISOString(),
      });
    },
  );
  mocks.finishAttempt.mockResolvedValue(undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('offline saved pages', () => {
  it.each([true, false])(
    'uses the server completion deadline rather than a delayed finishing location (all answers: %s)',
    async (complete) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-10T08:04:00.000Z'));
      const cached = makePack();
      localState.attempts = [
        makeAttempt(cached, {
          status: 'pending',
          startedAt: '2026-10-10T08:00:00.000Z',
          finishedAt: '2026-10-10T08:03:50.000Z',
          answers: cached.pack.questions
            .slice(0, complete ? 5 : 4)
            .map((question, index) => ({
              questionId: question.id,
              optionIds: ['first'],
              answeredAt: new Date(
                Date.parse('2026-10-10T08:00:00.000Z') + index * 10_000,
              ).toISOString(),
            })),
        }),
      ];
      renderPage('attempt');
      await screen.findByRole('heading', { name: 'Answers saved' });
      expect(document.querySelector('.offline-deadline time')).toHaveAttribute(
        'datetime',
        complete ? '2026-10-10T20:00:40.000Z' : '2026-10-10T20:02:00.000Z',
      );
      expect(
        screen.getAllByText(
          'Saved on this device. Pending server validation; no reward confirmed.',
        ),
      ).toHaveLength(1);
    },
  );

  it('updates a saved result in place after confirmation and focuses its result heading', async () => {
    localState.attempts = [makeAttempt(makePack(), { status: 'pending' })];
    renderPage('attempt');
    await screen.findByRole('heading', { name: 'Answers saved' });
    localState.attempts = [];
    localState.receipts = [
      {
        clientAttemptId: 'local-attempt-1',
        playerId: 'player',
        title: 'Great Hall Quest',
        outcome: 'accepted',
        attemptId: 'server-attempt',
        receivedAt: Date.now(),
      },
    ];
    await act(async () => window.dispatchEvent(new Event('storage')));
    const result = await screen.findByRole('heading', {
      name: 'Attempt confirmed',
    });
    await waitFor(() => expect(result).toHaveFocus());
    expect(window.location.pathname).toBe('/offline-attempts/local-attempt-1');
    expect(
      screen.getByRole('link', { name: 'View confirmed result' }),
    ).toHaveAttribute('href', '/challenge-attempts/server-attempt');
  });

  it('offers retry saving, never GPS, when arrival-policy finalisation cannot write to storage', async () => {
    const cached = makePack();
    cached.pack.locationPolicy = 'arrival-v1';
    const attempt = makeAttempt(cached, {
      answers: cached.pack.questions.map((question) => ({
        questionId: question.id,
        optionIds: [question.options[0]!.id],
        answeredAt: new Date().toISOString(),
      })),
    });
    localState.attempts = [attempt];
    mocks.finishAttempt.mockRejectedValueOnce(
      new DOMException('Storage unavailable'),
    );
    renderPage('attempt');
    expect(
      await screen.findByText(/completed attempt could not be finalised/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry location' })).toBeNull();
    expect(mocks.requestLocation).not.toHaveBeenCalled();
    mocks.finishAttempt.mockImplementationOnce(async () => {
      attempt.status = 'pending';
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
    await screen.findByText(
      'Saved on this device. Pending server validation; no reward confirmed.',
    );
    expect(mocks.requestLocation).not.toHaveBeenCalled();
    expect(attempt.answers).toHaveLength(5);
  });

  it('keeps completed answers after a failed finish and clears the error during retry', async () => {
    vi.useFakeTimers();
    const attempt = makeAttempt(makePack(), {
      startedAt: new Date(Date.now() - 119_000).toISOString(),
      answers: makePack().pack.questions.map((question) => ({
        questionId: question.id,
        optionIds: ['first'],
        answeredAt: new Date().toISOString(),
      })),
    });
    localState.attempts = [attempt];
    mocks.requestLocation.mockRejectedValueOnce(
      new BrowserLocationError('timeout'),
    );
    let finishRetry!: (value: LocationClaim) => void;
    mocks.requestLocation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRetry = resolve;
        }),
    );
    mocks.finishAttempt.mockImplementation(async () => {
      attempt.status = 'pending';
    });
    renderPage('attempt');
    await act(async () => {});
    expect(
      screen.getByText(
        /Your answers are saved. Your reported location took too long/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Retry location' }),
    ).toBeEnabled();
    expect(mocks.finishAttempt).not.toHaveBeenCalled();
    expect(attempt.answers).toHaveLength(5);

    // Crossing the deadline after a failed final-answer sample must not retry automatically.
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.requestLocation).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry location' }));
    expect(
      screen.getByRole('button', { name: 'Getting location…' }),
    ).toBeDisabled();
    expect(
      screen.queryByText(/reported location took too long/),
    ).not.toBeInTheDocument();
    await act(async () => finishRetry(location));
    expect(
      screen.getByText(
        'Saved on this device. Pending server validation; no reward confirmed.',
      ),
    ).toBeVisible();
    expect(mocks.finishAttempt).toHaveBeenCalledOnce();
    expect(attempt.answers).toHaveLength(5);
  });

  it('cancels a finish sample on unmount without committing its late result', async () => {
    localState.attempts = [
      makeAttempt(makePack(), {
        startedAt: new Date(Date.now() - 130_000).toISOString(),
      }),
    ];
    let lateSuccess!: (value: LocationClaim) => void;
    let signal: AbortSignal | undefined;
    mocks.requestLocation.mockImplementationOnce((value: AbortSignal) => {
      signal = value;
      return new Promise((resolve) => {
        lateSuccess = resolve;
      });
    });
    const view = renderPage('attempt');
    await screen.findByRole('button', { name: 'Getting location…' });
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => lateSuccess(location));
    expect(mocks.finishAttempt).not.toHaveBeenCalled();
  });
  it('keeps downloads secondary and never starts a challenge or requests GPS from this page', async () => {
    renderPage('explore');
    expect(
      await screen.findByRole('heading', {
        name: 'Downloads & saved attempts',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to Explore' }),
    ).toHaveAttribute('href', '/explore');
    expect(
      screen.getByRole('link', { name: 'Explore: Great Hall Quest' }),
    ).toHaveAttribute('href', '/explore?event=event-1');
    expect(
      screen.queryByRole('button', { name: 'Open saved challenge' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Check my location' }),
    ).toBeNull();
    expect(mocks.requestLocation).not.toHaveBeenCalled();
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it('filters downloaded events and exposes opening time, radius and timer', async () => {
    renderPage('explore');
    await screen.findByRole('heading', { name: 'Great Hall Quest' });
    expect(screen.getByText(/Start within 75 metres/)).toHaveTextContent(
      '5 questions',
    );
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search saved events' }),
      { target: { value: 'missing event' } },
    );
    expect(
      screen.queryByRole('heading', { name: 'Great Hall Quest' }),
    ).toBeNull();
    expect(
      screen.getByText('No saved events match your search.'),
    ).toBeVisible();
  });

  it('completes signed arrival-policy attempts without a finishing GPS request', async () => {
    const cached = makePack();
    cached.pack.locationPolicy = 'arrival-v1';
    const attempt = makeAttempt(cached, {
      answers: cached.pack.questions.map((question) => ({
        questionId: question.id,
        optionIds: [question.options[0]!.id],
        answeredAt: new Date().toISOString(),
      })),
    });
    localState.attempts = [attempt];
    mocks.finishAttempt.mockImplementation(async () => {
      attempt.status = 'pending';
    });
    renderPage('attempt');
    await waitFor(() =>
      expect(mocks.finishAttempt).toHaveBeenCalledWith(
        attempt.clientAttemptId,
        undefined,
      ),
    );
    expect(mocks.requestLocation).not.toHaveBeenCalled();
    expect(attempt.answers).toHaveLength(5);
  });

  it('shows the current multiple-choice question and refuses to submit without an answer', async () => {
    localState.attempts = [makeAttempt()];
    renderPage('attempt');

    expect(
      await screen.findByRole('heading', {
        name: 'Question 1: campus knowledge?',
      }),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole('status')
        .find((status) =>
          status.textContent?.includes('Each submitted answer saves'),
        ),
    ).toHaveTextContent('Each submitted answer saves');
    expect(
      screen.getByRole('group', { name: /Choose one answer/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit answer' }),
    ).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Back to Explore' })).toHaveClass(
      'button',
      'button--quiet',
    );
    expect(
      screen.getByRole('link', { name: 'Saved events and attempts' }),
    ).toHaveClass('button', 'button--quiet');
    fireEvent.click(screen.getByRole('radio', { name: 'Second answer' }));
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await waitFor(() =>
      expect(mocks.saveAnswer).toHaveBeenCalledWith(
        'local-attempt-1',
        'question-1',
        ['second'],
      ),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Question 2: campus knowledge?',
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .find((status) =>
            status.textContent?.includes('Answer saved on this device.'),
          ),
      ).toHaveTextContent('Answer saved on this device.'),
    );
  });

  it('submits the user-adjusted ordering and announces keyboard-accessible movement', async () => {
    const attempt = makeAttempt(makePack('ordering'));
    localState.attempts = [attempt];
    renderPage('attempt');

    expect(
      await screen.findByRole('button', {
        name: 'Move First answer down from position 1',
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move First answer down from position 1',
      }),
    );
    expect(
      screen
        .getAllByRole('status')
        .some((status) =>
          status.textContent?.includes('First answer moved to position 2 of 4'),
        ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Submit order' }));

    await waitFor(() =>
      expect(mocks.saveAnswer).toHaveBeenCalledWith(
        'local-attempt-1',
        'question-1',
        ['second', 'first', 'third', 'fourth'],
      ),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Question 2: campus knowledge?',
      }),
    ).toBeVisible();
  });

  it('shows pending local outbox status and keeps server confirmation distinct', async () => {
    const pending = makeAttempt(makePack(), { status: 'pending' });
    localState.attempts = [pending];
    renderPage('explore');

    expect(
      await screen.findByRole('link', { name: 'Great Hall Quest' }),
    ).toHaveAttribute('href', '/offline-attempts/local-attempt-1');
    const attemptLink = screen.getByRole('link', { name: 'Great Hall Quest' });
    expect(attemptLink.closest('li')).toHaveTextContent(
      'Saved locally — pending server validation; no reward confirmed.',
    );
    expect(
      screen.queryByRole('button', { name: 'Sync saved attempts' }),
    ).toBeNull();

    localState.attempts = [];
    localState.receipts = [
      {
        clientAttemptId: 'local-attempt-1',
        playerId: 'player',
        title: 'Great Hall Quest',
        outcome: 'accepted',
        attemptId: 'server-attempt-7',
        receivedAt: Date.now(),
      },
    ];
    window.dispatchEvent(new Event('storage'));
    expect(
      await screen.findByRole('link', { name: 'View confirmed result' }),
    ).toHaveAttribute('href', '/challenge-attempts/server-attempt-7');
  });

  it('explains unavailable attempts and links accepted or rejected receipt outcomes', async () => {
    localState.receipts = [
      {
        clientAttemptId: 'local-attempt-1',
        playerId: 'player',
        title: 'Great Hall Quest',
        outcome: 'OFFLINE_SYNC_EXPIRED',
        receivedAt: Date.now(),
      },
    ];
    renderPage('attempt');

    expect(
      await screen.findByRole('heading', { name: 'Saved attempt' }),
    ).toBeVisible();
    expect(screen.getByText(/12-hour sync window has ended/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Saved events' })).toHaveAttribute(
      'href',
      '/offline',
    );
  });

  it('identifies an attempt that is not present on this device', async () => {
    renderPage('attempt', 'unknown-attempt');

    expect(
      await screen.findByText(
        'This attempt is not available for the current local account.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Saved events' })).toHaveAttribute(
      'href',
      '/offline',
    );
  });

  it('shows device-storage failures with a retry action', async () => {
    mocks.readState.mockRejectedValue(new Error('IndexedDB blocked'));
    renderPage('attempt', 'missing');

    expect(
      await screen.findByText(
        'Device storage is unavailable. Connect to play online.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Retry device storage' }),
    ).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Saved events' })).toHaveAttribute(
      'href',
      '/offline',
    );
  });
});
