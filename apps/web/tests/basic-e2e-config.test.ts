import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Basic E2E concurrency and timeout boundaries', () => {
  it.each([
    ['true', 4],
    ['', 2],
  ])('uses %s CI configuration with %i workers', async (ci, workers) => {
    vi.stubEnv('CI', ci);
    const { default: config } = await import('../playwright.basic.config');
    expect(config).toMatchObject({
      fullyParallel: true,
      retries: 0,
      timeout: 120_000,
      workers,
      globalSetup: './playwright/basic-global-setup.ts',
      globalTeardown: './playwright/basic-global-teardown.ts',
      use: { actionTimeout: 15_000, navigationTimeout: 30_000 },
    });
  });
});
