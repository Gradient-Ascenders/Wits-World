import type { FastifyPluginAsync } from 'fastify';

import {
  ChallengeEventNotActiveError,
  ChallengeEventNotFoundError,
  ChallengeEventNotReachableError,
  type ChallengeAttemptStartService,
  ChallengeLocationRetryRequiredError,
  ChallengeUnavailableError,
} from '../challenges/challenge-attempt-start.js';
import type {
  CompletedChallengeAttempt,
  InProgressChallengeAttempt,
} from '../challenges/challenge-attempt-reader.js';
import { ApiError } from '../errors/api-error.js';
import { InvalidEventCoordinatesError } from '../events/event-eligibility.js';
import { InvalidLocationClaimError } from '../events/location-claim.js';

interface ChallengeAttemptRoutesOptions {
  startService: ChallengeAttemptStartService;
}

interface StartAttemptParams {
  eventId: string;
}

interface StartAttemptBody {
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

const playerSafeChoiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['choiceId', 'text'],
  properties: {
    choiceId: {
      type: 'string',
      format: 'uuid',
    },
    text: {
      type: 'string',
    },
  },
} as const;

const playerSafeQuestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'attemptQuestionId',
    'position',
    'prompt',
    'choices',
    'selectedChoiceId',
    'answeredAt',
  ],
  properties: {
    attemptQuestionId: {
      type: 'string',
      format: 'uuid',
    },
    position: {
      type: 'integer',
      minimum: 1,
      maximum: 5,
    },
    prompt: {
      type: 'string',
    },
    choices: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: playerSafeChoiceSchema,
    },
    selectedChoiceId: {
      anyOf: [
        {
          type: 'string',
          format: 'uuid',
        },
        {
          type: 'null',
        },
      ],
    },
    answeredAt: {
      anyOf: [
        {
          type: 'string',
          format: 'date-time',
        },
        {
          type: 'null',
        },
      ],
    },
  },
} as const;

const inProgressAttemptProperties = {
  attemptId: {
    type: 'string',
    format: 'uuid',
  },
  eventId: {
    type: 'string',
    format: 'uuid',
  },
  format: {
    type: 'string',
    enum: ['multiple_choice'],
  },
  status: {
    type: 'string',
    enum: ['in_progress'],
  },
  startedAt: {
    type: 'string',
    format: 'date-time',
  },
  deadline: {
    type: 'string',
    format: 'date-time',
  },
  totalQuestions: {
    type: 'integer',
    const: 5,
  },
  answeredCount: {
    type: 'integer',
    minimum: 0,
    maximum: 5,
  },
  questions: {
    type: 'array',
    minItems: 5,
    maxItems: 5,
    items: playerSafeQuestionSchema,
  },
  requestId: {
    type: 'string',
  },
} as const;

const inProgressAttemptResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'attemptId',
    'eventId',
    'format',
    'status',
    'startedAt',
    'deadline',
    'totalQuestions',
    'answeredCount',
    'questions',
    'requestId',
  ],
  properties: inProgressAttemptProperties,
} as const;

const rewardCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ownedCardId',
    'cardDefinitionId',
    'name',
    'category',
    'affinity',
    'rarity',
  ],
  properties: {
    ownedCardId: {
      type: 'string',
      format: 'uuid',
    },
    cardDefinitionId: {
      type: 'string',
      format: 'uuid',
    },
    name: {
      type: 'string',
    },
    category: {
      type: 'string',
      enum: ['creature', 'power'],
    },
    affinity: {
      type: 'string',
      enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'],
    },
    rarity: {
      type: 'string',
      enum: ['common', 'rare', 'epic', 'legendary'],
    },
  },
} as const;

const completedAttemptResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'attemptId',
    'eventId',
    'format',
    'status',
    'completedAt',
    'completionReason',
    'totalQuestions',
    'scoreCorrect',
    'reward',
    'requestId',
  ],
  properties: {
    attemptId: {
      type: 'string',
      format: 'uuid',
    },
    eventId: {
      type: 'string',
      format: 'uuid',
    },
    format: {
      type: 'string',
      enum: ['multiple_choice'],
    },
    status: {
      type: 'string',
      enum: ['completed'],
    },
    completedAt: {
      type: 'string',
      format: 'date-time',
    },
    completionReason: {
      type: 'string',
      enum: ['answered', 'timeout'],
    },
    totalQuestions: {
      type: 'integer',
      const: 5,
    },
    scoreCorrect: {
      type: 'integer',
      minimum: 0,
      maximum: 5,
    },
    reward: {
      type: 'object',
      additionalProperties: false,
      required: ['coinsAwarded', 'cards'],
      properties: {
        coinsAwarded: {
          type: 'integer',
          minimum: 0,
        },
        cards: {
          type: 'array',
          minItems: 0,
          maxItems: 2,
          items: rewardCardSchema,
        },
      },
    },
    requestId: {
      type: 'string',
    },
  },
} as const;

export const challengeAttemptRoutes: FastifyPluginAsync<
  ChallengeAttemptRoutesOptions
> = async (app, { startService }) => {
  app.post<{
    Params: StartAttemptParams;
    Body: StartAttemptBody;
  }>(
    '/events/:eventId/challenge-attempts',
    {
      onRequest: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'startOrResumeChallengeAttempt',
        summary: 'Start or resume an event challenge attempt',
        description:
          'Creates a challenge attempt after fresh authoritative event and location checks, or returns the player existing persisted attempt.',
        tags: ['Challenges'],
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
            oneOf: [
              inProgressAttemptResponseSchema,
              completedAttemptResponseSchema,
            ],
          },
          201: inProgressAttemptResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const player = request.player;

      if (!player) {
        throw new Error(
          'Active player authorization did not establish a local player.',
        );
      }

      let result;

      try {
        result = await startService.startOrResume({
          playerId: player.id,
          eventId: request.params.eventId,
          latitude: request.body.latitude,
          longitude: request.body.longitude,
          accuracyMetres: request.body.accuracyMetres,
          acquiredAt: request.body.acquiredAt,
        });
      } catch (error) {
        throw mapChallengeStartError(error);
      }

      if (result.outcome === 'created') {
        return reply.code(201).send(withRequestId(result.attempt, request.id));
      }

      return reply.code(200).send(withRequestId(result.attempt, request.id));
    },
  );
};

function withRequestId<
  T extends InProgressChallengeAttempt | CompletedChallengeAttempt,
>(attempt: T, requestId: string): T & { requestId: string } {
  return {
    ...attempt,
    requestId,
  };
}

function mapChallengeStartError(error: unknown): Error {
  if (
    error instanceof InvalidLocationClaimError ||
    error instanceof InvalidEventCoordinatesError
  ) {
    return new ApiError({
      statusCode: 400,
      code: 'INVALID_LOCATION_CLAIM',
      title: 'Invalid location claim',
      detail: error.message,
    });
  }

  if (error instanceof ChallengeEventNotReachableError) {
    return new ApiError({
      statusCode: 403,
      code: 'EVENT_NOT_REACHABLE',
      title: 'Event not reachable',
      detail: error.message,
    });
  }

  if (error instanceof ChallengeEventNotFoundError) {
    return new ApiError({
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
      title: 'Event not found',
      detail: error.message,
    });
  }

  if (error instanceof ChallengeEventNotActiveError) {
    return new ApiError({
      statusCode: 409,
      code: 'EVENT_NOT_ACTIVE',
      title: 'Event not active',
      detail: error.message,
    });
  }

  if (error instanceof ChallengeUnavailableError) {
    return new ApiError({
      statusCode: 409,
      code: 'CHALLENGE_UNAVAILABLE',
      title: 'Challenge unavailable',
      detail: error.message,
    });
  }

  if (error instanceof ChallengeLocationRetryRequiredError) {
    return new ApiError({
      statusCode: 422,
      code: 'LOCATION_RETRY_REQUIRED',
      title: 'Location retry required',
      detail: error.message,
    });
  }

  return error instanceof Error
    ? error
    : new Error('Challenge start failed unexpectedly.');
}
