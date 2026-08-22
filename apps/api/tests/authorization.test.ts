import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAuthorization } from '../src/auth/authorization.js';
import {
  PlayerNameConflictError,
  type PlayerIdentityService,
} from '../src/players/player-identity.js';

describe('application authorisation', () => {
  let app: FastifyInstance;
  let playerIdentityService: PlayerIdentityService;

  beforeEach(() => {
    app = Fastify({
      logger: false,
    });

    app.decorateRequest('auth', null);

    playerIdentityService = {
      resolve: vi.fn(),
    };

    registerAuthorization(app, playerIdentityService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('loads an active local player from validated authentication identity', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      role: 'player',
      playerName: 'test-player',
      lifecycleStatus: 'active',
    });

    app.addHook('preHandler', async (request) => {
      request.auth = {
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        playerName: 'test-player',
        subject: 'auth0|player-123',
      };
    });

    app.get(
      '/test',
      {
        preHandler: app.requireActivePlayer,
      },
      async (request) => ({
        player: request.player,
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);

    expect(playerIdentityService.resolve).toHaveBeenCalledWith({
      connectionStrategy: 'auth0',
      issuer: 'https://auth.example.test/',
      playerName: 'test-player',
      subject: 'auth0|player-123',
    });
  });

  it('rejects a deletion-pending account', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      role: 'player',
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    app.addHook('preHandler', async (request) => {
      request.auth = {
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        playerName: 'test-player',
        subject: 'auth0|player-123',
      };
    });

    app.get(
      '/test',
      {
        preHandler: app.requireActivePlayer,
      },
      async () => ({
        ok: true,
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });
  });

  it('loads a Google player awaiting setup for account routes', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      lifecycleStatus: 'active',
      playerName: null,
      role: 'player',
    });
    app.addHook('preHandler', async (request) => {
      request.auth = {
        connectionStrategy: 'google-oauth2',
        issuer: 'https://auth.example.test/',
        playerName: null,
        subject: 'google-oauth2|player-123',
      };
    });
    app.get('/test', { preHandler: app.loadActivePlayer }, async (request) => ({
      player: request.player,
    }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      player: { playerName: null },
    });
  });

  it('blocks gameplay while Google Player Name setup is required', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      lifecycleStatus: 'active',
      playerName: null,
      role: 'player',
    });
    app.addHook('preHandler', async (request) => {
      request.auth = {
        connectionStrategy: 'google-oauth2',
        issuer: 'https://auth.example.test/',
        playerName: null,
        subject: 'google-oauth2|player-123',
      };
    });
    app.get('/test', { preHandler: app.requireActivePlayer }, async () => ({
      ok: true,
    }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'PLAYER_NAME_SETUP_REQUIRED',
    });
  });

  it('rejects a non-interactive principal for player routes', async () => {
    app.addHook('preHandler', async (request) => {
      request.auth = {
        connectionStrategy: null,
        issuer: 'https://auth.example.test/',
        playerName: null,
        subject: 'client-credentials-client',
      };
    });
    app.get('/test', { preHandler: app.loadActivePlayer }, async () => ({
      ok: true,
    }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(401);
    expect(playerIdentityService.resolve).not.toHaveBeenCalled();
  });

  it('fails explicitly when the trusted player name belongs to another identity', async () => {
    vi.mocked(playerIdentityService.resolve).mockRejectedValue(
      new PlayerNameConflictError(),
    );

    app.addHook('preHandler', async (request) => {
      request.auth = {
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        playerName: 'conflicting-player',
        subject: 'auth0|losing-player',
      };
    });
    app.get('/test', { preHandler: app.requireActivePlayer }, async () => ({
      ok: true,
    }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PLAYER_NAME_CONFLICT' });
  });

  it('allows an Author through the Author guard', async () => {
    app.addHook('preHandler', async (request) => {
      request.player = {
        id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
        role: 'author',
        playerName: 'test-player',
        lifecycleStatus: 'active',
      };
    });

    app.get(
      '/test',
      {
        preHandler: app.requireAuthor,
      },
      async () => ({
        ok: true,
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects a Player from an Author-only operation', async () => {
    app.addHook('preHandler', async (request) => {
      request.player = {
        id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
        role: 'player',
        playerName: 'test-player',
        lifecycleStatus: 'active',
      };
    });

    app.get(
      '/test',
      {
        preHandler: app.requireAuthor,
      },
      async () => ({
        ok: true,
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'AUTHOR_REQUIRED',
    });
  });
});
