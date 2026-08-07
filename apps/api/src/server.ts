import { buildApp } from './app.js';
import { buildApiConfig } from './config/api.js';
import { loadApiEnvironment } from './config/database.js';
import { buildAuthConfig } from './config/auth.js';

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const config = buildApiConfig();
  const authConfig = buildAuthConfig();

  const app = await buildApp({
    config,
    authConfig,
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

    process.exitCode = 1;
  }
}

await startServer();
