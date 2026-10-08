import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLiveBattleSession } from '../src/pages/useLiveBattleSession';
import type { CpuMatchIntent } from '../src/api/matches';
import {
  LIVE_MATCH_ID,
  participantProjection,
  projectionResponse,
  readyMessage,
  ticketResponse,
  transitionMessage,
} from './fixtures/live';

const apiBaseUrl = 'https://api.example.test/api/v1';

class SessionSocket {
  static instances: SessionSocket[] = [];
  readyState = 1;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  close = vi.fn(() => {
    this.readyState = 3;
  });
  send = vi.fn((value: string) => this.sent.push(value));

  constructor(readonly url: string) {
    SessionSocket.instances.push(this);
  }

  emit(message: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(message) }),
    );
  }

  disconnect() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function liveFetch(snapshots: Record<string, unknown>[]) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith(`/matches/live/${LIVE_MATCH_ID}`)) {
      const snapshot = snapshots.shift();
      if (!snapshot) throw new Error('Unexpected live snapshot request.');
      return Promise.resolve(projectionResponse(snapshot));
    }
    if (url.pathname.endsWith('/connection-tickets')) {
      const body = JSON.parse(String(init?.body)) as { role: string };
      return Promise.resolve(ticketResponse(body.role as 'participant'));
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
}

beforeEach(() => {
  SessionSocket.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(snapshots: Record<string, unknown>[]) {
  const fetchMock = liveFetch(snapshots);
  vi.stubGlobal('fetch', fetchMock);
  const getAccessToken = vi.fn().mockResolvedValue('access-token');
  const webSocketFactory = vi.fn((url: string) => new SessionSocket(url));
  const result = renderHook(() =>
    useLiveBattleSession({
      apiBaseUrl,
      getAccessToken,
      matchId: LIVE_MATCH_ID,
      webSocketFactory: webSocketFactory as unknown as (
        url: string,
      ) => WebSocket,
    }),
  );
  return { ...result, fetchMock };
}

describe('live battle session boundaries', () => {
  it('reconciles a pending action after reconnect and recovers across a version gap', async () => {
    const initial = participantProjection();
    const applied = participantProjection({
      version: 5,
      currentActor: 'opponent',
      legalActions: [],
    });
    const latest = participantProjection({
      version: 7,
      currentActor: 'self',
      turnNumber: 4,
    });
    vi.stubGlobal('crypto', {
      randomUUID: () => '70000000-0000-4000-8000-000000000099',
    });
    const { result, fetchMock } = mount([initial, applied, latest]);

    await waitFor(() => expect(SessionSocket.instances).toHaveLength(1));
    const first = SessionSocket.instances[0]!;
    act(() => first.emit(readyMessage(initial)));
    expect(result.current.connection).toBe('connected');
    expect(result.current.match?.version).toBe(4);

    act(() => {
      expect(
        result.current.submitAction(initial.legalActions[0] as CpuMatchIntent),
      ).toBe(true);
    });
    expect(JSON.parse(first.sent[0]!)).toMatchObject({
      expectedVersion: 4,
      messageId: '70000000-0000-4000-8000-000000000099',
      type: 'action.submit',
    });
    expect(result.current.pending?.stage).toBe('sending');

    act(() => first.disconnect());
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(2));
    const recoveredSocket = SessionSocket.instances[1]!;
    expect(result.current.match?.version).toBe(5);
    expect(result.current.pending).toBeNull();
    act(() => recoveredSocket.emit(readyMessage(applied)));
    expect(result.current.connection).toBe('recovered');
    expect(result.current.match?.version).toBe(5);

    act(() =>
      recoveredSocket.emit({
        protocolVersion: 1,
        type: 'match.snapshot',
        eventId: '63000000-0000-4000-8000-000000000007',
        version: 4,
        serverTime: '2026-09-25T12:00:06.000Z',
        match: initial,
      }),
    );
    expect(result.current.match?.version).toBe(5);

    act(() => recoveredSocket.emit(transitionMessage(latest, 5)));
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(3));
    expect(fetchMock).toHaveBeenCalledTimes(6);
    act(() => SessionSocket.instances[2]!.emit(readyMessage(latest)));
    expect(result.current.connection).toBe('recovered');
    expect(result.current.match?.version).toBe(7);
    expect(result.current.match?.turnNumber).toBe(4);
    expect(SessionSocket.instances[2]!.sent).toHaveLength(0);
  });

  it('treats a server revocation as terminal without requesting a replacement session', async () => {
    const projection = participantProjection();
    const { result, fetchMock } = mount([projection]);
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(1));
    const socket = SessionSocket.instances[0]!;
    act(() => socket.emit(readyMessage(projection)));

    act(() =>
      socket.emit({
        protocolVersion: 1,
        type: 'error',
        code: 'LIVE_CONNECTION_SUPERSEDED',
        detail: 'A newer authenticated connection replaced this one.',
        retryable: false,
        serverTime: '2026-09-25T12:00:03.000Z',
      }),
    );
    expect(result.current.connection).toBe('unrecoverable');
    expect(result.current.error).toMatchObject({
      failure: 'authorization',
      options: { code: 'LIVE_CONNECTION_SUPERSEDED' },
    });
    expect(socket.close).toHaveBeenCalledOnce();
    expect(result.current.match?.version).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight read on unmount and closes the established socket', async () => {
    const initial = participantProjection();
    const { result, unmount } = mount([initial]);
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(1));
    const socket = SessionSocket.instances[0]!;
    act(() => socket.emit(readyMessage(initial)));

    let finishRead: ((value: Response) => void) | undefined;
    const pendingRead: { signal: AbortSignal | null } = { signal: null };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/matches/live/')) {
          pendingRead.signal = init?.signal ?? null;
          return new Promise<Response>((resolve) => {
            finishRead = resolve;
          });
        }
        return Promise.resolve(ticketResponse('participant'));
      }),
    );
    act(() => result.current.recover());
    await waitFor(() => expect(finishRead).toBeDefined());
    unmount();

    expect(socket.close).toHaveBeenCalled();
    expect(pendingRead.signal?.aborted).toBe(true);
    finishRead?.(projectionResponse(initial));
  });

  it('tracks presence and acknowledges an action before recovering a late-action error', async () => {
    const initial = participantProjection();
    const updated = participantProjection({ version: 5, turnNumber: 3 });
    vi.stubGlobal('crypto', {
      randomUUID: () => '70000000-0000-4000-8000-000000000088',
    });
    const { result } = mount([initial, updated]);
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(1));
    const socket = SessionSocket.instances[0]!;
    act(() => socket.emit(readyMessage(initial)));

    act(() =>
      socket.emit({
        protocolVersion: 1,
        type: 'presence.changed',
        eventId: '63000000-0000-4000-8000-000000000008',
        version: 4,
        serverTime: '2026-09-25T12:00:03.000Z',
        participants: { playerOneConnected: true, playerTwoConnected: false },
        spectatorCount: 3,
      }),
    );
    expect(result.current.presence).toEqual({
      playerOneConnected: true,
      playerTwoConnected: false,
      spectatorCount: 3,
    });

    const intent = initial.legalActions[0] as CpuMatchIntent;
    act(() => expect(result.current.submitAction(intent)).toBe(true));
    const acknowledged = {
      protocolVersion: 1,
      type: 'action.acknowledged',
      eventId: '63000000-0000-4000-8000-000000000009',
      messageId: '70000000-0000-4000-8000-000000000088',
      version: 4,
      serverTime: '2026-09-25T12:00:04.000Z',
    };
    act(() =>
      socket.emit({
        ...acknowledged,
        messageId: '70000000-0000-4000-8000-000000000089',
      }),
    );
    expect(result.current.pending?.stage).toBe('sending');
    act(() => socket.emit(acknowledged));
    expect(result.current.pending?.stage).toBe('acknowledged');

    act(() =>
      socket.emit({
        protocolVersion: 1,
        type: 'error',
        code: 'LIVE_ACTION_LATE',
        detail: 'The action arrived after the turn deadline.',
        messageId: '70000000-0000-4000-8000-000000000088',
        retryable: true,
        serverTime: '2026-09-25T12:00:05.000Z',
      }),
    );
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(2));
    expect(result.current.match?.version).toBe(5);
    expect(result.current.pending).toBeNull();
    act(() => SessionSocket.instances[1]!.emit(readyMessage(updated)));
    expect(result.current.connection).toBe('recovered');
  });

  it('keeps an unavailable match terminal until an explicit recovery succeeds', async () => {
    const projection = participantProjection();
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith(`/matches/live/${LIVE_MATCH_ID}`)) {
          reads += 1;
          return Promise.resolve(
            reads === 1
              ? new Response(
                  JSON.stringify({
                    code: 'LIVE_MATCH_NOT_FOUND',
                    detail: 'The live battle is no longer available.',
                    requestId: 'live-not-found',
                  }),
                  { status: 404 },
                )
              : projectionResponse(projection),
          );
        }
        if (pathname.endsWith('/connection-tickets')) {
          return Promise.resolve(ticketResponse('participant'));
        }
        throw new Error(`Unexpected request: ${pathname}`);
      }),
    );
    const getAccessToken = vi.fn().mockResolvedValue('access-token');
    const webSocketFactory = vi.fn((url: string) => new SessionSocket(url));
    const { result } = renderHook(() =>
      useLiveBattleSession({
        apiBaseUrl,
        getAccessToken,
        matchId: LIVE_MATCH_ID,
        webSocketFactory: webSocketFactory as unknown as (
          url: string,
        ) => WebSocket,
      }),
    );

    await waitFor(() =>
      expect(result.current.connection).toBe('unrecoverable'),
    );
    expect(result.current.error).toMatchObject({ failure: 'not-found' });
    expect(SessionSocket.instances).toHaveLength(0);

    act(() => result.current.recover());
    await waitFor(() => expect(SessionSocket.instances).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(result.current.match?.matchId).toBe(LIVE_MATCH_ID);
    expect(getAccessToken).toHaveBeenCalledTimes(3);
  });
});
