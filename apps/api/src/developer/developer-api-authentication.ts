import type { FastifyInstance } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import type { RateProtection } from '../security/rate-protection.js';
import type { DeveloperApiKeyService } from './developer-api-key-service.js';

export function registerDeveloperApiAuthentication(
  app: FastifyInstance,
  service: DeveloperApiKeyService,
  rateProtection: RateProtection,
): void {
  app.decorateRequest('developerApiKey', null);

  app.decorate('authenticateDeveloperApiKey', async (request, reply) => {
    const header = request.headers['x-api-key'];
    const apiKey = Array.isArray(header) ? undefined : header?.trim();

    if (!apiKey) {
      reply.header('WWW-Authenticate', 'ApiKey');
      throw createDeveloperAuthenticationError();
    }

    const authenticated = await service.authenticate(apiKey);
    if (!authenticated) {
      request.log.warn(
        { requestId: request.id },
        'Developer API key validation failed',
      );
      reply.header('WWW-Authenticate', 'ApiKey');
      throw createDeveloperAuthenticationError();
    }

    request.developerApiKey = authenticated;

    const decision = rateProtection.consume(authenticated.id);
    reply.header('RateLimit-Limit', decision.limit);
    reply.header('RateLimit-Remaining', decision.remaining);
    if (!decision.allowed) {
      reply.header('Retry-After', decision.retryAfterSeconds);
      throw new ApiError({
        statusCode: 429,
        code: 'RATE_LIMITED',
        title: 'Too many requests',
        detail:
          'This developer API key has made too many requests. Try again after the indicated delay.',
      });
    }
  });
}

function createDeveloperAuthenticationError(): ApiError {
  return new ApiError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    title: 'Developer API authentication required',
    detail: 'A valid X-API-Key developer credential is required.',
  });
}
