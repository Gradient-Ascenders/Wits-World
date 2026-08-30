import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = path.resolve(webDirectory, '../..');

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'playwright/test-results/starter',
  reporter: 'line',
  testDir: './playwright',
  testMatch:
    /(collection-gallery|starter-selection|deck-overview)\.visual\.spec\.ts/,
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5177',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command:
      'npm run dev --workspace @wits-world/web -- --mode basic-e2e --host 127.0.0.1 --port 5177',
    cwd: repositoryRoot,
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:3999/api/v1',
      VITE_AUTH0_AUDIENCE: 'https://starter-e2e.invalid/api',
      VITE_AUTH0_CLIENT_ID: 'starter-e2e-client',
      VITE_AUTH0_DOMAIN: 'starter-e2e.invalid',
      VITE_MAPBOX_ACCESS_TOKEN: 'pk.starter-e2e-not-used',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:5177',
  },
});
