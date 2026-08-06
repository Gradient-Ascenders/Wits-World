import { describe, expect, it } from 'vitest';

import { buildDatabaseConfig } from '../src/config/database.js';

const neonUrl =
  'postgresql://neondb_owner:password@example.neon.tech/neondb?sslmode=require';

describe('database configuration', () => {
  it('loads the development database URL', () => {
    expect(buildDatabaseConfig({ env: { DATABASE_URL: neonUrl } })).toEqual({
      connectionString: neonUrl,
      target: 'development',
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
