import type { FastifySchema } from 'fastify';

const rateLimitedResponseSchema = {
  description:
    'The verified local player has exceeded this API process request quota. Retry after the advertised delay.',
  type: 'object',
  additionalProperties: false,
  headers: {
    'Retry-After': {
      description: 'Whole seconds until this process-local window resets.',
      type: 'integer',
      minimum: 1,
    },
    'RateLimit-Limit': {
      description: 'Maximum requests allowed in the current fixed window.',
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

export function documentVerifiedPlayerRateLimit(
  schema: FastifySchema,
): FastifySchema {
  const usesBearerAuthentication = schema.security?.some(
    (requirement) => 'bearerAuth' in requirement,
  );

  if (!usesBearerAuthentication) return schema;

  const responses = (schema.response ?? {}) as Record<string | number, unknown>;
  return {
    ...schema,
    response: {
      ...responses,
      429: rateLimitedResponseSchema,
    },
  };
}
