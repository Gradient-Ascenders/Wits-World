import { validatePlayerName } from '@wits-world/account-policy';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { ReauthenticationTokenVerifier } from '../auth/reauthentication-token-verifier.js';
import { ApiError } from '../errors/api-error.js';
import { apiErrorSchema } from '../openapi/battle-schemas.js';
import {
  CardTradeError,
  type CardTradePage,
  type CardTradePartyView,
  type CardTradeService,
  type CardTradeStatus,
  type CardTradeView,
} from '../trading/card-trade-service.js';

interface Options {
  service: CardTradeService;
  reauthenticationVerifier: ReauthenticationTokenVerifier;
}

interface TradeParams {
  tradeId: string;
}

interface RequestedDefinitionBody {
  cardDefinitionId: string;
  quantity: number;
}

interface CreateTradeBody {
  submissionId: string;
  recipientPlayerName: string;
  offeredOwnedCardIds: string[];
  requestedDefinitions: RequestedDefinitionBody[];
}

interface ReviseTradeBody {
  submissionId: string;
  expectedVersion: number;
  offeredOwnedCardIds: string[];
  requestedDefinitions: RequestedDefinitionBody[];
}

interface VersionedTradeBody {
  submissionId: string;
  expectedVersion: number;
}

interface AcceptTradeBody extends VersionedTradeBody {
  reauthenticationToken: string;
}

interface SubmissionBody {
  submissionId: string;
}

interface TradeListQuery {
  page?: number;
  pageSize?: number;
  direction?: 'sent' | 'received';
  status?: CardTradeStatus;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const nullableTimestamp = {
  anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
} as const;
const nullableString = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;
const cardAffinity = {
  anyOf: [
    { enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'] },
    { type: 'null' },
  ],
} as const;
const cardCategory = { enum: ['creature', 'power'] } as const;
const cardRarity = {
  enum: ['common', 'rare', 'epic', 'legendary'],
} as const;
const tradeStatus = {
  enum: [
    'open',
    'completed',
    'declined',
    'cancelled',
    'expired',
    'invalidated',
  ],
} as const;
const tradeParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tradeId'],
  properties: { tradeId: uuid },
} as const;
const requestedDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cardDefinitionId', 'quantity'],
  properties: {
    cardDefinitionId: uuid,
    quantity: { type: 'integer', minimum: 1, maximum: 5 },
  },
} as const;
const offeredCopySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ownedCardId',
    'cardDefinitionId',
    'name',
    'category',
    'affinity',
    'rarity',
    'imageUrl',
    'imageAlt',
  ],
  properties: {
    ownedCardId: uuid,
    cardDefinitionId: uuid,
    name: { type: 'string' },
    category: cardCategory,
    affinity: cardAffinity,
    rarity: cardRarity,
    imageUrl: nullableString,
    imageAlt: nullableString,
  },
} as const;
const requestedDefinitionViewSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'cardDefinitionId',
    'quantity',
    'name',
    'category',
    'affinity',
    'rarity',
    'imageUrl',
    'imageAlt',
  ],
  properties: {
    ...requestedDefinitionSchema.properties,
    name: { type: 'string' },
    category: cardCategory,
    affinity: cardAffinity,
    rarity: cardRarity,
    imageUrl: nullableString,
    imageAlt: nullableString,
  },
} as const;
const tradePartySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'offeredCopies',
    'requestedDefinitions',
    'rarityPoints',
    'accepted',
    'imbalanceAcknowledged',
  ],
  properties: {
    offeredCopies: { type: 'array', items: offeredCopySchema },
    requestedDefinitions: {
      type: 'array',
      items: requestedDefinitionViewSchema,
    },
    rarityPoints: { type: 'integer', minimum: 0 },
    accepted: { type: 'boolean' },
    imbalanceAcknowledged: { type: 'boolean' },
  },
} as const;
const publicTradeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tradeId',
    'role',
    'counterpartyPlayerName',
    'status',
    'version',
    'createdAt',
    'expiresAt',
    'terminalAt',
    'complete',
    'imbalanceWarningRequired',
    'self',
    'counterparty',
    'settlement',
  ],
  properties: {
    tradeId: uuid,
    role: { enum: ['sender', 'recipient'] },
    counterpartyPlayerName: { type: 'string' },
    status: tradeStatus,
    version: { type: 'integer', minimum: 1 },
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    terminalAt: nullableTimestamp,
    complete: { type: 'boolean' },
    imbalanceWarningRequired: { type: 'boolean' },
    self: tradePartySchema,
    counterparty: tradePartySchema,
    settlement: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['completedAt'],
          properties: {
            completedAt: { type: 'string', format: 'date-time' },
          },
        },
        { type: 'null' },
      ],
    },
  },
} as const;
const tradeEnvelopeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['trade', 'requestId'],
  properties: {
    trade: publicTradeSchema,
    requestId: { type: 'string' },
  },
} as const;
const submissionIdBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['submissionId'],
  properties: { submissionId: uuid },
} as const;
const versionedBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['submissionId', 'expectedVersion'],
  properties: {
    submissionId: uuid,
    expectedVersion: { type: 'integer', minimum: 1 },
  },
} as const;
const mutationResponses = {
  200: tradeEnvelopeSchema,
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  429: apiErrorSchema,
} as const;

export const cardTradeRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service, reauthenticationVerifier },
) => {
  const secured = [app.authenticate, app.requireActivePlayer];

  app.post<{ Body: CreateTradeBody }>(
    '/trades',
    {
      preHandler: secured,
      schema: {
        operationId: 'createCardTrade',
        summary: 'Create a private bilateral card trade',
        description:
          'Creates a versioned private trade using the recipient Player Name. Ownership and eligibility remain server-authoritative.',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'submissionId',
            'recipientPlayerName',
            'offeredOwnedCardIds',
            'requestedDefinitions',
          ],
          properties: {
            submissionId: uuid,
            recipientPlayerName: {
              type: 'string',
              minLength: 3,
              maxLength: 20,
            },
            offeredOwnedCardIds: {
              type: 'array',
              minItems: 1,
              maxItems: 5,
              uniqueItems: true,
              items: uuid,
            },
            requestedDefinitions: {
              type: 'array',
              minItems: 1,
              maxItems: 5,
              items: requestedDefinitionSchema,
            },
          },
        },
        response: {
          201: tradeEnvelopeSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const validation = validatePlayerName(request.body.recipientPlayerName);
      if (!validation.valid) throw playerNameValidationError();
      try {
        const trade = await service.createTrade({
          senderPlayerId: playerId(request),
          recipientPlayerName: validation.playerName,
          submissionId: request.body.submissionId,
          offeredOwnedCardIds: request.body.offeredOwnedCardIds,
          requestedDefinitions: request.body.requestedDefinitions,
        });
        return reply.status(201).send(tradeEnvelope(trade, request));
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.get<{ Querystring: TradeListQuery }>(
    '/trades',
    {
      preHandler: secured,
      schema: {
        operationId: 'listCardTrades',
        summary: 'List the current player card trades',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 20,
            },
            direction: { enum: ['sent', 'received'] },
            status: tradeStatus,
          },
        },
        response: {
          200: tradeListEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const page = await service.listTrades({
          playerId: playerId(request),
          ...request.query,
        });
        return tradeListEnvelope(page, request);
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.get<{ Params: TradeParams }>(
    '/trades/:tradeId',
    {
      preHandler: secured,
      schema: {
        operationId: 'getCardTrade',
        summary: 'View a private card trade',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        params: tradeParamsSchema,
        response: {
          200: tradeEnvelopeSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return tradeEnvelope(
          await service.getTrade(request.params.tradeId, playerId(request)),
          request,
        );
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.put<{ Params: TradeParams; Body: ReviseTradeBody }>(
    '/trades/:tradeId',
    {
      preHandler: secured,
      schema: {
        operationId: 'reviseCardTrade',
        summary: 'Create a new immutable card trade version',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        params: tradeParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'submissionId',
            'expectedVersion',
            'offeredOwnedCardIds',
            'requestedDefinitions',
          ],
          properties: {
            ...versionedBodySchema.properties,
            offeredOwnedCardIds: {
              type: 'array',
              minItems: 1,
              maxItems: 5,
              uniqueItems: true,
              items: uuid,
            },
            requestedDefinitions: {
              type: 'array',
              minItems: 1,
              maxItems: 5,
              items: requestedDefinitionSchema,
            },
          },
        },
        response: mutationResponses,
      },
    },
    async (request) => {
      try {
        return tradeEnvelope(
          await service.reviseTrade({
            tradeId: request.params.tradeId,
            playerId: playerId(request),
            ...request.body,
          }),
          request,
        );
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.post<{ Params: TradeParams; Body: VersionedTradeBody }>(
    '/trades/:tradeId/imbalance-acknowledgement',
    {
      preHandler: secured,
      schema: {
        operationId: 'acknowledgeCardTradeImbalance',
        summary: 'Acknowledge the current trade version imbalance',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        params: tradeParamsSchema,
        body: versionedBodySchema,
        response: mutationResponses,
      },
    },
    async (request) => {
      try {
        return tradeEnvelope(
          await service.acknowledgeImbalance({
            tradeId: request.params.tradeId,
            playerId: playerId(request),
            ...request.body,
          }),
          request,
        );
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.post<{ Params: TradeParams; Body: AcceptTradeBody }>(
    '/trades/:tradeId/accept',
    {
      preHandler: secured,
      schema: {
        operationId: 'acceptCardTrade',
        summary: 'Accept the current trade version',
        description:
          'Requires fresh Auth0 reauthentication proof. Both participants must accept the same immutable version before settlement.',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        params: tradeParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'submissionId',
            'expectedVersion',
            'reauthenticationToken',
          ],
          properties: {
            ...versionedBodySchema.properties,
            reauthenticationToken: {
              type: 'string',
              minLength: 1,
              maxLength: 16384,
              description:
                'Fresh Auth0 ID token used only as recent-authentication proof.',
            },
          },
        },
        response: mutationResponses,
      },
    },
    async (request) => {
      await requireRecentAuthentication(request, reauthenticationVerifier);
      try {
        return tradeEnvelope(
          await service.acceptTrade({
            tradeId: request.params.tradeId,
            playerId: playerId(request),
            submissionId: request.body.submissionId,
            expectedVersion: request.body.expectedVersion,
          }),
          request,
        );
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.post<{ Params: TradeParams; Body: SubmissionBody }>(
    '/trades/:tradeId/decline',
    {
      preHandler: secured,
      schema: {
        operationId: 'declineCardTrade',
        summary: 'Decline an incoming card trade',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        params: tradeParamsSchema,
        body: submissionIdBodySchema,
        response: mutationResponses,
      },
    },
    async (request) => {
      try {
        return tradeEnvelope(
          await service.declineTradeCommand({
            tradeId: request.params.tradeId,
            playerId: playerId(request),
            submissionId: request.body.submissionId,
          }),
          request,
        );
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );

  app.post<{ Params: TradeParams; Body: SubmissionBody }>(
    '/trades/:tradeId/cancel',
    {
      preHandler: secured,
      schema: {
        operationId: 'cancelCardTrade',
        summary: 'Cancel an outgoing card trade',
        tags: ['Trading'],
        security: [{ bearerAuth: [] }],
        params: tradeParamsSchema,
        body: submissionIdBodySchema,
        response: mutationResponses,
      },
    },
    async (request) => {
      try {
        return tradeEnvelope(
          await service.cancelTradeCommand({
            tradeId: request.params.tradeId,
            playerId: playerId(request),
            submissionId: request.body.submissionId,
          }),
          request,
        );
      } catch (error) {
        throw mapTradeError(error);
      }
    },
  );
};

function playerId(request: FastifyRequest): string {
  if (!request.player) throw new Error('Active player context is missing.');
  return request.player.id;
}

async function requireRecentAuthentication(
  request: FastifyRequest<{ Body: AcceptTradeBody }>,
  verifier: ReauthenticationTokenVerifier,
): Promise<void> {
  const identity = request.auth;
  if (!identity) throw new Error('Authenticated identity context is missing.');
  try {
    const proof = await verifier.verify(request.body.reauthenticationToken);
    if (
      proof.identity.issuer !== identity.issuer ||
      proof.identity.subject !== identity.subject
    ) {
      throw new Error(
        'Reauthentication identity does not match access identity.',
      );
    }
  } catch {
    throw new ApiError({
      statusCode: 401,
      code: 'RECENT_AUTHENTICATION_REQUIRED',
      title: 'Recent authentication required',
      detail: 'Recent authentication is required to accept a card trade.',
    });
  }
}

function playerNameValidationError(): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    title: 'Validation failed',
    detail: 'The request contains an invalid Player Name.',
  });
}

function mapTradeError(error: unknown): Error {
  if (!(error instanceof CardTradeError)) {
    return error instanceof Error
      ? error
      : new Error('Card trade operation failed unexpectedly.');
  }

  if (
    error.code === 'TRADE_NOT_FOUND' ||
    error.code === 'TRADE_NOT_PARTICIPANT'
  ) {
    return new ApiError({
      statusCode: 404,
      code: 'TRADE_NOT_FOUND',
      title: 'Card trade not found',
      detail: 'The requested card trade is unavailable.',
    });
  }

  if (error.code === 'TRADE_PLAYER_UNAVAILABLE') {
    return new ApiError({
      statusCode: 404,
      code: error.code,
      title: 'Player unavailable',
      detail: 'The requested trade participant is unavailable.',
    });
  }

  if (error.code === 'TRADE_ACTION_NOT_ALLOWED') {
    return new ApiError({
      statusCode: 403,
      code: error.code,
      title: 'Trade action not allowed',
      detail: 'This trade action is not available to the current participant.',
    });
  }

  return new ApiError({
    statusCode: 409,
    code: error.code,
    title: tradeErrorTitle(error.code),
    detail: safeTradeDetail(error),
  });
}

function safeTradeDetail(error: CardTradeError): string {
  if (
    error.code === 'TRADE_COPY_CONFLICT' ||
    error.code === 'TRADE_INVENTORY_MINIMUM'
  ) {
    return 'The current trade can no longer be completed with the selected cards.';
  }
  if (error.code === 'TRADE_PLAYER_LIMIT_REACHED') {
    return 'The trade cannot be opened under the current trading limits.';
  }
  if (error.code === 'TRADE_DAILY_LIMIT_REACHED') {
    return 'The trade cannot be completed under the current trading limits.';
  }
  return error.message;
}

function tradeErrorTitle(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function tradeEnvelope(trade: CardTradeView, request: FastifyRequest) {
  return {
    trade: publicTrade(trade, playerId(request)),
    requestId: request.id,
  };
}

function publicTrade(trade: CardTradeView, viewerPlayerId: string) {
  const isSender = trade.senderPlayerId === viewerPlayerId;
  const isRecipient = trade.recipientPlayerId === viewerPlayerId;
  if (!isSender && !isRecipient) {
    throw new Error('Card trade service returned a non-participant view.');
  }
  const self = isSender ? trade.sender : trade.recipient;
  const counterparty = isSender ? trade.recipient : trade.sender;
  return {
    tradeId: trade.tradeId,
    role: isSender ? ('sender' as const) : ('recipient' as const),
    counterpartyPlayerName: isSender
      ? trade.recipientPlayerName
      : trade.senderPlayerName,
    status: trade.status,
    version: trade.version,
    createdAt: trade.createdAt,
    expiresAt: trade.expiresAt,
    terminalAt: trade.terminalAt,
    complete: trade.complete,
    imbalanceWarningRequired: trade.imbalanceWarningRequired,
    self: publicParty(self),
    counterparty: publicParty(counterparty),
    settlement: trade.settlement
      ? { completedAt: trade.settlement.completedAt }
      : null,
  };
}

function publicParty(party: CardTradePartyView) {
  return {
    offeredCopies: party.offeredCopies.map((copy) => ({
      ownedCardId: copy.ownedCardId,
      cardDefinitionId: copy.cardDefinitionId,
      name: copy.name,
      category: copy.category,
      affinity: copy.affinity,
      rarity: copy.rarity,
      imageUrl: copy.imageUrl,
      imageAlt: copy.imageAlt,
    })),
    requestedDefinitions: party.requestedDefinitions.map((definition) => ({
      cardDefinitionId: definition.cardDefinitionId,
      quantity: definition.quantity,
      name: definition.name,
      category: definition.category,
      affinity: definition.affinity,
      rarity: definition.rarity,
      imageUrl: definition.imageUrl,
      imageAlt: definition.imageAlt,
    })),
    rarityPoints: party.rarityPoints,
    accepted: party.accepted,
    imbalanceAcknowledged: party.imbalanceAcknowledged,
  };
}

function tradeListEnvelope(page: CardTradePage, request: FastifyRequest) {
  return { ...page, requestId: request.id };
}

function tradeListEnvelopeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'page', 'pageSize', 'hasMore', 'requestId'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'tradeId',
            'direction',
            'status',
            'version',
            'counterpartyPlayerName',
            'createdAt',
            'expiresAt',
            'terminalAt',
          ],
          properties: {
            tradeId: uuid,
            direction: { enum: ['sent', 'received'] },
            status: tradeStatus,
            version: { type: 'integer', minimum: 1 },
            counterpartyPlayerName: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
            terminalAt: nullableTimestamp,
          },
        },
      },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 50 },
      hasMore: { type: 'boolean' },
      requestId: { type: 'string' },
    },
  } as const;
}
