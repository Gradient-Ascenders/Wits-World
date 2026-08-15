import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import {
  AuthorCardNotReadyError,
  AuthorCardStateConflictError,
  type AuthorCardDefinition,
  type AuthorCardService,
} from '../src/cards/author-card-service.js';
import { InvalidCardDefinitionError } from '../src/cards/card-validation.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const AUTHOR_ID = 'b1000000-0000-4000-8000-000000000001';
const PLAYER_ID = 'b1000000-0000-4000-8000-000000000002';
const CARD_ID = 'b2000000-0000-4000-8000-000000000001';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const authenticatedIdentity = {
  issuer: authConfig.issuer,
  subject: 'auth0|author-card',
};

const activeAuthor = {
  id: AUTHOR_ID,
  role: 'author' as const,
  lifecycleStatus: 'active' as const,
};

const activePlayer = {
  id: PLAYER_ID,
  role: 'player' as const,
  lifecycleStatus: 'active' as const,
};

const card: AuthorCardDefinition = {
  id: CARD_ID,
  name: 'Campus Owl',
  category: 'creature',
  affinity: 'wit',
  rarity: 'common',
  hp: 120,
  power: 20,
  description: 'A scholarly creature.',
  imageUrl: null,
  isActive: false,
  moves: [
    {
      id: 'b3000000-0000-4000-8000-000000000001',
      position: 1,
      name: 'Quick Peck',
      moveType: 'basic',
      effectType: 'damage',
      effectValue: 12,
      modifierStat: null,
      modifierOperation: null,
      modifierDurationTurns: null,
      powerCost: 1,
    },
  ],
  effects: [],
  authoringStatus: 'draft',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

let app: FastifyInstance;
let service: {
  [K in keyof AuthorCardService]: ReturnType<typeof vi.fn>;
};
let playerResolve: ReturnType<typeof createPlayerResolveMock>;

beforeEach(async () => {
  service = createServiceMock();
  playerResolve = createPlayerResolveMock();

  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue(authenticatedIdentity),
  };

  app = await buildApp({
    authConfig,
    accessTokenVerifier,
    playerIdentityService: {
      resolve: playerResolve,
    },
    authorContentServices: {
      cards: service as unknown as AuthorCardService,
    },
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
});

describe('author card API', () => {
  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/author/cards',
    });

    expect(response.statusCode).toBe(401);
    expect(service.listCards).not.toHaveBeenCalled();
  });

  it('rejects an ordinary Player', async () => {
    playerResolve.mockResolvedValue(activePlayer);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/cards',
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'AUTHOR_REQUIRED',
    });

    expect(service.listCards).not.toHaveBeenCalled();
  });

  it('rejects a deletion-pending Author', async () => {
    playerResolve.mockResolvedValue({
      ...activeAuthor,
      lifecycleStatus: 'deletion_pending',
    });

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/cards',
    });

    expect(response.statusCode).toBe(403);

    expect(response.json()).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });

    expect(service.listCards).not.toHaveBeenCalled();
  });

  it('lists draft, published, and retired content for an Author', async () => {
    service.listCards.mockResolvedValue([
      card,
      {
        ...card,
        id: 'b2000000-0000-4000-8000-000000000002',
        authoringStatus: 'published',
        isActive: true,
      },
      {
        ...card,
        id: 'b2000000-0000-4000-8000-000000000003',
        authoringStatus: 'retired',
        isActive: false,
      },
    ]);

    const response = await authenticatedRequest({
      method: 'GET',
      url: '/api/v1/author/cards',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      cards: expect.arrayContaining([
        expect.objectContaining({
          authoringStatus: 'draft',
        }),
        expect.objectContaining({
          authoringStatus: 'published',
        }),
        expect.objectContaining({
          authoringStatus: 'retired',
        }),
      ]),
      requestId: expect.any(String),
    });
  });

  it('creates a draft using only the authenticated Author identity', async () => {
    const body = validCreatureBody();

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/cards',
      payload: body,
    });

    expect(response.statusCode).toBe(201);

    expect(service.createCard).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      ...body,
    });

    expect(response.json()).toEqual({
      card,
      requestId: expect.any(String),
    });
  });

  it('updates a draft using only the authenticated Author identity', async () => {
    const body = validCreatureBody();

    const response = await authenticatedRequest({
      method: 'PUT',
      url: `/api/v1/author/cards/${CARD_ID}`,
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    expect(service.updateCard).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      cardId: CARD_ID,
      ...body,
    });
  });

  it('rejects browser-supplied lifecycle and audit authority fields', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/cards',
      payload: {
        ...validCreatureBody(),
        actorPlayerId: PLAYER_ID,
        id: CARD_ID,
        isActive: true,
        authoringStatus: 'published',
        createdAt: '2026-08-16T00:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(service.createCard).not.toHaveBeenCalled();
  });

  it('rejects malformed card shape before calling the service', async () => {
    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/cards',
      payload: {
        name: '',
        category: 'unknown',
        affinity: 'invalid',
        rarity: 'mythic',
        hp: -1,
        power: -1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(service.createCard).not.toHaveBeenCalled();
  });

  it('maps cross-field card rule violations to 400', async () => {
    service.createCard.mockRejectedValue(
      new InvalidCardDefinitionError(
        'Creature cards must define at least one move.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/cards',
      payload: validCreatureBody(),
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'INVALID_CARD',
    });
  });

  it('publishes and retires using the authenticated Author identity', async () => {
    service.publishCard.mockResolvedValue({
      ...card,
      authoringStatus: 'published',
      isActive: true,
    });

    service.retireCard.mockResolvedValue({
      ...card,
      authoringStatus: 'retired',
      isActive: false,
    });

    const published = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/cards/${CARD_ID}/publish`,
      payload: {},
    });

    expect(published.statusCode).toBe(200);

    expect(service.publishCard).toHaveBeenCalledWith(AUTHOR_ID, CARD_ID);

    const retired = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/cards/${CARD_ID}/retire`,
      payload: {},
    });

    expect(retired.statusCode).toBe(200);

    expect(service.retireCard).toHaveBeenCalledWith(AUTHOR_ID, CARD_ID);
  });

  it('maps publication readiness failures to 422', async () => {
    service.publishCard.mockRejectedValue(
      new AuthorCardNotReadyError(
        'Creature cards must define at least one move.',
      ),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/cards/${CARD_ID}/publish`,
      payload: {},
    });

    expect(response.statusCode).toBe(422);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_NOT_READY',
    });
  });

  it('maps invalid lifecycle transitions to 409', async () => {
    service.publishCard.mockRejectedValue(
      new AuthorCardStateConflictError('Only a draft card can be published.'),
    );

    const response = await authenticatedRequest({
      method: 'POST',
      url: `/api/v1/author/cards/${CARD_ID}/publish`,
      payload: {},
    });

    expect(response.statusCode).toBe(409);

    expect(response.json()).toMatchObject({
      code: 'CONTENT_STATE_CONFLICT',
    });
  });

  it('authenticates before validating malformed card input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/author/cards',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(service.createCard).not.toHaveBeenCalled();
  });

  it('preserves null Power-card fields through request validation', async () => {
    const body = {
      name: 'Campus Recovery',
      category: 'power' as const,
      affinity: 'spirit' as const,
      rarity: 'common' as const,
      hp: null,
      power: null,
      description: null,
      imageUrl: null,
      moves: [],
      effects: [
        {
          position: 1,
          effectType: 'heal' as const,
          effectValue: 15,
          modifierStat: null,
          modifierOperation: null,
          modifierDurationTurns: null,
        },
      ],
    };

    const response = await authenticatedRequest({
      method: 'POST',
      url: '/api/v1/author/cards',
      payload: body,
    });

    expect(response.statusCode).toBe(201);

    expect(service.createCard).toHaveBeenCalledWith({
      actorPlayerId: AUTHOR_ID,
      ...body,
    });
  });
});

describe('author card OpenAPI documentation', () => {
  it('documents every card authoring operation as bearer-protected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<
        string,
        Record<
          string,
          {
            security?: Array<Record<string, unknown>>;
          }
        >
      >;
    }>();

    const operations = [
      ['/api/v1/author/cards', 'get'],
      ['/api/v1/author/cards', 'post'],
      ['/api/v1/author/cards/{cardId}', 'put'],
      ['/api/v1/author/cards/{cardId}/publish', 'post'],
      ['/api/v1/author/cards/{cardId}/retire', 'post'],
    ] as const;

    for (const [path, method] of operations) {
      expect(document.paths[path]?.[method]?.security).toEqual([
        {
          bearerAuth: [],
        },
      ]);
    }
  });
});

function createServiceMock() {
  return {
    listCards: vi.fn().mockResolvedValue([card]),
    createCard: vi.fn().mockResolvedValue(card),
    updateCard: vi.fn().mockResolvedValue(card),
    publishCard: vi.fn().mockResolvedValue({
      ...card,
      authoringStatus: 'published',
      isActive: true,
    }),
    retireCard: vi.fn().mockResolvedValue({
      ...card,
      authoringStatus: 'retired',
      isActive: false,
    }),
  };
}

function createPlayerResolveMock() {
  const resolve: PlayerIdentityService['resolve'] = async () => activeAuthor;

  return vi.fn(resolve);
}

function validCreatureBody() {
  return {
    name: 'Campus Owl',
    category: 'creature' as const,
    affinity: 'wit' as const,
    rarity: 'common' as const,
    hp: 120,
    power: 20,
    description: 'A scholarly creature.',
    imageUrl: null,
    moves: [
      {
        position: 1,
        name: 'Quick Peck',
        moveType: 'basic' as const,
        effectType: 'damage' as const,
        effectValue: 12,
        powerCost: 1,
      },
    ],
    effects: [],
  };
}

async function authenticatedRequest(options: {
  method: 'GET' | 'POST' | 'PUT';
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
