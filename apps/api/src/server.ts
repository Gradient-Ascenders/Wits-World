import { buildApp } from './app.js';
import { createOfflineChallengeService } from './challenges/offline-challenges.js';
import { buildApiConfig } from './config/api.js';
import { buildAuthConfig } from './config/auth.js';
import { buildDatabaseConfig, loadApiEnvironment } from './config/database.js';
import { createDatabasePool } from './database/connection.js';
import {
  createCachedEventDiscoveryService,
  createEventDiscoveryService,
} from './events/event-discovery.js';
import { createEventEligibilityService } from './events/event-eligibility.js';
import { buildCorsConfig } from './config/cors.js';
import { createPlayerIdentityService } from './players/player-identity.js';
import { buildAuthManagementConfig } from './config/auth-management.js';
import { createAuth0ManagementClient } from './auth/auth0-management-client.js';
import { createAccountDeletionLifecycle } from './players/account-deletion-lifecycle.js';
import { createAccountDeletionRetryProcessor } from './players/account-deletion-retry-processor.js';
import { createAccountDeletionRetryScheduler } from './players/account-deletion-retry-scheduler.js';
import { createReauthenticationTokenVerifier } from './auth/reauthentication-token-verifier.js';
import { createChallengeAttemptStartService } from './challenges/challenge-attempt-start.js';
import { createStarterGrantService } from './cards/starter-grant.js';
import { createChallengeAnswerSubmissionService } from './challenges/challenge-answer-submission.js';
import { createChallengeAttemptCompletionFinalizer } from './challenges/challenge-attempt-completion-finalizer.js';
import { createCardCollectionService } from './cards/card-collection.js';
import { createCardEvolutionService } from './cards/card-evolution.js';
import { createChallengeAttemptFetchService } from './challenges/challenge-attempt-fetch.js';
import { createDeckService } from './cards/deck-service.js';
import { createAuthorEventService } from './events/author-event-service.js';
import { createAuthorChallengeService } from './challenges/author-challenge-service.js';
import { createQuestionPerformanceService } from './challenges/question-performance-service.js';
import { createAuthorCardService } from './cards/author-card-service.js';
import { createAuthorContentReadService } from './authoring/content-read-service.js';
import { createCpuMatchService } from './matches/cpu-match-service.js';
import {
  createLocalRateProtection,
  createUpstashRateProtection,
} from './security/rate-protection.js';
import { createProgressionPersistence } from './progression/progression-persistence.js';
import { createProgressionReadService } from './progression/progression-read-service.js';
import { createPlayerProfileService } from './players/player-profile.js';
import { createAuthorTrailService } from './trails/author-trail-service.js';
import { createPlayerTrailService } from './trails/player-trail-service.js';
import { createAuthorCampaignService } from './campaigns/author-campaign-service.js';
import { createMovementEvidenceService } from './events/movement-evidence.js';
import { createMovementEvidenceCleanupScheduler } from './events/movement-evidence-cleanup-scheduler.js';
import { createSignedCursorCodec } from './security/signed-cursor.js';
import { createAsyncPvpService } from './matches/asynchronous-pvp-service.js';
import { createAsyncPvpDeadlineProcessor } from './matches/asynchronous-pvp-deadline-processor.js';
import { createAsyncPvpDeadlineScheduler } from './matches/asynchronous-pvp-deadline-scheduler.js';
import { createLivePvpService } from './matches/live-pvp-service.js';
import { createLivePvpGateway } from './matches/live-pvp-gateway.js';
import { createLivePvpDeadlineProcessor } from './matches/live-pvp-deadline-processor.js';
import { createLivePvpRuntimeScheduler } from './matches/live-pvp-runtime-scheduler.js';
import { hasLivePvpWork, nextRankedSweep } from './matches/gameplay-work.js';
import { createUpstashGameplayActivityStore } from './matches/gameplay-activity-store.js';
import {
  createGameplayCoordination,
  createGameplayMutationGuard,
  gameplayCoordinationNamespace,
  type GameplayCoordination,
} from './matches/gameplay-coordination.js';
import type { RankedDatabase } from './matches/ranked-database.js';
import { createLivePvpNotificationListener } from './matches/live-pvp-notifications.js';
import { createTrustService } from './trust/trust-service.js';
import { createTrustRestrictionService } from './trust/trust-restrictions.js';
import { createTrustEvaluationScheduler } from './trust/trust-evaluation-scheduler.js';
import { createPlacementService } from './placement/placement-service.js';
import { createPlacementScheduler } from './placement/placement-scheduler.js';
import { createRankedService } from './matches/ranked-service.js';
import { createRankedReadService } from './matches/ranked-read-service.js';
import { createRankedScheduler } from './matches/ranked-scheduler.js';
import { createTerritoryOwnerBonusService } from './territory/territory-owner-bonus.js';
import { createTerritoryReadService } from './territory/territory-read-service.js';
import { createCardTradeService } from './trading/card-trade-service.js';
import { createCardTradeMaintenanceScheduler } from './trading/card-trade-maintenance-scheduler.js';
import { createAuthorAnalyticsService } from './analytics/author-analytics-service.js';
import { createEventProductAnalyticsRecorder } from './analytics/event-product-aggregates.js';
import { createDeveloperApiKeyService } from './developer/developer-api-key-service.js';
import { createDeveloperPublicDataService } from './developer/developer-public-data-service.js';
import { createTrustReviewService } from './trust/trust-review-service.js';

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const config = buildApiConfig();
  const rateProtection =
    config.rateLimitBackend === 'local'
      ? createLocalRateProtection(config.rateLimitPolicies)
      : createUpstashRateProtection({
          url: config.upstashRedisRestUrl!,
          token: config.upstashRedisRestToken!,
          timeoutMs: config.rateLimitTimeoutMs,
          policies: config.rateLimitPolicies,
        });
  const authConfig = buildAuthConfig();
  const authManagementConfig = buildAuthManagementConfig({
    authConfig,
  });
  const reauthenticationVerifier =
    createReauthenticationTokenVerifier(authConfig);
  const corsConfig = buildCorsConfig();
  const databaseConfig = buildDatabaseConfig();

  const database = createDatabasePool(databaseConfig);
  const gameplayLogger = {
    error(_context: Record<string, unknown>, message: string) {
      console.error(message);
    },
  };
  const activityStore =
    config.rateLimitBackend === 'upstash' ||
    config.gameplaySchedulerBackend === 'upstash'
      ? createUpstashGameplayActivityStore({
          url: config.upstashRedisRestUrl!,
          token: config.upstashRedisRestToken!,
          namespace:
            config.gameplaySchedulerNamespace ??
            gameplayCoordinationNamespace(databaseConfig.connectionString),
          timeoutMs: config.rateLimitTimeoutMs,
        })
      : undefined;
  // Producers announce work even during the initial, fast-polling rollout.
  // Pure ranked page reads keep using the original, unguarded pool.
  const rankedDatabase: RankedDatabase = activityStore
    ? {
        connect: database.connect.bind(database),
        query: database.query.bind(database),
        activityGuard: createGameplayMutationGuard(
          activityStore,
          ['ranked'],
          gameplayLogger,
        ),
      }
    : database;

  const auth0ManagementClient =
    createAuth0ManagementClient(authManagementConfig);

  const trustService = createTrustService(database);
  const trustReviewService = createTrustReviewService(database);
  const placementService = createPlacementService(database);
  const trustRestrictions = createTrustRestrictionService(database);
  const rankedService = createRankedService(rankedDatabase, trustRestrictions, {
    activityStore,
    logger: gameplayLogger,
  });
  const rankedReadService = createRankedReadService(
    database,
    createSignedCursorCodec(config.asyncPvpCursorSigningKey),
  );
  const territoryOwnerBonus = createTerritoryOwnerBonusService();
  const territoryReadService = createTerritoryReadService(database);
  const cardTradeService = createCardTradeService(database);

  const movementEvidenceService = createMovementEvidenceService(database, {
    maxPlausibleJourneySpeedMetresPerSecond:
      config.maxPlausibleJourneySpeedMetresPerSecond,
    retentionMs: config.movementEvidenceRetentionMs,
    trustService,
  });
  const challengeAttemptStartService = createChallengeAttemptStartService(
    database,
    { movementEvidenceService, trustRestrictions, territoryOwnerBonus },
  );
  const starterGrantService = createStarterGrantService(database);
  const cardCollectionService = createCardCollectionService(database);
  const cardEvolutionService = createCardEvolutionService(database, {
    trustService,
  });
  const progressionPersistence = createProgressionPersistence();
  const asyncPvpService = createAsyncPvpService(database, {
    cursorCodec: createSignedCursorCodec(config.asyncPvpCursorSigningKey),
    progressionPersistence,
    trustRestrictions,
    trustService,
  });
  const livePvpService = createLivePvpService(database, { trustService });
  const accountDeletionLifecycle = createAccountDeletionLifecycle(database, {
    finalizeDependentGameplay: async (client, playerId, requestedAt) => {
      await asyncPvpService.finalizeAccountDeletion(
        client,
        playerId,
        requestedAt,
      );
      await livePvpService.finalizeAccountDeletion(
        client,
        playerId,
        requestedAt,
      );
    },
  });
  const challengeAttemptCompletionFinalizer =
    createChallengeAttemptCompletionFinalizer({
      progressionPersistence,
      territoryOwnerBonus,
    });
  const challengeAnswerSubmissionService =
    createChallengeAnswerSubmissionService(database, {
      finalizer: challengeAttemptCompletionFinalizer,
    });
  const challengeAttemptFetchService = createChallengeAttemptFetchService(
    database,
    {
      finalizer: challengeAttemptCompletionFinalizer,
    },
  );
  const deckService = createDeckService(database);
  const authorEventService = createAuthorEventService(database);
  const authorChallengeService = createAuthorChallengeService(database);
  const questionPerformanceService = createQuestionPerformanceService(database);
  const eventProductAnalyticsRecorder =
    createEventProductAnalyticsRecorder(database);
  const authorAnalyticsService = createAuthorAnalyticsService(
    database,
    questionPerformanceService,
  );
  const authorCardService = createAuthorCardService(database);
  const authorTrailService = createAuthorTrailService(database);
  const authorCampaignService = createAuthorCampaignService(database);
  const playerTrailService = createPlayerTrailService(database);
  const authorContentReadService = createAuthorContentReadService(database);
  const cpuMatchService = createCpuMatchService(database, {
    progressionPersistence,
    trustService,
  });
  const progressionReadService = createProgressionReadService(database);
  const playerIdentityService = createPlayerIdentityService(database);
  const eventDiscoveryService = createCachedEventDiscoveryService(
    createEventDiscoveryService(database),
  );
  const developerApiKeyService = createDeveloperApiKeyService(database);
  const developerPublicDataService = createDeveloperPublicDataService(
    database,
    eventDiscoveryService,
  );
  let wakeLiveWorker = () => {};
  let wakeRankedWorker = () => {};
  const livePvpGateway = createLivePvpGateway(livePvpService, undefined, {
    onActivity: () => wakeLiveWorker(),
    prepareConnection: () => livePvpNotificationListener.start(true),
  });
  const app = await buildApp({
    gameplayWorkers: {
      live: { wake: () => wakeLiveWorker() },
      ranked: { wake: () => wakeRankedWorker() },
    },
    placementService,
    offlineChallengeService: process.env.OFFLINE_PACK_SIGNING_KEY
      ? createOfflineChallengeService(database, {
          signingKey: process.env.OFFLINE_PACK_SIGNING_KEY,
          previousSigningKey:
            process.env.OFFLINE_PACK_PREVIOUS_SIGNING_KEY || undefined,
          finalizer: challengeAttemptCompletionFinalizer,
          maxSpeed: config.maxPlausibleJourneySpeedMetresPerSecond,
          retentionMs: config.movementEvidenceRetentionMs,
          trustRestrictions,
          trustService,
        })
      : undefined,
    config,
    authConfig,
    corsConfig,
    playerIdentityService,
    trustReviewService,
    playerNameSetupService: playerIdentityService,
    rateProtection,
    developerApi: {
      keyService: developerApiKeyService,
      publicDataService: developerPublicDataService,
      rateProtection,
    },

    challengeAttemptServices: {
      start: challengeAttemptStartService,
      fetch: challengeAttemptFetchService,
      answerSubmission: challengeAnswerSubmissionService,
    },

    cardServices: {
      starterGrant: starterGrantService,
      collection: cardCollectionService,
      evolution: cardEvolutionService,
      decks: deckService,
    },

    cpuMatchService,
    asyncPvpService,
    cardTrade: {
      service: cardTradeService,
      reauthenticationVerifier,
    },
    livePvp: {
      service: livePvpService,
      gateway: livePvpGateway,
      webSocketUrl: config.livePvpWebSocketUrl,
    },
    ranked: { service: rankedService, reads: rankedReadService },
    territory: { reads: territoryReadService },
    progressionReadService,
    playerProfileService: createPlayerProfileService(database),

    accountDeletionServices: {
      reauthenticationVerifier,
      managementClient: auth0ManagementClient,
      lifecycle: accountDeletionLifecycle,
    },

    eventServices: {
      discovery: eventDiscoveryService,
      eligibility: createEventEligibilityService(database),
      movementEvidence: movementEvidenceService,
      analyticsRecorder: eventProductAnalyticsRecorder,
    },

    trailServices: {
      player: playerTrailService,
    },

    authorContentServices: {
      events: authorEventService,
      challenges: authorChallengeService,
      cards: authorCardService,
      trails: authorTrailService,
      campaigns: authorCampaignService,
      read: authorContentReadService,
      questionPerformance: questionPerformanceService,
      analytics: authorAnalyticsService,
    },
  });
  gameplayLogger.error = (context, message) => app.log.error(context, message);

  const accountDeletionRetryProcessor = createAccountDeletionRetryProcessor(
    auth0ManagementClient,
    accountDeletionLifecycle,
    app.log,
  );

  const accountDeletionRetryScheduler = createAccountDeletionRetryScheduler(
    accountDeletionRetryProcessor,
    app.log,
    {
      intervalMs: config.accountDeletionRetryIntervalMs,
    },
  );
  const movementEvidenceCleanupScheduler =
    createMovementEvidenceCleanupScheduler(
      movementEvidenceService,
      app.log,
      config.movementEvidenceCleanupIntervalMs,
    );
  const trustEvaluationScheduler = createTrustEvaluationScheduler(
    trustService,
    app.log,
    config.trustEvaluationIntervalMs,
  );
  const placementScheduler = createPlacementScheduler(
    placementService,
    app.log,
  );
  const asyncPvpDeadlineProcessor = createAsyncPvpDeadlineProcessor(
    database,
    asyncPvpService,
    app.log,
  );
  const asyncPvpDeadlineScheduler = createAsyncPvpDeadlineScheduler(
    asyncPvpDeadlineProcessor,
    app.log,
    config.asyncPvpDeadlineSweepIntervalMs,
  );
  const livePvpDeadlineProcessor = createLivePvpDeadlineProcessor(
    livePvpService,
    app.log,
  );
  let gameplayCoordination: GameplayCoordination | undefined;
  const livePvpRuntimeScheduler = createLivePvpRuntimeScheduler(
    livePvpDeadlineProcessor,
    livePvpService,
    app.log,
    {
      deadlineSweepIntervalMs: config.livePvpDeadlineSweepIntervalMs,
      transientCleanupIntervalMs: config.livePvpTransientCleanupIntervalMs,
      coordinatedIdle: config.gameplaySchedulerBackend === 'upstash',
      hasActiveWork: async () => {
        const pending = await hasLivePvpWork(database);
        if (!pending && livePvpGateway.connectionCount() > 0) {
          await livePvpGateway.refreshConnections();
        }
        if (pending || livePvpGateway.connectionCount() > 0) {
          await gameplayCoordination?.observeActive('live', true);
          return true;
        }
        if (!gameplayCoordination) return false;
        const confirmation = await gameplayCoordination.confirmIdle(
          'live',
          hasLivePvpWork,
        );
        return !confirmation.idle;
      },
      onWorkState: async (active) => {
        // No local sockets need fan-out while idle. Stop reconnect attempts too,
        // otherwise a suspended compute would be woken by the listener itself.
        if (active || livePvpGateway.connectionCount() > 0) {
          await livePvpNotificationListener.start();
        } else {
          await livePvpNotificationListener.stop();
        }
      },
    },
  );
  const livePvpNotificationListener = createLivePvpNotificationListener(
    database,
    livePvpGateway,
    app.log,
  );
  const rankedScheduler = createRankedScheduler(
    rankedDatabase,
    rankedService,
    rankedReadService,
    app.log,
    config.rankedSweepIntervalMs,
    {
      onMatchesCreated: () => livePvpRuntimeScheduler.wake(),
      coordinatedIdle: config.gameplaySchedulerBackend === 'upstash',
      nextSweep: async () => {
        const next = await nextRankedSweep(database);
        if (!gameplayCoordination) return next;
        if (next === true) {
          await gameplayCoordination.observeActive('ranked', true);
          return true;
        }
        const confirmation = await gameplayCoordination.confirmIdle(
          'ranked',
          nextRankedSweep,
        );
        return confirmation.idle ? confirmation.nextSweep : true;
      },
    },
  );
  if (config.gameplaySchedulerBackend === 'upstash') {
    gameplayCoordination = createGameplayCoordination(
      database,
      activityStore!,
      { live: livePvpRuntimeScheduler, ranked: rankedScheduler },
      app.log,
    );
  }
  wakeLiveWorker = () => livePvpRuntimeScheduler.wake();
  wakeRankedWorker = () => rankedScheduler.wake();
  const cardTradeMaintenanceScheduler = createCardTradeMaintenanceScheduler(
    cardTradeService,
    app.log,
    config.cardTradeMaintenanceIntervalMs,
  );

  app.addHook('onClose', async () => {
    await gameplayCoordination?.stop();
    await placementScheduler.stop();
    await livePvpRuntimeScheduler.stop();
    await rankedScheduler.stop();
    await livePvpNotificationListener.stop();
    await livePvpGateway.closeAll();
    await accountDeletionRetryScheduler.stop();
    await movementEvidenceCleanupScheduler.stop();
    await trustEvaluationScheduler.stop();
    await asyncPvpDeadlineScheduler.stop();
    await cardTradeMaintenanceScheduler.stop();
    await database.end();
  });

  try {
    const address = await app.listen({
      host: config.host,
      port: config.port,
    });

    livePvpRuntimeScheduler.start();
    rankedScheduler.start();
    gameplayCoordination?.start();
    accountDeletionRetryScheduler.start();
    movementEvidenceCleanupScheduler.start();
    trustEvaluationScheduler.start();
    placementScheduler.start();
    asyncPvpDeadlineScheduler.start();
    cardTradeMaintenanceScheduler.start();

    app.log.info(
      {
        address,
      },
      'Wits World API started',
    );
  } catch (error) {
    app.log.fatal(
      {
        err: error,
      },
      'Wits World API failed to start',
    );

    await app.close();
    process.exitCode = 1;
  }
}

await startServer();
