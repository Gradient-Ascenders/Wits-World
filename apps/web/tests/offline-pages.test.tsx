import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  acquiredAt: '2026-10-08T08:00:00.000Z',
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
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('offline saved pages', () => {
  it('lists cached events and opens a saved challenge after location is available', async () => {
    renderPage('explore');

    expect(
      await screen.findByRole('heading', { name: 'Saved campus events' }),
    ).toBeVisible();
    expect(screen.getByText('Saved for Ari. No connection.')).toBeVisible();
    expect(
      screen.getByRole('img', { name: /Relative positions of saved events/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not a walking route/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open saved challenge' }),
    );

    await waitFor(() =>
      expect(mocks.createAttempt).toHaveBeenCalledWith(
        localState.packs[0],
        location,
      ),
    );
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        '/offline-attempts/local-attempt-1',
      ),
    );
  });

  it('keeps a not-yet-open cached event unavailable and explains unsupported location', async () => {
    const futurePack = makePack();
    futurePack.pack.validFrom = new Date(Date.now() + 60_000).toISOString();
    localState.packs = [futurePack];
    const view = renderPage('explore');

    expect(
      await screen.findByRole('button', { name: 'Open saved challenge' }),
    ).toBeDisabled();
    expect(mocks.createAttempt).not.toHaveBeenCalled();

    view.unmount();
    futurePack.pack.validFrom = new Date(Date.now() - 60_000).toISOString();
    mocks.requestLocation.mockRejectedValue(
      new BrowserLocationError('unsupported'),
    );
    renderPage('explore');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open saved challenge' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot provide location',
    );
    expect(mocks.createAttempt).not.toHaveBeenCalled();
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
          status.textContent?.includes('answers are provisional'),
        ),
    ).toHaveTextContent('answers are provisional');
    expect(
      screen.getByRole('group', { name: /Choose one answer/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit answer' }),
    ).toBeDisabled();
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
      screen.getByRole('button', { name: 'Sync saved attempts' }),
    ).toBeDisabled();

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
