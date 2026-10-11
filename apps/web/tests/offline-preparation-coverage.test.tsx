import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
  saveCatalogue: vi.fn(async () => {}),
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
  saveOfflineCatalogue: mocks.saveCatalogue,
  replacePacks: mocks.replacePacks,
}));

function PreparationState() {
  const { message, online, prepare, preparing } = useOffline();
  return (
    <>
      <p role="note">
        {online ? 'Online' : 'Offline'}: {message}
      </p>
      <button disabled={preparing} onClick={prepare}>
        Save events
      </button>
    </>
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
      locationPolicy: 'arrival-v1',
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
  it('upgrades a fresh legacy pack to the arrival policy automatically', async () => {
    const fresh = pack();
    fresh.pack.issuedAt = new Date().toISOString();
    delete fresh.pack.locationPolicy;
    mocks.read.mockResolvedValue({
      packs: [fresh],
      attempts: [],
      receipts: [],
    });
    const upgraded = {
      ...fresh,
      pack: { ...fresh.pack, locationPolicy: 'arrival-v1' as const },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ events: [event(1)], requestId: 'discovery' }),
      )
      .mockResolvedValueOnce(response({ packs: [upgraded] }));
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await waitFor(() =>
      expect(mocks.replacePacks).toHaveBeenCalledWith('player-one', [upgraded]),
    );
    expect(mocks.location).not.toHaveBeenCalled();
  });

  it('can download events without a usable GPS fix', async () => {
    mocks.location.mockRejectedValue(new Error('GPS unavailable indoors'));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ events: [event(1)], requestId: 'discovery' }),
        )
        .mockResolvedValueOnce(response({ packs: [pack()] })),
    );
    mount();
    await waitFor(() =>
      expect(mocks.replacePacks).toHaveBeenCalledWith('player-one', [pack()]),
    );
  });

  it('does not wait for a stalled optional GPS lookup before downloading', async () => {
    mocks.location.mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ events: [event(1)], requestId: 'discovery' }),
        )
        .mockResolvedValueOnce(response({ packs: [pack()] })),
    );
    mount();
    await waitFor(() =>
      expect(mocks.replacePacks).toHaveBeenCalledWith('player-one', [pack()]),
    );
    expect(screen.getByRole('note')).toHaveTextContent('1 event saved');
    expect(screen.getByRole('button', { name: 'Save events' })).toBeEnabled();
  });

  it('preserves usable packs when refresh returns no replacement and allows retry after failure', async () => {
    mocks.read.mockResolvedValue({
      packs: [pack()],
      attempts: [],
      receipts: [],
    });
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network disconnected'))
      .mockResolvedValueOnce(
        response({ events: [event(1)], requestId: 'discovery' }),
      )
      .mockResolvedValueOnce(response({ packs: [] }));
    vi.stubGlobal('fetch', fetch);
    mount();
    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent(
        'Events could not be saved',
      ),
    );
    expect(mocks.replacePacks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save events' }));
    await waitFor(() =>
      expect(mocks.replacePacks).toHaveBeenCalledWith('player-one', [pack()]),
    );
  });

  it('bounds stalled token acquisition and keeps existing packs for retry', async () => {
    vi.useFakeTimers();
    mocks.token.mockImplementationOnce(() => new Promise(() => {}));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole('note')).toHaveTextContent(
      'Saving events timed out',
    );
    expect(screen.getByRole('button', { name: 'Save events' })).toBeEnabled();
    expect(mocks.replacePacks).not.toHaveBeenCalled();
  });
  it('requests all eligible events in batches of ten and stores only valid packs for the current player', async () => {
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
      )
      .mockResolvedValueOnce(response({ packs: [] }));
    vi.stubGlobal('fetch', fetchMock);
    mount();

    await waitFor(() =>
      expect(mocks.replacePacks).toHaveBeenCalledWith('player-one', [valid]),
    );
    expect(mocks.saveSession).toHaveBeenCalledWith('player-one', 'Ari');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).eventIds,
    ).toEqual(['event-2', 'event-1']);
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://api.example.test/api/v1/offline-challenge-packs',
      expect.objectContaining({
        body: JSON.stringify({
          eventIds: Array.from(
            { length: 10 },
            (_, index) => `event-${12 - index}`,
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
        '1 event saved on this device.',
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ events: [event(1)], requestId: 'discovery' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    mount();
    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent('1 event saved'),
    );
    expect(mocks.location).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
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
        'Events could not be saved.',
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
        'Events could not be saved. Your existing saved events and answers are kept. Check your connection and retry.',
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
