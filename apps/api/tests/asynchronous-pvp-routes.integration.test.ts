import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  AsyncPvpError,
  type AsyncPvpMatchView,
  type AsyncPvpService,
  type PvpInvitationView,
} from '../src/matches/asynchronous-pvp-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};
const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const INVITATION_ID = 'a2000000-0000-4000-8000-000000000001';
const DECK_ID = 'a3000000-0000-4000-8000-000000000001';
const CREATURE_ID = 'a4000000-0000-4000-8000-000000000001';
const SUBMISSION_ID = 'a5000000-0000-4000-8000-000000000001';
const PVP_ACCEPT =
  'application/vnd.wits-world.pvp.v3+json, application/vnd.wits-world.pvp.v2+json;q=0.9, application/json;q=0.8';
const PVP_V2_ACCEPT = 'application/vnd.wits-world.pvp.v2+json';

let app: FastifyInstance;
let service: { [K in keyof AsyncPvpService]: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  const verifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      issuer: authConfig.issuer,
      subject: 'auth0|pvp-player',
      connectionStrategy: 'auth0',
      playerName: 'self_player',
    }),
  };
  const resolve = vi.fn<PlayerIdentityService['resolve']>().mockResolvedValue({
    id: PLAYER_ID,
    role: 'player',
    playerName: 'self_player',
    lifecycleStatus: 'active',
  });
  service = {
    findPlayer: vi.fn().mockResolvedValue('opponent_player'),
    createInvitation: vi.fn().mockResolvedValue(invitation()),
    listInvitations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    listActiveMatches: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    listHistory: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getMatch: vi.fn(),
    submitAction: vi.fn(),
    resignMatch: vi.fn(),
    expireInvitation: vi.fn(),
    forfeitOverdueMatch: vi.fn(),
    finalizeAccountDeletion: vi.fn(),
  };
  app = await buildApp({
    authConfig,
    accessTokenVerifier: verifier,
    playerIdentityService: { resolve },
    asyncPvpService: service as unknown as AsyncPvpService,
    logger: false,
  });
});

afterEach(async () => app.close());

describe('asynchronous PvP routes', () => {
  it('performs exact lookup without exposing an internal player ID', async () => {
    const response = await request(
      'GET',
      '/api/v1/matches/pvp/players?playerName=Opponent_Player',
    );

    expect(response.statusCode).toBe(200);
    expect(service.findPlayer).toHaveBeenCalledWith(
      PLAYER_ID,
      'opponent_player',
    );
    expect(response.json()).toEqual({
      playerName: 'opponent_player',
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain(PLAYER_ID);
  });

  it('derives the challenger and rejects browser-owned result fields', async () => {
    const valid = await request('POST', '/api/v1/matches/pvp/invitations', {
      opponentPlayerName: 'opponent_player',
      deckId: DECK_ID,
      initialCreatureId: CREATURE_ID,
      submissionId: SUBMISSION_ID,
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json()).toMatchObject({
      invitation: { canCancel: true, direction: 'outgoing', status: 'pending' },
    });
    expect(service.createInvitation).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      opponentPlayerName: 'opponent_player',
      deckId: DECK_ID,
      initialCreatureId: CREATURE_ID,
      submissionId: SUBMISSION_ID,
    });

    const invalid = await request('POST', '/api/v1/matches/pvp/invitations', {
      opponentPlayerName: 'opponent_player',
      deckId: DECK_ID,
      initialCreatureId: CREATURE_ID,
      submissionId: SUBMISSION_ID,
      challengerPlayerId: PLAYER_ID,
      eligible: true,
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('lets only the authenticated challenger cancel a pending invitation', async () => {
    service.cancelInvitation.mockResolvedValueOnce(
      invitation({
        status: 'cancelled',
        version: 1,
        respondedAt: '2026-08-30T01:00:00.000Z',
      }),
    );

    const response = await request(
      'POST',
      `/api/v1/matches/pvp/invitations/${INVITATION_ID}/cancel`,
      { submissionId: SUBMISSION_ID, expectedVersion: 0 },
    );

    expect(response.statusCode).toBe(200);
    expect(service.cancelInvitation).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      invitationId: INVITATION_ID,
      submissionId: SUBMISSION_ID,
      expectedVersion: 0,
    });
    expect(response.json()).toMatchObject({
      invitation: {
        canCancel: false,
        direction: 'outgoing',
        opponent: { playerName: 'opponent_player' },
        status: 'cancelled',
        version: 1,
      },
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain(PLAYER_ID);

    const invalid = await request(
      'POST',
      `/api/v1/matches/pvp/invitations/${INVITATION_ID}/cancel`,
      {
        submissionId: SUBMISSION_ID,
        expectedVersion: 0,
        recipientPlayerId: PLAYER_ID,
        result: 'cancelled',
      },
    );
    expect(invalid.statusCode).toBe(400);
    expect(service.cancelInvitation).toHaveBeenCalledTimes(1);
  });

  it('keeps pre-cancellation clients safe from the new operation and status', async () => {
    const legacyHeaders = {
      accept: PVP_V2_ACCEPT,
      authorization: 'Bearer valid-token',
    };
    const unsupported = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/pvp/invitations/${INVITATION_ID}/cancel`,
      headers: legacyHeaders,
      payload: { submissionId: SUBMISSION_ID, expectedVersion: 0 },
    });
    expect(unsupported.statusCode).toBe(409);
    expect(unsupported.json()).toMatchObject({
      code: 'PVP_CLIENT_UPDATE_REQUIRED',
    });
    expect(service.cancelInvitation).not.toHaveBeenCalled();

    service.listInvitations.mockResolvedValue({
      items: [
        invitation({
          status: 'cancelled',
          version: 1,
          respondedAt: '2026-08-30T01:00:00.000Z',
        }),
      ],
      nextCursor: null,
    });
    const legacyList = await app.inject({
      method: 'GET',
      url: '/api/v1/matches/pvp/invitations?direction=outgoing',
      headers: legacyHeaders,
    });
    expect(legacyList.statusCode).toBe(409);
    expect(legacyList.json()).toMatchObject({
      code: 'PVP_CLIENT_UPDATE_REQUIRED',
    });

    const currentList = await request(
      'GET',
      '/api/v1/matches/pvp/invitations?direction=outgoing',
    );
    expect(currentList.statusCode).toBe(200);
    expect(currentList.json()).toMatchObject({
      invitations: [{ canCancel: false, status: 'cancelled' }],
    });
  });

  it('requires authentication before resolving a cancellation challenger', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/pvp/invitations/${INVITATION_ID}/cancel`,
      headers: { accept: PVP_ACCEPT },
      payload: { submissionId: SUBMISSION_ID, expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(401);
    expect(service.cancelInvitation).not.toHaveBeenCalled();
  });

  it('rejects timeout and initial-selection actions at the PvP action route', async () => {
    for (const action of [
      { type: 'timeout' },
      { type: 'select_initial_creature', creatureId: CREATURE_ID },
    ]) {
      const response = await request(
        'POST',
        `/api/v1/matches/pvp/${INVITATION_ID}/actions`,
        {
          submissionId: SUBMISSION_ID,
          expectedVersion: 0,
          action,
        },
      );
      expect(response.statusCode).toBe(400);
    }
    expect(service.submitAction).not.toHaveBeenCalled();
  });

  it('derives resignation availability, loser, and winner on the server', async () => {
    service.getMatch.mockResolvedValueOnce(match());
    service.resignMatch.mockResolvedValueOnce(
      match({
        status: 'completed',
        currentActor: null,
        turnDeadline: null,
        outcome: 'loss',
        completionReason: 'voluntary_resignation',
        completedAt: '2026-09-05T10:00:00.000Z',
        version: 4,
      }),
    );

    const active = await request('GET', `/api/v1/matches/pvp/${INVITATION_ID}`);
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({ canResign: true, status: 'active' });

    const resigned = await request(
      'POST',
      `/api/v1/matches/pvp/${INVITATION_ID}/resign`,
      { submissionId: SUBMISSION_ID, expectedVersion: 3 },
    );
    expect(resigned.statusCode).toBe(200);
    expect(service.resignMatch).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      matchId: INVITATION_ID,
      submissionId: SUBMISSION_ID,
      expectedVersion: 3,
    });
    expect(resigned.json()).toMatchObject({
      canResign: false,
      completionReason: 'voluntary_resignation',
      outcome: 'loss',
      status: 'completed',
    });
    expect(resigned.body).not.toContain(PLAYER_ID);

    const invalid = await request(
      'POST',
      `/api/v1/matches/pvp/${INVITATION_ID}/resign`,
      {
        submissionId: SUBMISSION_ID,
        expectedVersion: 3,
        winner: 'self',
        resigningPlayerId: PLAYER_ID,
      },
    );
    expect(invalid.statusCode).toBe(400);
    expect(service.resignMatch).toHaveBeenCalledTimes(1);
  });

  it('does not advertise resignation after an overdue detail read is finalized', async () => {
    service.getMatch.mockResolvedValueOnce(
      match({
        status: 'completed',
        currentActor: null,
        turnDeadline: null,
        outcome: 'loss',
        completionReason: 'turn_forfeit',
        completedAt: '2026-09-06T10:00:00.000Z',
        version: 4,
      }),
    );

    const response = await request(
      'GET',
      `/api/v1/matches/pvp/${INVITATION_ID}`,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      canResign: false,
      completionReason: 'turn_forfeit',
      status: 'completed',
    });
  });

  it('keeps legacy clients safe throughout the resignation rollout', async () => {
    service.getMatch.mockResolvedValueOnce(match()).mockResolvedValueOnce(
      match({
        status: 'completed',
        currentActor: null,
        turnDeadline: null,
        outcome: 'loss',
        completionReason: 'voluntary_resignation',
        completedAt: '2026-09-05T10:00:00.000Z',
        version: 4,
      }),
    );

    const legacyHeaders = { authorization: 'Bearer valid-token' };
    const active = await app.inject({
      method: 'GET',
      url: `/api/v1/matches/pvp/${INVITATION_ID}`,
      headers: legacyHeaders,
    });
    expect(active.statusCode).toBe(200);
    expect(active.json()).not.toHaveProperty('canResign');

    const unsupported = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/pvp/${INVITATION_ID}/resign`,
      headers: legacyHeaders,
      payload: { submissionId: SUBMISSION_ID, expectedVersion: 3 },
    });
    expect(unsupported.statusCode).toBe(409);
    expect(unsupported.json()).toMatchObject({
      code: 'PVP_CLIENT_UPDATE_REQUIRED',
    });
    expect(service.resignMatch).not.toHaveBeenCalled();

    const completed = await app.inject({
      method: 'GET',
      url: `/api/v1/matches/pvp/${INVITATION_ID}`,
      headers: legacyHeaders,
    });
    expect(completed.statusCode).toBe(409);
    expect(completed.json()).toMatchObject({
      code: 'PVP_CLIENT_UPDATE_REQUIRED',
    });

    service.listHistory.mockResolvedValueOnce({
      items: [
        {
          matchId: INVITATION_ID,
          mode: 'asynchronous',
          status: 'completed',
          opponent: { playerName: 'opponent_player' },
          outcome: 'loss',
          completionReason: 'voluntary_resignation',
          startedAt: '2026-09-05T08:00:00.000Z',
          completedAt: '2026-09-05T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/matches/pvp/history',
      headers: legacyHeaders,
    });
    expect(history.statusCode).toBe(409);
    expect(history.json()).toMatchObject({
      code: 'PVP_CLIENT_UPDATE_REQUIRED',
    });
  });

  it('requires authentication before resolving a resignation participant', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/pvp/${INVITATION_ID}/resign`,
      headers: { accept: PVP_ACCEPT },
      payload: { submissionId: SUBMISSION_ID, expectedVersion: 3 },
    });

    expect(response.statusCode).toBe(401);
    expect(service.resignMatch).not.toHaveBeenCalled();
  });

  it('maps unavailable players and publishes static history before match detail', async () => {
    service.findPlayer.mockRejectedValueOnce(
      new AsyncPvpError(
        'PVP_PLAYER_UNAVAILABLE',
        'The requested player is unavailable.',
      ),
    );
    const unavailable = await request(
      'GET',
      '/api/v1/matches/pvp/players?playerName=missing_player',
    );
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toMatchObject({
      code: 'PVP_PLAYER_UNAVAILABLE',
    });

    const history = await request('GET', '/api/v1/matches/pvp/history');
    expect(history.statusCode).toBe(200);
    expect(service.listHistory).toHaveBeenCalled();
    expect(service.getMatch).not.toHaveBeenCalled();
  });

  it('documents all eleven protected operations', async () => {
    await app.ready();
    const paths = app.swagger().paths ?? {};
    expect(paths['/api/v1/matches/pvp/players']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/invitations']?.post).toBeDefined();
    expect(paths['/api/v1/matches/pvp/invitations']?.get).toBeDefined();
    expect(
      paths['/api/v1/matches/pvp/invitations/{invitationId}/accept']?.post,
    ).toBeDefined();
    expect(
      paths['/api/v1/matches/pvp/invitations/{invitationId}/decline']?.post,
    ).toBeDefined();
    const cancellationOperation =
      paths['/api/v1/matches/pvp/invitations/{invitationId}/cancel']?.post;
    expect(cancellationOperation).toBeDefined();
    expect(JSON.stringify(cancellationOperation)).toContain(
      'application/vnd.wits-world.pvp.v3+json',
    );
    expect(paths['/api/v1/matches/pvp']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/history']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/{matchId}']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/{matchId}/actions']?.post).toBeDefined();
    const resignationOperation =
      paths['/api/v1/matches/pvp/{matchId}/resign']?.post;
    expect(resignationOperation).toBeDefined();
    expect(JSON.stringify(resignationOperation)).toContain(
      'application/vnd.wits-world.pvp.v2+json',
    );
  });
});

function match(overrides: Partial<AsyncPvpMatchView> = {}): AsyncPvpMatchView {
  const status = overrides.status ?? 'active';
  const completed = status === 'completed';
  return {
    matchId: INVITATION_ID,
    mode: 'asynchronous',
    status,
    version: 3,
    opponent: { playerName: 'opponent_player' },
    currentActor: completed ? null : 'self',
    turnDeadline: completed ? null : '2026-09-06T10:00:00.000Z',
    state: {
      phase: completed ? 'completed' : 'active',
      turnNumber: 2,
      self: {
        playerName: 'self_player',
        creatures: [],
        powerCards: [],
        usedPowerCardIds: [],
        activeCreatureId: null,
      },
      opponent: {
        playerName: 'opponent_player',
        activeCreature: null,
        defeatedCreatures: [],
        remainingCreatureCount: 0,
        playedPowerCards: [],
        remainingPowerCardCount: 0,
      },
    },
    legalActions: [],
    lastAction: null,
    outcome: completed ? 'loss' : null,
    completionReason: completed ? 'voluntary_resignation' : null,
    startedAt: '2026-09-05T08:00:00.000Z',
    updatedAt: '2026-09-05T09:00:00.000Z',
    completedAt: completed ? '2026-09-05T10:00:00.000Z' : null,
    ...overrides,
  };
}

function invitation(
  overrides: Partial<PvpInvitationView> = {},
): PvpInvitationView {
  return {
    invitationId: INVITATION_ID,
    direction: 'outgoing',
    status: 'pending',
    version: 0,
    opponent: { playerName: 'opponent_player' },
    createdAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-08-31T00:00:00.000Z',
    respondedAt: null,
    matchId: null,
    ...overrides,
  };
}

function request(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: {
      accept: PVP_ACCEPT,
      authorization: 'Bearer valid-token',
    },
    ...(payload ? { payload } : {}),
  });
}
