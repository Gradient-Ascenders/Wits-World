import { buildDatabaseConfig, loadApiEnvironment } from '../config/database.js';
import { runMigrations } from './migrations.js';
import { getMigrationsDirectory } from './paths.js';

async function main() {
  loadApiEnvironment();

  const target = process.argv.includes('--test') ? 'test' : 'development';
  const databaseConfig = buildDatabaseConfig({ target });
  const migrationResult = await runMigrations(
    databaseConfig,
    getMigrationsDirectory(),
  );

  console.log(`Database target: ${databaseConfig.target}`);
  console.log(`Applied migrations: ${migrationResult.applied.length}`);
  console.log(`Skipped migrations: ${migrationResult.skipped.length}`);

  for (const migrationName of migrationResult.applied) {
    console.log(`applied ${migrationName}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
