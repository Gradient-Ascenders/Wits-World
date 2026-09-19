import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  PlacementConflictError,
  type PlacementService,
} from '../src/placement/placement-service.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authorId = '26200000-0000-4000-8000-000000000001';
const planId = '26220000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  audience: 'https://api.example.test',
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
  spaClientId: 'wits-world-spa-client',
};

describe('Author event placement API', () => {
  let app: FastifyInstance;
  let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;
  let service: {
    preview: ReturnType<typeof vi.fn<PlacementService['preview']>>;
    apply: ReturnType<typeof vi.fn<PlacementService['apply']>>;
    state: ReturnType<typeof vi.fn<PlacementService['state']>>;
    history: ReturnType<typeof vi.fn<PlacementService['history']>>;
  };

  beforeEach(async () => {
    resolvePlayer = vi.fn().mockResolvedValue({
      id: authorId,
      lifecycleStatus: 'active',
      playerName: 'placement-author',
      role: 'author',
    });
    service = {
      preview: vi.fn().mockResolvedValue({
        planId,
        policyVersion: 'placement-v1',
        rotationBucket: '2026-09-19',
        stateVersion: 0,
        validUntil: '2026-09-19T01:00:00.000Z',
        status: 'degraded',
        entries: [],
        zoneCounts: {},
        exceptions: ['target_shortfall'],
      }),
      apply: vi.fn().mockResolvedValue({
        planId,
        policyVersion: 'placement-v1',
        rotationBucket: '2026-09-19',
        stateVersion: 1,
        validUntil: '2026-09-19T01:00:00.000Z',
        status: 'degraded',
        entries: [],
        zoneCounts: {},
        exceptions: ['target_shortfall'],
      }),
      state: vi.fn().mockResolvedValue({
        policyVersion: 'placement-v1',
        rotationBucket: '2026-09-19',
        stateVersion: 0,
        currentPlanId: null,
        nextRotationBoundary: '2026-09-20T02:00:00.000Z',
        metrics: {
          targetAssignmentCount: 6,
          activeAssignmentCount: 0,
          activeZoneCount: 3,
          servedZoneCount: 0,
          unservedZoneCount: 3,
          lastAppliedAt: null,
          lastFailureAt: null,
          lastFailureCode: null,
        },
        zones: [],
        sites: [],
        assignments: [],
        overrides: [],
      }),
      history: vi.fn().mockResolvedValue([]),
    };
    const verifier: AccessTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        connectionStrategy: 'auth0',
        issuer: authConfig.issuer,
        playerName: 'identity-name',
        subject: 'auth0|private-subject',
      }),
    };
    app = await buildApp({
      accessTokenVerifier: verifier,
      authConfig,
      logger: false,
      placementService: service as unknown as PlacementService,
      playerIdentityService: { resolve: resolvePlayer },
    });
  });

  afterEach(async () => app.close());

  it('requires an active Author and exposes the placement operations in OpenAPI', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/author/event-placement/previews',
        })
      ).statusCode,
    ).toBe(401);
    resolvePlayer.mockResolvedValue({
      id: authorId,
      lifecycleStatus: 'active',
      playerName: 'ordinary-player',
      role: 'player',
    });
    expect(
      (await request('POST', '/api/v1/author/event-placement/previews'))
        .statusCode,
    ).toBe(403);
    expect(service.preview).not.toHaveBeenCalled();
    expect(
      app.swagger().paths?.['/api/v1/author/event-placement/apply'],
    ).toBeDefined();
  });

  it('returns the stored preview and validates and forwards an apply', async () => {
    const state = await request('GET', '/api/v1/author/event-placement');
    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({
      policyVersion: 'placement-v1',
      stateVersion: 0,
      assignments: [],
    });
    const history = await request(
      'GET',
      '/api/v1/author/event-placement/history',
    );
    expect(history.statusCode).toBe(200);
    expect(history.json().plans).toEqual([]);
    const preview = await request(
      'POST',
      '/api/v1/author/event-placement/previews',
    );
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.json().plan).toMatchObject({
      planId,
      policyVersion: 'placement-v1',
      status: 'degraded',
    });
    expect(service.preview).toHaveBeenCalledWith(authorId);

    const invalid = await request(
      'POST',
      '/api/v1/author/event-placement/apply',
      { planId, expectedVersion: 0, reason: ' ' },
    );
    expect(invalid.statusCode).toBe(400);
    expect(service.apply).not.toHaveBeenCalled();
    const incompletePin = await request(
      'POST',
      '/api/v1/author/event-placement/overrides',
      {
        kind: 'pin',
        expectedVersion: 0,
        reason: 'Reviewed pin',
        durationHours: 1,
        idempotencyKey: planId,
      },
    );
    expect(incompletePin.statusCode).toBe(400);

    const applied = await request(
      'POST',
      '/api/v1/author/event-placement/apply',
      { planId, expectedVersion: 0, reason: 'Reviewed placement' },
    );
    expect(applied.statusCode).toBe(200);
    expect(service.apply).toHaveBeenCalledWith(
      authorId,
      planId,
      0,
      'Reviewed placement',
    );

    service.apply.mockRejectedValueOnce(
      new PlacementConflictError('STALE_PLACEMENT_STATE'),
    );
    const stale = await request(
      'POST',
      '/api/v1/author/event-placement/apply',
      { planId, expectedVersion: 0, reason: 'Reviewed placement' },
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('STALE_PLACEMENT_STATE');
  });

  function request(
    method: 'GET' | 'POST',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      headers: { authorization: 'Bearer test-token' },
      method,
      url,
      ...(payload ? { payload } : {}),
    });
  }
});
