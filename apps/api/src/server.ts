import { buildApp } from './app.js';
import { buildApiConfig } from './config/api.js';
import { buildAuthConfig } from './config/auth.js';
import { buildDatabaseConfig, loadApiEnvironment } from './config/database.js';
import { createDatabasePool } from './database/connection.js';
import { createEventDiscoveryService } from './events/event-discovery.js';
import { createEventEligibilityService } from './events/event-eligibility.js';

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const config = buildApiConfig();
  const authConfig = buildAuthConfig();
  const databaseConfig = buildDatabaseConfig();

  const database = createDatabasePool(databaseConfig);

  const app = await buildApp({
    config,
    authConfig,
    eventServices: {
      discovery: createEventDiscoveryService(database),
      eligibility: createEventEligibilityService(database),
    },
  });

  app.addHook('onClose', async () => {
    await database.end();
  });

  try {
    const address = await app.listen({
      host: config.host,
      port: config.port,
    });

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
