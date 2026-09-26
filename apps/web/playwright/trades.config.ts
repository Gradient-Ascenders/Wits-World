import { defineConfig } from '@playwright/test';

import base from './progression.config';

export default defineConfig({
  ...base,
  outputDir: '/tmp/wits-world-trades-evidence',
  testMatch: /trades\.visual\.spec\.ts/,
});
