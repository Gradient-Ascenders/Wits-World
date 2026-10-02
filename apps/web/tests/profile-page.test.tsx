import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProfilePage from '../src/pages/ProfilePage';
import { profileExtension } from './fixtures/player-profile';
import LeaderboardPage from '../src/pages/LeaderboardPage';
import {
  buildProgressionProfile,
  buildStandingEntry,
  buildStandings,
  jsonResponse,
  profileResponse,
  progressionProblemResponse,
  standingsResponse,
} from './fixtures/progression';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function authValue(
  overrides: Partial<Auth0ContextInterface> = {},
): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Auth0ContextInterface;
}

function renderProfile(authentication = authValue()) {
  return render(
    <Auth0Context.Provider value={authentication}>
      <ProfilePage apiBaseUrl={apiBaseUrl} />
      <LeaderboardPage apiBaseUrl={apiBaseUrl} />
    </Auth0Context.Provider>,
  );
}

function renderProfileOnly(authentication = authValue()) {
  return render(
    <Auth0Context.Provider value={authentication}>
      <ProfilePage apiBaseUrl={apiBaseUrl} />
    </Auth0Context.Provider>,
  );
}

function progressionFetch(
  profile: () => Response = () => profileResponse(),
  standings: () => Response = () => standingsResponse(),
) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/profiles/me')) {
      const response = profile();
      if (!response.ok) return Promise.resolve(response);
      return response.json().then((payload: unknown) =>
        jsonResponse({
          ...profileExtension,
          ...(payload as Record<string, unknown>),
        }),
      );
    }

    if (url.includes('/progression/standings?')) {
      return Promise.resolve(standings());
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('progression profile and standings page', () => {
  it('keeps standings on the leaderboard instead of the profile', async () => {
    const fetchMock = progressionFetch();
    vi.stubGlobal('fetch', fetchMock);

    renderProfileOnly();

    expect(
      await screen.findByRole('heading', { name: 'naledi-star' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Campus standings' }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/progression/standings?'),
      ),
    ).toHaveLength(0);
  });

  it('renders authoritative profile, achievement, streak, and current-player standing data accessibly', async () => {
    const longPlayerName =
      'a-very-long-player-name-that-remains-readable-without-truncation';
    const profile = buildProgressionProfile({ playerName: longPlayerName });
    const currentPlayer = buildStandingEntry({
      currentStreak: profile.currentStreak,
      isCurrentPlayer: true,
      longestStreak: profile.longestStreak,
      playerName: longPlayerName,
      points: profile.points,
      rank: profile.rank,
    });
    vi.stubGlobal(
      'fetch',
      progressionFetch(
        () => profileResponse({ playerName: longPlayerName }),
        () =>
          standingsResponse({
            currentPlayer,
            entries: [
              buildStandingEntry({
                playerName: 'wits-legend',
                points: 1900,
                rank: 1,
              }),
              currentPlayer,
            ],
          }),
      ),
    );

    renderProfile();

    expect(
      await screen.findByRole('heading', { name: longPlayerName }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Favourite cards' }),
    ).toBeVisible();
    expect(
      within(screen.getByText('All-time rank').closest('div')!).getByText('#4'),
    ).toBeVisible();
    expect(screen.getAllByText(/1\s240/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 days').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7 days').length).toBeGreaterThan(0);

    const achievements = screen.getByRole('list', {
      name: 'Achievement progress',
    });
    expect(within(achievements).getByText('Earned')).toBeVisible();
    expect(within(achievements).getByText('In progress')).toBeVisible();
    await userEvent.click(within(achievements).getByText('Campus Explorer'));
    await userEvent.click(within(achievements).getByText('First Quiz'));
    expect(
      within(achievements).getByRole('progressbar', {
        name: 'Campus Explorer: In progress, 3 of 5',
      }),
    ).toHaveAttribute('value', '3');
    expect(
      within(achievements).getByRole('progressbar', {
        name: 'First Quiz: Earned, current progress 3, target 1',
      }),
    ).toHaveAttribute('value', '3');
    expect(
      within(achievements).getByText('Current 3 · target 1'),
    ).toBeVisible();

    const standings = screen.getByRole('list', {
      name: 'Player standings',
    });
    const currentRow = within(standings).getByText('You').closest('li');
    const standingsSection = screen
      .getByRole('heading', { name: 'Campus standings' })
      .closest('section');

    expect(standingsSection).not.toBeNull();
    expect(within(standingsSection!).getByText(/You are/u)).toHaveTextContent(
      '#4',
    );
    expect(currentRow).toHaveAttribute('aria-current', 'true');
    expect(currentRow).toHaveTextContent(longPlayerName);
    expect(currentRow).toHaveTextContent('#4');
    expect(within(currentRow!).getByText('You')).toBeVisible();
    expect(
      screen.queryByText(/email|latitude|gameplay history/i),
    ).not.toBeInTheDocument();
  });

  it('keeps useful loading states visible until both requests settle and aborts them on unmount', async () => {
    const pending = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    const view = renderProfile();

    expect(
      screen
        .getByRole('heading', { name: 'Loading player profile' })
        .closest('[role="status"]'),
    ).toHaveAttribute('role', 'status');
    expect(
      screen.getByText('Loading standings…').closest('[role="status"]'),
    ).toHaveAttribute('role', 'status');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const signals = fetchMock.mock.calls.map(
      (call) => call[1]?.signal as AbortSignal,
    );
    view.unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('renders empty achievement and standings states without hiding the current standing', async () => {
    const currentPlayer = buildStandingEntry({
      isCurrentPlayer: true,
      playerName: 'new-player',
      points: 0,
      rank: 21,
    });
    vi.stubGlobal(
      'fetch',
      progressionFetch(
        () => profileResponse({ achievements: [], playerName: 'new-player' }),
        () =>
          standingsResponse({
            currentPlayer,
            entries: [],
            pagination: {
              page: 1,
              pageSize: 20,
              totalPages: 2,
              totalPlayers: 21,
            },
          }),
      ),
    );

    renderProfile();

    expect(
      await screen.findByText('No achievements are available yet.'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'No players appear on this page' }),
    ).toBeVisible();
    expect(
      screen.getByText(/Your standing is shown separately below\./u),
    ).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: 'Your standing' }),
    ).toHaveTextContent('new-player');
    expect(
      within(
        screen.getByRole('list', { name: 'Player standings' }),
      ).queryByText('You'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
  });

  it('renders a deleted-player tombstone and a separate current-player rank outside the page', async () => {
    const currentPlayer = buildStandingEntry({
      isCurrentPlayer: true,
      playerName: 'current-player',
      points: 10,
      rank: 22,
    });
    vi.stubGlobal(
      'fetch',
      progressionFetch(undefined, () =>
        standingsResponse({
          currentPlayer,
          entries: [
            buildStandingEntry({ playerName: null, points: 900, rank: 7 }),
          ],
          pagination: {
            page: 1,
            pageSize: 20,
            totalPages: 2,
            totalPlayers: 22,
          },
        }),
      ),
    );

    renderProfile();

    expect(await screen.findByText('Deleted player')).toBeVisible();
    expect(screen.getByText(/anonymous tombstone/i)).toHaveClass('sr-only');
    const ownStanding = screen.getByRole('complementary', {
      name: 'Your standing',
    });
    expect(ownStanding).toHaveTextContent('current-player');
    expect(ownStanding).toHaveTextContent('22');
    expect(
      within(
        screen.getByRole('list', { name: 'Player standings' }),
      ).queryByText('You'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/auth0|@|latitude|longitude/i),
    ).not.toBeInTheDocument();
  });

  it('presents the no-active-rank state for an unavailable or deleted account', async () => {
    vi.stubGlobal(
      'fetch',
      progressionFetch(
        () => progressionProblemResponse('ACCOUNT_UNAVAILABLE', 403),
        () => progressionProblemResponse('ACCOUNT_UNAVAILABLE', 403),
      ),
    );

    renderProfile();

    expect(
      await screen.findByRole('heading', {
        name: 'Profile unavailable',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Account settings' }),
    ).toHaveAttribute('href', '/account');
    expect(
      screen.queryByRole('button', { name: 'Sign in again' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'No active standing is available',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/Only active players receive a live rank/),
    ).toBeVisible();
    expect(screen.getAllByText(/pending-deletion accounts/)).toHaveLength(1);
  });

  it('rejects malformed profile and standings payloads with safe retry states', async () => {
    vi.stubGlobal(
      'fetch',
      progressionFetch(
        () =>
          jsonResponse({
            ...buildProgressionProfile(),
            email: 'private@example.test',
            requestId: 'malformed-profile-request',
          }),
        () =>
          jsonResponse({
            ...buildStandings(),
            entries: [
              {
                ...buildStandingEntry(),
                location: { latitude: -26.19, longitude: 28.03 },
              },
            ],
            requestId: 'malformed-standings-request',
          }),
      ),
    );

    renderProfile();

    const malformedHeadings = await screen.findAllByRole('heading', {
      name: 'Progression data could not be displayed',
    });
    expect(malformedHeadings).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Your profile could not be loaded' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(
        'Your progression could not be displayed. Try loading it again.',
      ),
    ).toHaveLength(1);
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(
      2,
    );
  });

  it('keeps standings available when profile fails and retries only the failed profile', async () => {
    const user = userEvent.setup();
    let profileAttempts = 0;
    const fetchMock = progressionFetch(
      () => {
        profileAttempts += 1;
        return profileAttempts === 1
          ? progressionProblemResponse('SERVICE_UNAVAILABLE', 503)
          : profileResponse();
      },
      () => standingsResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderProfile();

    expect(
      await screen.findByRole('heading', {
        name: 'Your profile could not be loaded',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Campus standings' }),
    ).toBeVisible();

    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(
      await screen.findByRole('heading', { name: 'naledi-star' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'naledi-star' })).toHaveFocus();
    expect(profileAttempts).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/progression/standings?'),
      ),
    ).toHaveLength(1);
  });

  it('keeps the profile available when standings fails and retries only standings with focus recovery', async () => {
    const user = userEvent.setup();
    let standingsAttempts = 0;
    const fetchMock = progressionFetch(undefined, () => {
      standingsAttempts += 1;
      return standingsAttempts === 1
        ? progressionProblemResponse('SERVICE_UNAVAILABLE', 503)
        : standingsResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProfile();

    expect(
      await screen.findByRole('heading', {
        name: 'Standings could not load',
      }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'naledi-star' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    const standingsHeading = await screen.findByRole('heading', {
      name: 'Campus standings',
    });
    expect(standingsHeading).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'naledi-star' })).toBeVisible();
    expect(standingsAttempts).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/profiles/me'),
      ),
    ).toHaveLength(1);
  });

  it('starts reauthentication from an expired-session error', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      progressionFetch(
        () => progressionProblemResponse('SESSION_EXPIRED', 401),
        () => standingsResponse(),
      ),
    );

    renderProfile(authValue({ loginWithRedirect }));

    await user.click(
      await screen.findByRole('button', { name: 'Sign in again' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/profile' },
    });
  });

  it('applies a monthly filter and paginates with keyboard activation', async () => {
    const user = userEvent.setup();
    const currentPlayer = buildStandingEntry({
      isCurrentPlayer: true,
      playerName: 'naledi-star',
      points: 10,
      rank: 21,
    });
    const fetchMock = progressionFetch(undefined, () => standingsResponse());

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/progression/me')) {
        return Promise.resolve(profileResponse());
      }

      if (url.includes('period=monthly')) {
        return Promise.resolve(
          standingsResponse({
            currentPlayer,
            entries: [
              buildStandingEntry({
                playerName: 'monthly-leader',
                points: 50,
                rank: 1,
              }),
            ],
            month: '2026-08',
            pagination: {
              page: 1,
              pageSize: 20,
              totalPages: 2,
              totalPlayers: 21,
            },
            period: 'monthly',
          }),
        );
      }

      if (url.includes('page=2')) {
        const pageTwoCurrent = buildStandingEntry({
          isCurrentPlayer: true,
          playerName: 'naledi-star',
          points: 1240,
          rank: 21,
        });
        return Promise.resolve(
          standingsResponse({
            currentPlayer: pageTwoCurrent,
            entries: [pageTwoCurrent],
            pagination: {
              page: 2,
              pageSize: 20,
              totalPages: 2,
              totalPlayers: 21,
            },
          }),
        );
      }

      return Promise.resolve(
        standingsResponse({
          currentPlayer,
          entries: [buildStandingEntry({ rank: 1 })],
          pagination: {
            page: 1,
            pageSize: 20,
            totalPages: 2,
            totalPlayers: 21,
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProfile();
    await screen.findByRole('heading', { name: 'Campus standings' });

    expect(
      await screen.findByRole('complementary', { name: 'Your standing' }),
    ).toHaveTextContent('#21');
    expect(
      within(
        screen.getByRole('list', { name: 'Player standings' }),
      ).queryByText('You'),
    ).not.toBeInTheDocument();

    const monthly = screen.getByRole('button', { name: 'This month' });
    monthly.focus();
    await user.keyboard('{Enter}');

    const monthlyHeading = await screen.findByRole('heading', {
      name: 'Campus standings',
    });
    expect(monthlyHeading).toHaveFocus();
    expect(monthly).toHaveAttribute('aria-pressed', 'true');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        /period=monthly&month=\d{4}-\d{2}/u.test(String(input)),
      ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'All time' }));
    const next = await screen.findByRole('button', { name: 'Next' });
    next.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeVisible());
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('page=2&pageSize=20&period=all_time'),
      ),
    ).toBe(true);
    expect(
      within(screen.getByRole('list', { name: 'Player standings' }))
        .getByText('You')
        .closest('li'),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.queryByRole('complementary', { name: 'Your standing' }),
    ).not.toBeInTheDocument();
  });
});
