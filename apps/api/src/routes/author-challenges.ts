import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import {
  AuthorChallengeEventNotFoundError,
  AuthorChallengeNotFoundError,
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  AuthorQuestionNotFoundError,
  InvalidAuthorQuestionError,
  type ChallengeFormat,
  type AuthorChallengeService,
} from '../challenges/author-challenge-service.js';
import { ApiError } from '../errors/api-error.js';

interface AuthorChallengeRoutesOptions {
  service: AuthorChallengeService;
}

interface EventParams {
  eventId: string;
}

interface ChallengeParams {
  challengeId: string;
}

interface QuestionParams {
  questionId: string;
}

interface MultipleChoiceQuestionBody {
  format?: 'multiple_choice';
  prompt: string;
  difficulty: 1 | 2 | 3;
  explanation: string;
  choices: string[];
  acceptedChoicePosition: number;
}

interface OrderingQuestionBody {
  format: 'ordering';
  prompt: string;
  difficulty: 1 | 2 | 3;
  explanation: string;
  items: string[];
}

type QuestionBody = MultipleChoiceQuestionBody | OrderingQuestionBody;

interface CreateChallengeBody {
  format?: ChallengeFormat;
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

const bearerSecurity = [
  {
    bearerAuth: [],
  },
] as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
} as const;

const eventParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId'],
  properties: {
    eventId: {
      type: 'string',
      format: 'uuid',
    },
  },
} as const;

const challengeParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['challengeId'],
  properties: {
    challengeId: {
      type: 'string',
      format: 'uuid',
    },
  },
} as const;

const questionParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questionId'],
  properties: {
    questionId: {
      type: 'string',
      format: 'uuid',
    },
  },
} as const;

const challengeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'challengeId',
    'eventId',
    'format',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    challengeId: {
      type: 'string',
      format: 'uuid',
    },
    eventId: {
      type: 'string',
      format: 'uuid',
    },
    format: {
      type: 'string',
      enum: ['multiple_choice', 'ordering'],
    },
    status: {
      type: 'string',
      enum: ['draft', 'published', 'retired'],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

const questionChoiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['choiceId', 'position', 'text'],
  properties: {
    choiceId: {
      type: 'string',
      format: 'uuid',
    },
    position: {
      type: 'integer',
      minimum: 1,
      maximum: 4,
    },
    text: {
      type: 'string',
    },
  },
} as const;

const questionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'questionId',
    'challengeId',
    'format',
    'prompt',
    'difficulty',
    'explanation',
    'status',
    'choices',
    'acceptedChoiceId',
    'acceptedChoicePosition',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    questionId: {
      type: 'string',
      format: 'uuid',
    },
    challengeId: {
      type: 'string',
      format: 'uuid',
    },
    format: {
      type: 'string',
      enum: ['multiple_choice'],
    },
    prompt: {
      type: 'string',
    },
    difficulty: {
      type: 'integer',
      minimum: 1,
      maximum: 3,
    },
    explanation: {
      anyOf: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
    },
    status: {
      type: 'string',
      enum: ['draft', 'published', 'retired'],
    },
    choices: {
      type: 'array',
      items: questionChoiceSchema,
    },
    acceptedChoiceId: {
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
    acceptedChoicePosition: {
      anyOf: [
        {
          type: 'integer',
          minimum: 1,
          maximum: 4,
        },
        {
          type: 'null',
        },
      ],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

const orderingItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'position', 'text'],
  properties: {
    itemId: { type: 'string', format: 'uuid' },
    position: { type: 'integer', minimum: 1, maximum: 4 },
    text: { type: 'string' },
  },
} as const;

const orderingQuestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'questionId',
    'challengeId',
    'format',
    'prompt',
    'difficulty',
    'explanation',
    'status',
    'items',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    questionId: { type: 'string', format: 'uuid' },
    challengeId: { type: 'string', format: 'uuid' },
    format: { type: 'string', enum: ['ordering'] },
    prompt: { type: 'string' },
    difficulty: { type: 'integer', minimum: 1, maximum: 3 },
    explanation: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    status: { type: 'string', enum: ['draft', 'published', 'retired'] },
    items: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: orderingItemSchema,
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const authorQuestionSchema = {
  oneOf: [questionSchema, orderingQuestionSchema],
} as const;

const questionBodySchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'prompt',
        'difficulty',
        'explanation',
        'choices',
        'acceptedChoicePosition',
      ],
      properties: {
        format: {
          type: 'string',
          enum: ['multiple_choice'],
        },
        prompt: {
          type: 'string',
          minLength: 1,
        },
        difficulty: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
        },
        explanation: {
          type: 'string',
          minLength: 1,
        },
        choices: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        acceptedChoicePosition: {
          type: 'integer',
          minimum: 1,
          maximum: 4,
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['format', 'prompt', 'difficulty', 'explanation', 'items'],
      properties: {
        format: { type: 'string', enum: ['ordering'] },
        prompt: { type: 'string', minLength: 1 },
        difficulty: { type: 'integer', minimum: 1, maximum: 3 },
        explanation: { type: 'string', minLength: 1 },
        items: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: { type: 'string', minLength: 1 },
        },
      },
    },
  ],
} as const;

const createChallengeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    format: {
      type: 'string',
      enum: ['multiple_choice', 'ordering'],
      default: 'multiple_choice',
    },
  },
} as const;

export const authorChallengeRoutes: FastifyPluginAsync<
  AuthorChallengeRoutesOptions
> = async (app, { service }) => {
  const authorGuards = [
    app.authenticate,
    app.requireActivePlayer,
    app.requireAuthor,
  ];

  app.get<{ Params: EventParams }>(
    '/author/events/:eventId/challenges',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorChallenges',
        summary: 'List challenges for an event',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: eventParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['challenges', 'requestId'],
            properties: {
              challenges: {
                type: 'array',
                items: challengeSchema,
              },
              requestId: {
                type: 'string',
              },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          challenges: await service.listChallenges(request.params.eventId),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: EventParams;
    Body: CreateChallengeBody;
  }>(
    '/author/events/:eventId/challenges',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'createAuthorChallenge',
        summary: 'Create a draft challenge for an event',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: eventParamsSchema,
        body: createChallengeBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['challenge', 'requestId'],
            properties: {
              challenge: challengeSchema,
              requestId: {
                type: 'string',
              },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const author = requireResolvedAuthor(request);

      try {
        const challenge = await service.createChallenge({
          actorPlayerId: author.id,
          eventId: request.params.eventId,
          format: request.body.format ?? 'multiple_choice',
        });

        return reply.code(201).send({
          challenge,
          requestId: request.id,
        });
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.get<{ Params: ChallengeParams }>(
    '/author/challenges/:challengeId/questions',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'listAuthorQuestions',
        summary: 'List Author-visible challenge questions',
        description:
          'Returns challenge questions including the private accepted-answer relationship. This operation is Author-only.',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: challengeParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['questions', 'requestId'],
            properties: {
              questions: {
                type: 'array',
                items: authorQuestionSchema,
              },
              requestId: {
                type: 'string',
              },
            },
          },
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          questions: await service.listQuestions(request.params.challengeId),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: ChallengeParams;
    Body: QuestionBody;
  }>(
    '/author/challenges/:challengeId/questions',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'createAuthorQuestion',
        summary: 'Create a draft multiple-choice question',
        description:
          'Creates four choices and stores the accepted-answer relationship privately using the Author-supplied accepted choice position.',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: challengeParamsSchema,
        body: questionBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'requestId'],
            properties: {
              question: authorQuestionSchema,
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
    async (request, reply) => {
      const author = requireResolvedAuthor(request);

      try {
        const question = await service.createQuestion({
          actorPlayerId: author.id,
          challengeId: request.params.challengeId,
          ...normalizeQuestionBody(request.body),
        });

        return reply.code(201).send({
          question,
          requestId: request.id,
        });
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.put<{
    Params: QuestionParams;
    Body: QuestionBody;
  }>(
    '/author/questions/:questionId',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'updateAuthorQuestion',
        summary: 'Edit a draft question',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: questionParamsSchema,
        body: questionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'requestId'],
            properties: {
              question: authorQuestionSchema,
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
      const author = requireResolvedAuthor(request);

      try {
        return {
          question: await service.updateQuestion({
            actorPlayerId: author.id,
            questionId: request.params.questionId,
            ...normalizeQuestionBody(request.body),
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: QuestionParams;
    Body: Record<string, never>;
  }>(
    '/author/questions/:questionId/publish',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'publishAuthorQuestion',
        summary: 'Publish a complete draft question',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: questionParamsSchema,
        body: emptyBodySchema,
        response: lifecycleQuestionResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          question: await service.publishQuestion(
            author.id,
            request.params.questionId,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: QuestionParams;
    Body: Record<string, never>;
  }>(
    '/author/questions/:questionId/retire',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'retireAuthorQuestion',
        summary: 'Retire a question',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: questionParamsSchema,
        body: emptyBodySchema,
        response: lifecycleQuestionResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          question: await service.retireQuestion(
            author.id,
            request.params.questionId,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: ChallengeParams;
    Body: Record<string, never>;
  }>(
    '/author/challenges/:challengeId/publish',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'publishAuthorChallenge',
        summary: 'Publish a ready challenge',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: challengeParamsSchema,
        body: emptyBodySchema,
        response: lifecycleChallengeResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          challenge: await service.publishChallenge(
            author.id,
            request.params.challengeId,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: ChallengeParams;
    Body: Record<string, never>;
  }>(
    '/author/challenges/:challengeId/retire',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'retireAuthorChallenge',
        summary: 'Retire a challenge',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: challengeParamsSchema,
        body: emptyBodySchema,
        response: lifecycleChallengeResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          challenge: await service.retireChallenge(
            author.id,
            request.params.challengeId,
          ),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );
};

function normalizeQuestionBody(body: QuestionBody) {
  if (body.format === 'ordering') {
    return body;
  }

  return {
    ...body,
    format: 'multiple_choice' as const,
  };
}

function lifecycleQuestionResponses() {
  return {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['question', 'requestId'],
      properties: {
        question: authorQuestionSchema,
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
    422: apiErrorSchema,
  } as const;
}

function lifecycleChallengeResponses() {
  return {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['challenge', 'requestId'],
      properties: {
        challenge: challengeSchema,
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
    422: apiErrorSchema,
  } as const;
}

function requireResolvedAuthor(
  request: FastifyRequest,
): NonNullable<FastifyRequest['player']> {
  if (!request.player) {
    throw new Error(
      'Author request reached its handler without an active player context.',
    );
  }

  return request.player;
}

function throwAuthorChallengeError(error: unknown): never {
  if (error instanceof InvalidAuthorQuestionError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_QUESTION',
      title: 'Invalid question',
      detail: error.message,
    });
  }

  if (error instanceof AuthorChallengeEventNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
      title: 'Event not found',
      detail: 'The requested event was not found.',
    });
  }

  if (error instanceof AuthorChallengeNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'CHALLENGE_NOT_FOUND',
      title: 'Challenge not found',
      detail: 'The requested challenge was not found.',
    });
  }

  if (error instanceof AuthorQuestionNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'QUESTION_NOT_FOUND',
      title: 'Question not found',
      detail: 'The requested question was not found.',
    });
  }

  if (error instanceof AuthorContentStateConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONTENT_STATE_CONFLICT',
      title: 'Content state conflict',
      detail: error.message,
    });
  }

  if (error instanceof AuthorContentNotReadyError) {
    throw new ApiError({
      statusCode: 422,
      code: 'CONTENT_NOT_READY',
      title: 'Content not ready',
      detail: error.message,
    });
  }

  throw error;
}
