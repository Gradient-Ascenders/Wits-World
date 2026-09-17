import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLivePvpGateway,
  type LivePvpGateway,
} from '../src/matches/live-pvp-gateway.js';
import {
  LivePvpError,
  type LivePvpProjection,
  type LivePvpService,
} from '../src/matches/live-pvp-service.js';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const MOVE_ID = '44444444-4444-4444-8444-444444444444';

const participantProjection: LivePvpProjection = {
  matchId: MATCH_ID,
  mode: 'live',
  role: 'participant',
  status: 'active',
  version: 7,
  phase: 'active',
  turnNumber: 4,
  currentActor: 'self',
  turnDeadline: '2026-09-17T22:01:00.000Z',
  consecutiveTimeouts: { self: 0, opponent: 0 },
  self: {
    playerName: 'player_one',
    creatures: [],
    powerCards: [],
    usedPowerCardIds: [],
    activeCreatureId: null,
  },
  opponent: {
    playerName: 'player_two',
    activeCreature: null,
    defeatedCreatures: [],
    remainingCreatureCount: 3,
    playedPowerCards: [],
    remainingPowerCardCount: 2,
  },
  legalActions: [{ type: 'use_move', moveId: MOVE_ID }],
  lastAction: null,
  outcome: null,
  completionReason: null,
  startedAt: '2026-09-17T22:00:00.000Z',
  updatedAt: '2026-09-17T22:00:30.000Z',
  completedAt: null,
};

const spectatorProjection: LivePvpProjection = {
  matchId: MATCH_ID,
  mode: 'live',
  role: 'spectator',
  status: 'active',
  version: 7,
  phase: 'active',
  turnNumber: 4,
  currentActor: 'playerOne',
  turnDeadline: '2026-09-17T22:01:00.000Z',
  consecutiveTimeouts: { playerOne: 0, playerTwo: 0 },
  playerOne: {
    playerName: 'player_one',
    activeCreature: null,
    defeatedCreatures: [],
    remainingCreatureCount: 3,
    playedPowerCards: [],
    remainingPowerCardCount: 2,
  },
  playerTwo: {
    playerName: 'player_two',
    activeCreature: null,
    defeatedCreatures: [],
    remainingCreatureCount: 3,
    playedPowerCards: [],
    remainingPowerCardCount: 2,
  },
  history: [],
  presence: {
    playerOneConnected: true,
    playerTwoConnected: true,
    spectatorCount: 1,
  },
  completionReason: null,
  winner: null,
  startedAt: '2026-09-17T22:00:00.000Z',
  updatedAt: '2026-09-17T22:00:30.000Z',
  completedAt: null,
};

const openGateways: LivePvpGateway[] = [];

afterEach(async () => {
  await Promise.all(
    openGateways.splice(0).map((gateway) => gateway.closeAll()),
  );
});

describe('live PvP WebSocket gateway', () => {
  it('queues early client intent while asynchronous ticket redemption completes', async () => {
    const service = createService();
    let resolveRedemption!: (value: {
      accessId: string;
      matchId: string;
      playerId: string;
      role: 'participant';
      participantGeneration: number;
    }) => void;
    service.redeemConnectionTicket.mockReturnValue(
      new Promise((resolve) => {
        resolveRedemption = resolve;
      }),
    );
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    service.submitAction.mockResolvedValue({
      acknowledgement: {
        protocolVersion: 1,
        type: 'action.acknowledged',
        messageId: MESSAGE_ID,
        eventId: '99999999-9999-4999-8999-999999999999',
        version: 8,
        serverTime: '2026-09-17T22:00:40.000Z',
      },
      replayed: false,
      late: false,
    });

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    socket.emitMessage({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
    });
    await flushAsyncWork();
    expect(service.submitAction).not.toHaveBeenCalled();

    resolveRedemption({
      accessId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 2,
    });
    await flushAsyncWork();
    await flushAsyncWork();

    expect(service.submitAction).toHaveBeenCalledOnce();
    expect(
      messages(socket).map((message) => (message as { type?: string }).type),
    ).toEqual(
      expect.arrayContaining(['connection.ready', 'action.acknowledged']),
    );
    const messageTypes = messages(socket).map(
      (message) => (message as { type?: string }).type,
    );
    expect(messageTypes.indexOf('connection.ready')).toBeLessThan(
      messageTypes.indexOf('action.acknowledged'),
    );
  });

  it('redeems a participant ticket, resumes persisted state, and forwards intent only', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    service.submitAction.mockResolvedValue({
      acknowledgement: {
        protocolVersion: 1,
        type: 'action.acknowledged',
        messageId: MESSAGE_ID,
        eventId: '66666666-6666-4666-8666-666666666666',
        version: 8,
        serverTime: '2026-09-17T22:00:40.000Z',
      },
      replayed: false,
      late: false,
    });

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    expect(service.redeemConnectionTicket).toHaveBeenCalledWith(
      'opaque-ticket',
    );
    expect(service.processOverdueUntilCurrent).toHaveBeenCalledWith(MATCH_ID);
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'connection.ready',
        role: 'participant',
        version: 7,
        match: participantProjection,
      }),
    );

    socket.emitMessage({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
    });
    await flushAsyncWork();

    expect(service.submitAction).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      connectionGeneration: 3,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
    });
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'action.acknowledged',
        messageId: MESSAGE_ID,
        version: 8,
      }),
    );
  });

  it('lets a spectator resume public state but never enter participant mutation services', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '77777777-7777-4777-8777-777777777777',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'spectator',
      participantGeneration: null,
    });
    service.getProjectionForConnection.mockResolvedValue(spectatorProjection);

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    socket.emitMessage({
      protocolVersion: 1,
      type: 'resign.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
    });
    await flushAsyncWork();

    expect(service.submitAction).not.toHaveBeenCalled();
    expect(service.resign).not.toHaveBeenCalled();
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        messageId: MESSAGE_ID,
        code: 'LIVE_ACTION_FORBIDDEN',
      }),
    );
  });

  it('closes a spectator when persisted access is revoked on another instance', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'spectator',
      participantGeneration: null,
    });
    service.getProjectionForConnection
      .mockResolvedValueOnce(spectatorProjection)
      .mockResolvedValueOnce(spectatorProjection)
      .mockRejectedValueOnce(
        new LivePvpError(
          'LIVE_AUTHENTICATION_REQUIRED',
          'The realtime connection is no longer authorized.',
        ),
      );

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    await gateway.broadcastPresence(MATCH_ID);

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_AUTHENTICATION_REQUIRED',
      }),
    );
    expect(socket.closeCode).toBe(4401);
  });

  it('closes a remote stale participant when persisted generation validation reports supersession', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '88888888-8888-4888-8888-888888888888',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 1,
    });
    service.getProjectionForConnection
      .mockResolvedValueOnce(participantProjection)
      .mockRejectedValueOnce(
        new LivePvpError(
          'LIVE_CONNECTION_SUPERSEDED',
          'A newer participant connection is authoritative for this match.',
        ),
      );
    service.getCommittedEventMeta.mockResolvedValue(null);

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    await gateway.broadcastMatch(MATCH_ID, 7);

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_CONNECTION_SUPERSEDED',
      }),
    );
    expect(socket.closeCode).toBe(4409);
  });
});

type ServiceMock = {
  [K in keyof LivePvpService]: ReturnType<typeof vi.fn>;
};

function createService(): ServiceMock {
  return {
    mintConnectionTicket: vi.fn(),
    redeemConnectionTicket: vi.fn(),
    closeConnectionAccess: vi.fn().mockResolvedValue(undefined),
    getProjection: vi.fn(),
    getProjectionForConnection: vi.fn(),
    getPresence: vi.fn().mockResolvedValue({
      playerOneConnected: true,
      playerTwoConnected: true,
      spectatorCount: 1,
    }),
    getCommittedEventMeta: vi.fn(),
    submitAction: vi.fn(),
    resign: vi.fn(),
    processOverdueMatch: vi.fn(),
    processOverdueUntilCurrent: vi.fn().mockResolvedValue(undefined),
    listDueMatchIds: vi.fn(),
    purgeTransientAccess: vi.fn(),
    finalizeAccountDeletion: vi.fn(),
  };
}

async function registerGateway(service: ServiceMock): Promise<{
  gateway: LivePvpGateway;
  connect: (socket: FakeSocket, request: FastifyRequest) => void;
}> {
  let handler:
    ((socket: WebSocket, request: FastifyRequest) => void) | undefined;
  const app = {
    get: vi.fn(
      (
        _path: string,
        _options: Record<string, unknown>,
        routeHandler: (socket: WebSocket, request: FastifyRequest) => void,
      ) => {
        handler = routeHandler;
      },
    ),
  } as unknown as FastifyInstance;
  const gateway = createLivePvpGateway(service as unknown as LivePvpService, {
    warn: vi.fn(),
    error: vi.fn(),
  });
  await gateway.register(app);
  if (!handler)
    throw new Error('Gateway did not register its WebSocket route.');
  return {
    gateway,
    connect: (socket, request) =>
      handler!(socket as unknown as WebSocket, request),
  };
}

function ticketRequest(): FastifyRequest {
  return {
    query: { ticket: 'opaque-ticket' },
  } as unknown as FastifyRequest;
}

class FakeSocket {
  readyState = 1;
  closeCode: number | undefined;
  sent: string[] = [];
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: never[]) => void): this {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler as unknown as (...args: unknown[]) => void);
    this.handlers.set(event, existing);
    return this;
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  ping(): void {}

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = 3;
    this.emit('close');
  }

  terminate(): void {
    this.readyState = 3;
    this.emit('close');
  }

  emitMessage(payload: unknown): void {
    const raw = Buffer.from(JSON.stringify(payload));
    this.emit('message', raw as unknown as RawData, false);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

function messages(socket: FakeSocket): unknown[] {
  return socket.sent.map((payload) => JSON.parse(payload) as unknown);
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
