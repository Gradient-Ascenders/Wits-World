import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  StarterGrantService,
  StarterGrantSelection,
} from '../src/cards/starter-grant.js';
import type { OwnedCard } from '../src/cards/card-types.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const activeLocalPlayer = {
  id: '00000000-0000-4000-8000-000000000101',
  role: 'player' as const,
  lifecycleStatus: 'active' as const,
};

const selection: StarterGrantSelection = {
  created: true,
  grant: {
    starterGrantId: '00000000-0000-4000-8000-000000000201',
    affinity: 'wit',
    grantedAt: '2026-08-15T08:00:00.000Z',
    cards: [
      buildTestCard(1),
      buildTestCard(2),
      buildTestCard(3),
      buildTestCard(4),
      buildTestCard(5),
    ],
  },
};

let app: FastifyInstance;
let selectStarter: ReturnType<
  typeof vi.fn<StarterGrantService['selectStarter']>
>;

beforeEach(async () => {
  selectStarter = vi
    .fn<StarterGrantService['selectStarter']>()
    .mockResolvedValue(selection);

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      issuer: authConfig.issuer,
      subject: 'auth0|player-123',
    }),
  };

  const playerIdentityService: PlayerIdentityService = {
    resolve: vi.fn().mockResolvedValue(activeLocalPlayer),
  };

  const starterGrantService: StarterGrantService = {
    selectStarter,
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService,
    cardServices: {
      starterGrant: starterGrantService,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('starter selection API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/starter',
      payload: { affinity: 'wit' },
    });

    expect(response.statusCode).toBe(401);
    expect(selectStarter).not.toHaveBeenCalled();
  });

  it('derives player identity from the authenticated player context', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/starter',
      headers: { authorization: 'Bearer test-access-token' },
      payload: { affinity: 'spark', playerId: 'another-player' },
    });

    expect(response.statusCode).toBe(400);
    expect(selectStarter).not.toHaveBeenCalled();
  });

  it('returns 201 for a new starter selection', async () => {
    const response = await authenticatedRequest({ affinity: 'wit' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      starterGrantId: selection.grant.starterGrantId,
      affinity: 'wit',
      requestId: expect.any(String),
    });
    expect(selectStarter).toHaveBeenCalledWith({
      playerId: activeLocalPlayer.id,
      affinity: 'wit',
    });
  });

  it('returns 200 when the service reports an idempotent retry', async () => {
    selectStarter.mockResolvedValueOnce({
      ...selection,
      created: false,
    });

    const response = await authenticatedRequest({ affinity: 'wit' });

    expect(response.statusCode).toBe(200);
  });

  it.each(['ember', ''])(
    'rejects invalid affinity input: %s',
    async (affinity) => {
      const response = await authenticatedRequest({ affinity });

      expect(response.statusCode).toBe(400);
      expect(selectStarter).not.toHaveBeenCalled();
    },
  );
});

async function authenticatedRequest(payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/cards/starter',
    headers: { authorization: 'Bearer test-access-token' },
    payload,
  });
}

function buildTestCard(index: number): OwnedCard {
  const isCreature = index <= 3;

  return {
    ownedCardId: `00000000-0000-4000-8000-0000000003${index}0`,
    cardDefinitionId: `00000000-0000-4000-8000-0000000004${index}0`,
    name: `Test Card ${index}`,
    category: isCreature ? 'creature' : 'power',
    affinity: 'wit',
    rarity: 'common',
    hp: isCreature ? 100 : null,
    power: isCreature ? 10 : null,
    description: 'Test card',
    imageUrl: null,
    isActive: true,
    moves: [],
    effects: [],
    acquisitionKind: 'starter',
    acquiredAt: '2026-08-15T08:00:00.000Z',
  };
}
