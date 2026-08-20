import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = path.resolve(webDirectory, '../..');
const authSessionRestorationTest = /auth-session-restoration\.smoke\.spec\.ts/;

// These unprefixed values remain in the Playwright Node process. Vite exposes
// only VITE_* variables to browser code.
dotenv.config({
  path: path.join(webDirectory, '.env.e2e.local'),
  quiet: true,
});

export const authenticationStatePath = path.join(
  webDirectory,
  'playwright/.auth/player.json',
);

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'playwright/test-results',
  reporter: 'line',
  retries: process.env.CI ? 1 : 0,
  testDir: './playwright',
  timeout: 60_000,
  // Every authenticated project starts from the same rotating-refresh-token
  // storage snapshot. Keep these browser contexts serial so one test cannot
  // rotate or end the real Auth0 session while another test is restoring it.
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev --workspace @wits-world/api',
      cwd: repositoryRoot,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: 'http://127.0.0.1:3000/health',
    },
    {
      command: 'npm run dev --workspace @wits-world/web -- --mode e2e',
      cwd: repositoryRoot,
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:5173',
    },
  ],
  projects: [
    {
      name: 'auth-setup',
      teardown: 'auth-session-restoration',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'off',
        trace: 'off',
        video: 'off',
      },
    },
    {
      name: 'chromium',
      dependencies: ['auth-setup'],
      testIgnore: [
        /auth\.setup\.ts/,
        authSessionRestorationTest,
        /sprint1\.deterministic\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authenticationStatePath,
      },
    },
    {
      name: 'auth-session-restoration',
      testMatch: authSessionRestorationTest,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authenticationStatePath,
      },
    },
  ],
});
