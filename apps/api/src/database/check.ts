import { buildDatabaseConfig, loadApiEnvironment } from '../config/database.js';
import { checkDatabaseReadiness } from './readiness.js';

async function main() {
  loadApiEnvironment();

  const target = process.argv.includes('--test') ? 'test' : 'development';
  const databaseConfig = buildDatabaseConfig({ target });
  const readiness = await checkDatabaseReadiness(databaseConfig);

  console.log(`Database target: ${databaseConfig.target}`);
  console.log(`Connected database: ${readiness.database}`);
  console.log(`Connected user: ${readiness.user}`);
  console.log(`PostGIS: ${readiness.postgisVersion}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Database readiness check failed: ${message}`);
  process.exitCode = 1;
});
