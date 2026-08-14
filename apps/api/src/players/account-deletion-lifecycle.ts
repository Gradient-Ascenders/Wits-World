import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { AuthenticatedIdentity } from '../auth/types.js';
import type {
  AccountDeletionFailureReason,
  AccountDeletionRequest,
  AccountDeletionStatus,
  PlayerLifecycleStatus,
} from './types.js';

interface PlayerDeletionRow {
  id: string;
  lifecycle_status: PlayerLifecycleStatus;
  deletion_request_id: string | null;
}

interface AccountDeletionRow {
  id: string;
  requested_at: Date;
  completed_at: Date | null;
  status: AccountDeletionStatus;
  failure_reason: AccountDeletionFailureReason | null;
}

interface AccountDeletionLifecycleOptions {
  clock?: () => Date;
  createId?: () => string;
}

export interface AccountDeletionLifecycle {
  request(identity: AuthenticatedIdentity): Promise<AccountDeletionRequest>;

  markRetryPending(
    deletionRequestId: string,
    failureReason: AccountDeletionFailureReason,
  ): Promise<AccountDeletionRequest>;

  complete(deletionRequestId: string): Promise<AccountDeletionRequest>;

  purgeExpiredCompleted(): Promise<number>;
}

export function createAccountDeletionLifecycle(
  database: Pick<pg.Pool, 'connect'>,
  {
    clock = () => new Date(),
    createId = randomUUID,
  }: AccountDeletionLifecycleOptions = {},
): AccountDeletionLifecycle {
  return {
    async request(identity) {
      const client = await database.connect();

      try {
        await client.query('begin');

        const playerResult = await client.query<PlayerDeletionRow>(
          `
            select id, lifecycle_status, deletion_request_id
              from public.players
             where auth_issuer = $1
               and auth_subject = $2
             for update
          `,
          [identity.issuer, identity.subject],
        );

        const player = playerResult.rows[0];

        if (!player) {
          throw new Error(
            'Authenticated local player was not found for account deletion.',
          );
        }

        if (player.lifecycle_status === 'deletion_pending') {
          if (!player.deletion_request_id) {
            throw new Error('Deletion-pending player has no deletion request.');
          }

          const existing = await loadDeletionRequest(
            client,
            player.deletion_request_id,
          );

          await client.query('commit');

          return existing;
        }

        if (player.lifecycle_status !== 'active') {
          throw new Error(
            'Only an active local player can begin account deletion.',
          );
        }

        const deletionId = createId();
        const requestedAt = clock();

        const deletionResult = await client.query<AccountDeletionRow>(
          `
            insert into public.account_deletion_requests (
              id,
              requested_at,
              status
            )
            values ($1, $2, 'pending')
            returning
              id,
              requested_at,
              completed_at,
              status,
              failure_reason
          `,
          [deletionId, requestedAt],
        );

        const deletionRequest = deletionResult.rows[0];

        if (!deletionRequest) {
          throw new Error('Account deletion request creation returned no row.');
        }

        await client.query(
          `
            update public.players
               set lifecycle_status = 'deletion_pending',
                   deletion_request_id = $2,
                   updated_at = $3
             where id = $1
          `,
          [player.id, deletionId, requestedAt],
        );

        await client.query('commit');

        return mapDeletionRequest(deletionRequest);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async markRetryPending(deletionRequestId, failureReason) {
      const client = await database.connect();

      try {
        await client.query('begin');

        const current = await loadDeletionRequest(
          client,
          deletionRequestId,
          true,
        );

        if (current.status === 'completed') {
          await client.query('commit');
          return current;
        }

        const result = await client.query<AccountDeletionRow>(
          `
            update public.account_deletion_requests
               set status = 'retry_pending',
                   completed_at = null,
                   failure_reason = $2
             where id = $1
             returning
               id,
               requested_at,
               completed_at,
               status,
               failure_reason
          `,
          [deletionRequestId, failureReason],
        );

        const updated = result.rows[0];

        if (!updated) {
          throw new Error('Account deletion retry update returned no row.');
        }

        await client.query('commit');

        return mapDeletionRequest(updated);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async complete(deletionRequestId) {
      const client = await database.connect();

      try {
        await client.query('begin');

        const current = await loadDeletionRequest(
          client,
          deletionRequestId,
          true,
        );

        if (current.status === 'completed') {
          await client.query('commit');
          return current;
        }

        const playerResult = await client.query<{ id: string }>(
          `
            select id
              from public.players
             where deletion_request_id = $1
             for update
          `,
          [deletionRequestId],
        );

        const player = playerResult.rows[0];

        if (!player) {
          throw new Error(
            'Pending deletion request has no linked local player.',
          );
        }

        const completedAt = clock();

        await client.query(
          `
            update public.players
               set auth_issuer = null,
                   auth_subject = null,
                   role = null,
                   lifecycle_status = 'deleted',
                   deletion_request_id = null,
                   updated_at = $2
             where id = $1
          `,
          [player.id, completedAt],
        );

        const result = await client.query<AccountDeletionRow>(
          `
            update public.account_deletion_requests
               set status = 'completed',
                   completed_at = $2,
                   failure_reason = null
             where id = $1
             returning
               id,
               requested_at,
               completed_at,
               status,
               failure_reason
          `,
          [deletionRequestId, completedAt],
        );

        const completed = result.rows[0];

        if (!completed) {
          throw new Error('Account deletion completion returned no row.');
        }

        await client.query('commit');

        return mapDeletionRequest(completed);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async purgeExpiredCompleted() {
      const client = await database.connect();

      try {
        const cutoff = new Date(clock());
        cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);

        const result = await client.query<{ id: string }>(
          `
            delete from public.account_deletion_requests
             where status = 'completed'
               and completed_at < $1
             returning id
          `,
          [cutoff],
        );

        return result.rowCount ?? result.rows.length;
      } finally {
        client.release();
      }
    },
  };
}

async function loadDeletionRequest(
  client: pg.PoolClient,
  deletionRequestId: string,
  forUpdate = false,
): Promise<AccountDeletionRequest> {
  const lockClause = forUpdate ? 'for update' : '';

  const result = await client.query<AccountDeletionRow>(
    `
      select
        id,
        requested_at,
        completed_at,
        status,
        failure_reason
      from public.account_deletion_requests
      where id = $1
      ${lockClause}
    `,
    [deletionRequestId],
  );

  const deletionRequest = result.rows[0];

  if (!deletionRequest) {
    throw new Error('Account deletion request was not found.');
  }

  return mapDeletionRequest(deletionRequest);
}

function mapDeletionRequest(row: AccountDeletionRow): AccountDeletionRequest {
  return {
    id: row.id,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    status: row.status,
    failureReason: row.failure_reason,
  };
}
