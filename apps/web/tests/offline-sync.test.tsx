import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineProvider } from '../src/offline/OfflineProvider';
import { OfflineExplorePage } from '../src/offline/OfflinePages';
import type { CachedPack, LocalAttempt } from '../src/offline/store';
import { READ_TIMEOUT_MS } from '../src/components/loading-policy';

const mocks = vi.hoisted(() => ({
  sessionFailure: null as
    null | 'unavailable' | 'timeout' | 'authorization' | 'identity_changed',
  getToken: vi.fn(async () => 'token'),
  reload: vi.fn(),
  readOfflineState: vi.fn(),
  recordOfflineReceipt: vi.fn(),
  saveOfflineSession: vi.fn(),
}));
vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({
    state: mocks.sessionFailure
      ? { status: 'error', failure: mocks.sessionFailure }
      : { status: 'ready', player: { id: 'player', playerName: 'Player' } },
    reload: mocks.reload,
  }),
}));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => mocks.getToken,
}));
vi.mock('../src/offline/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/offline/store')>()),
  boundOfflinePlayer: () => 'player',
  readOfflineState: mocks.readOfflineState,
  recordOfflineReceipt: mocks.recordOfflineReceipt,
  saveOfflineSession: mocks.saveOfflineSession,
}));

const cached: CachedPack = {
  packToken: 'signed-pack',
  pack: {
    version: 1,
    playerId: 'player',
    packId: 'pack',
    issuedAt: new Date().toISOString(),
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    challengeId: 'challenge',
    challengeVersion: 1,
    format: 'multiple_choice',
    timeLimitSeconds: 90,
    questions: [],
    event: {
      eventId: 'event',
      version: 1,
      title: 'Saved event',
      description: null,
      latitude: 0,
      longitude: 0,
      radiusMetres: 50,
    },
  },
};
const location = {
  latitude: 0,
  longitude: 0,
  accuracyMetres: 10,
  acquiredAt: new Date().toISOString(),
};
const attempt: LocalAttempt = {
  clientAttemptId: 'same-attempt',
  playerId: 'player',
  cached,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  answers: [
    {
      questionId: 'question',
      optionIds: ['answer'],
      answeredAt: new Date().toISOString(),
    },
  ],
  status: 'pending',
  startLocation: location,
  finishLocation: location,
};

function renderOffline() {
  return render(
    <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
      <OfflineExplorePage />
    </OfflineProvider>,
  );
}

beforeEach(() => {
  mocks.sessionFailure = null;
  mocks.reload.mockClear();
  mocks.getToken.mockResolvedValue('token');
  mocks.recordOfflineReceipt.mockResolvedValue(undefined);
  mocks.readOfflineState.mockResolvedValue({
    session: { playerId: 'player', playerName: 'Player' },
    packs: [cached],
    attempts: [attempt],
    receipts: [],
  });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offline synchronization recovery', () => {
  it('keeps answers and asks for sign-in when the SDK requires authentication instead of retrying forever', async () => {
    vi.useFakeTimers();
    mocks.getToken.mockRejectedValue(
      Object.assign(new Error('Login required'), { error: 'login_required' }),
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderOffline();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      screen.getByRole('button', { name: 'Sign in to check answers' }),
    ).toBeEnabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.recordOfflineReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ['unavailable', true],
    ['timeout', true],
    ['authorization', false],
    ['identity_changed', false],
  ] as const)(
    'automatically recovers only transient session errors: %s',
    async (failure, recovers) => {
      vi.useFakeTimers();
      mocks.sessionFailure = failure;
      render(
        <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
          <h1>Saved play</h1>
        </OfflineProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(mocks.reload).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.reload).toHaveBeenCalledTimes(recovers ? 1 : 0);
    },
  );

  it('keeps uploads and sync failures out of regular pages', async () => {
    let failUpload!: (error: Error) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          failUpload = reject;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    render(
      <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
        <h1>Your campus</h1>
      </OfflineProvider>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('complementary', { name: 'Offline play' }),
    ).toBeNull();
    expect(
      screen.queryByRole('link', {
        name: 'Downloads & saved attempts',
      }),
    ).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Your campus' })).toBeVisible();

    await act(async () => failUpload(new TypeError('network unavailable')));
    expect(
      screen.queryByRole('complementary', { name: 'Offline play' }),
    ).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Your campus' })).toBeVisible();
    expect(mocks.recordOfflineReceipt).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'empty', attempts: [] },
    { name: 'active', attempts: [{ ...attempt, status: 'active' as const }] },
    {
      name: 'unfinished',
      attempts: [{ ...attempt, finishLocation: undefined }],
    },
  ])(
    'keeps an $name queue quiet during startup and focus checks',
    async ({ attempts }) => {
      let finishRead!: () => void;
      const pendingRead = () =>
        new Promise((resolve) => {
          finishRead = () =>
            resolve({ packs: [cached], attempts, receipts: [] });
        });
      let reading = pendingRead();
      mocks.readOfflineState.mockImplementation(() => reading);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      render(
        <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
          <h1>Your campus</h1>
        </OfflineProvider>,
      );

      expect(
        screen.queryByRole('complementary', { name: 'Offline play' }),
      ).toBeNull();
      await act(async () => finishRead());
      expect(
        screen.queryByRole('complementary', { name: 'Offline play' }),
      ).toBeNull();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();

      reading = pendingRead();
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(
        screen.queryByRole('complementary', { name: 'Offline play' }),
      ).toBeNull();
      await act(async () => finishRead());
      expect(
        screen.queryByRole('complementary', { name: 'Offline play' }),
      ).toBeNull();
      expect(mocks.getToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('exposes progress and disables repeated activation until the server confirms an attempt', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    renderOffline();
    await screen.findByRole('button', { name: 'Cancel sync' });
    expect(
      screen.queryByRole('button', { name: 'Sync saved attempts' }),
    ).toBeNull();
    expect(
      screen.queryByRole('complementary', { name: 'Offline play' }),
    ).toBeNull();
    const announcements = screen.getAllByRole('status');
    expect(announcements).toHaveLength(1);
    expect(announcements[0]).toHaveTextContent('Syncing saved attempts');
    expect(announcements[0]?.closest('[aria-busy="true"]')).toBeNull();
    expect(
      await screen.findByRole('region', { name: 'Awaiting confirmation' }),
    ).toBeInTheDocument();
    window.dispatchEvent(new Event('focus'));
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve(
        new Response(
          JSON.stringify({
            attempt: { status: 'completed', attemptId: 'confirmed' },
          }),
        ),
      ),
    );
    await waitFor(() =>
      expect(mocks.recordOfflineReceipt).toHaveBeenCalledWith(
        attempt,
        'accepted',
        'confirmed',
      ),
    );
    expect(
      await screen.findByText(/The server confirmed this result/),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Server checks finished',
    );
    expect(
      screen.queryByRole('button', { name: 'Sync saved attempts' }),
    ).toBeNull();
  });

  it('shows online failure without losing answers and retries the identical attempt on foreground', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attempt: { status: 'completed', attemptId: 'confirmed' },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    renderOffline();
    expect(
      await screen.findByRole('button', { name: 'Retry sync' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('region', { name: 'Saved play' }),
    ).toHaveTextContent('Server confirmation is unknown');
    expect(
      screen.queryByRole('complementary', { name: 'Offline play' }),
    ).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Your answers remain saved/).length,
    ).toBeGreaterThan(0);
    expect(mocks.recordOfflineReceipt).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('focus'));
    await act(async () => {});
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(fetch.mock.calls[1]?.[1]?.body);
    await waitFor(() =>
      expect(mocks.recordOfflineReceipt).toHaveBeenCalledWith(
        attempt,
        'accepted',
        'confirmed',
      ),
    );
  });

  it.each(['storage', 'token', 'fetch', 'response'] as const)(
    'bounds an unresponsive %s without losing the pending attempt',
    async (phase) => {
      vi.useFakeTimers();
      const never = () => new Promise<never>(() => {});
      const fetch = vi.fn<() => Promise<Response>>(never);
      vi.stubGlobal('fetch', fetch);
      if (phase === 'storage') mocks.readOfflineState.mockImplementation(never);
      if (phase === 'token') mocks.getToken.mockImplementation(never);
      if (phase === 'response') {
        const response = new Response();
        vi.spyOn(response, 'json').mockImplementation(never);
        fetch.mockResolvedValue(response);
      }
      renderOffline();
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
      });
      expect(
        screen.getByRole('region', { name: 'Saved play' }),
      ).toHaveTextContent(
        phase === 'storage'
          ? 'Device storage is taking too long'
          : 'Sync timed out',
      );
      expect(mocks.recordOfflineReceipt).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: phase === 'storage' ? 'Retry device storage' : 'Retry sync',
        }),
      ).toBeEnabled();
    },
  );

  it('preserves a known server confirmation when local receipt storage stalls', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            attempt: { status: 'completed', attemptId: 'confirmed' },
          }),
        ),
      ),
    );
    mocks.recordOfflineReceipt.mockImplementation(() => new Promise(() => {}));
    renderOffline();
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    });
    expect(
      screen.getByRole('region', { name: 'Saved play' }),
    ).toHaveTextContent('Confirmed');
    expect(
      screen.getByText(
        /The server confirmed this result. The receipt could not be saved/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retry sync' })).toHaveClass(
      'button--quiet',
    );
    expect(
      screen.getByRole('link', { name: 'View confirmed result: Saved event' }),
    ).toHaveAttribute('href', '/challenge-attempts/confirmed');
  });

  it('leaves an unconfirmed attempt saved when the provider unmounts during upload', async () => {
    let resolve!: (response: Response) => void;
    let signal!: AbortSignal;
    const fetch = vi.fn((_url, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    vi.stubGlobal('fetch', fetch);
    const view = renderOffline();
    await screen.findByRole('region', { name: 'Awaiting confirmation' });
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(
        new Response(
          JSON.stringify({
            attempt: { status: 'completed', attemptId: 'confirmed' },
          }),
        ),
      ),
    );
    expect(mocks.recordOfflineReceipt).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels waiting without claiming that an uploaded attempt failed validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason)),
          ),
      ),
    );
    renderOffline();
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Cancel sync' }))[0]!,
    );
    expect(
      await screen.findByRole('button', { name: 'Retry sync' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('region', { name: 'Saved play' }),
    ).toHaveTextContent(
      'Stopped waiting for sync. Server confirmation is unknown',
    );
    expect(mocks.recordOfflineReceipt).not.toHaveBeenCalled();
  });
});
