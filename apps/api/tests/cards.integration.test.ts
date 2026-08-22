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
import type { CardCollectionService } from '../src/cards/card-collection.js';

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
  displayName: null,
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

let listOwnedCards: ReturnType<
  typeof vi.fn<CardCollectionService['listOwnedCards']>
>;

let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;

beforeEach(async () => {
  selectStarter = vi
    .fn<StarterGrantService['selectStarter']>()
    .mockResolvedValue(selection);

  listOwnedCards = vi
    .fn<CardCollectionService['listOwnedCards']>()
    .mockResolvedValue([]);

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      issuer: authConfig.issuer,
      subject: 'auth0|player-123',
    }),
  };

  resolvePlayer = vi
    .fn<PlayerIdentityService['resolve']>()
    .mockResolvedValue(activeLocalPlayer);

  const playerIdentityService: PlayerIdentityService = {
    resolve: resolvePlayer,
  };

  const starterGrantService: StarterGrantService = {
    selectStarter,
  };

  const collectionService: CardCollectionService = {
    listOwnedCards,
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService,
    cardServices: {
      starterGrant: starterGrantService,
      collection: collectionService,
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

describe('card collection API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cards/collection',
    });

    expect(response.statusCode).toBe(401);
    expect(listOwnedCards).not.toHaveBeenCalled();
  });

  it('derives collection ownership from the authenticated player', async () => {
    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(200);

    expect(listOwnedCards).toHaveBeenCalledWith(activeLocalPlayer.id);
  });

  it('rejects a client-supplied player identity query', async () => {
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/v1/cards/collection' +
        '?playerId=00000000-0000-4000-8000-000000009999',
      headers: {
        authorization: 'Bearer test-access-token',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(listOwnedCards).not.toHaveBeenCalled();
  });

  it('rejects deletion-pending players', async () => {
    resolvePlayer.mockResolvedValueOnce({
      ...activeLocalPlayer,
      displayName: null,
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(403);
    expect(listOwnedCards).not.toHaveBeenCalled();
  });

  it('returns an empty collection', async () => {
    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      cards: [],
      requestId: expect.any(String),
    });
  });

  it('returns duplicate owned copies independently', async () => {
    const starterCard = buildTestCard(1);

    const rewardedCopy: OwnedCard = {
      ...starterCard,
      ownedCardId: '00000000-0000-4000-8000-000000000690',
      acquisitionKind: 'event_reward',
      acquiredAt: '2026-08-15T12:00:00.000Z',
    };

    listOwnedCards.mockResolvedValueOnce([rewardedCopy, starterCard]);

    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body.cards).toHaveLength(2);

    expect(
      body.cards.map(
        (card: { cardDefinitionId: string }) => card.cardDefinitionId,
      ),
    ).toEqual([starterCard.cardDefinitionId, starterCard.cardDefinitionId]);

    expect(
      new Set(
        body.cards.map((card: { ownedCardId: string }) => card.ownedCardId),
      ).size,
    ).toBe(2);

    expect(body.cards[0].acquisitionKind).toBe('event_reward');
    expect(body.cards[1].acquisitionKind).toBe('starter');
  });

  it('does not expose player or source provenance identifiers', async () => {
    listOwnedCards.mockResolvedValueOnce([buildTestCard(1)]);

    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(200);

    const card = response.json().cards[0];

    expect(card).not.toHaveProperty('playerId');
    expect(card).not.toHaveProperty('sourceCompletionId');
    expect(card).not.toHaveProperty('sourceStarterGrantId');
  });

  it('documents the collection endpoint as bearer authenticated', async () => {
    await app.ready();

    const document = app.swagger();

    const operation = document.paths?.['/api/v1/cards/collection']?.get;

    expect(operation).toBeDefined();
    expect(operation?.operationId).toBe('listOwnedCards');
    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('returns populated card modifier metadata through response validation', async () => {
    const creatureCard: OwnedCard = {
      ...buildTestCard(1),
      moves: [
        {
          id: '00000000-0000-4000-8000-000000000691',
          position: 1,
          name: 'Power Surge',
          moveType: 'wit',
          effectType: 'buff',
          effectValue: 10,
          modifierStat: 'power',
          modifierOperation: 'add',
          modifierDurationTurns: 2,
          powerCost: 5,
        },
      ],
      effects: [],
    };

    const powerCard: OwnedCard = {
      ...buildTestCard(4),
      moves: [],
      effects: [
        {
          id: '00000000-0000-4000-8000-000000000692',
          position: 1,
          effectType: 'buff',
          effectValue: 10,
          modifierStat: 'damage_multiplier',
          modifierOperation: 'multiply',
          modifierDurationTurns: null,
        },
      ],
    };

    listOwnedCards.mockResolvedValueOnce([creatureCard, powerCard]);

    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(200);

    expect(response.json().cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moves: [
            expect.objectContaining({
              modifierStat: 'power',
              modifierOperation: 'add',
              modifierDurationTurns: 2,
            }),
          ],
        }),
        expect.objectContaining({
          effects: [
            expect.objectContaining({
              modifierStat: 'damage_multiplier',
              modifierOperation: 'multiply',
              modifierDurationTurns: null,
            }),
          ],
        }),
      ]),
    );
  });
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

async function authenticatedCollectionRequest() {
  return app.inject({
    method: 'GET',
    url: '/api/v1/cards/collection',
    headers: {
      authorization: 'Bearer test-access-token',
    },
  });
}
