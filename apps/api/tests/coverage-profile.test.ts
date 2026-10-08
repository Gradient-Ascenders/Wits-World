import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('full API coverage target safety', () => {
  it('requires an explicit test target rather than loading a development environment file', async () => {
    vi.stubEnv('TEST_DATABASE_URL', undefined);
    await expect(import('../vitest.postgis.config.js')).rejects.toThrow(
      'explicit local TEST_DATABASE_URL',
    );
  });

  it.each([
    'postgresql://owner:secret@production.example.test/neondb',
    'postgresql://owner:secret@localhost.production.example.test/neondb',
    'https://localhost/database',
    'not a URL',
  ])(
    'rejects an unsafe target without exposing credentials: %s',
    async (target) => {
      vi.stubEnv('TEST_DATABASE_URL', target);
      try {
        await import('../vitest.postgis.config.js');
        expect.fail('Unsafe coverage target accepted.');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/requires|accepts only/);
        expect((error as Error).message).not.toContain('secret');
        expect((error as Error).message).not.toContain('production.example');
      }
    },
  );

  it.each(['localhost', '127.0.0.1', '[::1]', 'postgres'])(
    'permits the isolated %s target and keeps ordinary database connections unusable',
    async (host) => {
      vi.stubEnv(
        'TEST_DATABASE_URL',
        `postgresql://fixture:fixture@${host}/disposable`,
      );
      const { default: config } = await import('../vitest.postgis.config.js');
      expect(config.test?.env?.RUN_DATABASE_INTEGRATION_TESTS).toBe('true');
      const guardedUrl = new URL(config.test!.env!.DATABASE_URL!);
      expect(guardedUrl.hostname).toBe('127.0.0.1');
      expect(guardedUrl.port).toBe('1');
      expect(config.test?.coverage).toEqual(
        expect.objectContaining({ include: ['src/**/*.ts'] }),
      );
    },
  );
});
