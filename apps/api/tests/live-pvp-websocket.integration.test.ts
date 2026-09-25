import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import { createLivePvpGateway } from '../src/matches/live-pvp-gateway.js';
import type {
  LivePvpParticipantProjection,
  LivePvpService,
} from '../src/matches/live-pvp-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const MOVE_ID = '44444444-4444-4444-8444-444444444444';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const projection: LivePvpParticipantProjection = {
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

type ServiceMock = {
  [K in keyof LivePvpService]: ReturnType<typeof vi.fn>;
};

let app: FastifyInstance;
let service: ServiceMock;

beforeEach(async () => {
  service = createService();
  const gateway = createLivePvpGateway(service as unknown as LivePvpService, {
    warn: vi.fn(),
    error: vi.fn(),
  });
  const verifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      issuer: authConfig.issuer,
      subject: 'auth0|live-player',
      connectionStrategy: 'auth0',
      playerName: 'live_player',
    }),
  };
  const resolve = vi.fn<PlayerIdentityService['resolve']>().mockResolvedValue({
    id: PLAYER_ID,
    role: 'player',
    playerName: 'live_player',
    lifecycleStatus: 'active',
  });

  app = await buildApp({
    authConfig,
    accessTokenVerifier: verifier,
    playerIdentityService: { resolve },
    livePvp: {
      service: service as unknown as LivePvpService,
      gateway,
      webSocketUrl: 'wss://api.example.test/api/v1/realtime/live',
    },
    logger: false,
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('live PvP Fastify WebSocket integration', () => {
  it('upgrades the registered route, redeems the ticket, and handles participant intent', async () => {
    let resolveRedemption!: (value: {
      accessId: string;
      matchId: string;
      playerId: string;
      role: 'participant';
      participantGeneration: number;
    }) => void;
    service.redeemConnectionTicket.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRedemption = resolve;
      }),
    );
    const socket = await app.injectWS(
      '/api/v1/realtime/live?ticket=opaque-ticket',
    );
    try {
      const readyMessage = nextJsonMessage(socket);
      resolveRedemption({
        accessId: '55555555-5555-4555-8555-555555555555',
        matchId: MATCH_ID,
        playerId: PLAYER_ID,
        role: 'participant',
        participantGeneration: 3,
      });
      const ready = await readyMessage;
      expect(ready).toMatchObject({
        protocolVersion: 1,
        type: 'connection.ready',
        role: 'participant',
        version: 7,
      });

      const acknowledgementMessage = nextJsonMessage(socket);
      socket.send(
        JSON.stringify({
          protocolVersion: 1,
          type: 'action.submit',
          matchId: MATCH_ID,
          messageId: MESSAGE_ID,
          expectedVersion: 7,
          action: { type: 'use_move', moveId: MOVE_ID },
        }),
      );
      const acknowledgement = await acknowledgementMessage;
      expect(acknowledgement).toMatchObject({
        protocolVersion: 1,
        type: 'action.acknowledged',
        messageId: MESSAGE_ID,
        version: 8,
      });
      expect(service.submitAction).toHaveBeenCalledWith({
        matchId: MATCH_ID,
        playerId: PLAYER_ID,
        connectionGeneration: 3,
        messageId: MESSAGE_ID,
        expectedVersion: 7,
        action: { type: 'use_move', moveId: MOVE_ID },
      });
    } finally {
      socket.terminate();
    }
  });
});

function createService(): ServiceMock {
  return {
    mintConnectionTicket: vi.fn(),
    redeemConnectionTicket: vi.fn().mockResolvedValue({
      accessId: '55555555-5555-4555-8555-555555555555',
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      role: 'participant',
      participantGeneration: 3,
    }),
    closeConnectionAccess: vi.fn().mockResolvedValue(undefined),
    getProjection: vi.fn(),
    getProjectionForConnection: vi.fn().mockResolvedValue(projection),
    getPresence: vi.fn().mockResolvedValue({
      playerOneConnected: true,
      playerTwoConnected: true,
      spectatorCount: 0,
    }),
    getCommittedEventMeta: vi.fn().mockResolvedValue(null),
    submitAction: vi.fn().mockResolvedValue({
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
    }),
    resign: vi.fn(),
    processOverdueMatch: vi.fn(),
    processOverdueUntilCurrent: vi.fn().mockResolvedValue(undefined),
    listDueMatchIds: vi.fn(),
    purgeTransientAccess: vi.fn(),
    finalizeAccountDeletion: vi.fn(),
  };
}

function nextJsonMessage(socket: {
  once(event: 'message', listener: (data: Buffer) => void): unknown;
}): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once('message', (data) => {
      resolve(JSON.parse(data.toString()) as unknown);
    });
  });
}
