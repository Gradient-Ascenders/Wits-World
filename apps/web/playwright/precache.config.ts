import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'precache.spec.ts',
  outputDir: 'test-results/precache',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: {
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    baseURL: 'http://127.0.0.1:5193',
    serviceWorkers: 'allow',
    permissions: ['geolocation'],
    geolocation: { latitude: -26, longitude: 28, accuracy: 10 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node apps/web/playwright/precache-server.mjs',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: 'http://127.0.0.1:5193',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
