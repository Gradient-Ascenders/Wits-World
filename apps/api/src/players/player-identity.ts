import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { AuthenticatedIdentity } from '../auth/types.js';
import type {
  LocalPlayer,
  PlayerLifecycleStatus,
  PlayerRole,
} from './types.js';

interface PlayerRow {
  id: string;
  role: PlayerRole;
  lifecycle_status: PlayerLifecycleStatus;
}

export interface PlayerIdentityService {
  resolve(identity: AuthenticatedIdentity): Promise<LocalPlayer>;
}

export function createPlayerIdentityService(
  database: Pick<pg.Pool, 'query'>,
): PlayerIdentityService {
  return {
    async resolve(identity) {
      const result = await database.query<PlayerRow>(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role,
            lifecycle_status
          )
          values ($1, $2, $3, 'player', 'active')
          on conflict (auth_issuer, auth_subject)
          do update
            set auth_issuer = excluded.auth_issuer
          returning id, role, lifecycle_status
        `,
        [randomUUID(), identity.issuer, identity.subject],
      );

      const player = result.rows[0];

      if (!player) {
        throw new Error('Local player resolution returned no player.');
      }

      return {
        id: player.id,
        role: player.role,
        lifecycleStatus: player.lifecycle_status,
      };
    },
  };
}
