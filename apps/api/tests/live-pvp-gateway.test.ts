import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLivePvpGateway,
  type LivePvpGateway,
} from '../src/matches/live-pvp-gateway.js';
import {
  LivePvpError,
  type LivePvpParticipantProjection,
  type LivePvpProjection,
  type LivePvpService,
} from '../src/matches/live-pvp-service.js';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
// Obsidian Horn's deterministic catalogue UUID from migration 0041.
const MOVE_ID = 'ae6526b9-b164-210b-c746-c4af1b45747a';

const participantProjection: LivePvpParticipantProjection = {
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
  selfSide: 'playerOne',
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
  history: [],
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

const completedParticipantProjection: LivePvpParticipantProjection = {
  ...participantProjection,
  status: 'completed',
  version: 8,
  phase: 'completed',
  currentActor: null,
  turnDeadline: null,
  legalActions: [],
  outcome: 'win',
  completionReason: 'defeat',
  updatedAt: '2026-09-17T22:00:40.000Z',
  completedAt: '2026-09-17T22:00:40.000Z',
};

const openGateways: LivePvpGateway[] = [];

afterEach(async () => {
  await Promise.all(
    openGateways.splice(0).map((gateway) => gateway.closeAll()),
  );
});

describe('live PvP WebSocket gateway', () => {
  it('treats duplicate and stale notification versions as read-only hints', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 1,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    service.getCommittedEventMeta.mockResolvedValue(null);
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();
    const before = messages(socket).length;
    for (const version of [7, 7, 6, 8])
      await gateway.broadcastMatch(MATCH_ID, version);
    const after = messages(socket).slice(before) as {
      type: string;
      version: number;
    }[];
    expect(after).toHaveLength(3);
    expect(
      after.every(
        (message) => message.type === 'match.snapshot' && message.version === 7,
      ),
    ).toBe(true);
    expect(service.getCommittedEventMeta).toHaveBeenCalledTimes(4);
    expect(service.submitAction).not.toHaveBeenCalled();
    expect(service.resign).not.toHaveBeenCalled();
    expect(service.processOverdueMatch).not.toHaveBeenCalled();
  });
  it('waits for the notification subscription before loading the initial snapshot', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 1,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    let subscribed!: () => void;
    const prepareConnection = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          subscribed = resolve;
        }),
    );
    const onActivity = vi.fn();
    const { gateway, connect } = await registerGateway(service, {
      prepareConnection,
      onActivity,
    });
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();
    expect(prepareConnection).toHaveBeenCalledOnce();
    expect(gateway.connectionCount()).toBe(1);
    expect(onActivity).toHaveBeenCalledOnce();
    expect(service.getProjectionForConnection).not.toHaveBeenCalled();
    expect(messages(socket)).toEqual([]);
    subscribed();
    await flushAsyncWork();
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({ type: 'connection.ready', version: 7 }),
    );
  });

  it('bounds client intent queued while notification setup is pending', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 1,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    let resumeSetup!: () => void;
    const { gateway, connect } = await registerGateway(service, {
      prepareConnection: () =>
        new Promise<void>((resolve) => {
          resumeSetup = resolve;
        }),
    });
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    for (let index = 0; index < 17; index += 1) {
      socket.emitMessage({
        protocolVersion: 1,
        type: 'resign.submit',
        matchId: MATCH_ID,
        messageId: MESSAGE_ID,
        expectedVersion: 7,
      });
    }

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_ACTION_FORBIDDEN',
        detail: 'Too many messages arrived before connection setup completed.',
      }),
    );
    expect(socket.closeCode).toBe(4400);
    expect(service.resign).not.toHaveBeenCalled();
    resumeSetup();
    await flushAsyncWork();
    expect(service.resign).not.toHaveBeenCalled();
    expect(gateway.connectionCount()).toBe(0);
  });

  it('releases sockets after a terminal notification was missed instead of keeping idle work alive', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 1,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    const onActivity = vi.fn();
    const { gateway, connect } = await registerGateway(service, { onActivity });
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();
    service.getProjectionForConnection.mockResolvedValue(
      completedParticipantProjection,
    );
    await gateway.refreshConnections();
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'match.snapshot',
        match: expect.objectContaining({ status: 'completed' }),
      }),
    );
    expect(socket.closeCode).toBe(1000);
    expect(gateway.connectionCount()).toBe(0);
    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it.each([
    { battleSwaps: undefined, expectsSwap: false },
    { battleSwaps: '1', expectsSwap: true },
  ])('negotiates swap actions for the connection: %j', async (variant) => {
    const service = createService();
    const swapHistory = {
      type: 'participant_action',
      sequence: 7,
      action: { type: 'swap_creature', creatureId: MOVE_ID },
    };
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 1,
    });
    service.getProjectionForConnection.mockResolvedValue({
      ...participantProjection,
      legalActions: [
        { type: 'swap_creature', creatureId: MOVE_ID },
        { type: 'use_move', moveId: MOVE_ID },
      ],
      history: [swapHistory],
      lastAction: swapHistory,
    });
    service.getCommittedEventMeta.mockResolvedValue(null);

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    const request = {
      query: { ticket: 'opaque-ticket', battleSwaps: variant.battleSwaps },
    } as unknown as FastifyRequest;
    connect(socket, request);
    await flushAsyncWork();
    await gateway.broadcastMatch(MATCH_ID, participantProjection.version);

    const projections = messages(socket).filter(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        (message.type === 'connection.ready' ||
          message.type === 'match.snapshot'),
    ) as { match: LivePvpParticipantProjection }[];
    expect(projections).toHaveLength(2);
    for (const projection of projections) {
      expect(projection.match.legalActions).toEqual(
        variant.expectsSwap
          ? [
              { type: 'swap_creature', creatureId: MOVE_ID },
              { type: 'use_move', moveId: MOVE_ID },
            ]
          : [{ type: 'use_move', moveId: MOVE_ID }],
      );
      expect(projection.match.history).toHaveLength(1);
      expect(projection.match.history[0]).toMatchObject({ sequence: 7 });
      expect(projection.match.lastAction).toMatchObject({ sequence: 7 });
      if (variant.expectsSwap) {
        expect(projection.match.history[0]).toMatchObject({
          action: swapHistory.action,
        });
        expect(projection.match.lastAction).toMatchObject({
          action: swapHistory.action,
        });
      } else {
        expect(projection.match.history[0]).toMatchObject({ action: null });
        expect(projection.match.lastAction).toMatchObject({ action: null });
        expect(JSON.stringify(projection.match)).not.toContain('swap_creature');
      }
    }
  });

  it.each([
    { battleSwaps: undefined, expectsSwap: false },
    { battleSwaps: '1', expectsSwap: true },
  ])(
    'redacts spectator swap history by socket capability: %j',
    async (variant) => {
      const service = createService();
      const swapHistory = {
        type: 'participant_action',
        sequence: 7,
        action: { type: 'swap_creature', creatureId: MOVE_ID },
      };
      service.redeemConnectionTicket.mockResolvedValue({
        accessId: '55555555-5555-4555-8555-555555555555',
        matchId: MATCH_ID,
        playerId: PLAYER_ID,
        role: 'spectator',
        participantGeneration: null,
      });
      service.getProjectionForConnection.mockResolvedValue({
        ...spectatorProjection,
        history: [swapHistory],
      });
      service.getCommittedEventMeta.mockResolvedValue(null);

      const { gateway, connect } = await registerGateway(service);
      openGateways.push(gateway);
      const socket = new FakeSocket();
      connect(socket, {
        query: { ticket: 'opaque-ticket', battleSwaps: variant.battleSwaps },
      } as unknown as FastifyRequest);
      await flushAsyncWork();
      await gateway.broadcastMatch(MATCH_ID, spectatorProjection.version);

      const projections = messages(socket).filter(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          (message.type === 'connection.ready' ||
            message.type === 'match.snapshot'),
      ) as { match: LivePvpProjection }[];
      expect(projections).toHaveLength(2);
      for (const projection of projections) {
        expect(projection.match.version).toBe(7);
        expect(projection.match.history).toHaveLength(1);
        expect(projection.match.history[0]).toMatchObject({ sequence: 7 });
        if (variant.expectsSwap) {
          expect(projection.match.history[0]).toMatchObject({
            action: swapHistory.action,
          });
        } else {
          expect(projection.match.history[0]).toMatchObject({ action: null });
          expect(JSON.stringify(projection.match)).not.toContain(
            'swap_creature',
          );
        }
      }
    },
  );

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

  it('forwards a swap intent without trusting browser state', async () => {
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
    const creatureId = '77777777-7777-4777-8777-777777777777';
    socket.emitMessage({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'swap_creature', creatureId },
    });
    await flushAsyncWork();
    expect(service.submitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: PLAYER_ID,
        action: { type: 'swap_creature', creatureId },
      }),
    );
  });

  it('closes a participant after delivering an already-completed projection', async () => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(
      completedParticipantProjection,
    );

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

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'connection.ready',
        role: 'participant',
        version: 8,
        match: completedParticipantProjection,
      }),
    );
    expect(service.submitAction).not.toHaveBeenCalled();
    expect(socket.closeCode).toBe(1000);
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'match_completed',
    );
    expect(gateway.connectionCount()).toBe(0);
  });

  it('closes an active participant after broadcasting the final committed projection', async () => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection
      .mockResolvedValueOnce(participantProjection)
      .mockResolvedValueOnce(participantProjection)
      .mockResolvedValueOnce(completedParticipantProjection);
    service.getCommittedEventMeta.mockResolvedValue({
      eventId: '99999999-9999-4999-8999-999999999999',
      createdAt: '2026-09-17T22:00:40.000Z',
    });

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    await gateway.broadcastMatch(MATCH_ID, 8);

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'match.transition',
        version: 8,
        match: completedParticipantProjection,
      }),
    );
    expect(socket.closeCode).toBe(1000);
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'match_completed',
    );
    expect(gateway.connectionCount()).toBe(0);
  });

  it('does not run a queued valid action after a protocol failure begins closing the socket', async () => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    socket.deferCloseEvent = true;
    socket.emitMessage({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
      outcome: 'client-forged',
    });
    socket.emitMessage({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
    });
    await flushAsyncWork();

    expect(socket.closeCode).toBe(4400);
    expect(socket.readyState).toBe(2);
    expect(service.submitAction).not.toHaveBeenCalled();
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'transport_closed',
    );
    expect(gateway.connectionCount()).toBe(0);
    socket.finishClose();
  });

  it('closes redeemed durable access when catch-up fails before runtime setup completes', async () => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.processOverdueUntilCurrent.mockRejectedValue(
      new Error('catch-up failed'),
    );

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'transport_closed',
    );
    expect(service.getProjectionForConnection).not.toHaveBeenCalled();
    expect(socket.closeCode).toBe(4401);
    expect(gateway.connectionCount()).toBe(0);
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

  it('forces connected clients to reconnect after notification-listener recovery', async () => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);

    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    expect(gateway.connectionCount()).toBe(1);
    await gateway.recoverNotificationGap();

    expect(socket.closeCode).toBe(1012);
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'transport_closed',
    );
    expect(gateway.connectionCount()).toBe(0);
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

  it.each([
    {
      ticket: undefined,
      error: null,
      code: 'LIVE_AUTHENTICATION_REQUIRED',
      closeCode: 4401,
    },
    {
      ticket: 123,
      error: null,
      code: 'LIVE_AUTHENTICATION_REQUIRED',
      closeCode: 4401,
    },
    {
      ticket: 'x'.repeat(513),
      error: null,
      code: 'LIVE_AUTHENTICATION_REQUIRED',
      closeCode: 4401,
    },
    {
      ticket: 'expired-ticket',
      error: new LivePvpError('LIVE_TICKET_EXPIRED', 'Ticket expired.'),
      code: 'LIVE_TICKET_EXPIRED',
      closeCode: 4401,
    },
    {
      ticket: 'used-ticket',
      error: new LivePvpError(
        'LIVE_TICKET_ALREADY_USED',
        'Ticket was already used.',
      ),
      code: 'LIVE_TICKET_ALREADY_USED',
      closeCode: 4401,
    },
    {
      ticket: 'superseded-ticket',
      error: new LivePvpError(
        'LIVE_CONNECTION_SUPERSEDED',
        'A newer participant connection is authoritative for this match.',
      ),
      code: 'LIVE_CONNECTION_SUPERSEDED',
      closeCode: 4409,
    },
  ])(
    'rejects missing, invalid, or superseded connection tickets: $code',
    async (variant) => {
      const service = createService();
      if (variant.error)
        service.redeemConnectionTicket.mockRejectedValue(variant.error);
      const { gateway, connect } = await registerGateway(service);
      openGateways.push(gateway);
      const socket = new FakeSocket();
      connect(socket, {
        query: { ticket: variant.ticket },
      } as unknown as FastifyRequest);
      await flushAsyncWork();

      expect(messages(socket)).toContainEqual(
        expect.objectContaining({ type: 'error', code: variant.code }),
      );
      expect(socket.closeCode).toBe(variant.closeCode);
      expect(service.redeemConnectionTicket).toHaveBeenCalledTimes(
        typeof variant.ticket === 'string' && variant.ticket.length <= 512
          ? 1
          : 0,
      );
      expect(service.processOverdueUntilCurrent).not.toHaveBeenCalled();
      expect(service.getProjectionForConnection).not.toHaveBeenCalled();
      expect(service.closeConnectionAccess).not.toHaveBeenCalled();
      expect(gateway.connectionCount()).toBe(0);
    },
  );

  it('cleans up redeemed access after transport closure during redemption', async () => {
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
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    socket.finishClose();
    resolveRedemption({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    await flushAsyncWork();

    expect(service.processOverdueUntilCurrent).toHaveBeenCalledWith(MATCH_ID);
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      'transport_closed',
    );
    expect(service.getProjectionForConnection).not.toHaveBeenCalled();
    expect(gateway.connectionCount()).toBe(0);
  });

  it('cleans up an authorized connection when its initial projection fails', async () => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockRejectedValue(
      new Error('projection store unavailable'),
    );
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_AUTHENTICATION_REQUIRED',
      }),
    );
    expect(socket.closeCode).toBe(4401);
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'transport_closed',
    );
    expect(gateway.connectionCount()).toBe(0);
  });

  it('routes resign and reports late actions without acknowledging them', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection
      .mockResolvedValueOnce(participantProjection)
      .mockResolvedValueOnce(participantProjection)
      .mockResolvedValueOnce(participantProjection);
    service.resign.mockResolvedValue({
      acknowledgement: {
        protocolVersion: 1,
        type: 'resign.acknowledged',
        messageId: MESSAGE_ID,
        eventId: '66666666-6666-4666-8666-666666666666',
        version: 8,
        serverTime: '2026-09-17T22:00:40.000Z',
      },
      replayed: false,
      late: false,
    });
    const lateMessageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    service.submitAction.mockResolvedValue({
      acknowledgement: {
        protocolVersion: 1,
        type: 'action.acknowledged',
        messageId: lateMessageId,
        eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        version: 8,
        serverTime: '2026-09-17T22:00:40.000Z',
      },
      replayed: false,
      late: true,
    });
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
    expect(service.resign).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      connectionGeneration: 3,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
    });
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'resign.acknowledged',
        messageId: MESSAGE_ID,
      }),
    );

    socket.emitMessage({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: lateMessageId,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
    });
    await flushAsyncWork();

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_ACTION_LATE',
        messageId: lateMessageId,
        retryable: true,
      }),
    );
    expect(
      messages(socket).some(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'action.acknowledged',
      ),
    ).toBe(false);
    expect(
      messages(socket).some(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'match.snapshot',
      ),
    ).toBe(true);
    expect(gateway.connectionCount()).toBe(1);
  });

  it.each([
    { label: 'invalid JSON', raw: '{', binary: false },
    {
      label: 'binary payload',
      raw: JSON.stringify({ protocolVersion: 1 }),
      binary: true,
    },
  ])('rejects $label and revokes the active access', async (variant) => {
    const service = createService();
    const accessId = '55555555-5555-4555-8555-555555555555';
    service.redeemConnectionTicket.mockResolvedValue({
      accessId,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();
    socket.emitRawMessage(variant.raw, variant.binary);
    await flushAsyncWork();

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_ACTION_FORBIDDEN',
        retryable: false,
      }),
    );
    expect(socket.closeCode).toBe(4400);
    expect(service.submitAction).not.toHaveBeenCalled();
    expect(service.resign).not.toHaveBeenCalled();
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      accessId,
      'transport_closed',
    );
    expect(gateway.connectionCount()).toBe(0);
  });

  it.each([
    {
      label: 'oversized frame',
      payload: 'x'.repeat(16_385),
    },
    {
      label: 'unsupported message type',
      payload: JSON.stringify({
        protocolVersion: 1,
        type: 'action.cancel',
        matchId: MATCH_ID,
        messageId: MESSAGE_ID,
        expectedVersion: 7,
      }),
    },
    {
      label: 'missing action field',
      payload: JSON.stringify({
        protocolVersion: 1,
        type: 'action.submit',
        matchId: MATCH_ID,
        messageId: MESSAGE_ID,
        expectedVersion: 7,
      }),
    },
    {
      label: 'invalid move identifier',
      payload: JSON.stringify({
        protocolVersion: 1,
        type: 'action.submit',
        matchId: MATCH_ID,
        messageId: MESSAGE_ID,
        expectedVersion: 7,
        action: { type: 'use_move', moveId: 'not-a-uuid' },
      }),
    },
    {
      label: 'client-authored result action',
      payload: JSON.stringify({
        protocolVersion: 1,
        type: 'action.submit',
        matchId: MATCH_ID,
        messageId: MESSAGE_ID,
        expectedVersion: 7,
        action: { type: 'submit_result' },
      }),
    },
  ])('closes the connection for $label', async ({ payload }) => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();
    socket.emitRawMessage(payload);
    await flushAsyncWork();

    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_ACTION_FORBIDDEN',
        retryable: false,
      }),
    );
    expect(socket.closeCode).toBe(4400);
    expect(service.submitAction).not.toHaveBeenCalled();
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      'transport_closed',
    );
    expect(gateway.connectionCount()).toBe(0);
  });

  it('returns a snapshot for replayed or conflicted mutations and revokes unauthorized actions', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    service.submitAction
      .mockResolvedValueOnce({
        acknowledgement: {
          protocolVersion: 1,
          type: 'action.acknowledged',
          messageId: MESSAGE_ID,
          eventId: '66666666-6666-4666-8666-666666666666',
          version: 8,
          serverTime: '2026-09-17T22:00:40.000Z',
        },
        replayed: true,
        late: false,
      })
      .mockRejectedValueOnce(
        new LivePvpError('LIVE_VERSION_CONFLICT', 'Version changed.', true),
      )
      .mockRejectedValueOnce(
        new LivePvpError('LIVE_AUTHENTICATION_REQUIRED', 'Access revoked.'),
      );
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    const action = (messageId: string) => ({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: MOVE_ID },
    });
    socket.emitMessage(action(MESSAGE_ID));
    await flushAsyncWork();
    socket.emitMessage(action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    await flushAsyncWork();

    expect(
      messages(socket).filter(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'match.snapshot',
      ),
    ).toHaveLength(2);
    expect(gateway.connectionCount()).toBe(1);

    socket.emitMessage(action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
    await flushAsyncWork();
    expect(socket.closeCode).toBe(4401);
    expect(gateway.connectionCount()).toBe(0);
  });

  it('treats presence lookup failures as advisory and closes revoked fan-out connections', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    service.getPresence.mockRejectedValueOnce(
      new Error('presence unavailable'),
    );
    await gateway.broadcastPresence(MATCH_ID);
    expect(gateway.connectionCount()).toBe(1);
    expect(socket.closeCode).toBeUndefined();

    service.getCommittedEventMeta.mockResolvedValue(null);
    service.getProjectionForConnection.mockRejectedValueOnce(
      new LivePvpError('LIVE_AUTHENTICATION_REQUIRED', 'Access revoked.'),
    );
    await gateway.broadcastMatch(MATCH_ID, 8);
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_AUTHENTICATION_REQUIRED',
      }),
    );
    expect(socket.closeCode).toBe(4401);
  });

  it('replaces a local participant socket and cleans up the superseded access', async () => {
    const service = createService();
    service.redeemConnectionTicket
      .mockResolvedValueOnce({
        accessId: '55555555-5555-4555-8555-555555555555',
        matchId: MATCH_ID,
        playerId: PLAYER_ID,
        role: 'participant',
        participantGeneration: 1,
      })
      .mockResolvedValueOnce({
        accessId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        matchId: MATCH_ID,
        playerId: PLAYER_ID,
        role: 'participant',
        participantGeneration: 2,
      });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const olderSocket = new FakeSocket();
    const newerSocket = new FakeSocket();
    connect(olderSocket, ticketRequest());
    await flushAsyncWork();
    connect(newerSocket, ticketRequest());
    await flushAsyncWork();

    expect(messages(olderSocket)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'LIVE_CONNECTION_SUPERSEDED',
      }),
    );
    expect(olderSocket.closeCode).toBe(4409);
    expect(messages(newerSocket)).toContainEqual(
      expect.objectContaining({ type: 'connection.ready' }),
    );
    expect(service.closeConnectionAccess).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      'transport_closed',
    );
    expect(gateway.connectionCount()).toBe(1);
  });

  it('keeps connections available after a retryable non-authorization broadcast error', async () => {
    const service = createService();
    service.redeemConnectionTicket.mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    });
    service.getProjectionForConnection.mockResolvedValue(participantProjection);
    service.getCommittedEventMeta.mockResolvedValue(null);
    const { gateway, connect } = await registerGateway(service);
    openGateways.push(gateway);
    const socket = new FakeSocket();
    connect(socket, ticketRequest());
    await flushAsyncWork();

    service.getProjectionForConnection.mockRejectedValueOnce(
      new LivePvpError(
        'LIVE_VERSION_CONFLICT',
        'Projection changed during fan-out.',
        true,
      ),
    );
    await gateway.broadcastMatch(MATCH_ID, 8);
    expect(gateway.connectionCount()).toBe(1);
    expect(socket.closeCode).toBeUndefined();
    expect(service.closeConnectionAccess).not.toHaveBeenCalled();
    await gateway.broadcastPresence(MATCH_ID);
    expect(messages(socket)).toContainEqual(
      expect.objectContaining({ type: 'presence.changed' }),
    );
    expect(gateway.connectionCount()).toBe(1);
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

async function registerGateway(
  service: ServiceMock,
  options: Parameters<typeof createLivePvpGateway>[2] = {},
): Promise<{
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
  const gateway = createLivePvpGateway(
    service as unknown as LivePvpService,
    {
      warn: vi.fn(),
      error: vi.fn(),
    },
    options,
  );
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
  deferCloseEvent = false;
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
    this.readyState = 2;
    if (!this.deferCloseEvent) this.finishClose();
  }

  finishClose(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
  }

  terminate(): void {
    this.readyState = 3;
    this.emit('close');
  }

  emitMessage(payload: unknown): void {
    this.emitRawMessage(JSON.stringify(payload));
  }

  emitRawMessage(payload: string, isBinary = false): void {
    const raw = Buffer.from(payload);
    this.emit('message', raw as unknown as RawData, isBinary);
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
