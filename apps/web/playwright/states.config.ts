import { defineConfig } from '@playwright/test';
import battle from '../playwright.battle.config';

export default defineConfig({
  ...battle,
  testDir: '.',
  testMatch: /states\.spec\.ts/,
  outputDir: '../../../.playwright-artifacts/states',
  use: {
    ...battle.use,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
});
