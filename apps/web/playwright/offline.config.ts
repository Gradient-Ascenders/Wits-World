import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: /(?:offline|game-artwork)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/offline',
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4180',
    permissions: ['geolocation'],
    geolocation: { latitude: -26, longitude: 28, accuracy: 10 },
    serviceWorkers: 'allow',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node playwright/offline-preview.mjs',
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:3999/api/v1',
      VITE_AUTH0_AUDIENCE: 'https://offline-e2e.invalid/api',
      VITE_AUTH0_CLIENT_ID: 'offline-e2e-client',
      VITE_AUTH0_DOMAIN: 'offline-e2e.invalid',
      VITE_MAPBOX_ACCESS_TOKEN: 'pk.offline-e2e-not-used',
      VITE_DEV_GEO_ACCURACY: '',
      VITE_DEV_GEO_LAT: '',
      VITE_DEV_GEO_LNG: '',
    },
  },
});
