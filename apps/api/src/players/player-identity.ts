import { randomUUID } from 'node:crypto';

import {
  playerNameValidationMessage,
  validatePlayerName,
  type PlayerNameValidationFailure,
} from '@wits-world/account-policy';
import type pg from 'pg';

import { AUTH0_DATABASE_CONNECTION_STRATEGY } from '../auth/interactive-player-claims.js';
import type { InteractivePlayerPrincipal } from '../auth/types.js';
import type {
  LocalPlayer,
  PlayerLifecycleStatus,
  PlayerRole,
} from './types.js';

interface PlayerRow {
  id: string;
  player_name: string | null;
  role: PlayerRole;
  lifecycle_status: PlayerLifecycleStatus;
}

export interface PlayerIdentityService {
  resolve(identity: InteractivePlayerPrincipal): Promise<LocalPlayer>;
}

export interface PlayerNameSetupService {
  assignInitialPlayerName(
    playerId: string,
    playerName: string,
  ): Promise<LocalPlayer>;
}

export class PlayerNameConflictError extends Error {
  public constructor() {
    super('That Player Name is already linked to another player.');
    this.name = 'PlayerNameConflictError';
  }
}

export class InvalidPlayerNameError extends Error {
  public constructor(public readonly failure: PlayerNameValidationFailure) {
    super(playerNameValidationMessage(failure));
    this.name = 'InvalidPlayerNameError';
  }
}

export class PlayerNameAlreadyAssignedError extends Error {
  public constructor() {
    super('Player Name has already been assigned for this account.');
    this.name = 'PlayerNameAlreadyAssignedError';
  }
}

export function createPlayerIdentityService(
  database: Pick<pg.Pool, 'query'>,
): PlayerIdentityService & PlayerNameSetupService {
  return {
    async resolve(identity) {
      const playerName =
        identity.connectionStrategy === AUTH0_DATABASE_CONNECTION_STRATEGY
          ? identity.playerName
          : null;
      const synchronizePlayerName =
        identity.connectionStrategy === AUTH0_DATABASE_CONNECTION_STRATEGY;
      const result = await database
        .query<PlayerRow>(
          `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            player_name,
            role,
            lifecycle_status
          )
          values ($1, $2, $3, $4, 'player', 'active')
          on conflict (auth_issuer, auth_subject)
          do update
            set player_name = case
                  when $5 then excluded.player_name
                  else public.players.player_name
                end,
                updated_at = case
                  when $5
                    and public.players.player_name is distinct from excluded.player_name
                    then now()
                  else public.players.updated_at
                end
          returning id, player_name, role, lifecycle_status
        `,
          [
            randomUUID(),
            identity.issuer,
            identity.subject,
            playerName,
            synchronizePlayerName,
          ],
        )
        .catch(async (error: unknown) => {
          if (!isPlayerNameUniqueViolation(error)) {
            throw error;
          }

          const concurrentlyResolved = await database.query<PlayerRow>(
            `
              select id, player_name, role, lifecycle_status
                from public.players
               where auth_issuer = $1
                 and auth_subject = $2
                 and player_name = $3
            `,
            [identity.issuer, identity.subject, playerName],
          );

          if (concurrentlyResolved.rows.length === 0) {
            throw new PlayerNameConflictError();
          }

          return concurrentlyResolved;
        });

      const player = result.rows[0];

      if (!player) {
        throw new Error('Local player resolution returned no player.');
      }

      return {
        id: player.id,
        playerName: player.player_name,
        role: player.role,
        lifecycleStatus: player.lifecycle_status,
      };
    },

    async assignInitialPlayerName(playerId, value) {
      const validation = validatePlayerName(value);

      if (!validation.valid) {
        throw new InvalidPlayerNameError(validation.failure);
      }

      const result = await database
        .query<PlayerRow>(
          `
            update public.players
               set player_name = $2,
                   updated_at = now()
             where id = $1
               and lifecycle_status = 'active'
               and player_name is null
            returning id, player_name, role, lifecycle_status
          `,
          [playerId, validation.playerName],
        )
        .catch((error: unknown) => {
          if (isPlayerNameUniqueViolation(error)) {
            throw new PlayerNameConflictError();
          }

          throw error;
        });

      const player = result.rows[0];

      if (!player) {
        throw new PlayerNameAlreadyAssignedError();
      }

      return {
        id: player.id,
        playerName: player.player_name,
        role: player.role,
        lifecycleStatus: player.lifecycle_status,
      };
    },
  };
}

function isPlayerNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'players_player_name_case_insensitive_unique'
  );
}
