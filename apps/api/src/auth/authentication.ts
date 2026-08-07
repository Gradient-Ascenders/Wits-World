import type { FastifyInstance } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import type { AccessTokenVerifier } from './access-token-verifier.js';

export function registerAuthentication(
  app: FastifyInstance,
  accessTokenVerifier: AccessTokenVerifier,
): void {
  app.decorateRequest('auth', null);

  app.decorate('authenticate', async (request, reply) => {
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      reply.header('WWW-Authenticate', 'Bearer');
      throw createAuthenticationError();
    }

    try {
      request.auth = await accessTokenVerifier.verify(token);
    } catch {
      request.log.warn(
        {
          requestId: request.id,
        },
        'Access token validation failed',
      );

      reply.header('WWW-Authenticate', 'Bearer');
      throw createAuthenticationError();
    }
  });
}

function extractBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const match = /^Bearer +(\S+)$/i.exec(authorizationHeader.trim());

  return match?.[1];
}

function createAuthenticationError(): ApiError {
  return new ApiError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    title: 'Authentication required',
    detail: 'A valid bearer access token is required.',
  });
}
