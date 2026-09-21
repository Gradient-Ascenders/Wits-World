import { registerRequestTiming } from './request-timing.js';
import { randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  createAccessTokenVerifier,
  type AccessTokenVerifier,
} from './auth/access-token-verifier.js';
import { registerAuthentication } from './auth/authentication.js';
import type { ApiConfig } from './config/api.js';
import type { AuthConfig } from './config/auth.js';
import { registerErrorHandlers } from './errors/error-handler.js';
import { documentVerifiedPlayerRateLimit } from './openapi/rate-limited-response.js';
import { apiV1Routes } from './routes/api-v1.js';
import { authenticationRoutes } from './routes/authentication.js';
import { healthRoutes } from './routes/health.js';

import type { EventDiscoveryService } from './events/event-discovery.js';
import type { EventEligibilityService } from './events/event-eligibility.js';
import type { MovementEvidenceService } from './events/movement-evidence.js';
import { eventRoutes } from './routes/events.js';

import cors from '@fastify/cors';
import type { CorsConfig } from './config/cors.js';

import type {
  PlayerIdentityService,
  PlayerNameSetupService,
} from './players/player-identity.js';
import { registerAuthorization } from './auth/authorization.js';

import type { Auth0ManagementClient } from './auth/auth0-management-client.js';
import type { ReauthenticationTokenVerifier } from './auth/reauthentication-token-verifier.js';
import type { AccountDeletionLifecycle } from './players/account-deletion-lifecycle.js';
import { createAccountDeletionCoordinator } from './players/account-deletion-coordinator.js';
import { accountDeletionRoutes } from './routes/account-deletion.js';

import type { ChallengeAttemptStartService } from './challenges/challenge-attempt-start.js';
import { challengeAttemptRoutes } from './routes/challenge-attempts.js';

import type { ChallengeAnswerSubmissionService } from './challenges/challenge-answer-submission.js';
import type { StarterGrantService } from './cards/starter-grant.js';
import { cardRoutes } from './routes/cards.js';

import type { CardCollectionService } from './cards/card-collection.js';
import type { CardEvolutionService } from './cards/card-evolution.js';

import type { ChallengeAttemptFetchService } from './challenges/challenge-attempt-fetch.js';

import type { DeckService } from './cards/deck-service.js';
import { deckRoutes } from './routes/decks.js';
import type { CpuMatchService } from './matches/cpu-match-service.js';
import { cpuMatchRoutes } from './routes/cpu-matches.js';
import type { AsyncPvpService } from './matches/asynchronous-pvp-service.js';
import { asynchronousPvpRoutes } from './routes/asynchronous-pvp.js';
import { livePvpRoutes } from './routes/live-pvp.js';
import type { LivePvpService } from './matches/live-pvp-service.js';
import type { LivePvpGateway } from './matches/live-pvp-gateway.js';
import type { RankedService } from './matches/ranked-service.js';
import type { RankedReadService } from './matches/ranked-read-service.js';
import { rankedRoutes } from './routes/ranked.js';
import { offlineChallengeRoutes } from './routes/offline-challenges.js';
import type { OfflineChallengeService } from './challenges/offline-challenges.js';

import type { AuthorEventService } from './events/author-event-service.js';
import { authorEventRoutes } from './routes/author-events.js';
import { authorEventPlacementRoutes } from './routes/author-event-placement.js';
import type { PlacementService } from './placement/placement-service.js';

import type { AuthorChallengeService } from './challenges/author-challenge-service.js';
import { authorChallengeRoutes } from './routes/author-challenges.js';
import type { QuestionPerformanceService } from './challenges/question-performance-service.js';
import { authorQuestionPerformanceRoutes } from './routes/author-question-performance.js';

import type { AuthorCardService } from './cards/author-card-service.js';
import { authorCardRoutes } from './routes/author-cards.js';
import type { AuthorContentReadService } from './authoring/content-read-service.js';
import { authorContentRoutes } from './routes/author-content.js';
import type { AuthenticatedRateProtection } from './security/rate-protection.js';
import type { ProgressionReadService } from './progression/progression-read-service.js';
import { progressionRoutes } from './routes/progression.js';
import type { AuthorTrailService } from './trails/author-trail-service.js';
import type { PlayerTrailService } from './trails/player-trail-service.js';
import { authorTrailRoutes } from './routes/author-trails.js';
import { playerTrailRoutes } from './routes/trails.js';
import type { AuthorCampaignService } from './campaigns/author-campaign-service.js';
import { authorCampaignRoutes } from './routes/author-campaigns.js';

export interface EventServices {
  discovery: EventDiscoveryService;
  eligibility: EventEligibilityService;
  movementEvidence: MovementEvidenceService;
  clock?: () => Date;
  maxLocationClaimAgeMs?: number;
}

export interface BuildAppOptions {
  placementService?: PlacementService;
  offlineChallengeService?: OfflineChallengeService;
  authConfig: AuthConfig;
  config?: Pick<ApiConfig, 'logLevel'>;
  logger?: boolean;
  logDestination?: {
    write(message: string): void;
  };
  accessTokenVerifier?: AccessTokenVerifier;
  eventServices?: EventServices;
  corsConfig?: CorsConfig;
  playerIdentityService?: PlayerIdentityService;
  playerNameSetupService?: PlayerNameSetupService;
  accountDeletionServices?: AccountDeletionServices;
  challengeAttemptServices?: ChallengeAttemptServices;
  cardServices?: CardServices;
  authorContentServices?: AuthorContentServices;
  trailServices?: TrailServices;
  cpuMatchService?: CpuMatchService;
  asyncPvpService?: AsyncPvpService;
  livePvp?: {
    service: LivePvpService;
    gateway: LivePvpGateway;
    webSocketUrl: string;
  };
  ranked?: {
    service: RankedService;
    reads: RankedReadService;
  };
  progressionReadService?: ProgressionReadService;
  rateProtection?: AuthenticatedRateProtection;
}

export interface AccountDeletionServices {
  reauthenticationVerifier: ReauthenticationTokenVerifier;
  managementClient: Auth0ManagementClient;
  lifecycle: AccountDeletionLifecycle;
}

export interface ChallengeAttemptServices {
  start: ChallengeAttemptStartService;
  fetch?: ChallengeAttemptFetchService;
  answerSubmission?: ChallengeAnswerSubmissionService;
}

export interface CardServices {
  starterGrant: StarterGrantService;
  collection: CardCollectionService;
  evolution?: CardEvolutionService;
  decks?: DeckService;
}

export interface AuthorContentServices {
  events?: AuthorEventService;
  challenges?: AuthorChallengeService;
  cards?: AuthorCardService;
  trails?: AuthorTrailService;
  campaigns?: AuthorCampaignService;
  read?: AuthorContentReadService;
  questionPerformance?: QuestionPerformanceService;
}

export interface TrailServices {
  player: PlayerTrailService;
  clock?: () => Date;
  maxLocationClaimAgeMs?: number;
}

export async function buildApp({
  placementService,
  authConfig,
  config = {
    logLevel: 'info',
  },
  logger = true,
  logDestination,
  accessTokenVerifier,
  eventServices,
  corsConfig,
  playerIdentityService,
  playerNameSetupService,
  accountDeletionServices,
  challengeAttemptServices,
  cardServices,
  authorContentServices,
  trailServices,
  cpuMatchService,
  asyncPvpService,
  livePvp,
  ranked,
  progressionReadService,
  rateProtection,
  offlineChallengeService,
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
              'req.body.latitude',
              'req.body.longitude',
              'req.body.accuracyMetres',
              'req.body.acquiredAt',
              'request.body.latitude',
              'request.body.longitude',
              'request.body.accuracyMetres',
              'request.body.acquiredAt',
              'body.latitude',
              'body.longitude',
              'body.accuracyMetres',
              'body.acquiredAt',
              'req.body.packToken',
              'request.body.packToken',
              'body.packToken',
              'req.body.startLocation',
              'request.body.startLocation',
              'body.startLocation',
              'req.body.finishLocation',
              'request.body.finishLocation',
              'body.finishLocation',
              'req.body.answers',
              'request.body.answers',
              'body.answers',
              'req.body.startedAt',
              'request.body.startedAt',
              'body.startedAt',
              'req.body.finishedAt',
              'request.body.finishedAt',
              'body.finishedAt',
              'req.query.ticket',
              'request.query.ticket',
              'query.ticket',
            ],
            censor: '[REDACTED]',
          },
          ...(logDestination ? { stream: logDestination } : {}),
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
    registerAuthorization(app, playerIdentityService, rateProtection);
  }

  if (playerNameSetupService && !playerIdentityService) {
    throw new Error(
      'Player name setup services require a player identity service.',
    );
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

  if (cardServices && !playerIdentityService) {
    throw new Error('Card services require a player identity service.');
  }

  if (authorContentServices && !playerIdentityService) {
    throw new Error(
      'Author content services require a player identity service.',
    );
  }
  if (trailServices && !playerIdentityService) {
    throw new Error('Trail services require a player identity service.');
  }
  if (cpuMatchService && !playerIdentityService) {
    throw new Error('CPU match services require a player identity service.');
  }

  if (livePvp && !playerIdentityService) {
    throw new Error('Live PvP routes require the player identity service.');
  }

  if (ranked && !playerIdentityService) {
    throw new Error('Ranked routes require the player identity service.');
  }

  if (asyncPvpService && !playerIdentityService) {
    throw new Error(
      'Asynchronous PvP routes require the player identity service.',
    );
  }
  if (progressionReadService && !playerIdentityService) {
    throw new Error('Progression services require a player identity service.');
  }

  registerRequestTiming(app);
  registerErrorHandlers(app);

  if (livePvp) {
    await app.register(websocket, {
      options: {
        maxPayload: 16_384,
      },
    });
    await livePvp.gateway.register(app);
  }

  await app.register(swagger, {
    transform: ({ schema, url }) => ({
      schema: documentVerifiedPlayerRateLimit(schema),
      url,
    }),
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
        {
          name: 'Cards',
          description: 'Player card catalogue and starter selection.',
        },
        {
          name: 'Decks',
          description: 'Player saved decks and active deck selection.',
        },
        {
          name: 'Trails',
          description: 'Ordered campus trails and player progress guidance.',
        },
        {
          name: 'Authoring',
          description: 'Protected Author-only Basic content management.',
        },
        {
          name: 'Matches',
          description: 'Server-authoritative CPU matches and private history.',
        },
        {
          name: 'Ranked',
          description: 'Server-owned ranked live queue, rating, and seasons.',
        },
        {
          name: 'Progression',
          description:
            'Authenticated player progression and privacy-safe standings.',
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
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Wits-Challenge-Contract-Version',
        'X-Wits-Offline-Contract-Version',
      ],
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
      playerNameSetupService,
    });
  }

  if (eventServices) {
    await app.register(eventRoutes, {
      prefix: '/api/v1',
      discoveryService: eventServices.discovery,
      eligibilityService: eventServices.eligibility,
      movementEvidenceService: eventServices.movementEvidence,
      clock: eventServices.clock,
      maxLocationClaimAgeMs: eventServices.maxLocationClaimAgeMs,
    });
  }

  if (authorContentServices?.events) {
    await app.register(authorEventRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.events,
    });
  }

  if (placementService) {
    await app.register(authorEventPlacementRoutes, {
      prefix: '/api/v1',
      service: placementService,
    });
  }

  if (authorContentServices?.challenges) {
    await app.register(authorChallengeRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.challenges,
    });
  }

  if (authorContentServices?.questionPerformance) {
    await app.register(authorQuestionPerformanceRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.questionPerformance,
    });
  }

  if (authorContentServices?.cards) {
    await app.register(authorCardRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.cards,
    });
  }

  if (authorContentServices?.trails) {
    await app.register(authorTrailRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.trails,
    });
  }

  if (authorContentServices?.campaigns) {
    await app.register(authorCampaignRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.campaigns,
    });
  }

  if (trailServices) {
    await app.register(playerTrailRoutes, {
      prefix: '/api/v1',
      service: trailServices.player,
      clock: trailServices.clock,
      maxLocationClaimAgeMs: trailServices.maxLocationClaimAgeMs,
    });
  }

  if (authorContentServices?.read) {
    await app.register(authorContentRoutes, {
      prefix: '/api/v1',
      service: authorContentServices.read,
    });
  }

  if (challengeAttemptServices) {
    if (offlineChallengeService) {
      await app.register(offlineChallengeRoutes, {
        prefix: '/api/v1',
        service: offlineChallengeService,
      });
    }
    await app.register(challengeAttemptRoutes, {
      prefix: '/api/v1',
      startService: challengeAttemptServices.start,
      fetchService: challengeAttemptServices.fetch,
      answerSubmissionService: challengeAttemptServices.answerSubmission,
    });
  }

  if (cardServices) {
    await app.register(cardRoutes, {
      prefix: '/api/v1',
      starterGrantService: cardServices.starterGrant,
      collectionService: cardServices.collection,
      evolutionService: cardServices.evolution,
    });

    if (cardServices.decks) {
      await app.register(deckRoutes, {
        prefix: '/api/v1',
        service: cardServices.decks,
      });
    }
  }

  if (cpuMatchService) {
    await app.register(cpuMatchRoutes, {
      prefix: '/api/v1',
      service: cpuMatchService,
    });
  }

  if (asyncPvpService) {
    await app.register(asynchronousPvpRoutes, {
      prefix: '/api/v1',
      service: asyncPvpService,
    });
  }

  if (livePvp) {
    await app.register(livePvpRoutes, {
      prefix: '/api/v1',
      service: livePvp.service,
      webSocketUrl: livePvp.webSocketUrl,
    });
  }

  if (ranked) {
    await app.register(rankedRoutes, {
      prefix: '/api/v1',
      service: ranked.service,
      reads: ranked.reads,
    });
  }

  if (progressionReadService) {
    await app.register(progressionRoutes, {
      prefix: '/api/v1',
      service: progressionReadService,
    });
  }

  return app;
}
