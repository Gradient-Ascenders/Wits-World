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

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const config = buildApiConfig();
  const authConfig = buildAuthConfig();
  const authManagementConfig = buildAuthManagementConfig({
    authConfig,
  });
  const corsConfig = buildCorsConfig();
  const databaseConfig = buildDatabaseConfig();

  const database = createDatabasePool(databaseConfig);

  const accountDeletionLifecycle = createAccountDeletionLifecycle(database);

  const auth0ManagementClient =
    createAuth0ManagementClient(authManagementConfig);

  const app = await buildApp({
    config,
    authConfig,
    corsConfig,
    playerIdentityService: createPlayerIdentityService(database),
    eventServices: {
      discovery: createEventDiscoveryService(database),
      eligibility: createEventEligibilityService(database),
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
