import type { FastifyInstance } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  enforceRateProtection,
  type RateProtection,
} from '../security/rate-protection.js';
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

    await enforceRateProtection(
      request,
      reply,
      rateProtection,
      authenticated.id,
      'developer-api',
    );
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
