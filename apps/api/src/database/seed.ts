import {
  buildMigrationDatabaseConfig,
  loadApiEnvironment,
} from '../config/database.js';
import {
  getBasicDemoSeedsDirectory,
  getSeedsDirectory,
  getVerifiedEventsSeedsDirectory,
} from './paths.js';
import { runBasicDemoSeeds, runSeeds, runVerifiedEventSeeds } from './seeds.js';

async function main() {
  loadApiEnvironment();

  const target = process.argv.includes('--test') ? 'test' : 'development';
  const databaseConfig = buildMigrationDatabaseConfig({ target });
  if (
    process.argv.includes('--basic-demo') &&
    process.argv.includes('--verified-events')
  ) {
    throw new Error(
      '--basic-demo and --verified-events are separate content packs and cannot be combined.',
    );
  }

  const seedResult = process.argv.includes('--verified-events')
    ? await runVerifiedEventSeeds(
        databaseConfig,
        getSeedsDirectory(),
        getVerifiedEventsSeedsDirectory(),
      )
    : process.argv.includes('--basic-demo')
      ? await runBasicDemoSeeds(
          databaseConfig,
          getSeedsDirectory(),
          getBasicDemoSeedsDirectory(),
        )
      : await runSeeds(databaseConfig, getSeedsDirectory());

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
