import { defineConfig, devices } from '@playwright/test';

const diagnosticsReportPath = process.env.BASIC_E2E_JSON_REPORT_PATH?.trim();

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: './playwright/basic-global-setup.ts',
  globalTeardown: './playwright/basic-global-teardown.ts',
  outputDir: 'playwright/test-results-basic',
  reporter: diagnosticsReportPath
    ? [['json', { outputFile: diagnosticsReportPath }]]
    : 'line',
  retries: 0,
  testDir: './playwright',
  testMatch: /basic\.deterministic\.spec\.ts/,
  timeout: 300_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5175',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
