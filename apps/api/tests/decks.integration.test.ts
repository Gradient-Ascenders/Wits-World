import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  DeckNotFoundError,
  DeckOwnedCardNotFoundError,
  type DeckService,
  type SavedDeck,
} from '../src/cards/deck-service.js';
import { DeckRuleViolationError } from '../src/cards/deck-rules.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';

const DECK_ID = 'a2000000-0000-4000-8000-000000000001';

const activeLocalPlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  playerName: 'test-player',
  lifecycleStatus: 'active' as const,
};

let app: FastifyInstance;

let listDecks: ReturnType<typeof vi.fn<DeckService['listDecks']>>;

let createDeck: ReturnType<typeof vi.fn<DeckService['createDeck']>>;

let updateDeck: ReturnType<typeof vi.fn<DeckService['updateDeck']>>;

let deleteDeck: ReturnType<typeof vi.fn<DeckService['deleteDeck']>>;

let selectDeck: ReturnType<typeof vi.fn<DeckService['selectDeck']>>;

let resolvePlayer: ReturnType<typeof vi.fn<PlayerIdentityService['resolve']>>;

beforeEach(async () => {
  const deck = buildDeck();

  listDecks = vi.fn<DeckService['listDecks']>().mockResolvedValue([deck]);

  createDeck = vi.fn<DeckService['createDeck']>().mockResolvedValue(deck);

  updateDeck = vi.fn<DeckService['updateDeck']>().mockResolvedValue(deck);

  deleteDeck = vi.fn<DeckService['deleteDeck']>().mockResolvedValue(undefined);

  selectDeck = vi.fn<DeckService['selectDeck']>().mockResolvedValue({
    ...deck,
    isSelected: true,
  });

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'test-player',
      subject: 'auth0|deck-player',
    }),
  };

  resolvePlayer = vi
    .fn<PlayerIdentityService['resolve']>()
    .mockResolvedValue(activeLocalPlayer);

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: resolvePlayer,
    },
    cardServices: {
      starterGrant: {
        listStarterOptions: vi.fn(),
        selectStarter: vi.fn(),
      },
      collection: {
        listOwnedCards: vi.fn().mockResolvedValue([]),
        listTradingCatalogue: vi.fn().mockResolvedValue([]),
      },
      decks: {
        listDecks,
        createDeck,
        updateDeck,
        deleteDeck,
        selectDeck,
      },
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('saved deck API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/decks',
    });

    expect(response.statusCode).toBe(401);
    expect(listDecks).not.toHaveBeenCalled();
  });

  it('rejects deletion-pending players', async () => {
    resolvePlayer.mockResolvedValueOnce({
      ...activeLocalPlayer,
      playerName: 'test-player',
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/decks',
    });

    expect(response.statusCode).toBe(403);
    expect(listDecks).not.toHaveBeenCalled();
  });

  it('lists only the authenticated player decks', async () => {
    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/decks',
    });

    expect(response.statusCode).toBe(200);

    expect(listDecks).toHaveBeenCalledWith(PLAYER_ID);

    expect(response.json()).toEqual({
      decks: [buildDeck()],
      requestId: expect.any(String),
    });
  });

  it('rejects client-supplied player identity', async () => {
    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/decks' + '?playerId=a1000000-0000-4000-8000-000000009999',
    });

    expect(response.statusCode).toBe(400);
    expect(listDecks).not.toHaveBeenCalled();
  });

  it('creates a deck from name and owned copy IDs only', async () => {
    const payload = validDeckPayload();

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/decks',
      payload,
    });

    expect(response.statusCode).toBe(201);

    expect(createDeck).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      ...payload,
    });

    expect(response.json()).toMatchObject({
      deckId: DECK_ID,
      requestId: expect.any(String),
    });
  });

  it('rejects client-supplied authoritative deck metadata', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/decks',
      payload: {
        ...validDeckPayload(),
        playerId: PLAYER_ID,
        totalPoints: 1,
        rarity: 'common',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createDeck).not.toHaveBeenCalled();
  });

  it('requires exactly five submitted card copies', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/decks',
      payload: {
        name: 'Incomplete deck',
        ownedCardIds: validOwnedCardIds().slice(0, 4),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createDeck).not.toHaveBeenCalled();
  });

  it('maps duplicate-copy rule violations safely', async () => {
    createDeck.mockRejectedValueOnce(
      new DeckRuleViolationError(
        'DECK_COPY_DUPLICATED',
        'The same owned card copy cannot appear twice in one deck.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/decks',
      payload: validDeckPayload(),
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'DECK_COPY_DUPLICATED',
      status: 400,
    });
  });

  it('does not distinguish missing and cross-player card copies', async () => {
    createDeck.mockRejectedValueOnce(new DeckOwnedCardNotFoundError());

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/decks',
      payload: validDeckPayload(),
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'INVALID_DECK_CARDS',
      detail: 'One or more selected card copies are unavailable.',
    });
  });

  it('updates the authenticated player deck', async () => {
    const payload = validDeckPayload();

    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/decks/${DECK_ID}`,
      payload,
    });

    expect(response.statusCode).toBe(200);

    expect(updateDeck).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      deckId: DECK_ID,
      ...payload,
    });
  });

  it('selects a saved deck', async () => {
    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/decks/${DECK_ID}` + '/selection',
    });

    expect(response.statusCode).toBe(200);

    expect(selectDeck).toHaveBeenCalledWith(PLAYER_ID, DECK_ID);

    expect(response.json()).toMatchObject({
      deckId: DECK_ID,
      isSelected: true,
    });
  });

  it('deletes a saved deck', async () => {
    const response = await authenticatedRequest({
      method: 'DELETE',
      url: `/api/v1/decks/${DECK_ID}`,
    });

    expect(response.statusCode).toBe(204);

    expect(deleteDeck).toHaveBeenCalledWith(PLAYER_ID, DECK_ID);

    expect(response.body).toBe('');
  });

  it('returns the same safe 404 for an unavailable deck', async () => {
    selectDeck.mockRejectedValueOnce(new DeckNotFoundError());

    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/decks/${DECK_ID}` + '/selection',
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toMatchObject({
      code: 'DECK_NOT_FOUND',
      detail: 'The requested saved deck was not found.',
    });
  });

  it('rejects malformed deck identifiers before calling the service', async () => {
    const response = await authenticatedRequest({
      method: 'DELETE',
      url: '/api/v1/decks/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);

    expect(deleteDeck).not.toHaveBeenCalled();
  });

  it('documents every deck operation as bearer authenticated', async () => {
    await app.ready();

    const document = app.swagger();

    expect(document.paths?.['/api/v1/decks']?.get?.operationId).toBe(
      'listSavedDecks',
    );

    expect(document.paths?.['/api/v1/decks']?.post?.operationId).toBe(
      'createSavedDeck',
    );

    expect(document.paths?.['/api/v1/decks/{deckId}']?.put?.operationId).toBe(
      'updateSavedDeck',
    );

    expect(
      document.paths?.['/api/v1/decks/{deckId}']?.delete?.operationId,
    ).toBe('deleteSavedDeck');

    expect(
      document.paths?.['/api/v1/decks/{deckId}/selection']?.put?.operationId,
    ).toBe('selectSavedDeck');

    const operations = [
      document.paths?.['/api/v1/decks']?.get,
      document.paths?.['/api/v1/decks']?.post,
      document.paths?.['/api/v1/decks/{deckId}']?.put,
      document.paths?.['/api/v1/decks/{deckId}']?.delete,
      document.paths?.['/api/v1/decks/{deckId}/selection']?.put,
    ];

    for (const operation of operations) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }]);
    }
  });
});

function validDeckPayload() {
  return {
    name: 'Campus Five',
    ownedCardIds: validOwnedCardIds(),
  };
}

function validOwnedCardIds(): string[] {
  return Array.from(
    { length: 5 },
    (_, index) =>
      `a3000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
}

function buildDeck(): SavedDeck {
  return {
    deckId: DECK_ID,
    name: 'Campus Five',
    isSelected: false,
    totalPoints: 5,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    cards: validOwnedCardIds().map((ownedCardId, index) => ({
      position: index + 1,
      ownedCardId,
      cardDefinitionId: `a4000000-0000-4000-8000-${String(index + 1).padStart(
        12,
        '0',
      )}`,
      name: `Deck card ${index + 1}`,
      category: index < 3 ? 'creature' : 'power',
      affinity: 'wit',
      rarity: 'common',
    })),
  };
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  payload?: Record<string, unknown>;
}) {
  const headers = {
    authorization: 'Bearer test-access-token',
  };

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
