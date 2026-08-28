import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import type { ProgressionReadService } from '../src/progression/progression-read-service.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const PLAYER_ID = '17200000-0000-4000-8000-000000000001';
const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  playerName: 'current-player',
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;
let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;
let service: {
  getCurrentProfile: ReturnType<
    typeof vi.fn<ProgressionReadService['getCurrentProfile']>
  >;
  listStandings: ReturnType<
    typeof vi.fn<ProgressionReadService['listStandings']>
  >;
};

beforeEach(async () => {
  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'current-player',
      subject: 'auth0|progression-player',
    }),
  };
  resolvePlayer = vi
    .fn<PlayerIdentityService['resolve']>()
    .mockResolvedValue(activePlayer);
  service = {
    getCurrentProfile: vi.fn().mockResolvedValue({
      playerName: 'current-player',
      points: 75,
      rank: 4,
      currentStreak: 2,
      longestStreak: 3,
      achievements: [
        {
          code: 'first_quiz',
          title: 'First Quiz',
          description: 'Complete your first event quiz.',
          earned: true,
          progress: 2,
          target: 1,
        },
      ],
    }),
    listStandings: vi.fn().mockResolvedValue({
      period: 'all_time',
      month: null,
      entries: [entry('leader', 100, 1), entry('current-player', 75, 4, true)],
      currentPlayer: entry('current-player', 75, 4, true),
      pagination: {
        page: 1,
        pageSize: 20,
        totalPlayers: 4,
        totalPages: 1,
      },
    }),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: { resolve: resolvePlayer },
    progressionReadService: service,
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('progression API', () => {
  it('requires authentication for profile and standings', async () => {
    for (const url of [
      '/api/v1/progression/me',
      '/api/v1/progression/standings',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
    }

    expect(service.getCurrentProfile).not.toHaveBeenCalled();
    expect(service.listStandings).not.toHaveBeenCalled();
  });

  it('returns only the authenticated player private progression state', async () => {
    const response = await authenticatedGet('/api/v1/progression/me');

    expect(response.statusCode).toBe(200);
    expect(service.getCurrentProfile).toHaveBeenCalledWith(PLAYER_ID);
    expect(response.json()).toEqual({
      playerName: 'current-player',
      points: 75,
      rank: 4,
      currentStreak: 2,
      longestStreak: 3,
      achievements: [
        {
          code: 'first_quiz',
          title: 'First Quiz',
          description: 'Complete your first event quiz.',
          earned: true,
          progress: 2,
          target: 1,
        },
      ],
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain(PLAYER_ID);
    expect(response.body).not.toContain('auth0');
    expect(response.body).not.toContain('email');
    expect(response.body).not.toContain('location');
  });

  it('returns the requested page and current-player rank', async () => {
    service.listStandings.mockResolvedValueOnce({
      period: 'monthly',
      month: '2026-08',
      entries: [entry('leader', 50, 1)],
      currentPlayer: entry('current-player', 10, 7, true),
      pagination: {
        page: 2,
        pageSize: 5,
        totalPlayers: 8,
        totalPages: 2,
      },
    });

    const response = await authenticatedGet(
      '/api/v1/progression/standings?period=monthly&month=2026-08&page=2&pageSize=5',
    );

    expect(response.statusCode).toBe(200);
    expect(service.listStandings).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      period: 'monthly',
      month: '2026-08',
      page: 2,
      pageSize: 5,
    });
    expect(response.json()).toMatchObject({
      period: 'monthly',
      month: '2026-08',
      entries: [{ playerName: 'leader', rank: 1 }],
      currentPlayer: { playerName: 'current-player', rank: 7 },
      pagination: { page: 2, pageSize: 5, totalPlayers: 8, totalPages: 2 },
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain(PLAYER_ID);
  });

  it('applies safe all-time pagination defaults', async () => {
    const response = await authenticatedGet('/api/v1/progression/standings');

    expect(response.statusCode).toBe(200);
    expect(service.listStandings).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      period: 'all_time',
      page: 1,
      pageSize: 20,
    });
  });

  it.each([
    '?period=monthly',
    '?period=all_time&month=2026-08',
    '?period=monthly&month=0000-08',
    '?period=monthly&month=2026-13',
    '?page=0',
    '?page=10001',
    '?pageSize=101',
    '?playerId=attacker-selected-player',
  ])('rejects invalid or browser-authoritative query %s', async (query) => {
    const response = await authenticatedGet(
      `/api/v1/progression/standings${query}`,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(service.listStandings).not.toHaveBeenCalled();
  });

  it.each(['deletion_pending', 'deleted'] as const)(
    'excludes a %s account before progression is read',
    async (lifecycleStatus) => {
      resolvePlayer.mockResolvedValueOnce({
        ...activePlayer,
        playerName: lifecycleStatus === 'deleted' ? null : 'current-player',
        role: 'player',
        lifecycleStatus,
      });

      const response = await authenticatedGet('/api/v1/progression/me');

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
      expect(service.getCurrentProfile).not.toHaveBeenCalled();
      expect(response.body).not.toContain('Deleted player');
    },
  );

  it('publishes closed, bearer-authenticated OpenAPI contracts', async () => {
    await app.ready();
    const document = app.swagger();
    const profile = document.paths?.['/api/v1/progression/me']?.get;
    const standings = document.paths?.['/api/v1/progression/standings']?.get;

    expect(profile?.operationId).toBe('getCurrentProgressionProfile');
    expect(profile?.security).toEqual([{ bearerAuth: [] }]);
    expect(profile?.responses).toHaveProperty('401');
    expect(profile?.responses).toHaveProperty('403');
    expect(standings?.operationId).toBe('listProgressionStandings');
    expect(standings?.security).toEqual([{ bearerAuth: [] }]);
    expect(standings?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'period', in: 'query' }),
        expect.objectContaining({ name: 'month', in: 'query' }),
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'pageSize', in: 'query' }),
      ]),
    );
  });
});

async function authenticatedGet(url: string) {
  return app.inject({
    method: 'GET',
    url,
    headers: { authorization: 'Bearer valid-token' },
  });
}

function entry(
  playerName: string | null,
  points: number,
  rank: number,
  isCurrentPlayer = false,
) {
  return {
    playerName,
    points,
    rank,
    currentStreak: 1,
    longestStreak: 2,
    isCurrentPlayer,
  };
}
