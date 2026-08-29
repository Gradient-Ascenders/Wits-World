import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import type { EventDiscoveryService } from '../events/event-discovery.js';
import type { EventEligibilityService } from '../events/event-eligibility.js';
import {
  evaluateLocationTiming,
  evaluateReachabilityWithAccuracy,
  InvalidLocationClaimError,
  PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
} from '../events/location-claim.js';
import {
  InvalidMovementEvidenceContextError,
  InvalidMovementEvidenceError,
  type MovementEvidenceService,
  NonMonotonicMovementEvidenceError,
} from '../events/movement-evidence.js';

interface EventRoutesOptions {
  discoveryService: EventDiscoveryService;
  eligibilityService: EventEligibilityService;
  movementEvidenceService?: MovementEvidenceService;
  clock?: () => Date;
  maxLocationClaimAgeMs?: number;
}

interface EligibilityParams {
  eventId: string;
}

interface EligibilityBody {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  acquiredAt: string;
}

const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: {
      type: 'string',
    },
    title: {
      type: 'string',
    },
    status: {
      type: 'integer',
    },
    code: {
      type: 'string',
    },
    detail: {
      type: 'string',
    },
    requestId: {
      type: 'string',
    },
    validation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'message'],
        properties: {
          field: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
        },
      },
    },
  },
} as const;

export const eventRoutes: FastifyPluginAsync<EventRoutesOptions> = async (
  app,
  {
    discoveryService,
    eligibilityService,
    movementEvidenceService,
    clock = () => new Date(),
    maxLocationClaimAgeMs = PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
  },
) => {
  app.get(
    '/events',
    {
      onRequest: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'listPlayerEvents',
        summary: 'List published events for players',
        description:
          'Returns player-safe published event information for the campus map and event list.',
        tags: ['Events'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['events', 'requestId'],
            properties: {
              events: {
                type: 'array',
                items: {
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
                    'availability',
                  ],
                  properties: {
                    eventId: {
                      type: 'string',
                      format: 'uuid',
                    },
                    title: {
                      type: 'string',
                    },
                    description: {
                      anyOf: [
                        {
                          type: 'string',
                        },
                        {
                          type: 'null',
                        },
                      ],
                    },
                    latitude: {
                      type: 'number',
                      minimum: -90,
                      maximum: 90,
                    },
                    longitude: {
                      type: 'number',
                      minimum: -180,
                      maximum: 180,
                    },
                    radiusMetres: {
                      type: 'number',
                      exclusiveMinimum: 0,
                    },
                    startsAt: {
                      type: 'string',
                      format: 'date-time',
                    },
                    endsAt: {
                      type: 'string',
                      format: 'date-time',
                    },
                    availability: {
                      type: 'string',
                      enum: ['active', 'upcoming', 'ended'],
                    },
                  },
                },
              },
              requestId: {
                type: 'string',
              },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const events = await discoveryService.list();

      return {
        events,
        requestId: request.id,
      };
    },
  );

  app.post<{
    Params: EligibilityParams;
    Body: EligibilityBody;
  }>(
    '/events/:eventId/eligibility',
    {
      onRequest: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'evaluateEventEligibility',
        summary: 'Evaluate a player location claim for an event',
        description:
          'Validates a browser location claim, delegates authoritative distance and radius evaluation to the server-side PostGIS service, and stores short-lived movement evidence only for this active player-requested operation.',
        tags: ['Events'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['eventId'],
          properties: {
            eventId: {
              type: 'string',
              format: 'uuid',
            },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['latitude', 'longitude', 'accuracyMetres', 'acquiredAt'],
          properties: {
            latitude: {
              type: 'number',
              minimum: -90,
              maximum: 90,
            },
            longitude: {
              type: 'number',
              minimum: -180,
              maximum: 180,
            },
            accuracyMetres: {
              type: 'number',
              minimum: 0,
            },
            acquiredAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['eventId', 'status', 'reachable', 'requestId'],
            properties: {
              eventId: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['reachable', 'unreachable', 'retry', 'unavailable'],
              },
              reachable: {
                anyOf: [
                  {
                    type: 'boolean',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
              reason: {
                type: 'string',
                enum: [
                  'location_accuracy',
                  'stale_location',
                  'future_acquisition_time',
                  'not_started',
                  'ended',
                ],
              },
              requestId: {
                type: 'string',
              },
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
      const receivedAt = clock();

      let timingResult;

      try {
        timingResult = evaluateLocationTiming(
          request.body.acquiredAt,
          receivedAt,
          maxLocationClaimAgeMs,
        );
      } catch (error) {
        if (error instanceof InvalidLocationClaimError) {
          throw new ApiError({
            statusCode: 400,
            code: 'INVALID_LOCATION_CLAIM',
            title: 'Invalid location claim',
            detail: error.message,
          });
        }

        throw error;
      }

      if (timingResult.outcome === 'retry') {
        return {
          eventId: request.params.eventId,
          status: 'retry' as const,
          reachable: null,
          reason: timingResult.reason,
          requestId: request.id,
        };
      }

      const result = await eligibilityService.evaluate({
        eventId: request.params.eventId,
        latitude: request.body.latitude,
        longitude: request.body.longitude,
      });

      if (result.outcome === 'not_found') {
        throw eventNotFound();
      }

      if (result.outcome === 'unavailable') {
        if (result.reason === 'unpublished') {
          throw eventNotFound();
        }

        return {
          eventId: result.eventId,
          status: 'unavailable' as const,
          reachable: false,
          reason: result.reason,
          requestId: request.id,
        };
      }

      let reachability;

      try {
        reachability = evaluateReachabilityWithAccuracy(
          result.distanceMetres,
          result.radiusMetres,
          request.body.accuracyMetres,
        );
      } catch (error) {
        if (error instanceof InvalidLocationClaimError) {
          throw new ApiError({
            statusCode: 400,
            code: 'INVALID_LOCATION_CLAIM',
            title: 'Invalid location claim',
            detail: error.message,
          });
        }

        throw error;
      }

      if (movementEvidenceService) {
        const player = request.player;

        if (!player) {
          throw new Error(
            'Active player context was not set before movement evidence persistence.',
          );
        }

        try {
          await movementEvidenceService.record({
            playerId: player.id,
            eventId: result.eventId,
            latitude: request.body.latitude,
            longitude: request.body.longitude,
            accuracyMetres: request.body.accuracyMetres,
            acquiredAt: new Date(request.body.acquiredAt),
            receivedAt,
          });
        } catch (error) {
          if (error instanceof NonMonotonicMovementEvidenceError) {
            throw new ApiError({
              statusCode: 409,
              code: 'NON_MONOTONIC_MOVEMENT_EVIDENCE',
              title: 'Movement evidence is out of order',
              detail:
                'Use a newly acquired location before checking eligibility again.',
            });
          }

          if (error instanceof InvalidMovementEvidenceContextError) {
            throw new ApiError({
              statusCode: 409,
              code: 'MOVEMENT_EVIDENCE_CONTEXT_UNAVAILABLE',
              title: 'Movement evidence context unavailable',
              detail:
                'The active player or event context changed before eligibility evidence could be stored.',
            });
          }

          if (error instanceof InvalidMovementEvidenceError) {
            throw new ApiError({
              statusCode: 400,
              code: 'INVALID_LOCATION_CLAIM',
              title: 'Invalid location claim',
              detail: error.message,
            });
          }

          throw error;
        }
      }

      return {
        eventId: result.eventId,
        ...reachability,
        requestId: request.id,
      };
    },
  );
};

function eventNotFound(): ApiError {
  return new ApiError({
    statusCode: 404,
    code: 'EVENT_NOT_FOUND',
    title: 'Event not found',
    detail: 'The requested event was not found.',
  });
}
