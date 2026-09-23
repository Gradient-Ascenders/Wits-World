import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { ReauthenticationTokenVerifier } from '../src/auth/reauthentication-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';
import {
  CardTradeError,
  type CardTradeService,
  type CardTradeView,
} from '../src/trading/card-trade-service.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_PLAYER_ID = '10000000-0000-4000-8000-000000000002';
const TRADE_ID = '20000000-0000-4000-8000-000000000001';
const OWNED_CARD_ID = '30000000-0000-4000-8000-000000000001';
const DEFINITION_ID = '40000000-0000-4000-8000-000000000001';
const SUBMISSION_ID = '50000000-0000-4000-8000-000000000001';
const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'test-spa',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

const tradeView: CardTradeView = {
  tradeId: TRADE_ID,
  senderPlayerId: PLAYER_ID,
  senderPlayerName: 'sender',
  recipientPlayerId: OTHER_PLAYER_ID,
  recipientPlayerName: 'recipient_name',
  status: 'open',
  version: 1,
  createdAt: '2026-09-22T10:00:00.000Z',
  expiresAt: '2026-09-23T10:00:00.000Z',
  terminalAt: null,
  terminalReason: null,
  complete: false,
  imbalanceWarningRequired: false,
  sender: {
    playerId: PLAYER_ID,
    offeredCopies: [
      {
        position: 1,
        ownedCardId: OWNED_CARD_ID,
        cardDefinitionId: DEFINITION_ID,
        name: 'Fixture Card',
        category: 'creature',
        affinity: 'wit',
        rarity: 'common',
        imageUrl: '/cards/fixture.webp',
        imageAlt: 'Fixture card artwork',
        acquisitionKind: 'starter',
        acquiredAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    requestedDefinitions: [],
    rarityPoints: 1,
    accepted: false,
    imbalanceAcknowledged: false,
  },
  recipient: {
    playerId: OTHER_PLAYER_ID,
    offeredCopies: [],
    requestedDefinitions: [
      {
        cardDefinitionId: DEFINITION_ID,
        quantity: 1,
        name: 'Fixture Card',
        category: 'creature',
        affinity: 'wit',
        rarity: 'common',
        imageUrl: '/cards/fixture.webp',
        imageAlt: 'Fixture card artwork',
      },
    ],
    rarityPoints: 0,
    accepted: false,
    imbalanceAcknowledged: false,
  },
  settlement: null,
};

describe('card trading HTTP routes', () => {
  let app: FastifyInstance;
  let createTrade: ReturnType<typeof vi.fn>;
  let reviseTrade: ReturnType<typeof vi.fn>;
  let acknowledgeImbalance: ReturnType<typeof vi.fn>;
  let acceptTrade: ReturnType<typeof vi.fn>;
  let cancelTradeCommand: ReturnType<typeof vi.fn>;
  let declineTradeCommand: ReturnType<typeof vi.fn>;
  let getTrade: ReturnType<typeof vi.fn>;
  let listTrades: ReturnType<typeof vi.fn>;
  let verifyReauthentication: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const verifier: AccessTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        issuer: authConfig.issuer,
        subject: 'auth0|trade-player',
        connectionStrategy: 'auth0',
        playerName: 'sender',
      }),
    };
    const resolve = vi
      .fn<PlayerIdentityService['resolve']>()
      .mockResolvedValue({
        id: PLAYER_ID,
        role: 'player',
        playerName: 'sender',
        lifecycleStatus: 'active',
      });

    createTrade = vi.fn().mockResolvedValue(tradeView);
    reviseTrade = vi.fn().mockResolvedValue({ ...tradeView, version: 2 });
    acknowledgeImbalance = vi.fn().mockResolvedValue(tradeView);
    acceptTrade = vi.fn().mockResolvedValue(tradeView);
    cancelTradeCommand = vi.fn().mockResolvedValue({
      ...tradeView,
      status: 'cancelled',
    });
    declineTradeCommand = vi.fn().mockResolvedValue({
      ...tradeView,
      status: 'declined',
    });
    getTrade = vi.fn().mockResolvedValue(tradeView);
    listTrades = vi.fn().mockResolvedValue({
      items: [
        {
          tradeId: TRADE_ID,
          direction: 'sent',
          status: 'open',
          version: 1,
          counterpartyPlayerName: 'recipient_name',
          createdAt: tradeView.createdAt,
          expiresAt: tradeView.expiresAt,
          terminalAt: null,
        },
      ],
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    const service = {
      createTrade,
      reviseTrade,
      acknowledgeImbalance,
      acceptTrade,
      cancelTrade: vi.fn(),
      cancelTradeCommand,
      declineTrade: vi.fn(),
      declineTradeCommand,
      getTrade,
      listTrades,
      expireDueTrades: vi.fn(),
      purgeTerminalTrades: vi.fn(),
    } as unknown as CardTradeService;

    verifyReauthentication = vi.fn().mockResolvedValue({
      identity: {
        issuer: authConfig.issuer,
        subject: 'auth0|trade-player',
      },
      authenticatedAt: new Date('2026-09-22T10:00:00.000Z'),
    });
    const reauthenticationVerifier = {
      verify: verifyReauthentication,
    } as ReauthenticationTokenVerifier;

    app = await buildApp({
      authConfig,
      accessTokenVerifier: verifier,
      playerIdentityService: { resolve },
      cardTrade: { service, reauthenticationVerifier },
      logger: false,
    });
  });

  afterEach(async () => app.close());

  it('requires authentication before any trade command reaches the service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      payload: {
        submissionId: SUBMISSION_ID,
        recipientPlayerName: 'recipient_name',
        offeredOwnedCardIds: [OWNED_CARD_ID],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ID, quantity: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(createTrade).not.toHaveBeenCalled();
  });

  it('creates a trade from authenticated identity and normalized Player Name only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        recipientPlayerName: ' Recipient_Name ',
        offeredOwnedCardIds: [OWNED_CARD_ID],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ID, quantity: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createTrade).toHaveBeenCalledWith({
      senderPlayerId: PLAYER_ID,
      recipientPlayerName: 'recipient_name',
      submissionId: SUBMISSION_ID,
      offeredOwnedCardIds: [OWNED_CARD_ID],
      requestedDefinitions: [{ cardDefinitionId: DEFINITION_ID, quantity: 1 }],
    });
    expect(response.json()).toMatchObject({
      trade: {
        tradeId: TRADE_ID,
        role: 'sender',
        counterpartyPlayerName: 'recipient_name',
      },
    });
    expect(response.body).not.toContain('senderPlayerId');
    expect(response.body).not.toContain('terminalReason');
    expect(response.body).not.toContain('acquisitionKind');
  });

  it('rejects browser-supplied participant authority fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        recipientPlayerName: 'recipient_name',
        senderPlayerId: PLAYER_ID,
        offeredOwnedCardIds: [OWNED_CARD_ID],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ID, quantity: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createTrade).not.toHaveBeenCalled();
  });

  it('revises only through the authenticated participant and expected version', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${TRADE_ID}`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        expectedVersion: 1,
        offeredOwnedCardIds: [OWNED_CARD_ID],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ID, quantity: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(reviseTrade).toHaveBeenCalledWith({
      tradeId: TRADE_ID,
      playerId: PLAYER_ID,
      submissionId: SUBMISSION_ID,
      expectedVersion: 1,
      offeredOwnedCardIds: [OWNED_CARD_ID],
      requestedDefinitions: [{ cardDefinitionId: DEFINITION_ID, quantity: 1 }],
    });
  });

  it('passes cancellation and decline commands through authenticated identity', async () => {
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${TRADE_ID}/cancel`,
      headers: { authorization: 'Bearer test-token' },
      payload: { submissionId: SUBMISSION_ID },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancelTradeCommand).toHaveBeenCalledWith({
      tradeId: TRADE_ID,
      playerId: PLAYER_ID,
      submissionId: SUBMISSION_ID,
    });

    const decline = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${TRADE_ID}/decline`,
      headers: { authorization: 'Bearer test-token' },
      payload: { submissionId: SUBMISSION_ID },
    });
    expect(decline.statusCode).toBe(200);
    expect(declineTradeCommand).toHaveBeenCalledWith({
      tradeId: TRADE_ID,
      playerId: PLAYER_ID,
      submissionId: SUBMISSION_ID,
    });
  });

  it('maps stale-version conflicts without exposing database details', async () => {
    reviseTrade.mockRejectedValueOnce(
      new CardTradeError(
        'TRADE_VERSION_STALE',
        'The requested trade version is stale.',
      ),
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${TRADE_ID}`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        expectedVersion: 1,
        offeredOwnedCardIds: [OWNED_CARD_ID],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ID, quantity: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'TRADE_VERSION_STALE',
      detail: 'The requested trade version is stale.',
    });
  });

  it('requires recent proof matching the access-token identity for each acceptance', async () => {
    verifyReauthentication.mockResolvedValueOnce({
      identity: {
        issuer: authConfig.issuer,
        subject: 'auth0|different-player',
      },
      authenticatedAt: new Date('2026-09-22T10:00:00.000Z'),
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${TRADE_ID}/accept`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        expectedVersion: 1,
        reauthenticationToken: 'fresh-id-token',
      },
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toMatchObject({
      code: 'RECENT_AUTHENTICATION_REQUIRED',
    });
    expect(acceptTrade).not.toHaveBeenCalled();

    verifyReauthentication.mockResolvedValueOnce({
      identity: {
        issuer: authConfig.issuer,
        subject: 'auth0|trade-player',
      },
      authenticatedAt: new Date('2026-09-22T10:00:00.000Z'),
    });
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${TRADE_ID}/accept`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        expectedVersion: 1,
        reauthenticationToken: 'fresh-id-token',
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(acceptTrade).toHaveBeenCalledWith({
      tradeId: TRADE_ID,
      playerId: PLAYER_ID,
      submissionId: SUBMISSION_ID,
      expectedVersion: 1,
    });
  });

  it('hides a non-participant trade behind a neutral not-found response', async () => {
    getTrade.mockRejectedValueOnce(
      new CardTradeError(
        'TRADE_NOT_PARTICIPANT',
        'Only trade participants may access this trade.',
      ),
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${TRADE_ID}`,
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'TRADE_NOT_FOUND',
      detail: 'The requested card trade is unavailable.',
    });
  });

  it('uses a neutral safe detail for copy conflicts', async () => {
    acceptTrade.mockRejectedValueOnce(
      new CardTradeError(
        'TRADE_COPY_CONFLICT',
        'Internal copy 123 is locked by another relation.',
      ),
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${TRADE_ID}/accept`,
      headers: { authorization: 'Bearer test-token' },
      payload: {
        submissionId: SUBMISSION_ID,
        expectedVersion: 1,
        reauthenticationToken: 'fresh-id-token',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'TRADE_COPY_CONFLICT',
      detail:
        'The current trade can no longer be completed with the selected cards.',
    });
    expect(response.body).not.toContain('Internal copy 123');
  });

  it('publishes the authenticated trading contract through generated OpenAPI', async () => {
    await app.ready();
    const document = app.swagger();
    expect(document.paths?.['/api/v1/trades']?.post).toMatchObject({
      operationId: 'createCardTrade',
      tags: ['Trading'],
      security: [{ bearerAuth: [] }],
    });
    expect(
      document.paths?.['/api/v1/trades/{tradeId}/accept']?.post,
    ).toMatchObject({
      operationId: 'acceptCardTrade',
      security: [{ bearerAuth: [] }],
    });
  });

  it('lists only through the authenticated participant service query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/trades?direction=sent&status=open',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(listTrades).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      page: 1,
      pageSize: 20,
      direction: 'sent',
      status: 'open',
    });
    expect(response.json()).toMatchObject({
      items: [{ tradeId: TRADE_ID, counterpartyPlayerName: 'recipient_name' }],
      hasMore: false,
    });
  });
});
