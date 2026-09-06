import { buildApp } from './app.js';
import { createOfflineChallengeService } from './challenges/offline-challenges.js';
import { buildApiConfig } from './config/api.js';
import { buildAuthConfig } from './config/auth.js';
import { buildDatabaseConfig, loadApiEnvironment } from './config/database.js';
import { createDatabasePool } from './database/connection.js';
import { createEventDiscoveryService } from './events/event-discovery.js';
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
import { createChallengeAttemptFetchService } from './challenges/challenge-attempt-fetch.js';
import { createDeckService } from './cards/deck-service.js';
import { createAuthorEventService } from './events/author-event-service.js';
import { createAuthorChallengeService } from './challenges/author-challenge-service.js';
import { createQuestionPerformanceService } from './challenges/question-performance-service.js';
import { createAuthorCardService } from './cards/author-card-service.js';
import { createAuthorContentReadService } from './authoring/content-read-service.js';
import { createCpuMatchService } from './matches/cpu-match-service.js';
import { createAuthenticatedRateProtection } from './security/rate-protection.js';
import { createProgressionPersistence } from './progression/progression-persistence.js';
import { createProgressionReadService } from './progression/progression-read-service.js';
import { createAuthorTrailService } from './trails/author-trail-service.js';
import { createPlayerTrailService } from './trails/player-trail-service.js';
import { createAuthorCampaignService } from './campaigns/author-campaign-service.js';
import { createMovementEvidenceService } from './events/movement-evidence.js';
import { createMovementEvidenceCleanupScheduler } from './events/movement-evidence-cleanup-scheduler.js';
import { createSignedCursorCodec } from './security/signed-cursor.js';
import { createAsyncPvpService } from './matches/asynchronous-pvp-service.js';
import { createAsyncPvpDeadlineProcessor } from './matches/asynchronous-pvp-deadline-processor.js';
import { createAsyncPvpDeadlineScheduler } from './matches/asynchronous-pvp-deadline-scheduler.js';

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const config = buildApiConfig();
  const authConfig = buildAuthConfig();
  const authManagementConfig = buildAuthManagementConfig({
    authConfig,
  });
  const reauthenticationVerifier =
    createReauthenticationTokenVerifier(authConfig);
  const corsConfig = buildCorsConfig();
  const databaseConfig = buildDatabaseConfig();

  const database = createDatabasePool(databaseConfig);

  const auth0ManagementClient =
    createAuth0ManagementClient(authManagementConfig);

  const movementEvidenceService = createMovementEvidenceService(database, {
    maxPlausibleJourneySpeedMetresPerSecond:
      config.maxPlausibleJourneySpeedMetresPerSecond,
    retentionMs: config.movementEvidenceRetentionMs,
  });
  const challengeAttemptStartService = createChallengeAttemptStartService(
    database,
    { movementEvidenceService },
  );
  const starterGrantService = createStarterGrantService(database);
  const cardCollectionService = createCardCollectionService(database);
  const progressionPersistence = createProgressionPersistence();
  const asyncPvpService = createAsyncPvpService(database, {
    cursorCodec: createSignedCursorCodec(config.asyncPvpCursorSigningKey),
    progressionPersistence,
  });
  const accountDeletionLifecycle = createAccountDeletionLifecycle(database, {
    finalizeDependentGameplay: (client, playerId, requestedAt) =>
      asyncPvpService.finalizeAccountDeletion(client, playerId, requestedAt),
  });
  const challengeAttemptCompletionFinalizer =
    createChallengeAttemptCompletionFinalizer({ progressionPersistence });
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
  const authorCardService = createAuthorCardService(database);
  const authorTrailService = createAuthorTrailService(database);
  const authorCampaignService = createAuthorCampaignService(database);
  const playerTrailService = createPlayerTrailService(database);
  const authorContentReadService = createAuthorContentReadService(database);
  const cpuMatchService = createCpuMatchService(database, {
    progressionPersistence,
  });
  const progressionReadService = createProgressionReadService(database);
  const playerIdentityService = createPlayerIdentityService(database);
  const app = await buildApp({
    offlineChallengeService: process.env.OFFLINE_PACK_SIGNING_KEY
      ? createOfflineChallengeService(database, {
          signingKey: process.env.OFFLINE_PACK_SIGNING_KEY,
          previousSigningKey:
            process.env.OFFLINE_PACK_PREVIOUS_SIGNING_KEY || undefined,
          finalizer: challengeAttemptCompletionFinalizer,
          maxSpeed: config.maxPlausibleJourneySpeedMetresPerSecond,
          retentionMs: config.movementEvidenceRetentionMs,
        })
      : undefined,
    config,
    authConfig,
    corsConfig,
    playerIdentityService,
    playerNameSetupService: playerIdentityService,
    rateProtection: createAuthenticatedRateProtection({
      maxRequests: config.rateLimitMaxRequests,
      windowMs: config.rateLimitWindowMs,
    }),

    challengeAttemptServices: {
      start: challengeAttemptStartService,
      fetch: challengeAttemptFetchService,
      answerSubmission: challengeAnswerSubmissionService,
    },

    cardServices: {
      starterGrant: starterGrantService,
      collection: cardCollectionService,
      decks: deckService,
    },

    cpuMatchService,
    asyncPvpService,
    progressionReadService,

    accountDeletionServices: {
      reauthenticationVerifier,
      managementClient: auth0ManagementClient,
      lifecycle: accountDeletionLifecycle,
    },

    eventServices: {
      discovery: createEventDiscoveryService(database),
      eligibility: createEventEligibilityService(database),
      movementEvidence: movementEvidenceService,
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
    },
  });

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

  app.addHook('onClose', async () => {
    await accountDeletionRetryScheduler.stop();
    await movementEvidenceCleanupScheduler.stop();
    await asyncPvpDeadlineScheduler.stop();
    await database.end();
  });

  try {
    const address = await app.listen({
      host: config.host,
      port: config.port,
    });

    accountDeletionRetryScheduler.start();
    movementEvidenceCleanupScheduler.start();
    asyncPvpDeadlineScheduler.start();

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
