import { defineConfig } from '@playwright/test';
import base from './account.config';

export default defineConfig({
  ...base,
  testMatch: /typography\.spec\.ts/,
  outputDir: '../test-results-typography',
});
