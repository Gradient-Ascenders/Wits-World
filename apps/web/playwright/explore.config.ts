import { defineConfig } from '@playwright/test';
import trails from './trails.config';

export default defineConfig({
  ...trails,
  fullyParallel: true,
  timeout: 45_000,
  testMatch:
    /(explore-experience|territory-experience\.visual|trails-discovery\.visual)\.spec\.ts/,
  workers: process.env.CI ? 8 : undefined,
  use: {
    ...trails.use,
    actionTimeout: 10_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
});
