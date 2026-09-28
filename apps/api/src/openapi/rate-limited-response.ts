import type { FastifySchema } from 'fastify';

const verifiedPlayerRateLimitedResponseSchema = {
  description:
    'The verified local player has exceeded a shared sliding-window request limit. Retry after the advertised delay.',
  type: 'object',
  additionalProperties: false,
  headers: {
    'Retry-After': {
      description: 'Whole seconds until the request may be retried.',
      type: 'integer',
      minimum: 1,
    },
    'RateLimit-Limit': {
      description: 'Maximum requests allowed in the sliding window.',
      type: 'integer',
      minimum: 1,
    },
    'RateLimit-Remaining': {
      description: 'Requests remaining in the current window.',
      type: 'integer',
      minimum: 0,
    },
  },
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer', const: 429 },
    code: { type: 'string', const: 'RATE_LIMITED' },
    detail: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const;

const developerApiRateLimitedResponseSchema = {
  ...verifiedPlayerRateLimitedResponseSchema,
  description:
    'The authenticated developer API key has exceeded its shared sliding-window request limit. Retry after the advertised delay.',
} as const;

export const rateLimitUnavailableResponseSchema = {
  description:
    'The rate-limit store is unavailable, so this protected operation cannot proceed. Retry later.',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer', const: 503 },
    code: { type: 'string', const: 'RATE_LIMIT_UNAVAILABLE' },
    detail: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const;

export function documentVerifiedPlayerRateLimit(
  schema: FastifySchema,
): FastifySchema {
  const usesBearerAuthentication = schema.security?.some(
    (requirement) => 'bearerAuth' in requirement,
  );
  const usesDeveloperApiKey = schema.security?.some(
    (requirement) => 'developerApiKey' in requirement,
  );

  if (!usesBearerAuthentication && !usesDeveloperApiKey) return schema;

  const responses = (schema.response ?? {}) as Record<string | number, unknown>;
  return {
    ...schema,
    response: {
      ...responses,
      429: usesBearerAuthentication
        ? verifiedPlayerRateLimitedResponseSchema
        : developerApiRateLimitedResponseSchema,
    },
  };
}
