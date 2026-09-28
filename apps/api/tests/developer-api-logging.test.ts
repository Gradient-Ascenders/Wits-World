import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { DeveloperApiKeyService } from '../src/developer/developer-api-key-service.js';
import type { DeveloperPublicDataService } from '../src/developer/developer-public-data-service.js';
import { createRateProtection } from '../e2e/fake-rate-protection.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const API_KEY = `ww_api_0123456789abcdef_${'a'.repeat(43)}`;

describe('developer API credential log redaction', () => {
  let app: FastifyInstance;
  let output = '';

  beforeEach(async () => {
    output = '';
    const keyService: DeveloperApiKeyService = {
      listForPlayer: vi.fn(),
      createForPlayer: vi.fn(),
      revokeForPlayer: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({
        id: '18200000-0000-4000-8000-000000000001',
        ownerPlayerId: '17200000-0000-4000-8000-000000000001',
      }),
    };
    const publicDataService: DeveloperPublicDataService = {
      listEvents: vi.fn(),
      getEvent: vi.fn(),
      listCards: vi.fn(),
      getCard: vi.fn(),
      listLeaderboard: vi.fn(),
    };

    app = await buildApp({
      authConfig,
      accessTokenVerifier: { verify: vi.fn() },
      logger: true,
      logDestination: {
        write(message) {
          output += message;
        },
      },
      playerIdentityService: { resolve: vi.fn() },
      developerApi: {
        keyService,
        publicDataService,
        rateProtection: createRateProtection({
          maxRequests: 120,
          windowMs: 60_000,
        }),
      },
    });

    app.get(
      '/developer-redaction-probe',
      { onRequest: [app.authenticateDeveloperApiKey] },
      async (request) => {
        request.log.info(
          { headers: request.headers },
          'Developer API redaction regression probe',
        );
        return { ok: true };
      },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('redacts the X-API-Key header from structured logs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/developer-redaction-probe',
      headers: { 'x-api-key': API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(output).toContain('Developer API redaction regression probe');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain(API_KEY);
  });
});
