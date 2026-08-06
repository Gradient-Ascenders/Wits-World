import { buildDatabaseConfig, loadApiEnvironment } from '../config/database.js';
import { getSeedsDirectory } from './paths.js';
import { runSeeds } from './seeds.js';

async function main() {
  loadApiEnvironment();

  const target = process.argv.includes('--test') ? 'test' : 'development';
  const databaseConfig = buildDatabaseConfig({ target });
  const seedResult = await runSeeds(databaseConfig, getSeedsDirectory());

  console.log(`Database target: ${databaseConfig.target}`);
  console.log(`Applied seed files: ${seedResult.applied.length}`);

  for (const seedName of seedResult.applied) {
    console.log(`applied ${seedName}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Database seeding failed: ${message}`);
  process.exitCode = 1;
});
