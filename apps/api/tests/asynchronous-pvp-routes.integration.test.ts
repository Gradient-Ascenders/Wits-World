import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  AsyncPvpError,
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
    listActiveMatches: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    listHistory: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getMatch: vi.fn(),
    submitAction: vi.fn(),
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

  it('documents all nine protected operations', async () => {
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
    expect(paths['/api/v1/matches/pvp']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/history']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/{matchId}']?.get).toBeDefined();
    expect(paths['/api/v1/matches/pvp/{matchId}/actions']?.post).toBeDefined();
  });
});

function invitation(): PvpInvitationView {
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
    headers: { authorization: 'Bearer valid-token' },
    ...(payload ? { payload } : {}),
  });
}
