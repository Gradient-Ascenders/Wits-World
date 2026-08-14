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

import cors from '@fastify/cors';
import type { CorsConfig } from './config/cors.js';

import type { PlayerIdentityService } from './players/player-identity.js';
import { registerAuthorization } from './auth/authorization.js';

import type { Auth0ManagementClient } from './auth/auth0-management-client.js';
import type { ReauthenticationTokenVerifier } from './auth/reauthentication-token-verifier.js';
import type { AccountDeletionLifecycle } from './players/account-deletion-lifecycle.js';
import { createAccountDeletionCoordinator } from './players/account-deletion-coordinator.js';
import { accountDeletionRoutes } from './routes/account-deletion.js';

import type { ChallengeAttemptStartService } from './challenges/challenge-attempt-start.js';
import { challengeAttemptRoutes } from './routes/challenge-attempts.js';

import type { ChallengeAnswerSubmissionService } from './challenges/challenge-answer-submission.js';

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
  corsConfig?: CorsConfig;
  playerIdentityService?: PlayerIdentityService;
  accountDeletionServices?: AccountDeletionServices;
  challengeAttemptServices?: ChallengeAttemptServices;
}

export interface AccountDeletionServices {
  reauthenticationVerifier: ReauthenticationTokenVerifier;
  managementClient: Auth0ManagementClient;
  lifecycle: AccountDeletionLifecycle;
}

export interface ChallengeAttemptServices {
  start: ChallengeAttemptStartService;
  answerSubmission?: ChallengeAnswerSubmissionService;
}

export async function buildApp({
  authConfig,
  config = {
    logLevel: 'info',
  },
  logger = true,
  accessTokenVerifier,
  eventServices,
  corsConfig,
  playerIdentityService,
  accountDeletionServices,
  challengeAttemptServices,
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
              'req.body.reauthenticationToken',
              'request.body.reauthenticationToken',
              'body.reauthenticationToken',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });

  const verifier = accessTokenVerifier ?? createAccessTokenVerifier(authConfig);

  registerAuthentication(app, verifier);

  if (playerIdentityService) {
    registerAuthorization(app, playerIdentityService);
  }

  if (accountDeletionServices && !playerIdentityService) {
    throw new Error(
      'Account deletion services require a player identity service.',
    );
  }

  if (challengeAttemptServices && !playerIdentityService) {
    throw new Error(
      'Challenge attempt services require a player identity service.',
    );
  }

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
        {
          name: 'Challenges',
          description: 'Timed event challenge attempts and player quiz state.',
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

  if (corsConfig) {
    await app.register(cors, {
      origin: [corsConfig.allowedOrigin],
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
      preflight: true,
      strictPreflight: true,
      hideOptionsRoute: true,
    });
  }

  if (accountDeletionServices) {
    const accountDeletionCoordinator = createAccountDeletionCoordinator(
      accountDeletionServices.reauthenticationVerifier,
      accountDeletionServices.managementClient,
      accountDeletionServices.lifecycle,
      app.log,
    );

    await app.register(accountDeletionRoutes, {
      prefix: '/api/v1',
      coordinator: accountDeletionCoordinator,
    });
  }

  if (playerIdentityService) {
    await app.register(authenticationRoutes, {
      prefix: '/api/v1',
    });
  }

  if (eventServices) {
    await app.register(eventRoutes, {
      prefix: '/api/v1',
      discoveryService: eventServices.discovery,
      eligibilityService: eventServices.eligibility,
      clock: eventServices.clock,
      maxLocationClaimAgeMs: eventServices.maxLocationClaimAgeMs,
    });
  }

  if (challengeAttemptServices) {
    await app.register(challengeAttemptRoutes, {
      prefix: '/api/v1',
      startService: challengeAttemptServices.start,
      answerSubmissionService: challengeAttemptServices.answerSubmission,
    });
  }

  return app;
}
