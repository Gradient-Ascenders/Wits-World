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
import { lockPlayerIdentity } from './player-identity-lock.js';

interface PlayerRow {
  id: string;
  player_name: string | null;
  role: PlayerRole;
  lifecycle_status: PlayerLifecycleStatus;
}

interface ResolvedPlayerRow {
  id: string | null;
  identity_denied: boolean;
  player_name: string | null;
  role: PlayerRole | null;
  lifecycle_status: PlayerLifecycleStatus | null;
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

export class DeletedIdentityTokenError extends Error {
  public constructor() {
    super('This access token belongs to a deleted account.');
    this.name = 'DeletedIdentityTokenError';
  }
}

type PlayerIdentityDatabase =
  Pick<pg.Pool, 'connect' | 'query'> | Pick<pg.PoolClient, 'query' | 'release'>;

export function createPlayerIdentityService(
  database: PlayerIdentityDatabase,
): PlayerIdentityService & PlayerNameSetupService {
  return {
    async resolve(identity) {
      const playerName =
        identity.connectionStrategy === AUTH0_DATABASE_CONNECTION_STRATEGY
          ? identity.playerName
          : null;
      const synchronizePlayerName =
        identity.connectionStrategy === AUTH0_DATABASE_CONNECTION_STRATEGY;
      // Existing unchanged identities need a fresh authorization read, not a
      // provisioning write and identity lock on every gameplay request. A
      // single statement observes the player and deletion denial consistently.
      // Pending deletion still takes the lock below so completion and token
      // denial remain serialized with identity resolution.
      const existing = await database.query<ResolvedPlayerRow>(
        `select p.id, p.player_name, p.role, p.lifecycle_status,
          exists (
            select 1 from private.deleted_identity_token_denials denial
            where denial.expires_at > now()
              and $3 <= denial.tokens_issued_before
              and denial.identity_digest = sha256(
                denial.identity_salt
                || int4send(octet_length(convert_to($1, 'UTF8')))
                || convert_to($1, 'UTF8') || convert_to($2, 'UTF8')
              )
          ) as identity_denied
          from public.players p
          where p.auth_issuer = $1 and p.auth_subject = $2
            and p.lifecycle_status = 'active'
            and (not $5::boolean or p.player_name is not distinct from $4::text)`,
        [
          identity.issuer,
          identity.subject,
          identity.tokenIssuedAt,
          playerName,
          synchronizePlayerName,
        ],
      );
      const unchanged = existing.rows[0];
      if (unchanged?.identity_denied) throw new DeletedIdentityTokenError();
      if (unchanged?.id && unchanged.role && unchanged.lifecycle_status) {
        return {
          id: unchanged.id,
          playerName: unchanged.player_name,
          role: unchanged.role,
          lifecycleStatus: unchanged.lifecycle_status,
        };
      }

      const result = await withTransaction(database, async (client) => {
        await lockPlayerIdentity(client, identity);

        return client
          .query<ResolvedPlayerRow>(
            `
          with identity_decision as (
            select exists (
              select 1
                from private.deleted_identity_token_denials denial
               where denial.expires_at > now()
                 and $6 <= denial.tokens_issued_before
                 and denial.identity_digest = sha256(
                   denial.identity_salt
                   || int4send(octet_length(convert_to($2, 'UTF8')))
                   || convert_to($2, 'UTF8')
                   || convert_to($3, 'UTF8')
                 )
            ) as denied
          ), resolved_player as (
            insert into public.players (
              id,
              auth_issuer,
              auth_subject,
              player_name,
              role,
              lifecycle_status
            )
            select $1, $2, $3, $4, 'player', 'active'
             where not (select denied from identity_decision)
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
          )
          select
            resolved.id,
            resolved.player_name,
            resolved.role,
            resolved.lifecycle_status,
            decision.denied as identity_denied
          from identity_decision decision
          left join resolved_player resolved on true
        `,
            [
              randomUUID(),
              identity.issuer,
              identity.subject,
              playerName,
              synchronizePlayerName,
              identity.tokenIssuedAt,
            ],
          )
          .catch((error: unknown) => {
            if (!isPlayerNameUniqueViolation(error)) {
              throw error;
            }

            throw new PlayerNameConflictError();
          });
      });

      const player = result.rows[0];

      if (player?.identity_denied) {
        throw new DeletedIdentityTokenError();
      }

      if (!player || !player.id || !player.role || !player.lifecycle_status) {
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

async function withTransaction<T>(
  database: PlayerIdentityDatabase,
  callback: (client: Pick<pg.PoolClient, 'query'>) => Promise<T>,
): Promise<T> {
  const connectedClient =
    'release' in database ? undefined : await database.connect();
  const client = connectedClient ?? database;

  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    connectedClient?.release();
  }
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
