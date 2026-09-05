import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDirectory = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = path.resolve(webDirectory, '../..');

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results-progression',
  reporter: 'line',
  retries: 0,
  testDir: '.',
  testMatch: /progression-profile\.visual\.spec\.ts/,
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5178',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command:
      'npm run dev --workspace @wits-world/web -- --mode basic-e2e --host 127.0.0.1 --port 5178',
    cwd: repositoryRoot,
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:3999/api/v1',
      VITE_AUTH0_AUDIENCE: 'https://progression-e2e.invalid/api',
      VITE_AUTH0_CLIENT_ID: 'progression-e2e-client',
      VITE_AUTH0_DOMAIN: 'progression-e2e.invalid',
      VITE_DEV_GEO_ACCURACY: '',
      VITE_DEV_GEO_LAT: '',
      VITE_DEV_GEO_LNG: '',
      VITE_MAPBOX_ACCESS_TOKEN: 'pk.progression-e2e-not-used',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:5178',
  },
});
