import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const sprint1Fixture = (name: string) =>
  decodeURIComponent(
    new URL(`./playwright/fixtures/${name}`, import.meta.url).pathname,
  ).replace(/^\/([A-Za-z]:\/)/, '$1');

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'worker',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Wits World',
        short_name: 'Wits World',
        start_url: '/explore',
        display: 'standalone',
        background_color: '#edf2ec',
        theme_color: '#193b32',
        icons: [
          {
            src: '/branding/wits-world-campus-seal-transparent.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve:
    mode === 'sprint1-e2e' || mode === 'basic-e2e'
      ? {
          alias: [
            {
              find: '@auth0/auth0-react',
              replacement: sprint1Fixture('auth0-react.tsx'),
            },
            {
              find: './runtime-boundaries',
              replacement: sprint1Fixture('sprint1-runtime-boundaries.ts'),
            },
          ],
        }
      : undefined,
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    clearMocks: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: '../../coverage/web',
    },
    css: false,
    environment: 'jsdom',
    fileParallelism: true,
    maxWorkers: 2,
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./tests/setup.ts'],
  },
}));
