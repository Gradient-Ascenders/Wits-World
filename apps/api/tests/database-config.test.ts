import { describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  buildListenerDatabaseConfig,
} from '../src/config/database.js';

const neonUrl =
  'postgresql://neondb_owner:password@example.neon.tech/neondb?sslmode=require';

describe('explicit listener database configuration', () => {
  it('does not fall back to either shared or test configuration', () => {
    for (const LISTENER_DATABASE_URL of [undefined, '', '   ']) {
      expect(() =>
        buildListenerDatabaseConfig({
          DATABASE_URL: neonUrl,
          TEST_DATABASE_URL: neonUrl,
          LISTENER_DATABASE_URL,
        }),
      ).toThrow('LISTENER_DATABASE_URL is required');
    }
  });
  it('accepts an explicit direct endpoint without deriving or changing it', () => {
    expect(
      buildListenerDatabaseConfig({ LISTENER_DATABASE_URL: ` ${neonUrl} ` }),
    ).toEqual({
      connectionString: neonUrl,
      variableName: 'LISTENER_DATABASE_URL',
    });
    expect(
      buildListenerDatabaseConfig({
        LISTENER_DATABASE_URL: 'postgres://user:password@localhost/test',
      }).variableName,
    ).toBe('LISTENER_DATABASE_URL');
  });
  it.each([
    'private-marker',
    'https://user:private-marker@example.test/db',
    'postgres://user:private-marker@example.neon.tech/db',
    'postgres://user:private-marker@example.neon.tech/db?sslmode=disable',
    'postgres://user:private-marker@ep-example-pooler.neon.tech/db?sslmode=require',
    'postgres://user:private-marker@EP-EXAMPLE-POOLER.NEON.TECH./db?sslmode=require',
    'postgres://user:private-marker@example.test/',
    ...[
      'host',
      'HOST',
      'port',
      'database',
      'dbname',
      'db',
      'hostaddr',
      'service',
    ].map(
      (key) =>
        `postgres://user:private-marker@example.test/db?${key}=private-marker`,
    ),
  ])(
    'rejects unsafe configuration without exposing its contents (%#)',
    (url) => {
      let message = '';
      try {
        buildListenerDatabaseConfig({ LISTENER_DATABASE_URL: url });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('LISTENER_DATABASE_URL');
      expect(message).not.toContain('private-marker');
      expect(message).not.toContain('example.test');
      expect(message).not.toContain('example.neon.tech');
    },
  );
});

describe('database configuration', () => {
  it('loads the development database URL', () => {
    expect(buildDatabaseConfig({ env: { DATABASE_URL: neonUrl } })).toEqual({
      connectionString: neonUrl,
      target: 'development',
      variableName: 'DATABASE_URL',
    });
  });

  it('loads the production database URL as an explicit target', () => {
    expect(
      buildDatabaseConfig({
        env: { DATABASE_URL: neonUrl },
        target: 'production',
      }),
    ).toEqual({
      connectionString: neonUrl,
      target: 'production',
      variableName: 'DATABASE_URL',
    });
  });

  it('loads a separate test database URL', () => {
    const testUrl =
      'postgresql://neondb_owner:password@example.neon.tech/neondb_test?sslmode=require';

    expect(
      buildDatabaseConfig({
        env: {
          DATABASE_URL: neonUrl,
          TEST_DATABASE_URL: testUrl,
        },
        target: 'test',
      }),
    ).toEqual({
      connectionString: testUrl,
      target: 'test',
      variableName: 'TEST_DATABASE_URL',
    });
  });

  it('rejects a missing connection URL', () => {
    expect(() => buildDatabaseConfig({ env: {} })).toThrow(
      'DATABASE_URL is required for development database access.',
    );
  });

  it('rejects non-PostgreSQL URLs', () => {
    expect(() =>
      buildDatabaseConfig({ env: { DATABASE_URL: 'https://example.test' } }),
    ).toThrow(
      'DATABASE_URL must use the postgres:// or postgresql:// protocol.',
    );
  });

  it('requires SSL for Neon URLs', () => {
    expect(() =>
      buildDatabaseConfig({
        env: {
          DATABASE_URL:
            'postgresql://neondb_owner:password@example.neon.tech/neondb',
        },
      }),
    ).toThrow(
      'DATABASE_URL must include sslmode=require for Neon connections.',
    );
  });

  it('rejects Neon URLs with a non-required SSL mode', () => {
    expect(() =>
      buildDatabaseConfig({
        env: {
          DATABASE_URL:
            'postgresql://neondb_owner:password@example.neon.tech/neondb?sslmode=prefer',
        },
      }),
    ).toThrow('DATABASE_URL must set sslmode=require for Neon connections.');
  });

  it('recognises Neon hostnames case-insensitively and with a trailing dot', () => {
    expect(() =>
      buildDatabaseConfig({
        env: {
          DATABASE_URL:
            'postgresql://neondb_owner:password@EXAMPLE.NEON.TECH./neondb',
        },
      }),
    ).toThrow(
      'DATABASE_URL must include sslmode=require for Neon connections.',
    );
  });

  it('allows local PostgreSQL URLs without an SSL mode', () => {
    const localUrl =
      'postgresql://wits_world:wits_world@postgres:5432/wits_world';

    expect(buildDatabaseConfig({ env: { DATABASE_URL: localUrl } })).toEqual({
      connectionString: localUrl,
      target: 'development',
      variableName: 'DATABASE_URL',
    });
  });

  it('allows non-Neon PostgreSQL URLs without an SSL mode', () => {
    const postgresUrl =
      'postgresql://database_owner:password@postgres.example.test/wits_world';

    expect(buildDatabaseConfig({ env: { DATABASE_URL: postgresUrl } })).toEqual(
      {
        connectionString: postgresUrl,
        target: 'development',
        variableName: 'DATABASE_URL',
      },
    );
  });

  it('does not mistake a hostname containing neon.tech for a Neon host', () => {
    const postgresUrl =
      'postgresql://database_owner:password@neon.tech.example.test/wits_world';

    expect(buildDatabaseConfig({ env: { DATABASE_URL: postgresUrl } })).toEqual(
      {
        connectionString: postgresUrl,
        target: 'development',
        variableName: 'DATABASE_URL',
      },
    );
  });

  it('loads a separate local test database URL without an SSL mode', () => {
    const developmentUrl =
      'postgresql://development:password@127.0.0.1:5432/wits_world';
    const testUrl =
      'postgresql://wits_world_ci:password@postgres:5432/wits_world_test';

    expect(
      buildDatabaseConfig({
        env: {
          DATABASE_URL: developmentUrl,
          TEST_DATABASE_URL: testUrl,
        },
        target: 'test',
      }),
    ).toEqual({
      connectionString: testUrl,
      target: 'test',
      variableName: 'TEST_DATABASE_URL',
    });
  });

  it('rejects test configuration that points at the development database', () => {
    expect(() =>
      buildDatabaseConfig({
        env: {
          DATABASE_URL: neonUrl,
          TEST_DATABASE_URL: neonUrl,
        },
        target: 'test',
      }),
    ).toThrow(
      'TEST_DATABASE_URL must use a different host, port, or database from DATABASE_URL.',
    );
  });

  it('rejects equivalent database URLs with reordered options and different credentials', () => {
    const equivalentTestUrl =
      'postgres://test_owner:different@EXAMPLE.neon.tech:5432/neondb?channel_binding=require&sslmode=require';

    expect(() =>
      buildDatabaseConfig({
        env: {
          DATABASE_URL:
            'postgresql://dev_owner:password@example.neon.tech/neondb?sslmode=require&channel_binding=require',
          TEST_DATABASE_URL: equivalentTestUrl,
        },
        target: 'test',
      }),
    ).toThrow(
      'TEST_DATABASE_URL must use a different host, port, or database from DATABASE_URL.',
    );
  });

  it('rejects equivalent encoded database paths', () => {
    expect(() =>
      buildDatabaseConfig({
        env: {
          DATABASE_URL: neonUrl,
          TEST_DATABASE_URL:
            'postgresql://test_owner:password@example.neon.tech/neon%64b?sslmode=require',
        },
        target: 'test',
      }),
    ).toThrow(
      'TEST_DATABASE_URL must use a different host, port, or database from DATABASE_URL.',
    );
  });

  it('requires the development URL when validating a test target', () => {
    expect(() =>
      buildDatabaseConfig({
        env: { TEST_DATABASE_URL: neonUrl },
        target: 'test',
      }),
    ).toThrow(
      'DATABASE_URL is required to verify TEST_DATABASE_URL uses a separate database.',
    );
  });
});
