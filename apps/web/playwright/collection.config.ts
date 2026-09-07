import { defineConfig } from '@playwright/test';
import base from './progression.config';

export default defineConfig({
  ...base,
  testMatch: /collection-(gallery|evolution)\.visual\.spec\.ts/,
  outputDir: '/tmp/wits-world-collection-evidence',
  webServer: {
    ...(!Array.isArray(base.webServer) ? base.webServer : {}),
    command:
      'npm run dev --workspace @wits-world/web -- --mode basic-e2e --host 127.0.0.1 --port 5178',
    reuseExistingServer: true,
  },
});
