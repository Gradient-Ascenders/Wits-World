import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OfflineProvider, useOffline } from '../src/offline/OfflineProvider';
import type { CachedPack } from '../src/offline/store';
import type { PlayerEvent } from '../src/api/events';

const mocks = vi.hoisted(() => ({
  binding: 'player-one',
  reload: vi.fn(),
  token: vi.fn(async () => 'offline-token'),
  location: vi.fn(),
  read: vi.fn(),
  saveSession: vi.fn(async () => {}),
  replacePacks: vi.fn(async () => {}),
}));

vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({
    state: { status: 'ready', player: { id: 'player-one', playerName: 'Ari' } },
    reload: mocks.reload,
  }),
}));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => mocks.token,
}));
vi.mock('../src/browser-location', async (original) => ({
  ...(await original<typeof import('../src/browser-location')>()),
  requestBrowserLocation: mocks.location,
}));
vi.mock('../src/offline/store', async (original) => ({
  ...(await original<typeof import('../src/offline/store')>()),
  boundOfflinePlayer: () => mocks.binding,
  readOfflineState: mocks.read,
  saveOfflineSession: mocks.saveSession,
  replacePacks: mocks.replacePacks,
}));

function PreparationState() {
  const { message, online } = useOffline();
  return (
    <p role="note">
      {online ? 'Online' : 'Offline'}: {message}
    </p>
  );
}

function mount() {
  return render(
    <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
      <h1>Campus exploration</h1>
      <PreparationState />
    </OfflineProvider>,
  );
}

function event(
  index: number,
  overrides: Partial<PlayerEvent> = {},
): PlayerEvent {
  return {
    availability: 'active',
    description: 'Campus history',
    endsAt: '2026-11-30T22:00:00.000Z',
    eventId: `event-${index}`,
    latitude: -26.19205 + index / 1000,
    longitude: 28.03038,
    radiusMetres: 75,
    startsAt: '2026-09-01T08:00:00.000Z',
    title: `Campus event ${index}`,
    ...overrides,
  };
}

function pack(playerId = 'player-one'): CachedPack {
  return {
    packToken: 'signed-pack-token',
    pack: {
      version: 1,
      playerId,
      packId: `pack-${playerId}`,
      issuedAt: '2026-10-08T08:00:00.000Z',
      validFrom: '2026-10-08T08:00:00.000Z',
      validUntil: '2026-10-08T20:00:00.000Z',
      challengeId: 'challenge-one',
      challengeVersion: 1,
      format: 'multiple_choice',
      timeLimitSeconds: 90,
      event: {
        eventId: 'event-1',
        version: 1,
        title: 'Campus event 1',
        description: null,
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `question-${index}`,
        version: 1,
        difficulty: 1,
        prompt: `Which campus landmark is number ${index}?`,
        options: Array.from({ length: 4 }, (_, position) => ({
          id: `answer-${position}`,
          text: `Landmark ${position}`,
        })),
      })),
    },
  };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T09:00:00.000Z'));
  mocks.binding = 'player-one';
  mocks.read.mockResolvedValue({ packs: [], attempts: [], receipts: [] });
  mocks.location.mockResolvedValue({
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 12,
    acquiredAt: new Date().toISOString(),
  });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.stubGlobal('indexedDB', {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offline cache preparation', () => {
  it('requests only the ten nearest eligible events and stores only valid packs for the current player', async () => {
    const valid = pack();
    const malformed = { ...valid, pack: { ...valid.pack, questions: [] } };
    const events = [
      ...Array.from({ length: 12 }, (_, index) => event(12 - index)),
      event(0, { availability: 'ended' }),
      event(14, {
        availability: 'upcoming',
        startsAt: '2026-10-10T09:00:00.000Z',
      }),
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ events, requestId: 'discovery' }))
      .mockResolvedValueOnce(
        response({ packs: [valid, pack('other-player'), malformed] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    mount();

    await waitFor(() =>
      expect(mocks.replacePacks).toHaveBeenCalledWith('player-one', [valid]),
    );
    expect(mocks.saveSession).toHaveBeenCalledWith('player-one', 'Ari');
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://api.example.test/api/v1/offline-challenge-packs',
      expect.objectContaining({
        body: JSON.stringify({
          eventIds: Array.from(
            { length: 10 },
            (_, index) => `event-${index + 1}`,
          ),
        }),
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer offline-token',
          'Content-Type': 'application/json',
          'X-Wits-Offline-Contract-Version': '1',
        },
        method: 'POST',
      }),
    ]);
    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent(
        '1 events saved on this device.',
      ),
    );
  });

  it('does not reroll still-fresh cached packs', async () => {
    mocks.read.mockResolvedValue({
      packs: [
        {
          ...pack(),
          pack: { ...pack().pack, issuedAt: '2026-10-08T08:30:00.000Z' },
        },
      ],
      attempts: [],
      receipts: [],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    expect(mocks.location).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.replacePacks).not.toHaveBeenCalled();
  });

  it('keeps online exploration usable when pack download is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ events: [event(1)], requestId: 'discovery' }),
        )
        .mockResolvedValueOnce(response({ code: 'OFFLINE_UNAVAILABLE' }, 503)),
    );
    mount();
    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent(
        'Offline packs are unavailable. Online play is unchanged.',
      ),
    );
    expect(
      screen.getByRole('heading', { name: 'Campus exploration' }),
    ).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent('Online:');
    expect(mocks.replacePacks).not.toHaveBeenCalled();
  });

  it('does not replace existing cache with a malformed pack envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ events: [event(1)], requestId: 'discovery' }),
        )
        .mockResolvedValueOnce(response({ packs: 'corrupt' })),
    );
    mount();
    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent(
        'Offline preparation needs a connection and location access.',
      ),
    );
    expect(mocks.replacePacks).not.toHaveBeenCalled();
    expect(screen.getByRole('note')).toHaveTextContent('Online:');
  });

  it('discards packs that finish downloading after the device changes player binding', async () => {
    let completeDownload!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ events: [event(1)], requestId: 'discovery' }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            completeDownload = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    mocks.binding = 'other-player';
    await act(async () => completeDownload(response({ packs: [pack()] })));
    expect(mocks.replacePacks).not.toHaveBeenCalled();
    expect(screen.getByRole('note')).not.toHaveTextContent('events saved');
  });
});
