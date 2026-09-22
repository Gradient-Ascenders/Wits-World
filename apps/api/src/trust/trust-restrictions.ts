import type pg from 'pg';

export type TrustRestrictionScope =
  | 'online_verification_required'
  | 'location_reward_challenge_hold'
  | 'new_competitive_match_hold'
  | 'card_trade_hold';

export interface ActiveTrustRestriction {
  scope: TrustRestrictionScope;
  startsAt: Date;
  expiresAt: Date;
}

export interface TrustRestrictionQueryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface TrustRestrictionService {
  activeRestriction(
    playerId: string,
    scope: TrustRestrictionScope,
    client?: TrustRestrictionQueryable,
  ): Promise<ActiveTrustRestriction | null>;
  assertAllowed(
    playerId: string,
    scope: TrustRestrictionScope,
    client?: TrustRestrictionQueryable,
  ): Promise<void>;
}

export class TrustActivityRestrictedError extends Error {
  readonly code = 'ACTIVITY_REVIEW_RESTRICTION';
  readonly statusCode = 403;

  constructor(readonly restriction: ActiveTrustRestriction) {
    super(
      'This activity is temporarily unavailable while an account review is in progress.',
    );
    this.name = 'TrustActivityRestrictedError';
  }
}

export function createTrustRestrictionService(
  database: Pick<pg.Pool, 'connect'>,
): TrustRestrictionService {
  const find = async (
    queryable: TrustRestrictionQueryable,
    playerId: string,
    scope: TrustRestrictionScope,
  ): Promise<ActiveTrustRestriction | null> => {
    const result = await queryable.query<{
      scope: TrustRestrictionScope;
      starts_at: Date;
      effective_expires_at: Date;
    }>(
      `
        select restriction.scope,
               restriction.starts_at,
               coalesce(
                 case resolution.outcome
                   when 'upheld' then restriction.original_expires_at
                   else least(
                     restriction.original_expires_at,
                     resolution.effective_expires_at
                   )
                 end,
                 restriction.original_expires_at
               ) as effective_expires_at
          from private.trust_restrictions restriction
          left join private.trust_appeals appeal
            on appeal.challenged_decision_id = restriction.decision_id
          left join private.trust_appeal_resolutions resolution
            on resolution.appeal_id = appeal.id
         where restriction.player_id = $1::uuid
           and restriction.scope = $2
           and restriction.starts_at <= clock_timestamp()
           and coalesce(
                 case resolution.outcome
                   when 'upheld' then restriction.original_expires_at
                   else least(
                     restriction.original_expires_at,
                     resolution.effective_expires_at
                   )
                 end,
                 restriction.original_expires_at
               ) > clock_timestamp()
         order by effective_expires_at desc, restriction.id
         limit 1
      `,
      [playerId, scope],
    );
    const row = result.rows[0];
    return row
      ? {
          scope: row.scope,
          startsAt: row.starts_at,
          expiresAt: row.effective_expires_at,
        }
      : null;
  };

  const activeRestriction: TrustRestrictionService['activeRestriction'] =
    async (playerId, scope, client) => {
      if (client) return find(client, playerId, scope);
      const connection = await database.connect();
      try {
        return await find(connection, playerId, scope);
      } finally {
        connection.release();
      }
    };

  return {
    activeRestriction,
    async assertAllowed(playerId, scope, client) {
      const restriction = await activeRestriction(playerId, scope, client);
      if (restriction) throw new TrustActivityRestrictedError(restriction);
    },
  };
}
