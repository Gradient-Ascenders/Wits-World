import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  CpuMatchHistory,
  CpuMatchResponse,
  CpuMatchService,
} from '../src/matches/cpu-match-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const MATCH_ID = 'a2000000-0000-4000-8000-000000000001';
const DECK_ID = 'a3000000-0000-4000-8000-000000000001';

const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;
let service: {
  createMatch: ReturnType<typeof vi.fn<CpuMatchService['createMatch']>>;
  getMatch: ReturnType<typeof vi.fn<CpuMatchService['getMatch']>>;
  submitAction: ReturnType<typeof vi.fn<CpuMatchService['submitAction']>>;
  listHistory: ReturnType<typeof vi.fn<CpuMatchService['listHistory']>>;
};

beforeEach(async () => {
  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      issuer: authConfig.issuer,
      subject: 'auth0|cpu-player',
    }),
  };

  const resolvePlayer = vi
    .fn<PlayerIdentityService['resolve']>()
    .mockResolvedValue(activePlayer);

  service = {
    createMatch: vi.fn().mockResolvedValue(buildMatch()),
    getMatch: vi.fn().mockResolvedValue(buildMatch()),
    submitAction: vi.fn().mockResolvedValue(buildMatch()),
    listHistory: vi.fn().mockResolvedValue([]),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: resolvePlayer,
    },
    cpuMatchService: service,
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('CPU match API', () => {
  it('requires authentication before creating a match', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/matches/cpu',
      payload: { deckId: DECK_ID },
    });

    expect(response.statusCode).toBe(401);
    expect(service.createMatch).not.toHaveBeenCalled();
  });

  it('derives the player from authentication and accepts only a deck ID', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/matches/cpu',
      payload: { deckId: DECK_ID },
    });

    expect(response.statusCode).toBe(201);
    expect(service.createMatch).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      deckId: DECK_ID,
    });
    expect(response.json()).toMatchObject({
      matchId: MATCH_ID,
      requestId: expect.any(String),
    });
  });

  it('returns a safe 500 for unexpected match creation failures', async () => {
    service.createMatch.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint'),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/matches/cpu',
      payload: { deckId: DECK_ID },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'The server could not complete the request.',
    });
    expect(response.body).not.toContain('duplicate key');
  });

  it('rejects client-supplied player and battle result fields', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/matches/cpu',
      payload: {
        deckId: DECK_ID,
        playerId: PLAYER_ID,
        winner: 'player',
        matchResult: 'completed',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(service.createMatch).not.toHaveBeenCalled();
  });

  it('submits an intended action with the authenticated player', async () => {
    const submissionId = 'a4000000-0000-4000-8000-000000000001';
    const creatureId = 'a5000000-0000-4000-8000-000000000001';

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/matches/${MATCH_ID}/actions`,
      payload: {
        submissionId,
        expectedVersion: 0,
        action: {
          type: 'select_initial_creature',
          creatureId,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(service.submitAction).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      matchId: MATCH_ID,
      submissionId,
      expectedVersion: 0,
      action: {
        type: 'select_initial_creature',
        creatureId,
      },
    });
  });

  it('rejects timeout as a browser action', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/matches/${MATCH_ID}/actions`,
      payload: {
        submissionId: 'a4000000-0000-4000-8000-000000000002',
        expectedVersion: 0,
        action: { type: 'timeout' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(service.submitAction).not.toHaveBeenCalled();
  });

  it('lists only the authenticated player history through the service boundary', async () => {
    const history: CpuMatchHistory[] = [];
    service.listHistory.mockResolvedValueOnce(history);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/matches/history',
    });

    expect(response.statusCode).toBe(200);
    expect(service.listHistory).toHaveBeenCalledWith(PLAYER_ID);
    expect(response.json()).toMatchObject({
      matches: [],
      requestId: expect.any(String),
    });
  });
});

async function authenticatedRequest(options: {
  method: 'GET' | 'POST';
  url: string;
  payload?: Record<string, unknown>;
}) {
  const headers = { authorization: 'Bearer valid-token' };

  if (options.payload === undefined) {
    return app.inject({
      method: options.method,
      url: options.url,
      headers,
    });
  }

  return app.inject({
    method: options.method,
    url: options.url,
    headers,
    payload: options.payload,
  });
}

function buildMatch(): CpuMatchResponse {
  return {
    matchId: MATCH_ID,
    status: 'active',
    version: 0,
    winner: null,
    startedAt: '2026-08-16T00:00:00.000Z',
    completedAt: null,
    state: {
      phase: 'initial_selection',
      turnNumber: 0,
      currentSide: null,
      replacementSide: null,
      firstSide: null,
      selections: { player: null, cpu: null },
      player: {
        creatures: [],
        powerCards: [],
        usedPowerCardIds: [],
        activeCreatureId: null,
      },
      cpu: {
        activeCreature: null,
        defeatedCreatures: [],
        remainingCreatureCount: 3,
        usedPowerCardIds: [],
        remainingPowerCardCount: 2,
      },
      legalActions: [],
      turnDeadline: null,
    },
    lastAction: null,
  };
}
