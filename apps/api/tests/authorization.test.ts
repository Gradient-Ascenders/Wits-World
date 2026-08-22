import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAuthorization } from '../src/auth/authorization.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

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
      displayName: null,
      lifecycleStatus: 'active',
    });

    app.addHook('preHandler', async (request) => {
      request.auth = {
        issuer: 'https://auth.example.test/',
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
      issuer: 'https://auth.example.test/',
      subject: 'auth0|player-123',
    });
  });

  it('rejects a deletion-pending account', async () => {
    vi.mocked(playerIdentityService.resolve).mockResolvedValue({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      role: 'player',
      displayName: null,
      lifecycleStatus: 'deletion_pending',
    });

    app.addHook('preHandler', async (request) => {
      request.auth = {
        issuer: 'https://auth.example.test/',
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

  it('allows an Author through the Author guard', async () => {
    app.addHook('preHandler', async (request) => {
      request.player = {
        id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
        role: 'author',
        displayName: null,
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
        displayName: null,
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
