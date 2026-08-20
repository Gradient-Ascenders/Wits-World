import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../src/config/database.js';
import { remapAuthIssuer } from '../src/database/auth-issuer-remap-procedure.js';
import type { DatabaseClientRunner } from '../src/database/connection.js';

const fromIssuer = 'https://tenant.example.test/';
const toIssuer = 'https://login.wits-world.example/';
const databaseConfig: DatabaseConfig = {
  connectionString:
    'postgresql://owner:password@ep-production-pooler.example.neon.tech/wits_world?sslmode=require',
  target: 'production',
  variableName: 'DATABASE_URL',
};

describe('Auth0 issuer remap procedure', () => {
  it('inspects the exact issuers without writing by default', async () => {
    const query = createQuery({ oldCount: 3 });

    await expect(
      remapAuthIssuer(remapOptions(false), createClientRunner(query)),
    ).resolves.toEqual({
      applied: false,
      database: 'wits_world',
      hostname: 'ep-production-pooler.example.neon.tech',
      matchingPlayers: 3,
      updatedPlayers: 0,
    });

    expect(statements(query)).not.toContain('begin');
    expect(
      statements(query).some((statement) => statement.startsWith('update')),
    ).toBe(false);
  });

  it('changes only the issuer and verifies the bounded update', async () => {
    const query = createQuery({ oldCount: 3 });

    await expect(
      remapAuthIssuer(remapOptions(true), createClientRunner(query)),
    ).resolves.toEqual({
      applied: true,
      database: 'wits_world',
      hostname: 'ep-production-pooler.example.neon.tech',
      matchingPlayers: 3,
      updatedPlayers: 3,
    });

    const updateCall = query.mock.calls.find(([statement]) =>
      normalise(statement).startsWith('update public.players'),
    );

    expect(updateCall?.[0]).toContain('set auth_issuer = $2');
    expect(updateCall?.[0]).toContain('updated_at = now()');
    expect(updateCall?.[0]).not.toContain('auth_subject =');
    expect(updateCall?.[0]).not.toContain('id =');
    expect(updateCall?.[1]).toEqual([fromIssuer, toIssuer]);
    expect(statements(query)).toContain(
      'lock table public.players in access exclusive mode',
    );
    expect(statements(query).at(-1)).toBe('commit');
  });

  it('refuses to merge into an issuer that already has local players', async () => {
    const query = createQuery({ newCount: 1, oldCount: 3 });

    await expect(
      remapAuthIssuer(remapOptions(true), createClientRunner(query)),
    ).rejects.toThrow(
      'The new Auth0 issuer already has local players; reconcile them before cutover.',
    );

    expect(statements(query).at(-1)).toBe('rollback');
    expect(
      statements(query).some((statement) => statement.startsWith('update')),
    ).toBe(false);
  });

  it('requires exact confirmation of the connected database name', async () => {
    const query = createQuery({ database: 'different_database', oldCount: 3 });

    await expect(
      remapAuthIssuer(remapOptions(true), createClientRunner(query)),
    ).rejects.toThrow(
      'The connected database name or hostname does not match the explicit confirmation.',
    );

    expect(statements(query)).toEqual([
      'select current_database() as database',
    ]);
  });

  it('rejects the same database name on a different Neon hostname', async () => {
    const query = createQuery({ oldCount: 3 });

    await expect(
      remapAuthIssuer(
        {
          ...remapOptions(true),
          confirmHostname: 'ep-test-pooler.example.neon.tech',
        },
        createClientRunner(query),
      ),
    ).rejects.toThrow(
      'The connected database name or hostname does not match the explicit confirmation.',
    );

    expect(statements(query)).toEqual([
      'select current_database() as database',
    ]);
  });
});

function remapOptions(apply: boolean) {
  return {
    apply,
    confirmDatabase: 'wits_world',
    confirmHostname: 'ep-production-pooler.example.neon.tech',
    databaseConfig,
    fromIssuer,
    toIssuer,
  };
}

function createQuery({
  database = 'wits_world',
  newCount = 0,
  oldCount,
}: {
  database?: string;
  newCount?: number;
  oldCount: number;
}) {
  let currentNewCount = newCount;
  let currentOldCount = oldCount;

  return vi.fn(async (statement: string, parameters?: unknown[]) => {
    const sql = normalise(statement);

    if (sql === 'select current_database() as database') {
      return { rows: [{ database }] };
    }

    if (sql.startsWith('select count(*)::integer as count')) {
      const issuer = parameters?.[0];
      return {
        rows: [
          { count: issuer === fromIssuer ? currentOldCount : currentNewCount },
        ],
      };
    }

    if (sql.startsWith('update public.players')) {
      const rowCount = currentOldCount;
      currentOldCount = 0;
      currentNewCount += rowCount;
      return { rowCount, rows: [] };
    }

    return { rows: [] };
  });
}

function createClientRunner(query: ReturnType<typeof createQuery>) {
  const client = { query } as unknown as pg.PoolClient;

  const runWithClient: DatabaseClientRunner = async (_config, callback) =>
    callback(client);

  return runWithClient;
}

function statements(query: ReturnType<typeof createQuery>): string[] {
  return query.mock.calls.map(([statement]) => normalise(statement));
}

function normalise(statement: string): string {
  return statement.replace(/\s+/g, ' ').trim();
}
