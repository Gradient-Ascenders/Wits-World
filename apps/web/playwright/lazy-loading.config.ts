import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'lazy-loading.spec.ts',
  outputDir: 'test-results/lazy-loading',
  reporter: 'line',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    baseURL: 'http://127.0.0.1:5186',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node apps/web/playwright/lazy-loading-server.mjs',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
