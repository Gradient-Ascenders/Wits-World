import type { FastifyPluginAsync } from 'fastify';

import {
  ADVANCED_ANALYTICS_EASY_CORRECT_RATE_THRESHOLD,
  ADVANCED_ANALYTICS_MAX_PAGE_SIZE,
  ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
  InvalidAdvancedAnalyticsFiltersError,
  type AuthorAnalyticsService,
  type CardIssuanceAnalyticsFilters,
  type EventLocationAnalyticsFilters,
  type QuestionAnalyticsFilters,
} from '../analytics/author-analytics-service.js';
import { ApiError } from '../errors/api-error.js';

interface Options {
  service: AuthorAnalyticsService;
}

type EventLocationsQuery = Partial<
  Omit<EventLocationAnalyticsFilters, 'page' | 'pageSize' | 'mode'>
> & {
  mode?: EventLocationAnalyticsFilters['mode'];
  page?: number;
  pageSize?: number;
};

type QuestionsQuery = Omit<QuestionAnalyticsFilters, 'page' | 'pageSize'> & {
  page?: number;
  pageSize?: number;
};

type CardsQuery = Omit<CardIssuanceAnalyticsFilters, 'page' | 'pageSize'> & {
  page?: number;
  pageSize?: number;
};

const bearerSecurity = [{ bearerAuth: [] }] as const;
const nullableNonnegativeIntegerSchema = {
  anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
} as const;
const nullableRateSchema = {
  anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
} as const;
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
const commonQueryProperties = {
  fromDate: { type: 'string', format: 'date' },
  toDate: { type: 'string', format: 'date' },
  page: { type: 'integer', minimum: 1, default: 1 },
  pageSize: {
    type: 'integer',
    minimum: 1,
    maximum: ADVANCED_ANALYTICS_MAX_PAGE_SIZE,
    default: 25,
  },
} as const;
const paginationProperties = {
  page: { type: 'integer', minimum: 1 },
  pageSize: {
    type: 'integer',
    minimum: 1,
    maximum: ADVANCED_ANALYTICS_MAX_PAGE_SIZE,
  },
  totalItems: { type: 'integer', minimum: 0 },
  totalPages: { type: 'integer', minimum: 0 },
  minimumSampleSize: {
    type: 'integer',
    const: ADVANCED_ANALYTICS_MINIMUM_SAMPLE_SIZE,
  },
} as const;

export const authorAnalyticsRoutes: FastifyPluginAsync<Options> = async (
  app,
  { service },
) => {
  app.get<{ Querystring: EventLocationsQuery }>(
    '/author/analytics/event-locations',
    {
      onRequest: [app.authenticate, app.requireActivePlayer, app.requireAuthor],
      schema: {
        operationId: 'listAuthorEventLocationAnalytics',
        summary: 'List privacy-safe event-location analytics',
        description:
          'Returns aggregate discovery, eligibility, start, and completion activity by authored location or reviewed placement site. Player identities and precise player coordinates are never projected.',
        tags: ['Authoring'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ...commonQueryProperties,
            mode: {
              type: 'string',
              enum: ['all', 'popular', 'ignored'],
              default: 'all',
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
              'requestId',
            ],
            properties: {
              items: {
                type: 'array',
                maxItems: ADVANCED_ANALYTICS_MAX_PAGE_SIZE,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'eventId',
                    'eventTitle',
                    'locationKind',
                    'locationId',
                    'locationName',
                    'viewCount',
                    'eligibleCount',
                    'startCount',
                    'completionCount',
                    'suppressed',
                  ],
                  properties: {
                    eventId: { type: 'string', format: 'uuid' },
                    eventTitle: { type: 'string' },
                    locationKind: {
                      type: 'string',
                      enum: ['authored', 'placement_site'],
                    },
                    locationId: { type: 'string', format: 'uuid' },
                    locationName: { type: 'string' },
                    viewCount: nullableNonnegativeIntegerSchema,
                    eligibleCount: nullableNonnegativeIntegerSchema,
                    startCount: nullableNonnegativeIntegerSchema,
                    completionCount: nullableNonnegativeIntegerSchema,
                    suppressed: { type: 'boolean' },
                  },
                },
              },
              ...paginationProperties,
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
      return withInvalidFiltersAsApiError(async () => ({
        ...(await service.listEventLocations({
          ...(request.query.fromDate
            ? { fromDate: request.query.fromDate }
            : {}),
          ...(request.query.toDate ? { toDate: request.query.toDate } : {}),
          mode: request.query.mode ?? 'all',
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 25,
        })),
        requestId: request.id,
      }));
    },
  );

  app.get<{ Querystring: QuestionsQuery }>(
    '/author/analytics/questions',
    {
      onRequest: [app.authenticate, app.requireActivePlayer, app.requireAuthor],
      schema: {
        operationId: 'listAuthorAdvancedQuestionAnalytics',
        summary: 'List privacy-safe question analytics',
        description:
          'Reuses authoritative completed-attempt performance while suppressing small samples and classifying easy or problematic questions.',
        tags: ['Authoring'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ...commonQueryProperties,
            eventId: { type: 'string', format: 'uuid' },
            challengeId: { type: 'string', format: 'uuid' },
            format: {
              type: 'string',
              enum: ['multiple_choice', 'ordering'],
            },
            difficulty: { type: 'integer', minimum: 1, maximum: 3 },
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
              'easyCorrectRate',
              'problematicIncorrectRate',
              'requestId',
            ],
            properties: {
              items: {
                type: 'array',
                maxItems: ADVANCED_ANALYTICS_MAX_PAGE_SIZE,
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
                    'classification',
                    'suppressed',
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
                    answerCount: nullableNonnegativeIntegerSchema,
                    correctCount: nullableNonnegativeIntegerSchema,
                    incorrectCount: nullableNonnegativeIntegerSchema,
                    timeoutCount: nullableNonnegativeIntegerSchema,
                    correctRate: nullableRateSchema,
                    incorrectRate: nullableRateSchema,
                    classification: {
                      type: 'string',
                      enum: ['suppressed', 'easy', 'problematic', 'normal'],
                    },
                    suppressed: { type: 'boolean' },
                  },
                },
              },
              ...paginationProperties,
              easyCorrectRate: {
                type: 'number',
                const: ADVANCED_ANALYTICS_EASY_CORRECT_RATE_THRESHOLD,
              },
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
      return withInvalidFiltersAsApiError(async () => ({
        ...(await service.listQuestions({
          ...request.query,
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 25,
        })),
        requestId: request.id,
      }));
    },
  );

  app.get<{ Querystring: CardsQuery }>(
    '/author/analytics/card-issuance',
    {
      onRequest: [app.authenticate, app.requireActivePlayer, app.requireAuthor],
      schema: {
        operationId: 'listAuthorCardIssuanceAnalytics',
        summary: 'List privacy-safe card issuance analytics',
        description:
          'Returns historical card issuance from the immutable completion reward ledger, grouped by card and rarity without exposing current owners.',
        tags: ['Authoring'],
        security: bearerSecurity,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: commonQueryProperties,
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'items',
              'rarities',
              'page',
              'pageSize',
              'totalItems',
              'totalPages',
              'minimumSampleSize',
              'requestId',
            ],
            properties: {
              items: {
                type: 'array',
                maxItems: ADVANCED_ANALYTICS_MAX_PAGE_SIZE,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'cardDefinitionId',
                    'cardName',
                    'rarity',
                    'rewardEligible',
                    'issuanceCount',
                    'issuancesPer100Completions',
                    'suppressed',
                  ],
                  properties: {
                    cardDefinitionId: { type: 'string', format: 'uuid' },
                    cardName: { type: 'string' },
                    rarity: {
                      type: 'string',
                      enum: ['common', 'rare', 'epic', 'legendary'],
                    },
                    rewardEligible: { type: 'boolean' },
                    issuanceCount: nullableNonnegativeIntegerSchema,
                    issuancesPer100Completions: nullableRateSchema,
                    suppressed: { type: 'boolean' },
                  },
                },
              },
              rarities: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'rarity',
                    'issuanceCount',
                    'issuancesPer100Completions',
                    'suppressed',
                  ],
                  properties: {
                    rarity: {
                      type: 'string',
                      enum: ['common', 'rare', 'epic', 'legendary'],
                    },
                    issuanceCount: nullableNonnegativeIntegerSchema,
                    issuancesPer100Completions: nullableRateSchema,
                    suppressed: { type: 'boolean' },
                  },
                },
              },
              ...paginationProperties,
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
      return withInvalidFiltersAsApiError(async () => ({
        ...(await service.listCardIssuance({
          ...request.query,
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 25,
        })),
        requestId: request.id,
      }));
    },
  );
};

async function withInvalidFiltersAsApiError<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InvalidAdvancedAnalyticsFiltersError) {
      throw new ApiError({
        statusCode: 400,
        code: 'INVALID_ANALYTICS_FILTERS',
        title: 'Invalid analytics filters',
        detail: error.message,
      });
    }
    throw error;
  }
}
