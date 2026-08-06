import { buildApp } from './app.js';
import { buildApiConfig } from './config/api.js';
import { loadApiEnvironment } from './config/database.js';

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const config = buildApiConfig();
  const app = await buildApp({
    config,
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
