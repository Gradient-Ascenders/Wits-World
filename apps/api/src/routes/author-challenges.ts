import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { throwAuthorContentWorkflowError } from '../authoring/workflow-api-error.js';
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
type UpdateQuestionBody = QuestionBody & { expectedVersion: number };

interface LifecycleBody {
  expectedVersion: number;
  note?: string;
}

interface ReturnBody {
  expectedVersion: number;
  reason: string;
}

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

const lifecycleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    note: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
  },
} as const;

const returnBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'reason'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    reason: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
  },
} as const;

const lifecycleRequired = [
  'version',
  'submittedBy',
  'submittedAt',
  'reviewedBy',
  'reviewedAt',
  'publicationProvenance',
] as const;

const lifecycleProperties = {
  version: { type: 'integer', minimum: 0 },
  submittedBy: { type: 'string', format: 'uuid', nullable: true },
  submittedAt: { type: 'string', format: 'date-time', nullable: true },
  reviewedBy: { type: 'string', format: 'uuid', nullable: true },
  reviewedAt: { type: 'string', format: 'date-time', nullable: true },
  publicationProvenance: {
    type: 'string',
    enum: ['legacy', 'controlled_seed', 'reviewed', null],
    nullable: true,
  },
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
    ...lifecycleRequired,
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
      enum: ['draft', 'in_review', 'approved', 'published', 'retired'],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    ...lifecycleProperties,
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
    'sourceUrls',
    'status',
    'choices',
    'acceptedChoiceId',
    'acceptedChoicePosition',
    'createdAt',
    'updatedAt',
    ...lifecycleRequired,
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
    sourceUrls: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
    },
    status: {
      type: 'string',
      enum: ['draft', 'in_review', 'approved', 'published', 'retired'],
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
    ...lifecycleProperties,
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
    'sourceUrls',
    'status',
    'items',
    'createdAt',
    'updatedAt',
    ...lifecycleRequired,
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
    sourceUrls: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
    },
    status: {
      type: 'string',
      enum: ['draft', 'in_review', 'approved', 'published', 'retired'],
    },
    items: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: orderingItemSchema,
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    ...lifecycleProperties,
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

const updateQuestionBodySchema = {
  oneOf: questionBodySchema.oneOf.map((schema) => ({
    ...schema,
    required: [...schema.required, 'expectedVersion'],
    properties: {
      ...schema.properties,
      expectedVersion: { type: 'integer', minimum: 0 },
    },
  })),
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
        summary: 'Create a draft challenge question',
        description:
          'Creates a format-matching four-choice or four-item question and stores its accepted answer or correct sequence privately.',
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
    Body: UpdateQuestionBody;
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
        body: updateQuestionBodySchema,
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
            expectedVersion: request.body.expectedVersion,
            ...normalizeQuestionBody(request.body),
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  for (const action of ['submit', 'approve'] as const) {
    app.post<{ Params: QuestionParams; Body: LifecycleBody }>(
      `/author/questions/:questionId/${action}`,
      {
        onRequest: authorGuards,
        schema: {
          operationId: `${action}AuthorQuestion`,
          summary: `${action === 'submit' ? 'Submit' : 'Approve'} a question`,
          tags: ['Authoring'],
          security: bearerSecurity,
          params: questionParamsSchema,
          body: lifecycleBodySchema,
          response: lifecycleQuestionResponses(),
        },
      },
      async (request) => {
        const author = requireResolvedAuthor(request);
        try {
          const transition =
            action === 'submit'
              ? service.submitQuestion
              : service.approveQuestion;
          return {
            question: await transition({
              actorPlayerId: author.id,
              questionId: request.params.questionId,
              expectedVersion: request.body.expectedVersion,
              note: request.body.note,
            }),
            requestId: request.id,
          };
        } catch (error) {
          throwAuthorChallengeError(error);
        }
      },
    );
  }

  app.post<{ Params: QuestionParams; Body: ReturnBody }>(
    '/author/questions/:questionId/return',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'returnAuthorQuestion',
        summary: 'Return a question to draft',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: questionParamsSchema,
        body: returnBodySchema,
        response: lifecycleQuestionResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);
      try {
        return {
          question: await service.returnQuestion({
            actorPlayerId: author.id,
            questionId: request.params.questionId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.reason,
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
    Body: LifecycleBody;
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
        body: lifecycleBodySchema,
        response: lifecycleQuestionResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          question: await service.publishQuestion({
            actorPlayerId: author.id,
            questionId: request.params.questionId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.note,
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
    Body: LifecycleBody;
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
        body: lifecycleBodySchema,
        response: lifecycleQuestionResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          question: await service.retireQuestion({
            actorPlayerId: author.id,
            questionId: request.params.questionId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.note,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  for (const action of ['submit', 'approve'] as const) {
    app.post<{ Params: ChallengeParams; Body: LifecycleBody }>(
      `/author/challenges/:challengeId/${action}`,
      {
        onRequest: authorGuards,
        schema: {
          operationId: `${action}AuthorChallenge`,
          summary: `${action === 'submit' ? 'Submit' : 'Approve'} a challenge`,
          tags: ['Authoring'],
          security: bearerSecurity,
          params: challengeParamsSchema,
          body: lifecycleBodySchema,
          response: lifecycleChallengeResponses(),
        },
      },
      async (request) => {
        const author = requireResolvedAuthor(request);
        try {
          const transition =
            action === 'submit'
              ? service.submitChallenge
              : service.approveChallenge;
          return {
            challenge: await transition({
              actorPlayerId: author.id,
              challengeId: request.params.challengeId,
              expectedVersion: request.body.expectedVersion,
              note: request.body.note,
            }),
            requestId: request.id,
          };
        } catch (error) {
          throwAuthorChallengeError(error);
        }
      },
    );
  }

  app.post<{ Params: ChallengeParams; Body: ReturnBody }>(
    '/author/challenges/:challengeId/return',
    {
      onRequest: authorGuards,
      schema: {
        operationId: 'returnAuthorChallenge',
        summary: 'Return a challenge to draft',
        tags: ['Authoring'],
        security: bearerSecurity,
        params: challengeParamsSchema,
        body: returnBodySchema,
        response: lifecycleChallengeResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);
      try {
        return {
          challenge: await service.returnChallenge({
            actorPlayerId: author.id,
            challengeId: request.params.challengeId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.reason,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: ChallengeParams;
    Body: LifecycleBody;
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
        body: lifecycleBodySchema,
        response: lifecycleChallengeResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          challenge: await service.publishChallenge({
            actorPlayerId: author.id,
            challengeId: request.params.challengeId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.note,
          }),
          requestId: request.id,
        };
      } catch (error) {
        throwAuthorChallengeError(error);
      }
    },
  );

  app.post<{
    Params: ChallengeParams;
    Body: LifecycleBody;
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
        body: lifecycleBodySchema,
        response: lifecycleChallengeResponses(),
      },
    },
    async (request) => {
      const author = requireResolvedAuthor(request);

      try {
        return {
          challenge: await service.retireChallenge({
            actorPlayerId: author.id,
            challengeId: request.params.challengeId,
            expectedVersion: request.body.expectedVersion,
            note: request.body.note,
          }),
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
  throwAuthorContentWorkflowError(error);
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
