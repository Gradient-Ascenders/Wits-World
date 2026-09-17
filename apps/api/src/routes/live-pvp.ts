import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  LivePvpError,
  type LiveConnectionRole,
  type LivePvpService,
} from '../matches/live-pvp-service.js';
import { apiErrorSchema } from '../openapi/battle-schemas.js';

interface Options {
  service: LivePvpService;
  webSocketUrl: string;
}

interface MatchParams {
  matchId: string;
}

interface TicketBody {
  role: LiveConnectionRole;
}

const matchParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['matchId'],
  properties: {
    matchId: { type: 'string', format: 'uuid' },
  },
} as const;

const ticketBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role'],
  properties: {
    role: { enum: ['participant', 'spectator'] },
  },
} as const;

const matchProjectionSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['matchId', 'mode', 'role', 'status', 'version', 'phase'],
  properties: {
    matchId: { type: 'string', format: 'uuid' },
    mode: { const: 'live' },
    role: { enum: ['participant', 'spectator'] },
    status: { enum: ['active', 'completed'] },
    version: { type: 'integer', minimum: 0 },
    phase: {
      enum: ['initial_selection', 'active', 'replacement', 'completed'],
    },
  },
} as const;

const ticketResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ticket',
    'role',
    'protocolVersion',
    'expiresAt',
    'webSocketUrl',
    'requestId',
  ],
  properties: {
    ticket: { type: 'string', minLength: 32, maxLength: 512 },
    role: { enum: ['participant', 'spectator'] },
    protocolVersion: { const: 1 },
    expiresAt: { type: 'string', format: 'date-time' },
    webSocketUrl: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const;

export const livePvpRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service, webSocketUrl },
) => {
  app.get<{ Params: MatchParams }>(
    '/matches/live/:matchId',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'getLivePvpMatch',
        summary: 'Read the latest live PvP projection',
        description:
          'Returns the authoritative participant or spectator-safe projection derived from the authenticated player.',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        params: matchParamsSchema,
        response: {
          200: matchProjectionSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const player = request.player;
      if (!player) throw new Error('Active player context was not loaded.');
      try {
        const match = await service.getProjection({
          matchId: request.params.matchId,
          playerId: player.id,
        });
        return { ...match, requestId: request.id };
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  app.post<{ Params: MatchParams; Body: TicketBody }>(
    '/matches/live/:matchId/connection-tickets',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'createLivePvpConnectionTicket',
        summary: 'Mint a one-use live PvP connection ticket',
        description:
          'Returns a 60-second opaque ticket for the server-derived participant or spectator role. Bearer tokens are never used on the WebSocket URL.',
        tags: ['Matches'],
        security: [{ bearerAuth: [] }],
        params: matchParamsSchema,
        body: ticketBodySchema,
        response: {
          201: ticketResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = request.player;
      if (!player) throw new Error('Active player context was not loaded.');
      try {
        const ticket = await service.mintConnectionTicket({
          matchId: request.params.matchId,
          playerId: player.id,
          requestedRole: request.body.role,
        });
        return reply.status(201).send({
          ...ticket,
          webSocketUrl,
          requestId: request.id,
        });
      } catch (error) {
        throw toApiError(error);
      }
    },
  );
};

function toApiError(error: unknown): Error {
  if (!(error instanceof LivePvpError)) {
    return error instanceof Error
      ? error
      : new Error('Live PvP request failed.');
  }
  const statusCode =
    error.code === 'LIVE_MATCH_NOT_FOUND'
      ? 404
      : error.code === 'LIVE_ACTION_FORBIDDEN'
        ? 403
        : error.code === 'LIVE_MATCH_COMPLETED' ||
            error.code === 'LIVE_VERSION_CONFLICT' ||
            error.code === 'LIVE_ACTION_ILLEGAL' ||
            error.code === 'LIVE_ACTION_LATE' ||
            error.code === 'LIVE_IDEMPOTENCY_CONFLICT' ||
            error.code === 'LIVE_TICKET_ALREADY_USED'
          ? 409
          : error.code === 'LIVE_TICKET_EXPIRED'
            ? 410
            : 401;
  return new ApiError({
    statusCode,
    code: error.code,
    title: liveErrorTitle(error.code),
    detail: error.message,
  });
}

function liveErrorTitle(code: LivePvpError['code']): string {
  switch (code) {
    case 'LIVE_MATCH_NOT_FOUND':
      return 'Live match not found';
    case 'LIVE_ACTION_FORBIDDEN':
      return 'Live action forbidden';
    case 'LIVE_MATCH_COMPLETED':
      return 'Live match completed';
    case 'LIVE_VERSION_CONFLICT':
      return 'Live match version conflict';
    case 'LIVE_ACTION_ILLEGAL':
      return 'Illegal live action';
    case 'LIVE_ACTION_LATE':
      return 'Live action arrived too late';
    case 'LIVE_IDEMPOTENCY_CONFLICT':
      return 'Live message conflict';
    case 'LIVE_TICKET_EXPIRED':
      return 'Live ticket expired';
    case 'LIVE_TICKET_ALREADY_USED':
      return 'Live ticket already used';
    case 'LIVE_CONNECTION_SUPERSEDED':
      return 'Live connection superseded';
    case 'LIVE_AUTHENTICATION_REQUIRED':
      return 'Live authentication required';
  }
}
