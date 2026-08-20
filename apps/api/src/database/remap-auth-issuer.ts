import { buildDatabaseConfig, loadApiEnvironment } from '../config/database.js';
import { parseAuthIssuerRemapOptions } from './auth-issuer-remap-options.js';
import { remapAuthIssuer } from './auth-issuer-remap-procedure.js';

async function main() {
  loadApiEnvironment();

  const options = parseAuthIssuerRemapOptions(process.argv.slice(2));
  const databaseConfig = buildDatabaseConfig({ target: options.target });
  const result = await remapAuthIssuer({
    ...options,
    databaseConfig,
  });

  console.log(`Database target: ${options.target}`);
  console.log(`Connected database hostname: ${result.hostname}`);
  console.log(`Connected database: ${result.database}`);
  console.log(`Players using the old issuer: ${result.matchingPlayers}`);
  console.log(`Players updated: ${result.updatedPlayers}`);
  console.log(
    result.applied
      ? 'Auth0 issuer remap completed successfully.'
      : 'Dry run only. Re-run with --apply during the cutover maintenance window.',
  );
}

main().catch((error: unknown) => {
  const message = redactDatabaseUrls(
    error instanceof Error ? error.message : String(error),
  );

  console.error(`Auth0 issuer remap failed: ${message}`);
  process.exitCode = 1;
});

function redactDatabaseUrls(message: string) {
  return message.replace(
    /postgres(?:ql)?:\/\/\S+/giu,
    '[redacted database URL]',
  );
}
