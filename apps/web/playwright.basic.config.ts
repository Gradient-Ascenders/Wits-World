import { defineConfig, devices } from '@playwright/test';

const diagnosticsReportPath = process.env.BASIC_E2E_JSON_REPORT_PATH?.trim();

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  // Only the canonical journey writes to the API; all other tests intercept
  // every API request within their own browser context.
  fullyParallel: true,
  globalSetup: './playwright/basic-global-setup.ts',
  globalTeardown: './playwright/basic-global-teardown.ts',
  outputDir: 'playwright/test-results-basic',
  reporter: diagnosticsReportPath
    ? [
        [
          './playwright/diagnostic-reporter.mjs',
          { outputFile: diagnosticsReportPath },
        ],
      ]
    : 'line',
  retries: 0,
  testDir: './playwright',
  testMatch: /basic\.deterministic\.spec\.ts/,
  timeout: 120_000,
  workers: process.env.CI ? 4 : 2,
  use: {
    ...devices['Desktop Chrome'],
    actionTimeout: 15_000,
    baseURL: 'http://127.0.0.1:5175',
    navigationTimeout: 30_000,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
