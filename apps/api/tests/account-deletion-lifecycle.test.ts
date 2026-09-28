import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedIdentity } from '../src/auth/types.js';
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const DELETION_ID = 'a2000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-28T08:00:00.000Z');
const identity: AuthenticatedIdentity = {
  issuer: 'https://issuer.example/',
  subject: 'auth0|coverage-player',
};

describe('account deletion lifecycle persistence', () => {
  it('creates a pending request and finalizes dependent gameplay atomically', async () => {
    const finalizeDependentGameplay = vi.fn(async () => undefined);
    const { database, query, release } = lifecycleDatabase(
      async (statement) => {
        const sql = normalizedSql(statement);
        if (sql.includes('from public.players')) {
          return { rows: [playerRow('active')] };
        }
        if (sql.includes('insert into public.account_deletion_requests')) {
          return { rows: [deletionRow('pending')] };
        }
        return { rows: [] };
      },
    );
    const service = createAccountDeletionLifecycle(database, {
      clock: () => NOW,
      createId: () => DELETION_ID,
      finalizeDependentGameplay,
    });

    await expect(service.request(identity)).resolves.toEqual({
      id: DELETION_ID,
      requestedAt: NOW,
      completedAt: null,
      status: 'pending',
      failureReason: null,
    });
    expect(finalizeDependentGameplay).toHaveBeenCalledWith(
      expect.anything(),
      PLAYER_ID,
      NOW,
    );
    expect(query).toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns an existing request for an already locked player', async () => {
    const { database, query } = lifecycleDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('from public.players')) {
        return { rows: [playerRow('deletion_pending')] };
      }
      if (sql.includes('from public.account_deletion_requests')) {
        return { rows: [deletionRow('retry_pending')] };
      }
      return { rows: [] };
    });

    await expect(
      createAccountDeletionLifecycle(database).request(identity),
    ).resolves.toMatchObject({
      id: DELETION_ID,
      status: 'retry_pending',
    });
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes(
          'insert into public.account_deletion_requests',
        ),
      ),
    ).toBe(false);
  });

  it('marks retry state and completes physical removal idempotently', async () => {
    let status: 'pending' | 'retry_pending' | 'completed' = 'pending';
    const { database, query } = lifecycleDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('from public.account_deletion_requests')) {
        return { rows: [deletionRow(status)] };
      }
      if (
        sql.includes('update public.account_deletion_requests') &&
        sql.includes("status = 'retry_pending'")
      ) {
        status = 'retry_pending';
        return {
          rows: [deletionRow(status, 'auth0_deletion_failed')],
        };
      }
      if (sql.includes('delete from public.players')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('from public.players')) {
        return { rows: [playerRow('deletion_pending')] };
      }
      if (
        sql.includes('update public.account_deletion_requests') &&
        sql.includes("status = 'completed'")
      ) {
        status = 'completed';
        return { rows: [deletionRow(status)] };
      }
      return { rows: [] };
    });
    const service = createAccountDeletionLifecycle(database, {
      clock: () => NOW,
    });

    await expect(
      service.markRetryPending(DELETION_ID, 'auth0_deletion_failed'),
    ).resolves.toMatchObject({
      status: 'retry_pending',
      failureReason: 'auth0_deletion_failed',
    });
    await expect(service.complete(DELETION_ID)).resolves.toMatchObject({
      status: 'completed',
      completedAt: NOW,
    });
    await expect(service.complete(DELETION_ID)).resolves.toMatchObject({
      status: 'completed',
    });
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('private.delete_player_owned_data'),
      ),
    ).toBe(true);
  });

  it('lists bounded work and purges expired privacy records', async () => {
    const { database, release } = lifecycleDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes("deletion.status in ('pending', 'retry_pending')")) {
        return {
          rows: [
            {
              deletion_request_id: DELETION_ID,
              status: 'retry_pending',
              auth_issuer: identity.issuer,
              auth_subject: identity.subject,
            },
          ],
        };
      }
      if (sql.includes('delete from public.account_deletion_requests')) {
        return { rows: [{ id: DELETION_ID }], rowCount: 1 };
      }
      return { rows: [] };
    });
    const service = createAccountDeletionLifecycle(database, {
      clock: () => NOW,
    });

    await expect(service.listProcessable(10)).resolves.toEqual([
      {
        deletionId: DELETION_ID,
        identity,
        status: 'retry_pending',
      },
    ]);
    await expect(service.purgeExpiredCompleted()).resolves.toBe(1);
    await expect(service.listProcessable(0)).rejects.toThrow(
      'between 1 and 100',
    );
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('rolls back when an active player cannot be found', async () => {
    const { database, query, release } = lifecycleDatabase(async () => ({
      rows: [],
    }));

    await expect(
      createAccountDeletionLifecycle(database).request(identity),
    ).rejects.toThrow('Authenticated local player was not found');
    expect(query).toHaveBeenCalledWith('rollback');
    expect(release).toHaveBeenCalledOnce();
  });
});

function lifecycleDatabase(
  implementation: (
    statement: string,
    values?: unknown[],
  ) => Promise<{
    rows: Record<string, unknown>[];
    rowCount?: number | null;
  }>,
) {
  const query = vi.fn(implementation);
  const release = vi.fn();
  const client = { query, release } as unknown as pg.PoolClient;
  const database = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pick<pg.Pool, 'connect'>;
  return { database, query, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function playerRow(status: 'active' | 'deletion_pending') {
  return {
    id: PLAYER_ID,
    auth_issuer: identity.issuer,
    auth_subject: identity.subject,
    lifecycle_status: status,
    deletion_request_id: status === 'active' ? null : DELETION_ID,
  };
}

function deletionRow(
  status: 'pending' | 'retry_pending' | 'completed',
  failureReason: 'auth0_deletion_failed' | null = null,
) {
  return {
    id: DELETION_ID,
    requested_at: NOW,
    completed_at: status === 'completed' ? NOW : null,
    status,
    failure_reason: failureReason,
  };
}
