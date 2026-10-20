import { defineConfig } from '@playwright/test';
import base from './progression.config';

export default defineConfig({
  ...base,
  outputDir: '/tmp/wits-world-session-startup-evidence',
  testMatch: /session-startup\.spec\.ts/,
});
