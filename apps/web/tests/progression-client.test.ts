import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentProgressionProfile,
  listProgressionStandings,
} from '../src/api/progression';
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
const getAccessToken = vi.fn().mockResolvedValue('access-token');

afterEach(() => {
  vi.unstubAllGlobals();
  getAccessToken.mockClear();
});

describe('progression API client', () => {
  it('loads only the approved current-player progression fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(profileResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getCurrentProgressionProfile({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(buildProgressionProfile());
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/progression/me`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        method: 'GET',
      }),
    );
  });

  it('requests bounded monthly standings and accepts a deleted-player tombstone', async () => {
    const tombstone = buildStandingEntry({
      playerName: null,
      points: 900,
      rank: 7,
    });
    const currentPlayer = buildStandingEntry({
      isCurrentPlayer: true,
      playerName: 'naledi-star',
      points: 40,
      rank: 10,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      standingsResponse({
        currentPlayer,
        entries: [tombstone],
        month: '2026-08',
        pagination: {
          page: 2,
          pageSize: 20,
          totalPages: 2,
          totalPlayers: 21,
        },
        period: 'monthly',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listProgressionStandings({
        apiBaseUrl,
        getAccessToken,
        month: '2026-08',
        page: 2,
        pageSize: 20,
        period: 'monthly',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      entries: [{ playerName: null, rank: 7 }],
      month: '2026-08',
      period: 'monthly',
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${apiBaseUrl}/progression/standings?page=2&pageSize=20&period=monthly&month=2026-08`,
    );
  });

  it.each([
    { page: 0, pageSize: 20, period: 'all_time' as const },
    { page: 10_001, pageSize: 20, period: 'all_time' as const },
    { page: 1, pageSize: 101, period: 'all_time' as const },
    {
      month: '2026-13',
      page: 1,
      pageSize: 20,
      period: 'monthly' as const,
    },
  ])('rejects an invalid standings query before fetch', async (query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listProgressionStandings({
        apiBaseUrl,
        getAccessToken,
        ...query,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'malformed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['email', { email: 'private@example.test' }],
    ['location', { location: { latitude: -26.19, longitude: 28.03 } }],
    ['gameplay history', { gameplayHistory: [{ result: 'victory' }] }],
  ])(
    'rejects unexpected private %s profile data',
    async (_label, privateData) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            ...buildProgressionProfile(),
            ...privateData,
            requestId: 'private-data-request',
          }),
        ),
      );

      await expect(
        getCurrentProgressionProfile({
          apiBaseUrl,
          getAccessToken,
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        failure: 'malformed',
        requestId: 'private-data-request',
      });
    },
  );

  it.each([
    ['zero rank', { rank: 0 }],
    ['negative points', { points: -1 }],
    ['current streak above longest', { currentStreak: 8, longestStreak: 7 }],
    [
      'malformed achievement progress',
      {
        achievements: [
          {
            code: 'first_quiz',
            description: 'Complete your first event quiz.',
            earned: true,
            progress: 'one',
            target: 1,
            title: 'First Quiz',
          },
        ],
      },
    ],
  ])('rejects a profile with %s', async (_label, malformedField) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...buildProgressionProfile(),
          ...malformedField,
          requestId: 'malformed-profile',
        }),
      ),
    );

    await expect(
      getCurrentProgressionProfile({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'malformed' });
  });

  it.each([
    [
      'an extra private standings field',
      {
        entries: [
          {
            ...buildStandingEntry(),
            email: 'private@example.test',
          },
        ],
      },
    ],
    [
      'a mismatched current-player row',
      {
        entries: [
          buildStandingEntry({
            isCurrentPlayer: true,
            playerName: 'different-player',
          }),
        ],
      },
    ],
    [
      'inconsistent pagination',
      {
        pagination: {
          page: 1,
          pageSize: 20,
          totalPages: 4,
          totalPlayers: 2,
        },
      },
    ],
  ])('rejects standings with %s', async (_label, overrides) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...buildStandings(),
          ...overrides,
          requestId: 'malformed-standings',
        }),
      ),
    );

    await expect(
      listProgressionStandings({
        apiBaseUrl,
        getAccessToken,
        page: 1,
        pageSize: 20,
        period: 'all_time',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'malformed' });
  });

  it.each([
    [401, 'SESSION_EXPIRED', 'authorization'],
    [403, 'ACCOUNT_UNAVAILABLE', 'account-unavailable'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ] as const)('maps %s %s to %s', async (status, code, failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(progressionProblemResponse(code, status)),
    );

    await expect(
      getCurrentProgressionProfile({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      failure,
      requestId: 'progression-error-request',
    });
  });

  it('maps token and network failures without exposing provider details', async () => {
    const tokenError = new Error('private Auth0 detail');

    await expect(
      getCurrentProgressionProfile({
        apiBaseUrl,
        getAccessToken: vi.fn().mockRejectedValue(tokenError),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'authorization' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('private network detail')),
    );
    await expect(
      getCurrentProgressionProfile({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });
});
