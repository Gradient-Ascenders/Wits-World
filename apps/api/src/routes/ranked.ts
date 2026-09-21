import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import { RankedError } from '../matches/ranked-database.js';
import type { RankedReadService } from '../matches/ranked-read-service.js';
import type { RankedService } from '../matches/ranked-service.js';
import { apiErrorSchema } from '../openapi/battle-schemas.js';
import { InvalidCursorError } from '../security/signed-cursor.js';

interface Options {
  service: RankedService;
  reads: RankedReadService;
}

interface JoinBody {
  deckId: string;
}
interface ProposalParams {
  proposalId: string;
}
interface MatchParams {
  matchId: string;
}
interface SeasonParams {
  seasonId: string;
}
interface PageQuery {
  cursor?: string;
  limit?: number;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const nullableUuid = { anyOf: [uuid, { type: 'null' }] } as const;
const nullableDate = {
  anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
} as const;
const queueSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'queueEntryId',
    'seasonId',
    'joinedAt',
    'leaseExpiresAt',
    'searchRange',
    'proposalId',
    'acceptanceDeadline',
    'accepted',
    'matchId',
  ],
  properties: {
    status: {
      enum: [
        'idle',
        'searching',
        'proposed',
        'matched',
        'cancelled',
        'expired',
        'restricted',
        'invalid_deck',
      ],
    },
    queueEntryId: nullableUuid,
    seasonId: nullableUuid,
    joinedAt: nullableDate,
    leaseExpiresAt: nullableDate,
    searchRange: {
      anyOf: [
        { type: 'integer', minimum: 100, maximum: 400 },
        { type: 'null' },
      ],
    },
    proposalId: nullableUuid,
    acceptanceDeadline: nullableDate,
    accepted: { type: 'boolean' },
    matchId: nullableUuid,
  },
} as const;
const seasonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'seasonId',
    'name',
    'status',
    'policyVersion',
    'activatedAt',
    'activeEndsAt',
    'closedAt',
  ],
  properties: {
    seasonId: uuid,
    name: { type: 'string' },
    status: { enum: ['scheduled', 'active', 'closing', 'closed'] },
    policyVersion: { type: 'string' },
    activatedAt: nullableDate,
    activeEndsAt: nullableDate,
    closedAt: nullableDate,
  },
} as const;
const standingSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'playerName',
    'rank',
    'rating',
    'wins',
    'losses',
    'settledMatchCount',
  ],
  properties: {
    playerName: { type: 'string' },
    rank: { type: 'integer', minimum: 1 },
    rating: { type: 'integer', minimum: 100 },
    wins: { type: 'integer', minimum: 0 },
    losses: { type: 'integer', minimum: 0 },
    settledMatchCount: { type: 'integer', minimum: 5 },
  },
} as const;
const standingsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['season', 'entries', 'nextCursor'],
  properties: {
    season: seasonSchema,
    entries: { type: 'array', items: standingSchema },
    nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;
const profileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'season',
    'rating',
    'wins',
    'losses',
    'settledMatchCount',
    'placementMatchesRemaining',
    'provisional',
  ],
  properties: {
    season: { anyOf: [seasonSchema, { type: 'null' }] },
    rating: { anyOf: [{ type: 'integer', minimum: 100 }, { type: 'null' }] },
    wins: { type: 'integer', minimum: 0 },
    losses: { type: 'integer', minimum: 0 },
    settledMatchCount: { type: 'integer', minimum: 0 },
    placementMatchesRemaining: { type: 'integer', minimum: 0, maximum: 5 },
    provisional: { type: 'boolean' },
  },
} as const;
const settlementSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'matchId',
    'seasonId',
    'status',
    'completionReason',
    'outcome',
    'ratingBefore',
    'ratingAfter',
    'appliedDelta',
    'settledAt',
  ],
  properties: {
    matchId: uuid,
    seasonId: uuid,
    status: { enum: ['pending', 'settled'] },
    completionReason: {
      anyOf: [
        {
          enum: [
            'defeat',
            'abandonment_forfeit',
            'voluntary_resignation',
            'account_deletion_forfeit',
          ],
        },
        { type: 'null' },
      ],
    },
    outcome: { anyOf: [{ enum: ['win', 'loss'] }, { type: 'null' }] },
    ratingBefore: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    ratingAfter: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    appliedDelta: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    settledAt: nullableDate,
  },
} as const;
const pageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', minLength: 1, maxLength: 512 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
} as const;
const authenticated = {
  tags: ['Ranked'],
  security: [{ bearerAuth: [] }],
  response: {
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
  },
} as const;

export const rankedRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service, reads },
) => {
  app.post<{ Body: JoinBody }>(
    '/ranked/queue',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'joinRankedQueue',
        summary: 'Join the current ranked queue with an owned valid deck',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['deckId'],
          properties: { deckId: uuid },
        },
        response: { ...authenticated.response, 200: queueSchema },
      },
    },
    async (request) => {
      try {
        return await service.join(playerId(request), request.body.deckId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  app.get(
    '/ranked/queue',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getRankedQueue',
        summary: 'Read only your ranked queue state',
        response: { ...authenticated.response, 200: queueSchema },
      },
    },
    async (request) => service.status(playerId(request)),
  );

  app.post(
    '/ranked/queue/heartbeat',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'heartbeatRankedQueue',
        summary: 'Renew a live searching lease',
        response: { ...authenticated.response, 200: queueSchema },
      },
    },
    async (request) => service.heartbeat(playerId(request)),
  );

  app.delete(
    '/ranked/queue',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'cancelRankedQueue',
        summary: 'Cancel searching or decline a pending proposal',
        response: { ...authenticated.response, 200: queueSchema },
      },
    },
    async (request) => {
      try {
        return await service.cancel(playerId(request));
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  for (const action of ['accept', 'decline'] as const) {
    app.post<{ Params: ProposalParams }>(
      `/ranked/proposals/:proposalId/${action}`,
      {
        preHandler: [app.authenticate, app.requireActivePlayer],
        schema: {
          ...authenticated,
          operationId:
            action === 'accept'
              ? 'acceptRankedProposal'
              : 'declineRankedProposal',
          summary:
            action === 'accept'
              ? 'Accept your pending ranked proposal'
              : 'Decline your pending ranked proposal',
          params: {
            type: 'object',
            additionalProperties: false,
            required: ['proposalId'],
            properties: { proposalId: uuid },
          },
          response: { ...authenticated.response, 200: queueSchema },
        },
      },
      async (request) => {
        try {
          return await service[action](
            playerId(request),
            request.params.proposalId,
          );
        } catch (error) {
          throw toApiError(error);
        }
      },
    );
  }

  app.get(
    '/ranked/me',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getRankedProfile',
        summary: 'Read your own seasonal rating and placements',
        response: { ...authenticated.response, 200: profileSchema },
      },
    },
    async (request) => reads.profile(playerId(request)),
  );

  app.get<{ Params: MatchParams }>(
    '/ranked/matches/:matchId/settlement',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getRankedSettlement',
        summary: 'Read your own ranked match settlement',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['matchId'],
          properties: { matchId: uuid },
        },
        response: { ...authenticated.response, 200: settlementSchema },
      },
    },
    async (request) => {
      try {
        return await reads.settlement(
          playerId(request),
          request.params.matchId,
        );
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  app.get(
    '/ranked/seasons/current',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getCurrentRankedSeason',
        summary: 'Read the current ranked season',
        response: {
          ...authenticated.response,
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['season'],
            properties: { season: { anyOf: [seasonSchema, { type: 'null' }] } },
          },
        },
      },
    },
    async () => ({ season: await reads.currentSeason() }),
  );

  app.get<{ Querystring: PageQuery }>(
    '/ranked/standings',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'listCurrentRankedStandings',
        summary: 'Page through established current-season standings',
        querystring: pageQuerySchema,
        response: { ...authenticated.response, 200: standingsSchema },
      },
    },
    async (request) => {
      try {
        return await reads.currentStandings(
          playerId(request),
          request.query.limit ?? 25,
          request.query.cursor,
        );
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  app.get<{ Params: SeasonParams; Querystring: PageQuery }>(
    '/ranked/seasons/:seasonId/standings',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'listArchivedRankedStandings',
        summary: 'Page through immutable closed-season results',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['seasonId'],
          properties: { seasonId: uuid },
        },
        querystring: pageQuerySchema,
        response: { ...authenticated.response, 200: standingsSchema },
      },
    },
    async (request) => {
      try {
        return await reads.archivedStandings(
          playerId(request),
          request.params.seasonId,
          request.query.limit ?? 25,
          request.query.cursor,
        );
      } catch (error) {
        throw toApiError(error);
      }
    },
  );
};

function playerId(request: { player?: { id: string } | null }): string {
  if (!request.player) throw new Error('Active player context was not loaded.');
  return request.player.id;
}

function toApiError(error: unknown): Error {
  if (error instanceof InvalidCursorError) {
    return new ApiError({
      statusCode: 400,
      code: 'RANKED_CURSOR_INVALID',
      title: 'Invalid ranked cursor',
      detail: error.message,
    });
  }
  if (error instanceof RankedError) {
    return new ApiError({
      statusCode: error.statusCode,
      code: error.code,
      title: 'Ranked request unavailable',
      detail: error.message,
    });
  }
  return error instanceof Error ? error : new Error('Ranked request failed.');
}
