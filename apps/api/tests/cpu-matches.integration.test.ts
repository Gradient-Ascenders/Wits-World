import type { FastifyInstance } from 'fastify';
import type { BattleState } from '@wits-world/game-rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  CpuMatchNotFoundError,
  CpuMatchActionError,
  createCpuMatchService,
  type CpuMatchDatabase,
  type CpuMatchClient,
  type CpuMatchHistory,
  type CpuMatchResponse,
  type CpuMatchService,
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
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;
let service: {
  createMatch: ReturnType<typeof vi.fn<CpuMatchService['createMatch']>>;
  forfeitMatch: ReturnType<typeof vi.fn<CpuMatchService['forfeitMatch']>>;
  getActiveMatch: ReturnType<typeof vi.fn<CpuMatchService['getActiveMatch']>>;
  getMatch: ReturnType<typeof vi.fn<CpuMatchService['getMatch']>>;
  submitAction: ReturnType<typeof vi.fn<CpuMatchService['submitAction']>>;
  listHistory: ReturnType<typeof vi.fn<CpuMatchService['listHistory']>>;
};

beforeEach(async () => {
  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'test-player',
      subject: 'auth0|cpu-player',
    }),
  };

  const resolvePlayer = vi
    .fn<PlayerIdentityService['resolve']>()
    .mockResolvedValue(activePlayer);

  service = {
    createMatch: vi.fn().mockResolvedValue(buildMatch()),
    forfeitMatch: vi.fn().mockResolvedValue({
      ...buildMatch(),
      status: 'completed',
      version: 1,
      winner: 'cpu',
      completedAt: '2026-08-16T00:01:00.000Z',
    }),
    getActiveMatch: vi.fn().mockResolvedValue(buildMatch()),
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
  it('serializes an engine power-change result for action, reload and resume responses', async () => {
    const participant = {
      creatures: [],
      powerCards: [],
      usedPowerCardIds: [],
      activeCreatureId: null,
    };
    const state: BattleState = {
      phase: 'completed',
      turnNumber: 7,
      currentSide: null,
      replacementSide: null,
      firstSide: 'player',
      selections: { player: null, cpu: null },
      winner: 'cpu',
      participants: { player: participant, cpu: participant },
    };
    const result = {
      side: 'cpu',
      action: { type: 'use_move', moveId: DECK_ID },
      winner: 'cpu',
      defeatedCreatureId: null,
      turnEnded: true,
      expiredEffects: [],
      effects: [
        {
          effectId: DECK_ID,
          effectType: 'debuff',
          effectCode: 'power_change',
          targetSide: 'player',
          targetCreatureId: PLAYER_ID,
          amount: -1000,
          damageMultiplier: null,
        },
      ],
    };
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: MATCH_ID,
          player_id: PLAYER_ID,
          state,
          status: 'completed',
          version: 7,
          winner: 'cpu',
          started_at: new Date('2026-08-16T00:00:00Z'),
          completed_at: new Date('2026-08-16T00:01:00Z'),
          turn_deadline: null,
          log_actions: [
            {
              result,
              roundNumber: 4,
              sequence: 7,
              roundStateBefore: state,
              roundStateAfter: state,
            },
          ],
        },
      ],
    });
    const realService = createCpuMatchService({
      connect: async () => ({
        query: query as CpuMatchClient['query'],
        release: vi.fn(),
      }),
    });
    const projected = await realService.getMatch(PLAYER_ID, MATCH_ID);
    service.getMatch.mockResolvedValue(projected);
    service.getActiveMatch.mockResolvedValue(projected);
    service.submitAction.mockResolvedValue(projected);
    for (const request of [
      { method: 'GET' as const, url: `/api/v1/matches/${MATCH_ID}` },
      { method: 'GET' as const, url: '/api/v1/matches/cpu' },
      {
        method: 'POST' as const,
        url: `/api/v1/matches/${MATCH_ID}/actions`,
        payload: {
          expectedVersion: 6,
          submissionId: PLAYER_ID,
          action: { type: 'use_move', moveId: DECK_ID },
        },
      },
    ]) {
      const response = await authenticatedRequest(request);
      expect(response.statusCode).toBe(200);
      expect(response.json().lastAction.effects).toEqual([
        {
          effectId: DECK_ID,
          effectType: 'debuff',
          targetSide: 'player',
          targetCreatureId: PLAYER_ID,
          amount: -1000,
          damageMultiplier: null,
          modifier: null,
        },
      ]);
    }
  });
  it('returns an API rejection when the service rejects an out-of-turn action', async () => {
    service.submitAction.mockRejectedValueOnce(
      new CpuMatchActionError(
        'The side cannot act during the current battle phase.',
      ),
    );
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/matches/${MATCH_ID}/actions`,
      payload: {
        expectedVersion: 1,
        submissionId: 'a4000000-0000-4000-8000-000000000001',
        action: {
          type: 'use_move',
          moveId: 'a5000000-0000-4000-8000-000000000001',
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'ILLEGAL_CPU_MATCH_ACTION' });
  });
  it('serializes stored engine effects on action responses and subsequent match loads', async () => {
    const effect = {
      effectId: 'effect-1',
      effectCode: 'damage' as const,
      effectType: 'damage' as const,
      targetSide: 'player' as const,
      targetCreatureId: 'creature-1',
      amount: 12,
      damageMultiplier: null,
    };
    const result = {
      side: 'cpu' as const,
      action: { type: 'use_move' as const, moveId: 'move-1' },
      effects: [effect],
      expiredEffects: [],
      defeatedCreatureId: null,
      winner: null,
      turnEnded: true,
    };
    const participant = {
      creatures: [],
      powerCards: [],
      usedPowerCardIds: [],
      activeCreatureId: null,
    };
    const state = {
      phase: 'active',
      turnNumber: 2,
      currentSide: 'player',
      replacementSide: null,
      firstSide: 'player',
      selections: { player: null, cpu: null },
      winner: null,
      participants: { player: participant, cpu: participant },
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: MATCH_ID,
            player_id: PLAYER_ID,
            status: 'active',
            version: 1,
            winner: null,
            started_at: new Date('2026-08-16T00:00:00Z'),
            completed_at: null,
            turn_deadline: null,
            state,
            card_names: {},
            log_actions: [
              {
                result,
                roundNumber: 1,
                roundStateBefore: state,
                roundStateAfter: state,
                sequence: 1,
              },
            ],
          },
        ],
      }),
    };
    const database: CpuMatchDatabase = {
      connect: vi.fn().mockResolvedValue({ ...client, release: vi.fn() }),
    };
    const persisted = await createCpuMatchService(database).getMatch(
      PLAYER_ID,
      MATCH_ID,
    );
    service.submitAction.mockResolvedValue(persisted);
    service.getMatch.mockResolvedValue(persisted);
    service.getActiveMatch.mockResolvedValue(persisted);
    for (const request of [
      {
        method: 'POST' as const,
        url: `/api/v1/matches/${MATCH_ID}/actions`,
        payload: {
          submissionId: 'a5000000-0000-4000-8000-000000000001',
          expectedVersion: 0,
          action: { type: 'select_initial_creature', creatureId: DECK_ID },
        },
      },
      { method: 'GET' as const, url: `/api/v1/matches/${MATCH_ID}` },
      { method: 'GET' as const, url: '/api/v1/matches/cpu' },
    ]) {
      const response = await authenticatedRequest(request);
      expect(response.statusCode).toBe(200);
      expect(response.json().lastAction.effects).toEqual([
        {
          effectId: effect.effectId,
          effectType: effect.effectType,
          targetSide: effect.targetSide,
          targetCreatureId: effect.targetCreatureId,
          amount: 12,
          damageMultiplier: null,
          modifier: null,
        },
      ]);
    }
  });

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

  it('requires authentication before recovering the active match', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/matches/cpu',
    });

    expect(response.statusCode).toBe(401);
    expect(service.getActiveMatch).not.toHaveBeenCalled();
  });

  it('recovers the authenticated player active match without a match ID', async () => {
    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/matches/cpu',
    });

    expect(response.statusCode).toBe(200);
    expect(service.getActiveMatch).toHaveBeenCalledWith(PLAYER_ID);
    expect(service.getMatch).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      matchId: MATCH_ID,
      status: 'active',
      version: 0,
      requestId: expect.any(String),
    });
  });

  it('returns the established not-found problem when no active match exists', async () => {
    service.getActiveMatch.mockRejectedValueOnce(new CpuMatchNotFoundError());

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/matches/cpu',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      status: 404,
      code: 'CPU_MATCH_NOT_FOUND',
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

  it('forfeits the current match with the authenticated player and expected version', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/matches/${MATCH_ID}/forfeit`,
      payload: { expectedVersion: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(service.forfeitMatch).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      matchId: MATCH_ID,
      expectedVersion: 0,
    });
    expect(response.json()).toMatchObject({
      matchId: MATCH_ID,
      status: 'completed',
      winner: 'cpu',
      requestId: expect.any(String),
    });
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

  it('publishes the active-match recovery contract in OpenAPI', async () => {
    await app.ready();
    const document = app.swagger();
    const operation = document.paths?.['/api/v1/matches/cpu']?.get;

    expect(operation?.operationId).toBe('getActiveCpuMatch');
    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
    expect(operation?.responses?.['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              status: { enum: ['active'] },
              winner: { type: 'null' },
              completedAt: { type: 'null' },
            },
          },
        },
      },
    });
    expect(operation?.responses?.['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              state: {
                properties: {
                  player: {
                    properties: {
                      creatures: {
                        items: {
                          properties: {
                            activeModifiers: { type: 'array' },
                            moves: {
                              items: {
                                properties: { effects: { type: 'array' } },
                              },
                            },
                          },
                        },
                      },
                      powerCards: {
                        items: {
                          properties: {
                            effects: { type: 'array' },
                            name: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(operation?.responses).toHaveProperty('401');
    expect(operation?.responses).toHaveProperty('403');
    expect(operation?.responses).toHaveProperty('404');
    expect(document.paths?.['/api/v1/matches/cpu']?.post?.operationId).toBe(
      'createCpuMatch',
    );
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
    battleLog: [],
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
