import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';

import type { ApiConfig } from './config/api.js';
import { registerErrorHandlers } from './errors/error-handler.js';
import { apiV1Routes } from './routes/api-v1.js';
import { healthRoutes } from './routes/health.js';

import { randomUUID } from 'node:crypto';

export interface BuildAppOptions {
  config?: Pick<ApiConfig, 'logLevel'>;
  logger?: boolean;
}

export async function buildApp({
  config = {
    logLevel: 'info',
  },
  logger = true,
}: BuildAppOptions = {}): Promise<FastifyInstance> {
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
      ],
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

  return app;
}
