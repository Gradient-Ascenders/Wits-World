import { defineConfig, mergeConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

const target = process.env.TEST_DATABASE_URL;
if (!target) {
  throw new Error(
    'Full API coverage requires an explicit local TEST_DATABASE_URL.',
  );
}
let databaseUrl: URL;
try {
  databaseUrl = new URL(target);
} catch {
  throw new Error('Full API coverage requires a valid local PostgreSQL URL.');
}
if (
  !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
  !['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(
    databaseUrl.hostname,
  )
) {
  throw new Error(
    'Full API coverage accepts only local or isolated CI PostGIS, never a remote database.',
  );
}

export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      maxWorkers: 4,
      testTimeout: 30_000,
      env: {
        RUN_DATABASE_INTEGRATION_TESTS: 'true',
        DATABASE_URL:
          'postgresql://ci-guard:ci-guard@127.0.0.1:1/wits_world_ci_guard',
      },
    },
  }),
);
