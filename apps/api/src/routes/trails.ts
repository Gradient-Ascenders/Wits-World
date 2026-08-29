import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  evaluateLocationTiming,
  InvalidLocationClaimError,
  PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
} from '../events/location-claim.js';
import {
  InvalidNearbyUnvisitedSearchError,
  PlayerTrailNotFoundError,
  type PlayerTrailService,
} from '../trails/player-trail-service.js';

const DEFAULT_NEARBY_DISTANCE_METRES = 1_000;
const DEFAULT_NEARBY_LIMIT = 20;

interface PlayerTrailRoutesOptions {
  service: PlayerTrailService;
  clock?: () => Date;
  maxLocationClaimAgeMs?: number;
}

interface PlayerTrailParams {
  trailId: string;
}

interface NearbyUnvisitedBody {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  acquiredAt: string;
  maxDistanceMetres?: number;
  limit?: number;
}

const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    code: { type: 'string' },
    detail: { type: 'string' },
    requestId: { type: 'string' },
    validation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'message'],
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
} as const;

const playerTrailSummaryProperties = {
  trailId: { type: 'string', format: 'uuid' },
  title: { type: 'string' },
  description: { type: 'string', nullable: true },
  publicationStatus: { type: 'string', enum: ['published', 'retired'] },
  availability: {
    type: 'string',
    enum: ['active', 'upcoming', 'ended', 'retired'],
  },
  startsAt: { type: 'string', format: 'date-time', nullable: true },
  endsAt: { type: 'string', format: 'date-time', nullable: true },
  progressStatus: {
    type: 'string',
    enum: ['in_progress', 'completed', 'retired'],
  },
  completedStepCount: { type: 'integer', minimum: 0 },
  totalSteps: { type: 'integer', minimum: 1, maximum: 50 },
  currentStepPosition: {
    type: 'integer',
    minimum: 1,
    maximum: 50,
    nullable: true,
  },
} as const;

const playerTrailSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(playerTrailSummaryProperties),
  properties: playerTrailSummaryProperties,
} as const;

const playerTrailSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...Object.keys(playerTrailSummaryProperties), 'steps'],
  properties: {
    ...playerTrailSummaryProperties,
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'position',
          'eventId',
          'title',
          'description',
          'latitude',
          'longitude',
          'radiusMetres',
          'startsAt',
          'endsAt',
          'state',
          'unavailableReason',
          'completedAt',
        ],
        properties: {
          position: { type: 'integer', minimum: 1, maximum: 50 },
          eventId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          radiusMetres: { type: 'integer', minimum: 1 },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          state: {
            type: 'string',
            enum: ['completed', 'current', 'locked', 'unavailable'],
          },
          unavailableReason: {
            type: 'string',
            enum: [
              'upcoming',
              'ended',
              'event_unavailable',
              'event_retired',
              'trail_retired',
            ],
            nullable: true,
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
        },
      },
    },
  },
} as const;

const nearbyEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'eventId',
    'title',
    'description',
    'latitude',
    'longitude',
    'radiusMetres',
    'startsAt',
    'endsAt',
    'distanceMetres',
    'trailContexts',
  ],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    radiusMetres: { type: 'integer', minimum: 1 },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    distanceMetres: { type: 'number', minimum: 0 },
    trailContexts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trailId', 'title', 'position', 'totalSteps'],
        properties: {
          trailId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          position: { type: 'integer', minimum: 1, maximum: 50 },
          totalSteps: { type: 'integer', minimum: 2, maximum: 50 },
        },
      },
    },
  },
} as const;

export const playerTrailRoutes: FastifyPluginAsync<
  PlayerTrailRoutesOptions
> = async (
  app,
  {
    service,
    clock = () => new Date(),
    maxLocationClaimAgeMs = PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
  },
) => {
  const playerGuards = [app.authenticate, app.requireActivePlayer];

  app.get(
    '/trails',
    {
      onRequest: playerGuards,
      schema: {
        operationId: 'listPlayerTrails',
        summary: 'List visible trails and progress',
        description:
          "Returns effectively scheduled trails plus retired history with progress derived from this authenticated player's authoritative event completions.",
        tags: ['Trails'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['trails', 'requestId'],
            properties: {
              trails: { type: 'array', items: playerTrailSummarySchema },
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const player = requireResolvedPlayer(request);

      return {
        trails: await service.listTrails(player.id),
        requestId: request.id,
      };
    },
  );

  app.get<{ Params: PlayerTrailParams }>(
    '/trails/:trailId',
    {
      onRequest: playerGuards,
      schema: {
        operationId: 'getPlayerTrail',
        summary: 'Get ordered trail progress',
        description:
          'Returns completed, current, locked, and unavailable steps derived for the authenticated player.',
        tags: ['Trails'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['trailId'],
          properties: {
            trailId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['trail', 'requestId'],
            properties: {
              trail: playerTrailSchema,
              requestId: { type: 'string' },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const player = requireResolvedPlayer(request);

      try {
        return {
          trail: await service.getTrail(player.id, request.params.trailId),
          requestId: request.id,
        };
      } catch (error) {
        throwPlayerTrailError(error);
      }
    },
  );

  app.post<{ Body: NearbyUnvisitedBody }>(
    '/events/nearby-unvisited',
    {
      onRequest: playerGuards,
      schema: {
        operationId: 'listNearbyUnvisitedEvents',
        summary: 'Find nearby unvisited current events',
        description:
          'Uses a fresh untrusted browser location claim to return active standalone events and current trail steps. This guidance does not grant event eligibility.',
        tags: ['Trails', 'Events'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['latitude', 'longitude', 'accuracyMetres', 'acquiredAt'],
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            accuracyMetres: { type: 'number', minimum: 0 },
            acquiredAt: { type: 'string', format: 'date-time' },
            maxDistanceMetres: {
              type: 'number',
              minimum: 100,
              maximum: 5_000,
            },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['events', 'requestId'],
            properties: {
              events: { type: 'array', items: nearbyEventSchema },
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const player = requireResolvedPlayer(request);
      const maxDistanceMetres =
        request.body.maxDistanceMetres ?? DEFAULT_NEARBY_DISTANCE_METRES;

      try {
        const timing = evaluateLocationTiming(
          request.body.acquiredAt,
          clock(),
          maxLocationClaimAgeMs,
        );

        if (timing.outcome === 'retry') {
          throw locationRetryRequired(
            timing.reason === 'stale_location'
              ? 'The location claim is too old. Acquire a new location and retry.'
              : 'The location acquisition time is in the future. Acquire a new location and retry.',
          );
        }

        if (request.body.accuracyMetres > maxDistanceMetres) {
          throw locationRetryRequired(
            'Reported location accuracy is too poor for the requested search distance.',
          );
        }

        return {
          events: await service.listNearbyUnvisited({
            playerId: player.id,
            latitude: request.body.latitude,
            longitude: request.body.longitude,
            accuracyMetres: request.body.accuracyMetres,
            maxDistanceMetres,
            limit: request.body.limit ?? DEFAULT_NEARBY_LIMIT,
          }),
          requestId: request.id,
        };
      } catch (error) {
        if (error instanceof InvalidLocationClaimError) {
          throw new ApiError({
            statusCode: 400,
            code: 'INVALID_LOCATION_CLAIM',
            title: 'Invalid location claim',
            detail: error.message,
          });
        }

        throwPlayerTrailError(error);
      }
    },
  );
};

function requireResolvedPlayer(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player) {
    throw new Error(
      'Player request reached its handler without an active player context.',
    );
  }

  return request.player;
}

function locationRetryRequired(detail: string): ApiError {
  return new ApiError({
    statusCode: 422,
    code: 'LOCATION_RETRY_REQUIRED',
    title: 'Location retry required',
    detail,
  });
}

function throwPlayerTrailError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof PlayerTrailNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'TRAIL_NOT_FOUND',
      title: 'Trail not found',
      detail: 'The requested trail was not found.',
    });
  }

  if (error instanceof InvalidNearbyUnvisitedSearchError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_NEARBY_SEARCH',
      title: 'Invalid nearby search',
      detail: error.message,
    });
  }

  throw error;
}
