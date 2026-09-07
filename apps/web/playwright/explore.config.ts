import { defineConfig } from '@playwright/test';
import trails from './trails.config';

export default defineConfig({
  ...trails,
  timeout: 45_000,
  testMatch: /(explore-experience|trails-discovery\.visual)\.spec\.ts/,
  use: {
    ...trails.use,
    actionTimeout: 10_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
});
