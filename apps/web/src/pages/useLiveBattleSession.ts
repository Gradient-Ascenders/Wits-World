import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildLiveWebSocketUrl,
  createLiveConnectionTicket,
  getLiveProjection,
  LiveApiError,
  parseLiveServerMessage,
  type LiveParticipantProjection,
  type LiveProjection,
  type LiveServerMessage,
} from '../api/live';
import type { CpuMatchIntent } from '../api/matches';
import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export type LiveConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'recovered'
  | 'completed'
  | 'unrecoverable';

interface PendingIntent {
  action: CpuMatchIntent | null;
  expectedVersion: number;
  messageId: string;
  stage: 'sending' | 'acknowledged';
  type: 'action.submit' | 'resign.submit';
}

export interface LivePresence {
  playerOneConnected: boolean;
  playerTwoConnected: boolean;
  spectatorCount: number;
}

interface SessionState {
  connection: LiveConnectionStatus;
  error: LiveApiError | null;
  feedback: string;
  match: LiveProjection | null;
  pending: PendingIntent | null;
  presence: LivePresence | null;
}

interface UseLiveBattleSessionOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  matchId: string;
  webSocketFactory?: (url: string) => WebSocket;
}

const reconnectDelays = [0, 1_000, 2_000, 5_000, 10_000] as const;
const defaultWebSocketFactory = (url: string) => new WebSocket(url);

export function useLiveBattleSession({
  apiBaseUrl,
  getAccessToken,
  matchId,
  webSocketFactory = defaultWebSocketFactory,
}: UseLiveBattleSessionOptions) {
  const [state, setState] = useState<SessionState>({
    connection: 'connecting',
    error: null,
    feedback: 'Connecting…',
    match: null,
    pending: null,
    presence: null,
  });
  const stateRef = useRef(state);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const socket = useRef<WebSocket | null>(null);
  const request = useRef<AbortController | null>(null);
  const snapshotRequest = useRef<AbortController | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const recoveredTimer = useRef<number | null>(null);
  const reconnectAttempt = useRef(0);
  const pendingRef = useRef<PendingIntent | null>(null);
  const serverClock = useRef({
    clientTime: Date.now(),
    serverTime: Date.now(),
  });
  stateRef.current = state;

  const update = useCallback(
    (next: SessionState | ((current: SessionState) => SessionState)) => {
      if (!mounted.current) return;
      setState((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        stateRef.current = value;
        return value;
      });
    },
    [],
  );

  const anchorServerTime = useCallback((value: string) => {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return;
    serverClock.current = { clientTime: Date.now(), serverTime: parsed };
  }, []);

  const applyMatch = useCallback(
    (
      match: LiveProjection,
      allowVersionJump = false,
    ): 'applied' | 'obsolete' | 'gap' => {
      if (match.matchId !== matchId) return 'obsolete';
      const current = stateRef.current.match;
      if (current && current.role !== match.role) return 'obsolete';
      if (current && match.version < current.version) return 'obsolete';
      if (current && !allowVersionJump && match.version > current.version + 1) {
        return 'gap';
      }
      const pending = pendingRef.current;
      if (pending && match.version > pending.expectedVersion) {
        pendingRef.current = null;
      }
      const connection =
        match.status === 'completed'
          ? 'completed'
          : stateRef.current.connection;
      update((previous) => ({
        ...previous,
        connection,
        error: null,
        match,
        pending: pendingRef.current,
        presence:
          match.role === 'spectator' ? match.presence : previous.presence,
      }));
      return 'applied';
    },
    [matchId, update],
  );

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current !== null) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (recoveredTimer.current !== null) {
      window.clearTimeout(recoveredTimer.current);
      recoveredTimer.current = null;
    }
  }, []);

  const closeTransport = useCallback(() => {
    const current = socket.current;
    socket.current = null;
    if (current && current.readyState < WebSocket.CLOSING) {
      current.close(1000, 'client reconnect');
    }
  }, []);

  const recoverRef = useRef<
    (reason: 'initial' | 'manual' | 'transport') => void
  >(() => undefined);

  // Resynchronizing gameplay must not replace a healthy participant socket.
  // Replacing it changes connection generation and broadcasts another presence
  // update, which can otherwise make both participants repeatedly reconnect.
  const refreshSnapshot = useCallback(() => {
    if (snapshotRequest.current || !mounted.current) return;
    const controller = new AbortController();
    snapshotRequest.current = controller;
    const currentEpoch = epoch.current;
    void getLiveProjection({
      apiBaseUrl,
      getAccessToken,
      matchId,
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted || currentEpoch !== epoch.current) return;
        if (applyMatch(response.match, true) === 'obsolete') return;
        anchorServerTime(response.serverTime);
        update((previous) => ({
          ...previous,
          feedback: connectionFeedback(response.match),
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentEpoch !== epoch.current) return;
        if (error instanceof LiveApiError && error.failure !== 'unavailable') {
          recoverRef.current('transport');
        }
      })
      .finally(() => {
        if (snapshotRequest.current === controller)
          snapshotRequest.current = null;
      });
  }, [
    apiBaseUrl,
    getAccessToken,
    matchId,
    anchorServerTime,
    applyMatch,
    update,
  ]);

  const scheduleReconnect = useCallback(
    (currentEpoch: number) => {
      if (
        !mounted.current ||
        currentEpoch !== epoch.current ||
        stateRef.current.match?.status === 'completed' ||
        stateRef.current.connection === 'unrecoverable'
      ) {
        return;
      }
      const index = Math.min(
        reconnectAttempt.current,
        reconnectDelays.length - 1,
      );
      const delay = reconnectDelays[index]!;
      reconnectAttempt.current += 1;
      update((previous) => ({
        ...previous,
        connection: 'reconnecting',
        feedback:
          delay === 0
            ? 'Reconnecting…'
            : `Connection lost. Retrying in ${Math.ceil(delay / 1000)} seconds…`,
      }));
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        recoverRef.current('transport');
      }, delay);
    },
    [update],
  );

  const handleServerMessage = useCallback(
    (message: LiveServerMessage, currentEpoch: number) => {
      if (!mounted.current || currentEpoch !== epoch.current) return;
      const currentMatch = stateRef.current.match;
      if (
        currentMatch &&
        ((message.type === 'match.transition' &&
          message.version <= currentMatch.version) ||
          ((message.type === 'match.snapshot' ||
            message.type === 'presence.changed') &&
            message.version < currentMatch.version))
      )
        return;
      anchorServerTime(message.serverTime);

      if (message.type === 'connection.ready') {
        const result = applyMatch(message.match, true);
        if (result === 'gap') {
          recoverRef.current('transport');
          return;
        }
        reconnectAttempt.current = 0;
        const recovered = stateRef.current.connection === 'reconnecting';
        update((previous) => ({
          ...previous,
          connection:
            message.match.status === 'completed'
              ? 'completed'
              : recovered
                ? 'recovered'
                : 'connected',
          feedback: recovered
            ? 'Live battle recovered from the latest server state.'
            : connectionFeedback(message.match),
        }));
        if (recovered && message.match.status === 'active') {
          recoveredTimer.current = window.setTimeout(() => {
            recoveredTimer.current = null;
            update((previous) => ({
              ...previous,
              connection: 'connected',
              feedback: connectionFeedback(previous.match),
            }));
          }, 2_500);
        }
        const pending = pendingRef.current;
        if (pending && message.match.version === pending.expectedVersion) {
          pendingRef.current = null;
          update((previous) => ({
            ...previous,
            feedback:
              'The interrupted action was not applied. Review the restored turn and try again.',
            pending: null,
          }));
        }
        return;
      }

      if (message.type === 'match.transition') {
        const current = stateRef.current.match;
        if (
          current &&
          (message.previousVersion !== current.version ||
            message.version > current.version + 1)
        ) {
          refreshSnapshot();
          return;
        }
        if (applyMatch(message.match, true) === 'gap') {
          recoverRef.current('transport');
          return;
        }
        update((previous) => ({
          ...previous,
          feedback: connectionFeedback(message.match),
        }));
        return;
      }

      if (message.type === 'match.snapshot') {
        applyMatch(message.match, true);
        return;
      }

      if (message.type === 'presence.changed') {
        const current = stateRef.current.match;
        if (!current || message.version < current.version) return;
        if (message.version > current.version) {
          refreshSnapshot();
        }
        const presence = {
          ...message.participants,
          spectatorCount: message.spectatorCount,
        };
        update((previous) => ({
          ...previous,
          presence,
          match:
            previous.match?.role === 'spectator'
              ? { ...previous.match, presence }
              : previous.match,
        }));
        return;
      }

      if (message.type === 'action.acknowledged') {
        const pending = pendingRef.current;
        if (!pending || pending.messageId !== message.messageId) return;
        pendingRef.current = { ...pending, stage: 'acknowledged' };
        update((previous) => ({
          ...previous,
          feedback: 'Action accepted. Updating battle…',
          pending: pendingRef.current,
        }));
        return;
      }

      if (message.type !== 'error') return;

      const pending = pendingRef.current;
      if (message.messageId && pending?.messageId !== message.messageId) return;
      if (
        message.code === 'LIVE_CONNECTION_SUPERSEDED' ||
        message.code === 'LIVE_AUTHENTICATION_REQUIRED' ||
        message.code === 'LIVE_ACTION_FORBIDDEN'
      ) {
        pendingRef.current = null;
        closeTransport();
        update((previous) => ({
          ...previous,
          connection: 'unrecoverable',
          error: new LiveApiError(
            message.code === 'LIVE_AUTHENTICATION_REQUIRED'
              ? 'authentication'
              : 'authorization',
            { code: message.code, detail: message.detail },
          ),
          feedback: message.detail,
          pending: null,
        }));
        return;
      }
      pendingRef.current = null;
      update((previous) => ({
        ...previous,
        feedback:
          message.code === 'LIVE_ACTION_LATE'
            ? 'Action was too late. Updating turn…'
            : 'Action not applied. Updating turn…',
        pending: null,
      }));
      refreshSnapshot();
    },
    [anchorServerTime, applyMatch, closeTransport, refreshSnapshot, update],
  );

  const recover = useCallback(
    (reason: 'initial' | 'manual' | 'transport') => {
      const currentEpoch = ++epoch.current;
      clearTimers();
      closeTransport();
      request.current?.abort();
      snapshotRequest.current?.abort();
      snapshotRequest.current = null;
      const controller = new AbortController();
      request.current = controller;
      update((previous) => ({
        ...previous,
        connection: reason === 'initial' ? 'connecting' : 'reconnecting',
        error: null,
        feedback: reason === 'initial' ? 'Connecting…' : 'Updating battle…',
      }));

      void (async () => {
        try {
          const response = await getLiveProjection({
            apiBaseUrl,
            getAccessToken,
            matchId,
            signal: controller.signal,
          });
          if (controller.signal.aborted || currentEpoch !== epoch.current)
            return;
          anchorServerTime(response.serverTime);
          applyMatch(response.match, true);
          if (response.match.status === 'completed') {
            update((previous) => ({
              ...previous,
              connection: 'completed',
              feedback: 'This live battle is complete.',
            }));
            return;
          }
          const ticket = await createLiveConnectionTicket({
            apiBaseUrl,
            getAccessToken,
            matchId,
            role: response.match.role,
            signal: controller.signal,
          });
          if (controller.signal.aborted || currentEpoch !== epoch.current)
            return;
          const nextSocket = webSocketFactory(
            buildLiveWebSocketUrl(ticket.webSocketUrl, ticket.ticket),
          );
          socket.current = nextSocket;
          nextSocket.onmessage = (event) => {
            try {
              handleServerMessage(
                parseLiveServerMessage(String(event.data)),
                currentEpoch,
              );
            } catch {
              update((previous) => ({
                ...previous,
                feedback: 'Connection error. Reconnecting…',
              }));
              recoverRef.current('transport');
            }
          };
          nextSocket.onerror = () => {
            if (currentEpoch !== epoch.current) return;
            update((previous) => ({
              ...previous,
              feedback: 'The live connection was interrupted.',
            }));
          };
          nextSocket.onclose = () => {
            if (socket.current === nextSocket) socket.current = null;
            scheduleReconnect(currentEpoch);
          };
        } catch (caught) {
          if (controller.signal.aborted || currentEpoch !== epoch.current)
            return;
          const error =
            caught instanceof LiveApiError
              ? caught
              : new LiveApiError('unavailable');
          if (
            error.failure === 'authentication' ||
            error.failure === 'authorization' ||
            error.failure === 'not-found' ||
            error.failure === 'validation'
          ) {
            pendingRef.current = null;
            update((previous) => ({
              ...previous,
              connection: 'unrecoverable',
              error,
              feedback: errorMessage(error),
              pending: null,
            }));
          } else {
            scheduleReconnect(currentEpoch);
          }
        }
      })();
    },
    [
      apiBaseUrl,
      anchorServerTime,
      applyMatch,
      clearTimers,
      closeTransport,
      getAccessToken,
      handleServerMessage,
      matchId,
      scheduleReconnect,
      update,
      webSocketFactory,
    ],
  );
  recoverRef.current = recover;

  useEffect(() => {
    mounted.current = true;
    pendingRef.current = null;
    reconnectAttempt.current = 0;
    stateRef.current = {
      connection: 'connecting',
      error: null,
      feedback: 'Connecting…',
      match: null,
      pending: null,
      presence: null,
    };
    update(stateRef.current);
    recover('initial');
    return () => {
      mounted.current = false;
      epoch.current += 1;
      clearTimers();
      request.current?.abort();
      snapshotRequest.current?.abort();
      snapshotRequest.current = null;
      closeTransport();
    };
  }, [clearTimers, closeTransport, recover, update]);

  useEffect(() => {
    if (state.pending?.stage !== 'acknowledged') return;
    // The acknowledgement can arrive even if its separate notification is lost.
    const timer = window.setTimeout(refreshSnapshot, 1_500);
    return () => window.clearTimeout(timer);
  }, [state.pending, refreshSnapshot]);

  useEffect(() => {
    if (
      state.match?.status !== 'active' ||
      !state.match.turnDeadline ||
      (state.connection !== 'connected' && state.connection !== 'recovered')
    )
      return;
    const anchor = serverClock.current;
    const now = anchor.serverTime + (Date.now() - anchor.clientTime);
    const remaining = Date.parse(state.match.turnDeadline) - now;
    // Read the authoritative result if a deadline notification does not arrive.
    // Only the server advances the decision or resolves a timeout.
    const timer = window.setTimeout(
      refreshSnapshot,
      Math.max(0, remaining) + 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    state.match?.status,
    state.match?.turnDeadline,
    state.connection,
    refreshSnapshot,
  ]);

  const sendIntent = useCallback(
    (action: CpuMatchIntent | null, type: PendingIntent['type']) => {
      const match = stateRef.current.match;
      const activeSocket = socket.current;
      if (
        pendingRef.current ||
        match?.role !== 'participant' ||
        match.status !== 'active' ||
        stateRef.current.connection !== 'connected' ||
        !activeSocket ||
        activeSocket.readyState !== WebSocket.OPEN
      ) {
        return false;
      }
      if (
        action &&
        !match.legalActions.some((legal) => sameIntent(legal, action))
      ) {
        update((previous) => ({
          ...previous,
          feedback: 'That action is no longer legal in the server state.',
        }));
        return false;
      }
      const pending: PendingIntent = {
        action,
        expectedVersion: match.version,
        messageId: crypto.randomUUID(),
        stage: 'sending',
        type,
      };
      pendingRef.current = pending;
      update((previous) => ({
        ...previous,
        feedback:
          type === 'resign.submit'
            ? 'Submitting your forfeit…'
            : 'Submitting your action…',
        pending,
      }));
      activeSocket.send(
        JSON.stringify({
          protocolVersion: 1,
          type,
          matchId,
          messageId: pending.messageId,
          expectedVersion: pending.expectedVersion,
          ...(action ? { action } : {}),
        }),
      );
      return true;
    },
    [matchId, update],
  );

  const serverNow = useCallback(() => {
    const anchor = serverClock.current;
    return anchor.serverTime + (Date.now() - anchor.clientTime);
  }, []);

  const scopedState =
    state.match && state.match.matchId !== matchId
      ? {
          ...state,
          match: null,
          pending: null,
          presence: null,
          error: null,
          connection: 'connecting' as const,
          feedback: 'Connecting…',
        }
      : state;
  return {
    ...scopedState,
    recover: () => recover('manual'),
    resign: () => sendIntent(null, 'resign.submit'),
    serverNow,
    submitAction: (action: CpuMatchIntent) =>
      sendIntent(action, 'action.submit'),
  };
}

function connectionFeedback(match: LiveProjection | null): string {
  if (!match) return 'Connected to the live battle.';
  if (match.status === 'completed') return 'This live battle is complete.';
  if (match.role === 'spectator')
    return 'Watching the live public battle state.';
  if (match.phase === 'initial_selection') {
    return match.legalActions.some(
      (action) => action.type === 'select_initial_creature',
    )
      ? 'Choose your first Creature.'
      : 'Opening Creature selected. Waiting for opponent…';
  }
  return match.currentActor === 'self'
    ? 'Your turn. Choose one of the server-approved actions.'
    : 'Waiting for opponent…';
}

function errorMessage(error: LiveApiError): string {
  if (error.failure === 'authentication') {
    return 'Your session cannot open this live battle. Sign in again.';
  }
  if (error.failure === 'authorization') {
    return 'This connection is not authorized for the requested live role.';
  }
  if (error.failure === 'not-found') {
    return 'This live match is unavailable or has already ended.';
  }
  return error.options.detail ?? 'The live battle could not be recovered.';
}

function sameIntent(left: CpuMatchIntent, right: CpuMatchIntent): boolean {
  if (left.type !== right.type) return false;
  if ('creatureId' in left && 'creatureId' in right) {
    return left.creatureId === right.creatureId;
  }
  if ('moveId' in left && 'moveId' in right) {
    return left.moveId === right.moveId;
  }
  if ('powerCardId' in left && 'powerCardId' in right) {
    return left.powerCardId === right.powerCardId;
  }
  return false;
}

export function isParticipant(
  match: LiveProjection | null,
): match is LiveParticipantProjection {
  return match?.role === 'participant';
}
