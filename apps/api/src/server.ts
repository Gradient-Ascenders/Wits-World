import { buildApp } from './app.js';
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
import { createAuthorCardService } from './cards/author-card-service.js';
import { createCpuMatchService } from './matches/cpu-match-service.js';
import { createAuthenticatedRateProtection } from './security/rate-protection.js';
import { createProgressionPersistence } from './progression/progression-persistence.js';
import { createProgressionReadService } from './progression/progression-read-service.js';

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
  const accountDeletionLifecycle = createAccountDeletionLifecycle(database);

  const auth0ManagementClient =
    createAuth0ManagementClient(authManagementConfig);

  const challengeAttemptStartService =
    createChallengeAttemptStartService(database);
  const starterGrantService = createStarterGrantService(database);
  const cardCollectionService = createCardCollectionService(database);
  const progressionPersistence = createProgressionPersistence();
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
  const authorCardService = createAuthorCardService(database);
  const cpuMatchService = createCpuMatchService(database, {
    progressionPersistence,
  });
  const progressionReadService = createProgressionReadService(database);
  const playerIdentityService = createPlayerIdentityService(database);

  const app = await buildApp({
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
    progressionReadService,

    accountDeletionServices: {
      reauthenticationVerifier,
      managementClient: auth0ManagementClient,
      lifecycle: accountDeletionLifecycle,
    },

    eventServices: {
      discovery: createEventDiscoveryService(database),
      eligibility: createEventEligibilityService(database),
    },

    authorContentServices: {
      events: authorEventService,
      challenges: authorChallengeService,
      cards: authorCardService,
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

  app.addHook('onClose', async () => {
    await accountDeletionRetryScheduler.stop();
    await database.end();
  });

  try {
    const address = await app.listen({
      host: config.host,
      port: config.port,
    });

    accountDeletionRetryScheduler.start();

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
