import type pg from 'pg';

import type { AuthenticatedIdentity } from '../auth/types.js';

type IdentityLockClient = Pick<pg.PoolClient, 'query'>;

export async function lockPlayerIdentity(
  client: IdentityLockClient,
  identity: AuthenticatedIdentity,
): Promise<void> {
  await client.query(
    `
      select pg_advisory_xact_lock(
        hashtextextended(
          encode(
            int4send(octet_length(convert_to($1, 'UTF8')))
            || convert_to($1, 'UTF8')
            || convert_to($2, 'UTF8'),
            'hex'
          ),
          0
        )
      )
    `,
    [identity.issuer, identity.subject],
  );
}
