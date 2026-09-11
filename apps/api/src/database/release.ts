import { buildDatabaseConfig, loadApiEnvironment } from '../config/database.js';
import { parseDatabaseReleaseOptions } from './release-options.js';
import { runDatabaseRelease } from './release-procedure.js';

async function main() {
  loadApiEnvironment();

  const options = parseDatabaseReleaseOptions(process.argv.slice(2));
  const databaseConfig = buildDatabaseConfig({ target: options.target });
  const result = await runDatabaseRelease({
    confirmDatabase: options.confirmDatabase,
    databaseConfig,
    includeBasicDemoSeed: options.includeBasicDemoSeed,
    includeVerifiedEventsSeed: options.includeVerifiedEventsSeed,
    onInspection(inspection) {
      console.log(`Release target: ${options.target}`);
      console.log(`Connected database: ${inspection.database}`);
      console.log(`PostGIS available: ${inspection.postgisAvailableVersion}`);
    },
  });

  console.log(`Applied migrations: ${result.migrations.applied.length}`);
  console.log(`Skipped migrations: ${result.migrations.skipped.length}`);
  console.log(`PostGIS installed: ${result.readiness.postgisVersion}`);
  console.log(`Applied seed files: ${result.seeds?.applied.length ?? 0}`);
  console.log(`Recorded migrations: ${result.verification.migrationCount}`);

  if (result.verification.basicDemoEventCount !== undefined) {
    console.log(
      `Published Basic demo events: ${result.verification.basicDemoEventCount}`,
    );
  }

  if (result.verification.basicDemoChallengeCount !== undefined) {
    console.log(
      `Published Basic demo challenges: ${result.verification.basicDemoChallengeCount}`,
    );
  }

  if (result.verification.verifiedEventCount !== undefined) {
    console.log(`Verified events: ${result.verification.verifiedEventCount}`);
    console.log(
      `Verified questions: ${result.verification.verifiedQuestionCount}`,
    );
  }

  console.log('Database release procedure completed successfully.');
}

main().catch((error: unknown) => {
  const message = redactDatabaseUrls(
    error instanceof Error ? error.message : String(error),
  );

  console.error(`Database release procedure failed: ${message}`);
  process.exitCode = 1;
});

function redactDatabaseUrls(message: string) {
  return message.replace(
    /postgres(?:ql)?:\/\/\S+/giu,
    '[redacted database URL]',
  );
}
