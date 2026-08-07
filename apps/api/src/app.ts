import { randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  createAccessTokenVerifier,
  type AccessTokenVerifier,
} from './auth/access-token-verifier.js';
import { registerAuthentication } from './auth/authentication.js';
import type { ApiConfig } from './config/api.js';
import type { AuthConfig } from './config/auth.js';
import { registerErrorHandlers } from './errors/error-handler.js';
import { apiV1Routes } from './routes/api-v1.js';
import { authenticationRoutes } from './routes/authentication.js';
import { healthRoutes } from './routes/health.js';

import type { EventDiscoveryService } from './events/event-discovery.js';
import type { EventEligibilityService } from './events/event-eligibility.js';
import { eventRoutes } from './routes/events.js';

export interface EventServices {
  discovery: EventDiscoveryService;
  eligibility: EventEligibilityService;
  clock?: () => Date;
  maxLocationClaimAgeMs?: number;
}

export interface BuildAppOptions {
  authConfig: AuthConfig;
  config?: Pick<ApiConfig, 'logLevel'>;
  logger?: boolean;
  accessTokenVerifier?: AccessTokenVerifier;
  eventServices?: EventServices;
}

export async function buildApp({
  authConfig,
  config = {
    logLevel: 'info',
  },
  logger = true,
  accessTokenVerifier,
  eventServices,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger
      ? {
          level: config.logLevel,
          redact: {
            paths: [
              'req.headers.authorization',
              'request.headers.authorization',
              'headers.authorization',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
    genReqId: () => randomUUID(),
  });

  const verifier = accessTokenVerifier ?? createAccessTokenVerifier(authConfig);

  registerAuthentication(app, verifier);
  registerErrorHandlers(app);

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Wits World API',
        description: 'Hand-written HTTP API for the Wits Quest game.',
        version: '0.0.0',
      },
      tags: [
        {
          name: 'System',
          description: 'API health and version information.',
        },
        {
          name: 'Authentication',
          description: 'Authenticated API identity operations.',
        },
        {
          name: 'Events',
          description: 'Player-safe event discovery and location eligibility.',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'Auth0 bearer access token issued for the Wits World API.',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  await app.register(healthRoutes);
  await app.register(apiV1Routes, {
    prefix: '/api/v1',
  });
  await app.register(authenticationRoutes, {
    prefix: '/api/v1',
  });

  if (eventServices) {
    await app.register(eventRoutes, {
      prefix: '/api/v1',
      discoveryService: eventServices.discovery,
      eligibilityService: eventServices.eligibility,
      clock: eventServices.clock,
      maxLocationClaimAgeMs: eventServices.maxLocationClaimAgeMs,
    });
  }

  return app;
}
