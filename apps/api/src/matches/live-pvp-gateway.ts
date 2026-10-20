import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';

import { livePvpMatchForClient } from './battle-projection-capability.js';
import {
  LivePvpError,
  type LiveClientAction,
  type LivePvpService,
  type RedeemedLivePvpConnection,
} from './live-pvp-service.js';

export const LIVE_PVP_PROTOCOL_VERSION = 1 as const;
export const LIVE_PVP_MAX_MESSAGE_BYTES = 16_384;
export const LIVE_PVP_HEARTBEAT_INTERVAL_MS = 20_000;
const LIVE_PVP_MAX_PENDING_MESSAGES = 16;

const UUID_PATTERN =
  // Catalogue IDs are deterministic PostgreSQL UUIDs, without RFC version bits.
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LivePvpGatewayLogger {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export interface LivePvpGateway {
  register(app: FastifyInstance): Promise<void>;
  broadcastMatch(matchId: string, committedVersion: number): Promise<void>;
  broadcastPresence(matchId: string): Promise<void>;
  recoverNotificationGap(): Promise<void>;
  closeAll(): Promise<void>;
  connectionCount(): number;
  refreshConnections(): Promise<void>;
}

interface GatewayConnection {
  socket: WebSocket;
  principal: RedeemedLivePvpConnection;
  supportsBattleSwaps: boolean;
  missedPongs: number;
  closed: boolean;
}

interface BaseClientMessage {
  protocolVersion: 1;
  matchId: string;
  messageId: string;
  expectedVersion: number;
}

interface ActionSubmitMessage extends BaseClientMessage {
  type: 'action.submit';
  action: LiveClientAction;
}

interface ResignSubmitMessage extends BaseClientMessage {
  type: 'resign.submit';
}

type ClientMessage = ActionSubmitMessage | ResignSubmitMessage;

export function createLivePvpGateway(
  service: LivePvpService,
  logger: LivePvpGatewayLogger = console,
  options: {
    onActivity?: () => void;
    prepareConnection?: () => Promise<void>;
  } = {},
): LivePvpGateway {
  const connectionsByMatch = new Map<string, Set<GatewayConnection>>();
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;

  function addConnection(connection: GatewayConnection): void {
    const existing = connectionsByMatch.get(connection.principal.matchId);
    const matchConnections = existing ?? new Set<GatewayConnection>();

    if (connection.principal.role === 'participant') {
      for (const candidate of matchConnections) {
        if (
          candidate.principal.role === 'participant' &&
          candidate.principal.playerId === connection.principal.playerId &&
          candidate !== connection
        ) {
          sendError(
            candidate.socket,
            new LivePvpError(
              'LIVE_CONNECTION_SUPERSEDED',
              'A newer participant connection is authoritative for this match.',
            ),
          );
          safeClose(candidate.socket, 4409, 'connection superseded');
        }
      }
    }

    matchConnections.add(connection);
    connectionsByMatch.set(connection.principal.matchId, matchConnections);
    options.onActivity?.();
  }

  function removeConnection(connection: GatewayConnection): void {
    const matchConnections = connectionsByMatch.get(
      connection.principal.matchId,
    );
    if (!matchConnections) return;
    matchConnections.delete(connection);
    if (matchConnections.size === 0) {
      connectionsByMatch.delete(connection.principal.matchId);
    }
    options.onActivity?.();
  }

  function ensureHeartbeat(): void {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      for (const matchConnections of connectionsByMatch.values()) {
        for (const connection of matchConnections) {
          if (connection.closed) continue;
          if (connection.missedPongs >= 2) {
            safeTerminate(connection.socket);
            continue;
          }
          connection.missedPongs += 1;
          try {
            connection.socket.ping();
          } catch {
            safeTerminate(connection.socket);
          }
        }
      }
    }, LIVE_PVP_HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();
  }

  async function handleConnection(
    socket: WebSocket,
    request: FastifyRequest,
  ): Promise<void> {
    let connection: GatewayConnection | undefined = undefined;
    let readyForMessages = false;
    let transportClosed = false;
    let messageChain = Promise.resolve();
    const pendingMessages: Array<{ data: RawData; isBinary: boolean }> = [];

    const enqueueMessage = (data: RawData, isBinary: boolean): void => {
      if (!connection || !readyForMessages) {
        if (pendingMessages.length >= LIVE_PVP_MAX_PENDING_MESSAGES) {
          sendProtocolError(
            socket,
            'Too many messages arrived before connection setup completed.',
          );
          safeClose(socket, 4400, 'protocol error');
          return;
        }
        pendingMessages.push({ data, isBinary });
        return;
      }
      const activeConnection = connection;
      messageChain = messageChain
        .then(() => handleMessage(activeConnection, data, isBinary))
        .catch(() => {
          logger.error(
            { matchId: activeConnection.principal.matchId },
            'Live PvP message processing failed unexpectedly.',
          );
          safeClose(activeConnection.socket, 1011, 'message processing failed');
        });
    };

    // @fastify/websocket requires message handlers to be attached synchronously
    // when the route handler runs. Queue bounded early messages while ticket
    // redemption and persisted recovery complete so no client intent is lost.
    socket.on('pong', () => {
      if (connection) connection.missedPongs = 0;
    });
    socket.on('message', (data: RawData, isBinary: boolean) => {
      enqueueMessage(data, isBinary);
    });
    socket.on('error', () => {
      // The close handler performs persisted cleanup. Avoid logging raw socket
      // request state because its URL contains the short-lived ticket.
    });
    socket.on('close', () => {
      transportClosed = true;
      if (connection) void finalizeConnection(connection, 'transport_closed');
    });

    if (shuttingDown) {
      safeClose(socket, 1012, 'service restart');
      return;
    }

    const ticket = readTicket(request);
    if (!ticket) {
      sendError(
        socket,
        new LivePvpError(
          'LIVE_AUTHENTICATION_REQUIRED',
          'A valid realtime connection ticket is required.',
        ),
      );
      safeClose(socket, 4401, 'authentication required');
      return;
    }

    let principal: RedeemedLivePvpConnection;
    try {
      principal = await service.redeemConnectionTicket(ticket);
    } catch (error) {
      const liveError = normalizeLiveError(error);
      sendError(socket, liveError);
      safeClose(
        socket,
        liveError.code === 'LIVE_CONNECTION_SUPERSEDED' ? 4409 : 4401,
        safeCloseReason(liveError),
      );
      return;
    }

    try {
      await service.processOverdueUntilCurrent(principal.matchId);
    } catch (error) {
      const cleanup = closeRedeemedAccess(principal, 'transport_closed');
      const liveError = normalizeLiveError(error);
      sendError(socket, liveError);
      safeCloseForError(socket, liveError, 'connection setup failed');
      await cleanup;
      return;
    }

    connection = {
      socket,
      principal,
      supportsBattleSwaps: readBattleSwaps(request),
      missedPongs: 0,
      closed: false,
    };
    if (transportClosed || socket.readyState !== 1) {
      await service.closeConnectionAccess(
        principal.accessId,
        'transport_closed',
      );
      return;
    }
    addConnection(connection);
    ensureHeartbeat();

    try {
      // Subscribe before loading the snapshot so a concurrent remote commit
      // cannot fall between the initial projection and notification fan-out.
      await options.prepareConnection?.();
      const projection = await service.getProjectionForConnection(principal);
      if (connection.closed || socket.readyState !== 1) return;
      send(socket, {
        protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
        type: 'connection.ready',
        connectionId: principal.accessId,
        role: principal.role,
        serverTime: new Date().toISOString(),
        version: projection.version,
        match: livePvpMatchForClient(
          projection,
          connection.supportsBattleSwaps,
        ),
      });
      if (projection.status === 'completed') {
        pendingMessages.length = 0;
        await closeCompletedConnection(connection);
        return;
      }
      readyForMessages = true;
      for (const pending of pendingMessages.splice(0)) {
        enqueueMessage(pending.data, pending.isBinary);
      }
      await gateway.broadcastPresence(principal.matchId);
    } catch (error) {
      const liveError = normalizeLiveError(error);
      sendError(socket, liveError);
      const cleanup = finalizeConnection(connection, 'transport_closed');
      safeCloseForError(socket, liveError, 'projection unavailable');
      await cleanup;
    }
  }

  async function handleMessage(
    connection: GatewayConnection,
    rawData: RawData,
    isBinary: boolean,
  ): Promise<void> {
    if (connection.closed || connection.socket.readyState !== 1) return;
    if (isBinary) {
      await failProtocol(connection, 'Binary messages are not supported.');
      return;
    }

    const text = rawData.toString();
    if (Buffer.byteLength(text, 'utf8') > LIVE_PVP_MAX_MESSAGE_BYTES) {
      await failProtocol(connection, 'Realtime message is too large.');
      return;
    }

    let message: ClientMessage;
    try {
      message = parseLivePvpClientMessage(text);
    } catch (error) {
      await failProtocol(
        connection,
        error instanceof Error ? error.message : 'Invalid realtime message.',
      );
      return;
    }

    if (message.matchId !== connection.principal.matchId) {
      sendError(
        connection.socket,
        new LivePvpError(
          'LIVE_ACTION_FORBIDDEN',
          'The connection cannot operate on another match.',
        ),
        message.messageId,
      );
      return;
    }

    if (
      connection.principal.role !== 'participant' ||
      connection.principal.participantGeneration === null
    ) {
      sendError(
        connection.socket,
        new LivePvpError(
          'LIVE_ACTION_FORBIDDEN',
          'Spectator connections cannot mutate a live match.',
        ),
        message.messageId,
      );
      return;
    }

    const mutationInput = {
      matchId: connection.principal.matchId,
      playerId: connection.principal.playerId,
      connectionGeneration: connection.principal.participantGeneration,
      messageId: message.messageId,
      expectedVersion: message.expectedVersion,
    };

    try {
      const result =
        message.type === 'action.submit'
          ? await service.submitAction({
              ...mutationInput,
              action: message.action,
            })
          : await service.resign(mutationInput);

      if (result.late) {
        sendError(
          connection.socket,
          new LivePvpError(
            'LIVE_ACTION_LATE',
            'The persisted decision deadline elapsed before this intent acquired authority.',
            true,
          ),
          message.messageId,
        );
        await sendSnapshot(connection);
        return;
      }

      send(connection.socket, result.acknowledgement);
      if (result.replayed) {
        await sendSnapshot(connection);
      }
    } catch (error) {
      const liveError = normalizeLiveError(error);
      sendError(connection.socket, liveError, message.messageId);
      if (isConnectionAuthorizationError(liveError)) {
        safeCloseForError(connection.socket, liveError, 'connection revoked');
      } else if (liveError.code === 'LIVE_VERSION_CONFLICT') {
        await sendSnapshot(connection);
      }
    }
  }

  async function sendSnapshot(connection: GatewayConnection): Promise<void> {
    try {
      const projection = await service.getProjectionForConnection(
        connection.principal,
      );
      send(connection.socket, {
        protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
        type: 'match.snapshot',
        eventId: randomUUID(),
        serverTime: new Date().toISOString(),
        version: projection.version,
        match: livePvpMatchForClient(
          projection,
          connection.supportsBattleSwaps,
        ),
      });
      if (projection.status === 'completed') {
        await closeCompletedConnection(connection);
      }
    } catch (error) {
      const liveError = normalizeLiveError(error);
      sendError(connection.socket, liveError);
      if (isConnectionAuthorizationError(liveError)) {
        safeCloseForError(connection.socket, liveError, 'connection revoked');
      }
    }
  }

  async function failProtocol(
    connection: GatewayConnection,
    detail: string,
  ): Promise<void> {
    if (connection.closed || connection.socket.readyState !== 1) return;
    sendProtocolError(connection.socket, detail);
    const cleanup = finalizeConnection(connection, 'transport_closed');
    safeClose(connection.socket, 4400, 'protocol error');
    await cleanup;
  }

  async function closeCompletedConnection(
    connection: GatewayConnection,
  ): Promise<void> {
    if (connection.closed) return;
    const cleanup = finalizeConnection(connection, 'match_completed');
    safeClose(connection.socket, 1000, 'match completed');
    await cleanup;
  }

  async function closeRedeemedAccess(
    principal: RedeemedLivePvpConnection,
    reason: 'transport_closed' | 'service_shutdown' | 'match_completed',
  ): Promise<void> {
    try {
      await service.closeConnectionAccess(principal.accessId, reason);
    } catch {
      logger.warn(
        { matchId: principal.matchId },
        'Live PvP redeemed access cleanup failed.',
      );
    }
  }

  async function finalizeConnection(
    connection: GatewayConnection,
    reason: 'transport_closed' | 'service_shutdown' | 'match_completed',
  ): Promise<void> {
    if (connection.closed) return;
    connection.closed = true;
    removeConnection(connection);
    try {
      await service.closeConnectionAccess(
        connection.principal.accessId,
        reason,
      );
    } catch {
      logger.warn(
        { matchId: connection.principal.matchId },
        'Live PvP connection access cleanup failed.',
      );
    }
    if (reason !== 'match_completed') {
      await gateway.broadcastPresence(connection.principal.matchId);
    }
  }

  const gateway: LivePvpGateway = {
    async register(app) {
      app.get(
        '/api/v1/realtime/live',
        {
          websocket: true,
          logLevel: 'silent',
        },
        (socket: WebSocket, request: FastifyRequest) => {
          void handleConnection(socket, request);
        },
      );
    },

    async broadcastMatch(matchId, committedVersion) {
      const matchConnections = connectionsByMatch.get(matchId);
      if (!matchConnections || matchConnections.size === 0) return;
      const eventMeta = await service.getCommittedEventMeta(
        matchId,
        committedVersion,
      );
      await Promise.all(
        [...matchConnections].map(async (connection) => {
          if (connection.closed || connection.socket.readyState !== 1) return;
          try {
            const projection = await service.getProjectionForConnection(
              connection.principal,
            );
            if (projection.version < committedVersion) return;
            if (projection.version === committedVersion && eventMeta) {
              send(connection.socket, {
                protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
                type: 'match.transition',
                eventId: eventMeta.eventId,
                previousVersion: Math.max(0, committedVersion - 1),
                version: committedVersion,
                serverTime: eventMeta.createdAt,
                match: livePvpMatchForClient(
                  projection,
                  connection.supportsBattleSwaps,
                ),
              });
            } else {
              send(connection.socket, {
                protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
                type: 'match.snapshot',
                eventId: randomUUID(),
                version: projection.version,
                serverTime: new Date().toISOString(),
                match: livePvpMatchForClient(
                  projection,
                  connection.supportsBattleSwaps,
                ),
              });
            }
            if (projection.status === 'completed') {
              await closeCompletedConnection(connection);
            }
          } catch (error) {
            const liveError = normalizeLiveError(error);
            if (isConnectionAuthorizationError(liveError)) {
              sendError(connection.socket, liveError);
              safeCloseForError(
                connection.socket,
                liveError,
                'connection revoked',
              );
              return;
            }
            logger.warn(
              { matchId, code: liveError.code },
              'Live PvP fan-out projection failed.',
            );
          }
        }),
      );
    },

    async broadcastPresence(matchId) {
      const matchConnections = connectionsByMatch.get(matchId);
      if (!matchConnections || matchConnections.size === 0) return;
      try {
        const presence = await service.getPresence(matchId);
        const serverTime = new Date().toISOString();
        const eventId = randomUUID();
        await Promise.all(
          [...matchConnections].map(async (connection) => {
            if (connection.closed || connection.socket.readyState !== 1) return;
            try {
              const projection = await service.getProjectionForConnection(
                connection.principal,
              );
              if (projection.status === 'completed') {
                send(connection.socket, {
                  protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
                  type: 'match.snapshot',
                  eventId,
                  version: projection.version,
                  serverTime,
                  match: livePvpMatchForClient(
                    projection,
                    connection.supportsBattleSwaps,
                  ),
                });
                await closeCompletedConnection(connection);
                return;
              }
              send(connection.socket, {
                protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
                type: 'presence.changed',
                eventId,
                version: projection.version,
                serverTime,
                participants: {
                  playerOneConnected: presence.playerOneConnected,
                  playerTwoConnected: presence.playerTwoConnected,
                },
                spectatorCount: presence.spectatorCount,
              });
            } catch (error) {
              const liveError = normalizeLiveError(error);
              if (isConnectionAuthorizationError(liveError)) {
                sendError(connection.socket, liveError);
                safeCloseForError(
                  connection.socket,
                  liveError,
                  'connection revoked',
                );
              }
              // Presence is advisory. Any other projection failure is repaired
              // by the next authoritative snapshot/transition or reconnect.
            }
          }),
        );
      } catch {
        logger.warn({ matchId }, 'Live PvP advisory presence refresh failed.');
      }
    },

    async recoverNotificationGap() {
      const all = [...connectionsByMatch.values()].flatMap((items) => [
        ...items,
      ]);
      await Promise.all(
        all.map(async (connection) => {
          if (connection.closed) return;
          const cleanup = finalizeConnection(connection, 'transport_closed');
          safeClose(connection.socket, 1012, 'reconnect required');
          await cleanup;
        }),
      );
    },

    async refreshConnections() {
      for (const matchId of [...connectionsByMatch.keys()]) {
        await gateway.broadcastPresence(matchId);
      }
    },

    async closeAll() {
      shuttingDown = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
      const all = [...connectionsByMatch.values()].flatMap((items) => [
        ...items,
      ]);
      await Promise.all(
        all.map(async (connection) => {
          safeClose(connection.socket, 1012, 'service restart');
          await finalizeConnection(connection, 'service_shutdown');
        }),
      );
      connectionsByMatch.clear();
    },

    connectionCount() {
      let count = 0;
      for (const items of connectionsByMatch.values()) count += items.size;
      return count;
    },
  };

  return gateway;
}

function readTicket(request: FastifyRequest): string | null {
  const query = request.query as Record<string, unknown>;
  return typeof query.ticket === 'string' && query.ticket.length <= 512
    ? query.ticket
    : null;
}

function readBattleSwaps(request: FastifyRequest): boolean {
  const query = request.query as Record<string, unknown>;
  return query.battleSwaps === '1';
}

export function parseLivePvpClientMessage(text: string): ClientMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Realtime messages must be valid JSON objects.');
  }
  if (!isRecord(parsed)) throw new Error('Realtime message must be an object.');
  if (parsed.protocolVersion !== LIVE_PVP_PROTOCOL_VERSION) {
    throw new Error('Unsupported live PvP protocol version.');
  }
  if (
    typeof parsed.matchId !== 'string' ||
    !UUID_PATTERN.test(parsed.matchId)
  ) {
    throw new Error('matchId must be a UUID.');
  }
  if (
    typeof parsed.messageId !== 'string' ||
    !UUID_PATTERN.test(parsed.messageId)
  ) {
    throw new Error('messageId must be a UUID.');
  }
  if (
    typeof parsed.expectedVersion !== 'number' ||
    !Number.isSafeInteger(parsed.expectedVersion) ||
    parsed.expectedVersion < 0
  ) {
    throw new Error('expectedVersion must be a non-negative integer.');
  }

  if (parsed.type === 'resign.submit') {
    assertExactKeys(parsed, [
      'protocolVersion',
      'type',
      'matchId',
      'messageId',
      'expectedVersion',
    ]);
    return parsed as unknown as ResignSubmitMessage;
  }

  if (parsed.type === 'action.submit') {
    assertExactKeys(parsed, [
      'protocolVersion',
      'type',
      'matchId',
      'messageId',
      'expectedVersion',
      'action',
    ]);
    const action = parseAction(parsed.action);
    return {
      protocolVersion: 1,
      type: 'action.submit',
      matchId: parsed.matchId,
      messageId: parsed.messageId,
      expectedVersion: parsed.expectedVersion,
      action,
    };
  }

  throw new Error('Unsupported live PvP message type.');
}

function parseAction(value: unknown): LiveClientAction {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('action must be a supported battle intent.');
  }
  if (
    value.type === 'select_initial_creature' ||
    value.type === 'select_replacement' ||
    value.type === 'swap_creature'
  ) {
    assertExactKeys(value, ['type', 'creatureId']);
    if (
      typeof value.creatureId !== 'string' ||
      !UUID_PATTERN.test(value.creatureId)
    ) {
      throw new Error('creatureId must be a UUID.');
    }
    return { type: value.type, creatureId: value.creatureId };
  }
  if (value.type === 'use_move') {
    assertExactKeys(value, ['type', 'moveId']);
    if (typeof value.moveId !== 'string' || !UUID_PATTERN.test(value.moveId)) {
      throw new Error('moveId must be a UUID.');
    }
    return { type: 'use_move', moveId: value.moveId };
  }
  if (value.type === 'use_power_card') {
    assertExactKeys(value, ['type', 'powerCardId']);
    if (
      typeof value.powerCardId !== 'string' ||
      !UUID_PATTERN.test(value.powerCardId)
    ) {
      throw new Error('powerCardId must be a UUID.');
    }
    return { type: 'use_power_card', powerCardId: value.powerCardId };
  }
  throw new Error(
    'Client-submitted timeout or result actions are not allowed.',
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new Error('Realtime messages cannot contain additional fields.');
  }
  if (allowed.some((key) => !(key in value))) {
    throw new Error('Realtime message is missing a required field.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendProtocolError(socket: WebSocket, detail: string): void {
  send(socket, {
    protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
    type: 'error',
    code: 'LIVE_ACTION_FORBIDDEN',
    detail,
    retryable: false,
    serverTime: new Date().toISOString(),
  });
}

function sendError(
  socket: WebSocket,
  error: LivePvpError,
  messageId?: string,
): void {
  send(socket, {
    protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
    type: 'error',
    ...(messageId ? { messageId } : {}),
    code: error.code,
    detail: error.message,
    retryable: error.retryable,
    serverTime: new Date().toISOString(),
  });
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify(payload));
}

function safeClose(socket: WebSocket, code: number, reason: string): void {
  try {
    if (socket.readyState === 0 || socket.readyState === 1) {
      socket.close(code, reason.slice(0, 100));
    }
  } catch {
    safeTerminate(socket);
  }
}

function safeTerminate(socket: WebSocket): void {
  try {
    socket.terminate();
  } catch {
    // Nothing else can be done for a failed transport.
  }
}

function isConnectionAuthorizationError(error: LivePvpError): boolean {
  return (
    error.code === 'LIVE_CONNECTION_SUPERSEDED' ||
    error.code === 'LIVE_AUTHENTICATION_REQUIRED'
  );
}

function safeCloseForError(
  socket: WebSocket,
  error: LivePvpError,
  fallbackReason: string,
): void {
  if (error.code === 'LIVE_CONNECTION_SUPERSEDED') {
    safeClose(socket, 4409, 'connection superseded');
    return;
  }
  if (
    error.code === 'LIVE_TICKET_EXPIRED' ||
    error.code === 'LIVE_TICKET_ALREADY_USED' ||
    error.code === 'LIVE_AUTHENTICATION_REQUIRED'
  ) {
    safeClose(socket, 4401, safeCloseReason(error));
    return;
  }
  safeClose(socket, 1011, fallbackReason);
}

function safeCloseReason(error: LivePvpError): string {
  if (error.code === 'LIVE_TICKET_EXPIRED') return 'ticket expired';
  if (error.code === 'LIVE_TICKET_ALREADY_USED') return 'ticket already used';
  return 'authentication failed';
}

function normalizeLiveError(error: unknown): LivePvpError {
  if (error instanceof LivePvpError) return error;
  return new LivePvpError(
    'LIVE_AUTHENTICATION_REQUIRED',
    'The live PvP operation could not be authorized.',
  );
}
