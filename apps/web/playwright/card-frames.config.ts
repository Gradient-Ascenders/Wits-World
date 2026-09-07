import { defineConfig } from '@playwright/test';
import base from './collection.config';

export default defineConfig({
  ...base,
  testMatch: /card-frames\.visual\.spec\.ts/,
  outputDir: '/tmp/wits-world-card-frames',
});
