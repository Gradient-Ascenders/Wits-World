import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'visual-capture-safety.spec.ts',
  outputDir: 'test-results/visual-capture-safety',
  reporter: 'line',
  workers: 1,
  use: { browserName: 'chromium', screenshot: 'only-on-failure' },
});
