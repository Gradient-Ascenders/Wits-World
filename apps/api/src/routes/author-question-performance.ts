import type { FastifyPluginAsync } from 'fastify';

import {
  InvalidQuestionPerformanceFiltersError,
  type QuestionPerformanceFilters,
  type QuestionPerformanceService,
} from '../challenges/question-performance-service.js';
import { ApiError } from '../errors/api-error.js';

interface Options {
  service: QuestionPerformanceService;
}

type Query = Omit<QuestionPerformanceFilters, 'page' | 'pageSize'> & {
  page?: number;
  pageSize?: number;
};

const bearerSecurity = [{ bearerAuth: [] }] as const;
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
  },
} as const;

export const authorQuestionPerformanceRoutes: FastifyPluginAsync<
  Options
> = async (app, { service }) => {
  app.get<{ Querystring: Query }>(
    '/author/question-performance',
    {
      config: { rateLimitPolicy: 'author-expensive' },
      onRequest: [app.authenticate, app.requireActivePlayer, app.requireAuthor],
      schema: {
        operationId: 'listAuthorQuestionPerformance',
        summary: 'List Author-only question performance aggregates',
        description:
          'Returns Author-only aggregate outcomes. No player identity, selected response, order, or location is projected.',
        tags: ['Authoring'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            eventId: { type: 'string', format: 'uuid' },
            challengeId: { type: 'string', format: 'uuid' },
            format: {
              type: 'string',
              enum: ['multiple_choice', 'ordering'],
            },
            difficulty: { type: 'integer', minimum: 1, maximum: 3 },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 25,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'items',
              'page',
              'pageSize',
              'totalItems',
              'totalPages',
              'minimumSampleSize',
              'problematicIncorrectRate',
              'requestId',
            ],
            properties: {
              items: {
                type: 'array',
                maxItems: 100,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'questionId',
                    'challengeId',
                    'eventId',
                    'eventTitle',
                    'prompt',
                    'format',
                    'difficulty',
                    'status',
                    'answerCount',
                    'correctCount',
                    'incorrectCount',
                    'timeoutCount',
                    'correctRate',
                    'incorrectRate',
                    'hasSufficientSample',
                    'isProblematic',
                  ],
                  properties: {
                    questionId: { type: 'string', format: 'uuid' },
                    challengeId: { type: 'string', format: 'uuid' },
                    eventId: { type: 'string', format: 'uuid' },
                    eventTitle: { type: 'string' },
                    prompt: { type: 'string' },
                    format: {
                      type: 'string',
                      enum: ['multiple_choice', 'ordering'],
                    },
                    difficulty: { type: 'integer', minimum: 1, maximum: 3 },
                    status: {
                      type: 'string',
                      enum: [
                        'draft',
                        'in_review',
                        'approved',
                        'published',
                        'retired',
                      ],
                    },
                    answerCount: { type: 'integer', minimum: 0 },
                    correctCount: { type: 'integer', minimum: 0 },
                    incorrectCount: { type: 'integer', minimum: 0 },
                    timeoutCount: { type: 'integer', minimum: 0 },
                    correctRate: { type: 'number', minimum: 0, maximum: 1 },
                    incorrectRate: { type: 'number', minimum: 0, maximum: 1 },
                    hasSufficientSample: { type: 'boolean' },
                    isProblematic: { type: 'boolean' },
                  },
                },
              },
              page: { type: 'integer', minimum: 1 },
              pageSize: { type: 'integer', minimum: 1, maximum: 100 },
              totalItems: { type: 'integer', minimum: 0 },
              totalPages: { type: 'integer', minimum: 0 },
              minimumSampleSize: { type: 'integer', const: 10 },
              problematicIncorrectRate: { type: 'number', const: 0.7 },
              requestId: { type: 'string' },
            },
          },
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      try {
        return {
          ...(await service.list({
            ...request.query,
            page: request.query.page ?? 1,
            pageSize: request.query.pageSize ?? 25,
          })),
          requestId: request.id,
        };
      } catch (error) {
        if (error instanceof InvalidQuestionPerformanceFiltersError) {
          throw new ApiError({
            statusCode: 400,
            code: 'INVALID_ANALYTICS_FILTERS',
            title: 'Invalid analytics filters',
            detail: error.message,
          });
        }
        throw error;
      }
    },
  );
};
