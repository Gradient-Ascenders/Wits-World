import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type {
  StarterGrantService,
  StarterGrantSelection,
} from '../src/cards/starter-grant.js';
import { StarterAffinityNotAllowedError } from '../src/cards/starter-grant.js';
import type {
  OwnedCard,
  StarterAffinity,
  StarterOption,
} from '../src/cards/card-types.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import type { CardCollectionService } from '../src/cards/card-collection.js';
import {
  EvolutionCopiesDeckLockedError,
  EvolutionCopiesTradeReservedError,
  EvolutionNotAvailableError,
  EvolutionReplayConflictError,
  InsufficientEvolutionCopiesError,
  type CardEvolutionPreview,
  type CardEvolutionResult,
  type CardEvolutionService,
  type EvolutionCardDefinition,
} from '../src/cards/card-evolution.js';

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
  playerName: 'test-player',
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
let listStarterOptions: ReturnType<
  typeof vi.fn<StarterGrantService['listStarterOptions']>
>;

let listOwnedCards: ReturnType<
  typeof vi.fn<CardCollectionService['listOwnedCards']>
>;
let previewEvolution: ReturnType<
  typeof vi.fn<CardEvolutionService['previewEvolution']>
>;
let evolveCards: ReturnType<typeof vi.fn<CardEvolutionService['evolveCards']>>;

let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;

beforeEach(async () => {
  selectStarter = vi
    .fn<StarterGrantService['selectStarter']>()
    .mockResolvedValue(selection);
  listStarterOptions = vi
    .fn<StarterGrantService['listStarterOptions']>()
    .mockResolvedValue([
      buildStarterOption('spark'),
      buildStarterOption('grit'),
      buildStarterOption('wit'),
    ]);

  listOwnedCards = vi
    .fn<CardCollectionService['listOwnedCards']>()
    .mockResolvedValue([]);
  previewEvolution = vi
    .fn<CardEvolutionService['previewEvolution']>()
    .mockResolvedValue(buildEvolutionPreview());
  evolveCards = vi
    .fn<CardEvolutionService['evolveCards']>()
    .mockResolvedValue(buildEvolutionResult());

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'test-player',
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
    listStarterOptions,
    selectStarter,
  };

  const collectionService: CardCollectionService = {
    listOwnedCards,
  };

  const evolutionService: CardEvolutionService = {
    previewEvolution,
    evolveCards,
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService,
    cardServices: {
      starterGrant: starterGrantService,
      collection: collectionService,
      evolution: evolutionService,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('starter selection API', () => {
  it('returns only the authenticated server starter options', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cards/starter-options',
      headers: { authorization: 'Bearer test-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .options.map(
          (option: { affinity: StarterAffinity }) => option.affinity,
        ),
    ).toEqual(['spark', 'grit', 'wit']);
    expect(listStarterOptions).toHaveBeenCalledOnce();
  });

  it('requires authentication for starter package previews', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cards/starter-options',
    });

    expect(response.statusCode).toBe(401);
    expect(listStarterOptions).not.toHaveBeenCalled();
  });

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

  it.each(['spirit', 'mystic'] as const)(
    'rejects a new progression-only %s grant through server eligibility',
    async (affinity) => {
      selectStarter.mockRejectedValueOnce(new StarterAffinityNotAllowedError());
      const response = await authenticatedRequest({ affinity });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: 'STARTER_AFFINITY_NOT_ALLOWED',
      });
      expect(selectStarter).toHaveBeenCalledWith({
        affinity,
        playerId: activeLocalPlayer.id,
      });
    },
  );

  it('returns an idempotent historical Spirit grant', async () => {
    selectStarter.mockResolvedValueOnce({
      created: false,
      grant: {
        ...selection.grant,
        affinity: 'spirit',
        cards: selection.grant.cards.map((card) => ({
          ...card,
          affinity: 'spirit',
        })),
      },
    });

    const response = await authenticatedRequest({ affinity: 'spirit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ affinity: 'spirit' });
  });

  it.each(['ember', ''])(
    'rejects unknown affinity input: %s',
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
      playerName: 'test-player',
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
    const evolvedCopy: OwnedCard = {
      ...starterCard,
      ownedCardId: '00000000-0000-4000-8000-000000000693',
      acquisitionKind: 'evolution',
      acquiredAt: '2026-08-15T13:00:00.000Z',
    };

    listOwnedCards.mockResolvedValueOnce([
      evolvedCopy,
      rewardedCopy,
      starterCard,
    ]);

    const response = await authenticatedCollectionRequest();

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body.cards).toHaveLength(3);

    expect(
      body.cards.map(
        (card: { cardDefinitionId: string }) => card.cardDefinitionId,
      ),
    ).toEqual([
      starterCard.cardDefinitionId,
      starterCard.cardDefinitionId,
      starterCard.cardDefinitionId,
    ]);

    expect(
      new Set(
        body.cards.map((card: { ownedCardId: string }) => card.ownedCardId),
      ).size,
    ).toBe(3);

    expect(body.cards[0].acquisitionKind).toBe('evolution');
    expect(body.cards[1].acquisitionKind).toBe('event_reward');
    expect(body.cards[2].acquisitionKind).toBe('starter');
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

describe('card evolution API', () => {
  const sourceCardDefinitionId = '00000000-0000-4000-8000-000000000710';
  const submissionId = '00000000-0000-4000-8000-000000000720';

  it('previews server-owned copy eligibility for the authenticated player', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cards/evolutions/${sourceCardDefinitionId}/preview`,
      headers: { authorization: 'Bearer test-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      canEvolve: true,
      copiesRequired: 3,
      requestId: expect.any(String),
    });
    expect(previewEvolution).toHaveBeenCalledWith(
      activeLocalPlayer.id,
      sourceCardDefinitionId,
    );
  });

  it('evolves using only the source definition and idempotency key', async () => {
    const response = await authenticatedEvolutionRequest({
      submissionId,
      sourceCardDefinitionId,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      submissionId,
      sourceCardDefinitionId,
      replayed: false,
      newCard: { acquisitionKind: 'evolution' },
      requestId: expect.any(String),
    });
    expect(evolveCards).toHaveBeenCalledWith({
      playerId: activeLocalPlayer.id,
      submissionId,
      sourceCardDefinitionId,
    });
  });

  it('returns 200 for an idempotent evolution replay', async () => {
    evolveCards.mockResolvedValueOnce({
      ...buildEvolutionResult(),
      replayed: true,
    });

    const response = await authenticatedEvolutionRequest({
      submissionId,
      sourceCardDefinitionId,
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects client-selected owned copies', async () => {
    const response = await authenticatedEvolutionRequest({
      submissionId,
      sourceCardDefinitionId,
      ownedCardIds: [
        '00000000-0000-4000-8000-000000000731',
        '00000000-0000-4000-8000-000000000732',
        '00000000-0000-4000-8000-000000000733',
      ],
    });

    expect(response.statusCode).toBe(400);
    expect(evolveCards).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/evolutions',
      payload: { submissionId, sourceCardDefinitionId },
    });

    expect(response.statusCode).toBe(401);
    expect(evolveCards).not.toHaveBeenCalled();
  });

  it.each([
    [new EvolutionNotAvailableError(), 404, 'EVOLUTION_NOT_AVAILABLE'],
    [
      new InsufficientEvolutionCopiesError(),
      409,
      'EVOLUTION_COPIES_INSUFFICIENT',
    ],
    [new EvolutionCopiesDeckLockedError(), 409, 'EVOLUTION_COPIES_DECK_LOCKED'],
    [
      new EvolutionCopiesTradeReservedError(),
      409,
      'EVOLUTION_COPIES_TRADE_RESERVED',
    ],
    [new EvolutionReplayConflictError(), 409, 'EVOLUTION_REPLAY_CONFLICT'],
  ] as const)(
    'maps evolution failures to safe API errors',
    async (error, statusCode, code) => {
      evolveCards.mockRejectedValueOnce(error);

      const response = await authenticatedEvolutionRequest({
        submissionId,
        sourceCardDefinitionId,
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toMatchObject({ code });
    },
  );

  it('documents both evolution operations as bearer authenticated', async () => {
    await app.ready();

    const document = app.swagger();
    const preview =
      document.paths?.[
        '/api/v1/cards/evolutions/{sourceCardDefinitionId}/preview'
      ]?.get;
    const evolve = document.paths?.['/api/v1/cards/evolutions']?.post;

    expect(preview?.operationId).toBe('previewCardEvolution');
    expect(preview?.security).toEqual([{ bearerAuth: [] }]);
    expect(evolve?.operationId).toBe('evolveCards');
    expect(evolve?.security).toEqual([{ bearerAuth: [] }]);
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

function buildStarterOption(affinity: StarterAffinity): StarterOption {
  return {
    affinity,
    title:
      affinity === 'spark'
        ? 'Pressure'
        : affinity === 'grit'
          ? 'Durability'
          : 'Flexibility',
    description: 'Server-authored starter comparison.',
    highlights: ['First strength', 'Second strength', 'Third strength'],
    composition: { creatureCount: 3, powerCardCount: 2 },
    creatures: [1, 2, 3].map((index) => ({
      name: `${affinity} Creature ${index}`,
      hp: 90 + index,
      power: 10 + index,
      moves: [1, 2, 3, 4].map((position) => ({
        position,
        name: `Move ${position}`,
        moveType: affinity,
        effectType: 'damage',
        effectValue: 10 + position,
        modifierStat: null,
        modifierOperation: null,
        modifierDurationTurns: null,
        powerCost: position,
      })),
    })),
    powerCards: [1, 2].map((index) => ({
      name: `${affinity} Power ${index}`,
      effects: [
        {
          position: 1,
          effectType: 'damage',
          effectValue: 10 + index,
          modifierStat: null,
          modifierOperation: null,
          modifierDurationTurns: null,
        },
      ],
    })),
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

function buildEvolutionDefinition(
  cardDefinitionId: string,
  rarity: 'rare' | 'epic',
): EvolutionCardDefinition {
  return {
    cardDefinitionId,
    name: rarity === 'rare' ? 'Source Card' : 'Evolved Card',
    category: 'creature',
    affinity: 'wit',
    rarity,
    hp: 120,
    power: 20,
    description: 'A server-authored evolution test card.',
    imageUrl: null,
    imageAlt: null,
    isActive: true,
    moves: [],
    effects: [],
    deckPointCost: rarity === 'rare' ? 2 : 3,
  };
}

function buildEvolutionPreview(): CardEvolutionPreview {
  const source = buildEvolutionDefinition(
    '00000000-0000-4000-8000-000000000710',
    'rare',
  );
  const target = buildEvolutionDefinition(
    '00000000-0000-4000-8000-000000000711',
    'epic',
  );
  const copies = [1, 2, 3].map((index) => ({
    ownedCardId: `00000000-0000-4000-8000-00000000073${index}`,
    acquiredAt: `2026-08-15T08:00:0${index}.000Z`,
    acquisitionKind: 'event_reward' as const,
    eligible: true,
    lockReason: null,
  }));

  return {
    source,
    target,
    copiesRequired: 3,
    ownedCopyCount: 3,
    eligibleCopyCount: 3,
    deckLockedCopyCount: 0,
    tradeReservedCopyCount: 0,
    copies,
    canEvolve: true,
    unavailableReason: null,
  };
}

function buildEvolutionResult(): CardEvolutionResult {
  const preview = buildEvolutionPreview();

  return {
    evolutionId: '00000000-0000-4000-8000-000000000740',
    submissionId: '00000000-0000-4000-8000-000000000720',
    sourceCardDefinitionId: preview.source.cardDefinitionId,
    target: preview.target,
    consumedOwnedCardIds: preview.copies.map((copy) => copy.ownedCardId) as [
      string,
      string,
      string,
    ],
    newCard: {
      ...preview.target,
      ownedCardId: '00000000-0000-4000-8000-000000000741',
      acquisitionKind: 'evolution',
      acquiredAt: '2026-08-15T08:01:00.000Z',
    },
    completedAt: '2026-08-15T08:01:00.000Z',
    replayed: false,
  };
}

async function authenticatedEvolutionRequest(payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/cards/evolutions',
    headers: { authorization: 'Bearer test-access-token' },
    payload,
  });
}
