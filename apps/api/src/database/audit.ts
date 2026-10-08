import { readFile } from 'node:fs/promises';

import { buildDatabaseConfig, loadApiEnvironment } from '../config/database.js';
import { createDatabasePool, type DatabaseClientRunner } from './connection.js';
import {
  auditDatabaseQuality,
  parsePlayerDataClassifications,
} from './quality-audit.js';

const runQuietly: DatabaseClientRunner = async (config, callback) => {
  const pool = createDatabasePool(config, {
    logger: { info() {}, error() {} },
  });
  let client;
  try {
    client = await pool.connect();
    return await callback(client);
  } finally {
    client?.release();
    await pool.end();
  }
};

async function main() {
  const args = process.argv.slice(2);
  const classificationIndex = args.indexOf('--classifications');
  const classificationPath =
    classificationIndex < 0 ? undefined : args[classificationIndex + 1];
  const knownArgs = args.filter(
    (_, index) => index !== classificationIndex + 1 || classificationIndex < 0,
  );
  if (
    knownArgs.some((arg) => arg !== '--test' && arg !== '--classifications') ||
    (classificationIndex >= 0 &&
      (!classificationPath || classificationPath.startsWith('--'))) ||
    args.filter((arg) => arg === '--classifications').length > 1
  ) {
    throw new Error(
      'Usage: db:audit [--test] [--classifications /path/to/private.json]',
    );
  }
  loadApiEnvironment();
  const config = buildDatabaseConfig({
    target: args.includes('--test') ? 'test' : 'development',
  });
  const classifications =
    classificationPath === undefined
      ? undefined
      : parsePlayerDataClassifications(
          JSON.parse(await readFile(classificationPath, 'utf8')) as unknown,
          config,
        );
  const report = await auditDatabaseQuality(
    config,
    { classifications },
    runQuietly,
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_]{1,20}$/.test(error.code)
      ? error.code
      : 'AUDIT_FAILED';
  console.error(
    `Database quality audit failed (${code}). Check the target and arguments; no data was changed.`,
  );
  process.exitCode = 1;
});
