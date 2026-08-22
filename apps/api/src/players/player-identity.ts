import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { AuthenticatedIdentity } from '../auth/types.js';
import type {
  LocalPlayer,
  PlayerLifecycleStatus,
  PlayerRole,
} from './types.js';
import { normalizeDisplayName } from './display-name.js';

interface PlayerRow {
  display_name: string | null;
  id: string;
  role: PlayerRole;
  lifecycle_status: PlayerLifecycleStatus;
}

export interface PlayerIdentityService {
  resolve(identity: AuthenticatedIdentity): Promise<LocalPlayer>;
}

export interface PlayerDisplayNameService {
  updateDisplayName(
    playerId: string,
    displayName: string,
  ): Promise<LocalPlayer>;
}

export function createPlayerIdentityService(
  database: Pick<pg.Pool, 'query'>,
): PlayerIdentityService & PlayerDisplayNameService {
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
          returning id, role, lifecycle_status, display_name
        `,
        [randomUUID(), identity.issuer, identity.subject],
      );

      const player = result.rows[0];

      if (!player) {
        throw new Error('Local player resolution returned no player.');
      }

      return {
        displayName: player.display_name,
        id: player.id,
        role: player.role,
        lifecycleStatus: player.lifecycle_status,
      };
    },

    async updateDisplayName(playerId, value) {
      const displayName = normalizeDisplayName(value);
      const result = await database.query<PlayerRow>(
        `
          update public.players
             set display_name = $2,
                 updated_at = now()
           where id = $1
             and lifecycle_status = 'active'
          returning id, role, lifecycle_status, display_name
        `,
        [playerId, displayName],
      );

      const player = result.rows[0];

      if (!player) {
        throw new Error('Local player display-name update returned no player.');
      }

      return {
        displayName: player.display_name,
        id: player.id,
        role: player.role,
        lifecycleStatus: player.lifecycle_status,
      };
    },
  };
}
