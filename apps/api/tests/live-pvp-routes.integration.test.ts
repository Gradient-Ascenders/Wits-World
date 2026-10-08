import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { LivePvpGateway } from '../src/matches/live-pvp-gateway.js';
import {
  LivePvpError,
  type LivePvpService,
} from '../src/matches/live-pvp-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const MATCH_ID = '20000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

let app: FastifyInstance;
let service: { [K in keyof LivePvpService]: ReturnType<typeof vi.fn> };

beforeEach(async () => {
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
  service = {
    mintConnectionTicket: vi.fn().mockResolvedValue({
      ticket: 'opaque-ticket-value-with-enough-random-characters',
      role: 'participant',
      protocolVersion: 1,
      expiresAt: '2026-09-17T22:01:00.000Z',
    }),
    redeemConnectionTicket: vi.fn(),
    closeConnectionAccess: vi.fn(),
    getProjection: vi.fn().mockResolvedValue({
      matchId: MATCH_ID,
      mode: 'live',
      role: 'participant',
      status: 'active',
      version: 4,
      phase: 'active',
      turnNumber: 2,
      currentActor: 'self',
      turnDeadline: '2026-09-17T22:01:00.000Z',
      consecutiveTimeouts: { self: 0, opponent: 1 },
      selfSide: 'playerOne',
      self: {},
      opponent: {},
      legalActions: [],
      history: [],
      lastAction: null,
      outcome: null,
      completionReason: null,
      startedAt: '2026-09-17T22:00:00.000Z',
      updatedAt: '2026-09-17T22:00:30.000Z',
      completedAt: null,
    }),
    getProjectionForConnection: vi.fn(),
    getPresence: vi.fn(),
    getCommittedEventMeta: vi.fn(),
    submitAction: vi.fn(),
    resign: vi.fn(),
    processOverdueMatch: vi.fn(),
    processOverdueUntilCurrent: vi.fn(),
    listDueMatchIds: vi.fn(),
    purgeTransientAccess: vi.fn(),
    finalizeAccountDeletion: vi.fn(),
  };
  const gateway: LivePvpGateway = {
    register: vi.fn().mockResolvedValue(undefined),
    broadcastMatch: vi.fn().mockResolvedValue(undefined),
    broadcastPresence: vi.fn().mockResolvedValue(undefined),
    recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
    closeAll: vi.fn().mockResolvedValue(undefined),
    connectionCount: vi.fn().mockReturnValue(0),
    refreshConnections: vi.fn().mockResolvedValue(undefined),
  };

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
});

afterEach(async () => app.close());

describe('live PvP HTTP routes', () => {
  it('redacts committed swaps for old participant HTTP clients', async () => {
    const base = await (
      service.getProjection as LivePvpService['getProjection']
    )({ matchId: MATCH_ID, playerId: PLAYER_ID });
    const swap = { type: 'swap_creature', creatureId: MATCH_ID };
    const move = { type: 'use_move', moveId: MATCH_ID };
    const history = [
      { type: 'participant_action', sequence: 3, action: move },
      { type: 'participant_action', sequence: 4, action: swap },
    ];
    service.getProjection.mockResolvedValue({
      ...base,
      legalActions: [swap, move],
      history,
      lastAction: history[1],
    });

    const url = `/api/v1/matches/live/${MATCH_ID}`;
    const legacy = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer valid-token' },
    });
    const current = await app.inject({
      method: 'GET',
      url,
      headers: {
        authorization: 'Bearer valid-token',
        accept: 'application/vnd.wits-world.live.v2+json',
      },
    });

    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().legalActions).toEqual([move]);
    expect(
      legacy
        .json()
        .history.map((entry: { sequence: number }) => entry.sequence),
    ).toEqual([3, 4]);
    expect(legacy.json().history[1].action).toBeNull();
    expect(legacy.json().lastAction.action).toBeNull();
    expect(legacy.json().version).toBe(base.version);
    expect(legacy.body).not.toContain('swap_creature');
    expect(current.statusCode).toBe(200);
    expect(current.json().legalActions).toEqual([swap, move]);
    expect(current.json().history[1].action).toEqual(swap);
    expect(current.json().lastAction.action).toEqual(swap);
  });

  it('redacts committed swaps for old spectator HTTP clients without dropping history', async () => {
    const swap = { type: 'swap_creature', creatureId: MATCH_ID };
    const history = [
      {
        type: 'participant_action',
        sequence: 3,
        action: { type: 'use_move', moveId: MATCH_ID },
      },
      { type: 'participant_action', sequence: 4, action: swap },
    ];
    const visibleParticipant = {
      playerName: 'player',
      activeCreature: null,
      defeatedCreatures: [],
      remainingCreatureCount: 2,
      playedPowerCards: [],
      remainingPowerCardCount: 1,
    };
    service.getProjection.mockResolvedValue({
      matchId: MATCH_ID,
      mode: 'live',
      role: 'spectator',
      status: 'active',
      version: 4,
      phase: 'active',
      turnNumber: 2,
      currentActor: 'playerOne',
      turnDeadline: '2026-09-17T22:01:00.000Z',
      consecutiveTimeouts: { playerOne: 0, playerTwo: 0 },
      playerOne: visibleParticipant,
      playerTwo: visibleParticipant,
      history,
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
    });

    const url = `/api/v1/matches/live/${MATCH_ID}`;
    const legacy = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer valid-token' },
    });
    const current = await app.inject({
      method: 'GET',
      url,
      headers: {
        authorization: 'Bearer valid-token',
        accept: 'application/vnd.wits-world.live.v2+json',
      },
    });

    expect(legacy.statusCode).toBe(200);
    expect(
      legacy
        .json()
        .history.map((entry: { sequence: number }) => entry.sequence),
    ).toEqual([3, 4]);
    expect(legacy.json().history[1].action).toBeNull();
    expect(legacy.json().version).toBe(4);
    expect(legacy.body).not.toContain('swap_creature');
    expect(current.statusCode).toBe(200);
    expect(current.json().history[1].action).toEqual(swap);
  });

  it('returns the authenticated player projection without accepting browser identity', async () => {
    const response = await request('GET', `/api/v1/matches/live/${MATCH_ID}`);

    expect(response.statusCode).toBe(200);
    expect(service.getProjection).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
    });
    expect(response.json()).toMatchObject({
      matchId: MATCH_ID,
      role: 'participant',
      version: 4,
      requestId: expect.any(String),
      serverTime: expect.any(String),
    });
  });

  it('mints a one-use role-bound ticket and returns only the configured WebSocket URL', async () => {
    const response = await request(
      'POST',
      `/api/v1/matches/live/${MATCH_ID}/connection-tickets`,
      { role: 'participant' },
    );

    expect(response.statusCode).toBe(201);
    expect(service.mintConnectionTicket).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      requestedRole: 'participant',
    });
    expect(response.json()).toMatchObject({
      role: 'participant',
      protocolVersion: 1,
      webSocketUrl: 'wss://api.example.test/api/v1/realtime/live',
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain('Bearer');
  });

  it('rejects browser-owned ticket identity or authority fields', async () => {
    const response = await request(
      'POST',
      `/api/v1/matches/live/${MATCH_ID}/connection-tickets`,
      { role: 'participant', playerId: PLAYER_ID, generation: 99 },
    );
    expect(response.statusCode).toBe(400);
    expect(service.mintConnectionTicket).not.toHaveBeenCalled();
  });

  it('maps participant spectator-downgrade rejection to a safe 403', async () => {
    service.mintConnectionTicket.mockRejectedValueOnce(
      new LivePvpError(
        'LIVE_ACTION_FORBIDDEN',
        'This connection cannot perform participant operations.',
      ),
    );
    const response = await request(
      'POST',
      `/api/v1/matches/live/${MATCH_ID}/connection-tickets`,
      { role: 'spectator' },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'LIVE_ACTION_FORBIDDEN' });
  });

  it('requires bearer authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matches/live/${MATCH_ID}`,
    });
    expect(response.statusCode).toBe(401);
  });
});

async function request(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
) {
  return await app.inject({
    method,
    url,
    headers: { authorization: 'Bearer test-token' },
    ...(payload === undefined ? {} : { payload }),
  });
}
