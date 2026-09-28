import type pg from 'pg';

/** Complete the historical tombstone flow in tests pinned before migration 0062. */
export async function completeLegacyAccountDeletion(
  database: Pick<pg.Pool, 'connect'>,
  playerId: string,
  deletionRequestId: string,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `select private.delete_player_owned_data($1::uuid, $2::uuid)`,
      [playerId, deletionRequestId],
    );
    await client.query(
      `update public.players
          set auth_issuer = null, auth_subject = null,
              player_name = null, role = null,
              lifecycle_status = 'deleted', deletion_request_id = null,
              updated_at = clock_timestamp()
        where id = $1::uuid`,
      [playerId],
    );
    await client.query(
      `update public.account_deletion_requests
          set status = 'completed', completed_at = clock_timestamp(),
              failure_reason = null
        where id = $1::uuid`,
      [deletionRequestId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
