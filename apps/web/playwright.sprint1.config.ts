import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = path.resolve(webDirectory, '../..');

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'playwright/test-results',
  reporter: 'line',
  retries: process.env.CI ? 1 : 0,
  testDir: './playwright',
  testMatch: /(account-player-name|sprint1\.deterministic)\.spec\.ts/,
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'npm run dev:e2e:sprint1 --workspace @wits-world/api',
      cwd: repositoryRoot,
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:3001/health',
    },
    {
      command:
        'npm run dev --workspace @wits-world/web -- --mode sprint1-e2e --host 127.0.0.1 --port 5174',
      cwd: repositoryRoot,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:3001/api/v1',
        VITE_AUTH0_AUDIENCE: 'https://sprint1-e2e.invalid/api',
        VITE_AUTH0_CLIENT_ID: 'sprint1-e2e-client',
        VITE_AUTH0_DOMAIN: 'sprint1-e2e.invalid',
        VITE_MAPBOX_ACCESS_TOKEN: 'pk.sprint1-e2e-not-used',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:5174',
    },
  ],
});
