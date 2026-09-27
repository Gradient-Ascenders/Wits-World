import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { TrustActivityRestrictedError } from '../trust/trust-restrictions.js';
import { validatePlayerName } from '@wits-world/account-policy';

import { ApiError } from '../errors/api-error.js';
import {
  AsyncPvpError,
  type AsyncPvpMatchView,
  type AsyncPvpService,
  type PvpAction,
  type PvpInvitationView,
  type PvpInvitationStatus,
} from '../matches/asynchronous-pvp-service.js';
import {
  acceptsBattleSwaps,
  asyncPvpMatchForClient,
  PVP_SWAP_MEDIA_TYPE,
} from '../matches/battle-projection-capability.js';
import {
  apiErrorSchema,
  publicCreatureSchema,
  publicEffectSchema,
  publicPowerCardSchema,
  pvpActionSchema,
} from '../openapi/battle-schemas.js';
import { InvalidCursorError } from '../security/signed-cursor.js';

interface Options {
  service: AsyncPvpService;
}
interface InvitationParams {
  invitationId: string;
}
interface MatchParams {
  matchId: string;
}
interface PageQuery {
  cursor?: string;
  limit?: number;
}
const RESIGNATION_CONTRACT_MEDIA_TYPE =
  'application/vnd.wits-world.pvp.v2+json';
const CANCELLATION_CONTRACT_MEDIA_TYPE =
  'application/vnd.wits-world.pvp.v3+json';
const BATTLE_HISTORY_CONTRACT_MEDIA_TYPE =
  'application/vnd.wits-world.pvp.v4+json';
const pvpContractHeadersSchema = {
  type: 'object',
  properties: {
    accept: {
      type: 'string',
      description: `Include ${PVP_SWAP_MEDIA_TYPE} for voluntary Creature swaps and the current battle projection, ${BATTLE_HISTORY_CONTRACT_MEDIA_TYPE} for participant-safe full battle history, ${CANCELLATION_CONTRACT_MEDIA_TYPE} for invitation cancellation, or ${RESIGNATION_CONTRACT_MEDIA_TYPE} for voluntary resignation only, without adding a non-safelisted CORS request header.`,
    },
  },
} as const;
interface InvitationQuery extends PageQuery {
  direction?: 'incoming' | 'outgoing';
  status?: PvpInvitationStatus;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const nullableTimestamp = {
  anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
} as const;
const opponentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['playerName'],
  properties: { playerName: { type: 'string' } },
} as const;
const invitationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'invitationId',
    'direction',
    'status',
    'version',
    'opponent',
    'createdAt',
    'expiresAt',
    'respondedAt',
    'matchId',
  ],
  properties: {
    invitationId: uuid,
    direction: { enum: ['incoming', 'outgoing'] },
    status: {
      enum: [
        'pending',
        'accepted',
        'declined',
        'cancelled',
        'expired',
        'invalidated',
      ],
    },
    version: { type: 'integer', minimum: 0 },
    opponent: opponentSchema,
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    respondedAt: nullableTimestamp,
    matchId: { anyOf: [uuid, { type: 'null' }] },
    canCancel: {
      type: 'boolean',
      description:
        'Server-derived outgoing pending-invitation capability returned to PvP contract version 3 clients.',
    },
  },
} as const;
const actionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'side',
    'action',
    'effects',
    'defeatedCreatureId',
    'winner',
    'turnEnded',
  ],
  properties: {
    side: { enum: ['self', 'opponent'] },
    action: pvpActionSchema,
    effects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'effectId',
          'effectType',
          'targetSide',
          'targetCreatureId',
          'amount',
          'damageMultiplier',
          'modifier',
        ],
        properties: {
          effectId: { type: 'string' },
          effectType: { enum: ['buff', 'damage', 'debuff', 'heal'] },
          targetSide: { enum: ['self', 'opponent'] },
          targetCreatureId: uuid,
          amount: { type: 'number' },
          damageMultiplier: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          modifier: publicEffectSchema.properties.modifier,
        },
      },
    },
    defeatedCreatureId: { anyOf: [uuid, { type: 'null' }] },
    winner: { anyOf: [{ enum: ['self', 'opponent'] }, { type: 'null' }] },
    turnEnded: { type: 'boolean' },
  },
} as const;
const actionHistoryEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sequence', 'turnNumber', 'createdAt', 'result'],
  properties: {
    sequence: { type: 'integer', minimum: 1 },
    turnNumber: { type: 'integer', minimum: 1 },
    createdAt: { type: 'string', format: 'date-time' },
    result: actionResultSchema,
  },
} as const;
const selfParticipantSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'playerName',
    'creatures',
    'powerCards',
    'usedPowerCardIds',
    'activeCreatureId',
  ],
  properties: {
    playerName: { type: 'string' },
    creatures: { type: 'array', items: publicCreatureSchema },
    powerCards: { type: 'array', items: publicPowerCardSchema },
    usedPowerCardIds: { type: 'array', items: uuid },
    activeCreatureId: { anyOf: [uuid, { type: 'null' }] },
  },
} as const;
const opponentParticipantSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'playerName',
    'activeCreature',
    'defeatedCreatures',
    'remainingCreatureCount',
    'playedPowerCards',
    'remainingPowerCardCount',
  ],
  properties: {
    playerName: { type: 'string' },
    activeCreature: { anyOf: [publicCreatureSchema, { type: 'null' }] },
    defeatedCreatures: { type: 'array', items: publicCreatureSchema },
    remainingCreatureCount: { type: 'integer', minimum: 0 },
    playedPowerCards: { type: 'array', items: publicPowerCardSchema },
    remainingPowerCardCount: { type: 'integer', minimum: 0 },
  },
} as const;
const matchSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'matchId',
    'mode',
    'status',
    'version',
    'opponent',
    'currentActor',
    'turnDeadline',
    'state',
    'legalActions',
    'lastAction',
    'outcome',
    'completionReason',
    'startedAt',
    'updatedAt',
    'completedAt',
    'requestId',
  ],
  properties: {
    matchId: uuid,
    mode: { const: 'asynchronous' },
    status: { enum: ['active', 'completed'] },
    version: { type: 'integer', minimum: 0 },
    opponent: opponentSchema,
    currentActor: { anyOf: [{ enum: ['self', 'opponent'] }, { type: 'null' }] },
    turnDeadline: nullableTimestamp,
    state: {
      type: 'object',
      additionalProperties: false,
      required: ['phase', 'turnNumber', 'self', 'opponent'],
      properties: {
        phase: { enum: ['active', 'replacement', 'completed'] },
        turnNumber: { type: 'integer', minimum: 1 },
        self: selfParticipantSchema,
        opponent: opponentParticipantSchema,
      },
    },
    legalActions: { type: 'array', items: pvpActionSchema },
    history: { type: 'array', items: actionHistoryEntrySchema },
    lastAction: { anyOf: [actionResultSchema, { type: 'null' }] },
    outcome: { anyOf: [{ enum: ['win', 'loss'] }, { type: 'null' }] },
    completionReason: {
      anyOf: [
        {
          enum: [
            'defeat',
            'turn_forfeit',
            'account_deletion_forfeit',
            'voluntary_resignation',
          ],
        },
        { type: 'null' },
      ],
    },
    startedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    completedAt: nullableTimestamp,
    canResign: {
      type: 'boolean',
      description:
        'Server-derived active-match capability returned to PvP contract version 2 clients.',
    },
    requestId: { type: 'string' },
  },
} as const;
const pageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', maxLength: 512 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
} as const;
const paramsSchema = (name: string) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: [name],
    properties: { [name]: uuid },
  }) as const;

export const asynchronousPvpRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service },
) => {
  const secured = [app.authenticate, app.requireActivePlayer];
  app.get<{ Querystring: { playerName: string } }>(
    '/matches/pvp/players',
    {
      preHandler: secured,
      schema: {
        operationId: 'findPvpPlayer',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['playerName'],
          properties: {
            playerName: { type: 'string', minLength: 3, maxLength: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['playerName', 'requestId'],
            properties: {
              playerName: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const validation = validatePlayerName(request.query.playerName);
      if (!validation.valid) throw validationError();
      try {
        return {
          playerName: await service.findPlayer(
            playerId(request),
            validation.playerName,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  app.post<{
    Body: {
      opponentPlayerName: string;
      deckId: string;
      initialCreatureId: string;
      submissionId: string;
    };
  }>(
    '/matches/pvp/invitations',
    {
      preHandler: secured,
      schema: {
        operationId: 'createPvpInvitation',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'opponentPlayerName',
            'deckId',
            'initialCreatureId',
            'submissionId',
          ],
          properties: {
            opponentPlayerName: { type: 'string', minLength: 3, maxLength: 20 },
            deckId: uuid,
            initialCreatureId: uuid,
            submissionId: uuid,
          },
        },
        response: {
          201: invitationEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const validation = validatePlayerName(request.body.opponentPlayerName);
      if (!validation.valid) throw validationError();
      try {
        const invitation = await service.createInvitation({
          playerId: playerId(request),
          ...request.body,
          opponentPlayerName: validation.playerName,
        });
        return reply.status(201).send({
          invitation: invitationEnvelope(invitation, request),
          requestId: request.id,
        });
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  app.get<{ Querystring: InvitationQuery }>(
    '/matches/pvp/invitations',
    {
      preHandler: secured,
      schema: {
        operationId: 'listPvpInvitations',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        querystring: {
          ...pageQuerySchema,
          properties: {
            ...pageQuerySchema.properties,
            direction: { enum: ['incoming', 'outgoing'] },
            status: {
              enum: [
                'pending',
                'accepted',
                'declined',
                'cancelled',
                'expired',
                'invalidated',
              ],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['invitations', 'nextCursor', 'requestId'],
            properties: {
              invitations: { type: 'array', items: invitationSchema },
              nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const page = await service.listInvitations({
          playerId: playerId(request),
          ...request.query,
        });
        if (
          !supportsPvpContract(request, 3) &&
          page.items.some((invitation) => invitation.status === 'cancelled')
        ) {
          throw clientUpdateRequiredError('invitation cancellation');
        }
        return {
          invitations: page.items.map((invitation) =>
            invitationEnvelope(invitation, request),
          ),
          nextCursor: page.nextCursor,
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  app.post<{
    Params: InvitationParams;
    Body: {
      deckId: string;
      initialCreatureId: string;
      submissionId: string;
      expectedVersion: number;
    };
  }>(
    '/matches/pvp/invitations/:invitationId/accept',
    {
      preHandler: secured,
      schema: {
        operationId: 'acceptPvpInvitation',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        params: paramsSchema('invitationId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'deckId',
            'initialCreatureId',
            'submissionId',
            'expectedVersion',
          ],
          properties: {
            deckId: uuid,
            initialCreatureId: uuid,
            submissionId: uuid,
            expectedVersion: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['invitation', 'match', 'requestId'],
            properties: {
              invitation: invitationSchema,
              match: matchSchema,
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const result = await service.acceptInvitation({
          playerId: playerId(request),
          invitationId: request.params.invitationId,
          ...request.body,
        });
        return {
          invitation: invitationEnvelope(result.invitation, request),
          match: matchEnvelope(result.match, request),
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  app.post<{
    Params: InvitationParams;
    Body: { submissionId: string; expectedVersion: number };
  }>(
    '/matches/pvp/invitations/:invitationId/decline',
    {
      preHandler: secured,
      schema: {
        operationId: 'declinePvpInvitation',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        params: paramsSchema('invitationId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['submissionId', 'expectedVersion'],
          properties: {
            submissionId: uuid,
            expectedVersion: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          200: invitationEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          invitation: invitationEnvelope(
            await service.declineInvitation({
              playerId: playerId(request),
              invitationId: request.params.invitationId,
              ...request.body,
            }),
            request,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  app.post<{
    Params: InvitationParams;
    Body: { submissionId: string; expectedVersion: number };
  }>(
    '/matches/pvp/invitations/:invitationId/cancel',
    {
      preHandler: secured,
      schema: {
        operationId: 'cancelPvpInvitation',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        params: paramsSchema('invitationId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['submissionId', 'expectedVersion'],
          properties: {
            submissionId: uuid,
            expectedVersion: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          200: invitationEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        if (!supportsPvpContract(request, 3)) {
          throw clientUpdateRequiredError('invitation cancellation');
        }
        return {
          invitation: invitationEnvelope(
            await service.cancelInvitation({
              playerId: playerId(request),
              invitationId: request.params.invitationId,
              ...request.body,
            }),
            request,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  registerMatchRoutes(app, service, secured);
};

function registerMatchRoutes(
  app: Parameters<FastifyPluginAsync<Options>>[0],
  service: AsyncPvpService,
  secured: Parameters<FastifyPluginAsync<Options>>[0]['authenticate'][],
) {
  app.get<{ Querystring: PageQuery }>(
    '/matches/pvp/history',
    {
      preHandler: secured,
      schema: {
        operationId: 'listPvpHistory',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        querystring: pageQuerySchema,
        response: {
          200: historyEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const page = await service.listHistory({
          playerId: playerId(request),
          ...request.query,
        });
        if (
          !supportsPvpContract(request, 2) &&
          page.items.some(
            (match) => match.completionReason === 'voluntary_resignation',
          )
        ) {
          throw clientUpdateRequiredError('voluntary match resignation');
        }
        return {
          matches: page.items,
          nextCursor: page.nextCursor,
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );
  app.get<{ Querystring: PageQuery }>(
    '/matches/pvp',
    {
      preHandler: secured,
      schema: {
        operationId: 'listActivePvpMatches',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        querystring: pageQuerySchema,
        response: {
          200: activeEnvelopeSchema(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const page = await service.listActiveMatches({
          playerId: playerId(request),
          ...request.query,
        });
        return {
          matches: page.items,
          nextCursor: page.nextCursor,
          requestId: request.id,
        };
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );
  app.get<{ Params: MatchParams }>(
    '/matches/pvp/:matchId',
    {
      preHandler: secured,
      schema: {
        operationId: 'getPvpMatch',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        params: paramsSchema('matchId'),
        response: {
          200: matchSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        const match = await service.getMatch(
          playerId(request),
          request.params.matchId,
        );
        if (
          !supportsPvpContract(request, 2) &&
          match.completionReason === 'voluntary_resignation'
        ) {
          throw clientUpdateRequiredError('voluntary match resignation');
        }
        return matchEnvelope(match, request);
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );
  app.post<{
    Params: MatchParams;
    Body: { submissionId: string; expectedVersion: number; action: PvpAction };
  }>(
    '/matches/pvp/:matchId/actions',
    {
      preHandler: secured,
      schema: {
        operationId: 'submitPvpAction',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        params: paramsSchema('matchId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['submissionId', 'expectedVersion', 'action'],
          properties: {
            submissionId: uuid,
            expectedVersion: { type: 'integer', minimum: 0 },
            action: pvpActionSchema,
          },
        },
        response: {
          200: matchSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return matchEnvelope(
          await service.submitAction({
            playerId: playerId(request),
            matchId: request.params.matchId,
            ...request.body,
          }),
          request,
        );
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );

  app.post<{
    Params: MatchParams;
    Body: { submissionId: string; expectedVersion: number };
  }>(
    '/matches/pvp/:matchId/resign',
    {
      preHandler: secured,
      schema: {
        operationId: 'resignPvpMatch',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        headers: pvpContractHeadersSchema,
        params: paramsSchema('matchId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['submissionId', 'expectedVersion'],
          properties: {
            submissionId: uuid,
            expectedVersion: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          200: matchSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        if (!supportsPvpContract(request, 2)) {
          throw clientUpdateRequiredError('voluntary match resignation');
        }
        return matchEnvelope(
          await service.resignMatch({
            playerId: playerId(request),
            matchId: request.params.matchId,
            ...request.body,
          }),
          request,
        );
      } catch (error) {
        throw mapError(error, request);
      }
    },
  );
}

function matchEnvelope(match: AsyncPvpMatchView, request: FastifyRequest) {
  const compatible = asyncPvpMatchForClient(
    match,
    acceptsBattleSwaps(request, PVP_SWAP_MEDIA_TYPE),
  );
  const { history, ...legacyMatch } = compatible;
  return {
    ...legacyMatch,
    ...(supportsPvpContract(request, 4) ? { history } : {}),
    ...(supportsPvpContract(request, 2)
      ? { canResign: match.status === 'active' }
      : {}),
    requestId: request.id,
  };
}

function invitationEnvelope(
  invitation: PvpInvitationView,
  request: FastifyRequest,
) {
  return {
    ...invitation,
    ...(supportsPvpContract(request, 3)
      ? {
          canCancel:
            invitation.direction === 'outgoing' &&
            invitation.status === 'pending',
        }
      : {}),
  };
}

function supportsPvpContract(
  request: FastifyRequest,
  minimumVersion: 2 | 3 | 4,
): boolean {
  const acceptedTypes =
    request.headers.accept
      ?.split(',')
      .map((range) => range.trim().split(';', 1)[0]?.toLowerCase()) ?? [];
  return acceptedTypes.some((mediaType) => {
    if (mediaType === PVP_SWAP_MEDIA_TYPE) return true;
    if (mediaType === BATTLE_HISTORY_CONTRACT_MEDIA_TYPE) return true;
    if (mediaType === CANCELLATION_CONTRACT_MEDIA_TYPE)
      return minimumVersion <= 3;
    return (
      mediaType === RESIGNATION_CONTRACT_MEDIA_TYPE && minimumVersion === 2
    );
  });
}

function clientUpdateRequiredError(capability: string): ApiError {
  return new ApiError({
    statusCode: 409,
    code: 'PVP_CLIENT_UPDATE_REQUIRED',
    title: 'PvP client update required',
    detail: `Reload Wits World before using ${capability}.`,
  });
}

function invitationEnvelopeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['invitation', 'requestId'],
    properties: { invitation: invitationSchema, requestId: { type: 'string' } },
  } as const;
}
function activeEnvelopeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['matches', 'nextCursor', 'requestId'],
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'matchId',
            'mode',
            'status',
            'version',
            'opponent',
            'currentActor',
            'turnDeadline',
            'updatedAt',
          ],
          properties: {
            matchId: uuid,
            mode: { const: 'asynchronous' },
            status: { const: 'active' },
            version: { type: 'integer' },
            opponent: opponentSchema,
            currentActor: { enum: ['self', 'opponent'] },
            turnDeadline: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      requestId: { type: 'string' },
    },
  } as const;
}
function historyEnvelopeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['matches', 'nextCursor', 'requestId'],
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'matchId',
            'mode',
            'status',
            'opponent',
            'outcome',
            'completionReason',
            'startedAt',
            'completedAt',
          ],
          properties: {
            matchId: uuid,
            mode: { const: 'asynchronous' },
            status: { const: 'completed' },
            opponent: opponentSchema,
            outcome: { enum: ['win', 'loss'] },
            completionReason: {
              enum: [
                'defeat',
                'turn_forfeit',
                'account_deletion_forfeit',
                'voluntary_resignation',
              ],
            },
            startedAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      requestId: { type: 'string' },
    },
  } as const;
}
function playerId(request: FastifyRequest): string {
  if (!request.player) throw new Error('Active player context is missing.');
  return request.player.id;
}
function validationError(): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    title: 'Validation failed',
    detail: 'The request contains an invalid Player Name.',
  });
}
function mapError(error: unknown, request?: FastifyRequest): Error {
  if (error instanceof TrustActivityRestrictedError) {
    return new ApiError({
      statusCode: 403,
      code: error.code,
      title: 'Activity temporarily unavailable',
      detail: error.message,
    });
  }
  if (
    error instanceof AsyncPvpError &&
    error.code === 'PVP_INVITATION_CANCELLED' &&
    request &&
    !supportsPvpContract(request, 3)
  ) {
    return clientUpdateRequiredError('invitation cancellation');
  }
  if (error instanceof InvalidCursorError)
    return new ApiError({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      title: 'Validation failed',
      detail: 'The pagination cursor is invalid.',
    });
  if (!(error instanceof AsyncPvpError))
    return error instanceof Error
      ? error
      : new Error('PvP operation failed unexpectedly.');
  const status =
    error.code === 'PVP_PLAYER_UNAVAILABLE' || error.code.endsWith('_NOT_FOUND')
      ? 404
      : error.code === 'PVP_DECK_INVALID'
        ? 400
        : 409;
  return new ApiError({
    statusCode: status,
    code: error.code,
    title: pvpTitle(error.code),
    detail: error.message,
  });
}
function pvpTitle(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
