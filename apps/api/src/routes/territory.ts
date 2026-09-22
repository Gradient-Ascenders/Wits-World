import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import { apiErrorSchema } from '../openapi/battle-schemas.js';
import {
  TerritoryZoneNotFoundError,
  type TerritoryReadService,
} from '../territory/territory-read-service.js';

interface Options {
  reads: TerritoryReadService;
}

interface ZoneParams {
  zoneId: string;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const nullableDate = {
  anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
} as const;
const ownerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['playerName'],
  properties: { playerName: { type: 'string' } },
} as const;
const zoneSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'zoneId',
    'name',
    'status',
    'geometry',
    'owner',
    'seasonId',
    'windowStart',
    'windowEnd',
  ],
  properties: {
    zoneId: uuid,
    name: { type: 'string' },
    status: { enum: ['active', 'suspended'] },
    geometry: { type: 'object', additionalProperties: true },
    owner: { anyOf: [ownerSchema, { type: 'null' }] },
    seasonId: { anyOf: [uuid, { type: 'null' }] },
    windowStart: nullableDate,
    windowEnd: nullableDate,
  },
} as const;
const authenticated = {
  tags: ['Territory'],
  security: [{ bearerAuth: [] }],
  response: {
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
  },
} as const;
const zoneParams = {
  type: 'object',
  additionalProperties: false,
  required: ['zoneId'],
  properties: { zoneId: uuid },
} as const;

export const territoryRoutes: FastifyPluginAsync<Options> = async (
  app,
  { reads },
) => {
  app.get(
    '/territory/zones',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'listTerritoryZones',
        summary: 'List reviewed contested-campus zones and current ownership',
        response: {
          ...authenticated.response,
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['zones'],
            properties: { zones: { type: 'array', items: zoneSchema } },
          },
        },
      },
    },
    async (request) => reads.listZones(playerId(request)),
  );

  app.get<{ Params: ZoneParams }>(
    '/territory/zones/:zoneId',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getTerritoryZone',
        summary: 'Read one territory zone and its public ownership state',
        params: zoneParams,
        response: {
          ...authenticated.response,
          200: {
            ...zoneSchema,
            required: [
              ...zoneSchema.required,
              'lifecycleVersion',
              'lastSettledAt',
            ],
            properties: {
              ...zoneSchema.properties,
              lifecycleVersion: { type: 'integer', minimum: 0 },
              lastSettledAt: nullableDate,
            },
          },
        },
      },
    },
    async (request) => {
      try {
        return await reads.getZone(playerId(request), request.params.zoneId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  app.get<{ Params: ZoneParams }>(
    '/territory/zones/:zoneId/standings',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getTerritoryStandings',
        summary: 'Read anonymous current influence standings for a territory',
        params: zoneParams,
        response: {
          ...authenticated.response,
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['zoneId', 'seasonId', 'top', 'activity', 'viewer'],
            properties: {
              zoneId: uuid,
              seasonId: { anyOf: [uuid, { type: 'null' }] },
              top: {
                type: 'array',
                maxItems: 3,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['rank', 'influence'],
                  properties: {
                    rank: { type: 'integer', minimum: 1, maximum: 3 },
                    influence: { type: 'integer', minimum: 1 },
                  },
                },
              },
              activity: {
                type: 'object',
                additionalProperties: false,
                required: ['influence', 'contributors'],
                properties: {
                  influence: { type: 'integer', minimum: 0 },
                  contributors: { type: 'integer', minimum: 0 },
                },
              },
              viewer: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'influence',
                  'todayInfluence',
                  'dailyCap',
                  'remainingDailyInfluence',
                ],
                properties: {
                  influence: { type: 'integer', minimum: 0 },
                  todayInfluence: { type: 'integer', minimum: 0 },
                  dailyCap: { type: 'integer', minimum: 1 },
                  remainingDailyInfluence: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      try {
        return await reads.standings(playerId(request), request.params.zoneId);
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  app.get<{ Params: ZoneParams }>(
    '/territory/zones/:zoneId/history',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        ...authenticated,
        operationId: 'getTerritoryHistory',
        summary: 'Read recent public ownership history for a territory',
        params: zoneParams,
        response: {
          ...authenticated.response,
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['zoneId', 'entries'],
            properties: {
              zoneId: uuid,
              entries: {
                type: 'array',
                maxItems: 50,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'seasonId',
                    'owner',
                    'transitionKind',
                    'effectiveAt',
                  ],
                  properties: {
                    seasonId: { anyOf: [uuid, { type: 'null' }] },
                    owner: { anyOf: [ownerSchema, { type: 'null' }] },
                    transitionKind: { type: 'string' },
                    effectiveAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      try {
        return await reads.history(playerId(request), request.params.zoneId);
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
  if (error instanceof TerritoryZoneNotFoundError) {
    return new ApiError({
      statusCode: 404,
      code: 'TERRITORY_ZONE_NOT_FOUND',
      title: 'Territory zone unavailable',
      detail: error.message,
    });
  }
  return error instanceof Error
    ? error
    : new Error('Territory request failed.');
}
