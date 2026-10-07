import { defineConfig } from '@playwright/test';
import battle from '../playwright.battle.config';

export default defineConfig({
  ...battle,
  // Allow cold Vite module transforms; policy deadlines use controlled clocks.
  expect: { timeout: 30_000 },
  testDir: '.',
  testMatch: /loading-policy\.spec\.ts/,
  outputDir: '../../../.playwright-artifacts/loading-policy',
  use: {
    ...battle.use,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
});
