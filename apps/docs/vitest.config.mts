import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fixture = (name: string) =>
  fileURLToPath(new URL(`./tests/fixtures/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@docusaurus/Head': fixture('DocusaurusHead.tsx'),
      '@docusaurus/Link': fixture('DocusaurusLink.tsx'),
      '@docusaurus/router': fixture('DocusaurusRouter.tsx'),
      '@docusaurus/useBaseUrl': fixture('useBaseUrl.ts'),
      '@theme/Heading': fixture('ThemeHeading.tsx'),
      '@theme/Layout': fixture('ThemeLayout.tsx'),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['docusaurus.config.ts', 'sidebars.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: '../../coverage/docs',
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    environment: 'node',
  },
});
