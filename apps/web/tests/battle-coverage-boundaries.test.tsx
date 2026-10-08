import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import CpuMatchPage from '../src/pages/CpuMatchPage';
import LiveMatchPage from '../src/pages/LiveMatchPage';
import {
  MATCH_ID,
  activeMatch,
  completedMatch,
  matchResponse,
  problemResponse,
} from './fixtures/matches';
import {
  LIVE_MATCH_ID,
  LIVE_SERVER_TIME,
  participantProjection,
  projectionResponse,
  readyMessage,
  spectatorProjection,
  ticketResponse,
} from './fixtures/live';

const apiBaseUrl = 'https://api.example.test/api/v1';

function auth(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  } as Auth0ContextInterface;
}

function cpuResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function renderCpuMatch(authValue = auth()) {
  window.history.replaceState({}, '', `/matches/cpu/${MATCH_ID}`);
  return render(
    <Auth0Context.Provider value={authValue}>
      <Router>
        <Route path="/matches/cpu/:matchId">
          <CpuMatchPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

class RecoverySocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: RecoverySocket[] = [];
  readyState = RecoverySocket.OPEN;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    RecoverySocket.instances.push(this);
  }

  send = vi.fn();
  close() {
    this.readyState = RecoverySocket.CLOSED;
    this.onclose?.();
  }
  emit(value: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
  disconnect() {
    this.readyState = RecoverySocket.CLOSED;
    this.onclose?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  RecoverySocket.instances = [];
});

async function connectLiveMatch(role: 'participant' | 'spectator') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(LIVE_SERVER_TIME));
  vi.stubGlobal('WebSocket', RecoverySocket);
  const projection =
    role === 'participant' ? participantProjection() : spectatorProjection();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith(`/matches/live/${LIVE_MATCH_ID}`))
        return Promise.resolve(projectionResponse(projection));
      if (pathname.endsWith('/connection-tickets'))
        return Promise.resolve(ticketResponse(role));
      throw new Error(`Unexpected live request: ${pathname}`);
    }),
  );
  window.history.replaceState({}, '', `/matches/live/${LIVE_MATCH_ID}`);
  render(
    <Auth0Context.Provider value={auth()}>
      <Router>
        <Route path="/matches/live/:matchId">
          <LiveMatchPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
  await waitFor(() => expect(RecoverySocket.instances).toHaveLength(1));
  const socket = RecoverySocket.instances[0]!;
  act(() => socket.emit(readyMessage(projection)));
  expect(await screen.findByText('Connected')).toBeVisible();
  return socket;
}

describe('battle recovery boundaries', () => {
  it.each(['unavailable', 'rejected'] as const)(
    'allows another link-copy attempt after the clipboard is %s',
    async (failure) => {
      const user = userEvent.setup();
      await connectLiveMatch('spectator');
      if (failure === 'unavailable') {
        vi.stubGlobal(
          'navigator',
          Object.create(navigator, { clipboard: { value: undefined } }),
        );
      } else {
        vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
          new Error('Clipboard permission denied'),
        );
      }
      await user.click(
        screen.getByRole('button', { name: 'Copy private link' }),
      );
      expect(screen.getByRole('button', { name: 'Copy failed' })).toBeEnabled();
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Copy private link' }),
        ).toBeEnabled(),
      );
    },
  );

  it('copies the current private battle URL and resets the confirmation', async () => {
    const user = userEvent.setup();
    await connectLiveMatch('spectator');
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: 'Copy private link' }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Copy private link' }),
      ).toBeVisible(),
    );
  });

  it('sends a live resignation only after confirmation, never after canceling', async () => {
    const user = userEvent.setup();
    const socket = await connectLiveMatch('participant');
    await user.click(screen.getByText('Leave this battle'));
    await user.click(screen.getByRole('button', { name: 'Forfeit battle' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('BraamBear');
    await user.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(socket.send).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Forfeit battle' }));
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(socket.send).toHaveBeenCalledOnce();
    expect(JSON.parse(socket.send.mock.calls[0]![0] as string)).toMatchObject({
      protocolVersion: 1,
      matchId: LIVE_MATCH_ID,
      type: 'resign.submit',
      expectedVersion: 4,
    });
    expect(
      screen.getByRole('button', { name: 'Forfeit battle' }),
    ).toBeDisabled();
  });

  it.each(['CPU_MATCH_STALE_ACTION', 'CPU_MATCH_COMPLETED'])(
    'reconciles %s forfeit rejection with the authoritative completed result',
    async (code) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(matchResponse(activeMatch(4)))
        .mockResolvedValueOnce(problemResponse(code, 409))
        .mockResolvedValueOnce(matchResponse(completedMatch(6)));
      vi.stubGlobal('fetch', fetchMock);
      renderCpuMatch();

      await user.click(
        await screen.findByRole('button', { name: 'Forfeit battle' }),
      );
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Confirm forfeit',
        }),
      );

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          'Battle completed. You won.',
        ),
      );
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Forfeit battle' }),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1]).toEqual([
        `${apiBaseUrl}/matches/${MATCH_ID}/forfeit`,
        expect.objectContaining({
          body: JSON.stringify({ expectedVersion: 4 }),
          method: 'POST',
        }),
      ]);
      expect(String(fetchMock.mock.calls[2]![0])).toBe(
        `${apiBaseUrl}/matches/${MATCH_ID}`,
      );
    },
  );

  it('retains the last confirmed battle when forfeit reconciliation fails, then reloads without replaying the forfeit', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_STALE_ACTION', 409))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_UNAVAILABLE', 503))
      .mockResolvedValueOnce(matchResponse(activeMatch(5)));
    vi.stubGlobal('fetch', fetchMock);
    renderCpuMatch();

    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm forfeit',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Forfeit not confirmed.',
    );
    expect(
      screen.getByRole('heading', { name: 'Battle needs sync' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Forfeit battle' }),
    ).toBeDisabled();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Keep playing',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Check battle again' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('does not assume a forfeit succeeded after a server failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_UNAVAILABLE', 503));
    vi.stubGlobal('fetch', fetchMock);
    renderCpuMatch();

    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm forfeit',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Forfeit not confirmed.',
    );
    expect(
      screen
        .getAllByRole('status')
        .some((status) =>
          status.textContent?.includes(
            'The forfeit outcome could not be confirmed.',
          ),
        ),
    ).toBe(true);
    expect(screen.queryByText('The result is saved.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Forfeit battle' }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a recoverable sign-in failure after an expired match session', async () => {
    const user = userEvent.setup();
    const authValue = auth();
    vi.mocked(authValue.loginWithRedirect).mockRejectedValueOnce(
      new Error('Authentication unavailable'),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problemResponse('UNAUTHORIZED', 401)),
    );
    renderCpuMatch(authValue);

    await user.click(
      await screen.findByRole('button', { name: 'Sign in again' }),
    );
    expect(
      await screen.findByText('Sign-in could not start. Try again.'),
    ).toBeVisible();
    expect(authValue.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: `/matches/${MATCH_ID}` },
    });
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeEnabled();
  });

  it('retries an unavailable CPU match read without changing the requested match', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        cpuResponse({ code: 'CPU_MATCH_UNAVAILABLE' }, 503),
      )
      .mockResolvedValueOnce(matchResponse(activeMatch(4)));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', `/matches/cpu/${MATCH_ID}`);
    render(
      <Auth0Context.Provider value={auth()}>
        <Router>
          <Route path="/matches/cpu/:matchId">
            <CpuMatchPage apiBaseUrl={apiBaseUrl} />
          </Route>
        </Router>
      </Auth0Context.Provider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('battle');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1]![0])).pathname).toBe(
      `/api/v1/matches/${MATCH_ID}`,
    );
  });

  it('reconnects after stream loss and applies only the newer authoritative projection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    vi.stubGlobal('WebSocket', RecoverySocket);
    vi.stubGlobal(
      'crypto',
      Object.assign({}, crypto, {
        randomUUID: vi
          .fn()
          .mockReturnValue('70000000-0000-4000-8000-000000000001'),
      }),
    );
    const base = spectatorProjection();
    const snapshots = [base, { ...base, version: base.version + 1 }];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith(`/matches/live/${LIVE_MATCH_ID}`)) {
          return Promise.resolve(
            projectionResponse(
              snapshots.shift() ?? { ...base, version: base.version + 1 },
            ),
          );
        }
        if (pathname.endsWith('/connection-tickets'))
          return Promise.resolve(ticketResponse('spectator'));
        throw new Error(`Unexpected live request: ${pathname}`);
      }),
    );
    window.history.replaceState(
      {},
      '',
      `/matches/live/${LIVE_MATCH_ID}?spectate=1`,
    );
    render(
      <Auth0Context.Provider value={auth()}>
        <Router>
          <Route path="/matches/live/:matchId">
            <LiveMatchPage apiBaseUrl={apiBaseUrl} />
          </Route>
        </Router>
      </Auth0Context.Provider>,
    );

    await waitFor(() => expect(RecoverySocket.instances).toHaveLength(1));
    act(() => RecoverySocket.instances[0]!.emit(readyMessage(base)));
    expect(await screen.findByText('Connected')).toBeVisible();
    act(() => RecoverySocket.instances[0]!.disconnect());
    await waitFor(() => expect(RecoverySocket.instances).toHaveLength(2));
    act(() =>
      RecoverySocket.instances[1]!.emit(
        readyMessage({ ...base, version: base.version + 1 }),
      ),
    );
    expect(await screen.findByText('Connected')).toBeVisible();
    expect(screen.getByRole('status')).not.toHaveTextContent(
      /older|out of date/i,
    );
  });
});
