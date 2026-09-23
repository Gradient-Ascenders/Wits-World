import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

const KEY_PUBLIC_ID_BYTES = 8;
const KEY_SECRET_BYTES = 32;
const KEY_PREFIX = 'ww_api_';
const KEY_PATTERN = /^ww_api_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$/u;

export const DEVELOPER_API_ACTIVE_KEY_LIMIT = 5;
export const DEVELOPER_API_KEY_NAME_MAX_LENGTH = 80;

export interface DeveloperApiKeyMetadata {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked';
}

export interface CreatedDeveloperApiKey {
  apiKey: string;
  key: DeveloperApiKeyMetadata;
}

export interface AuthenticatedDeveloperApiKey {
  id: string;
  ownerPlayerId: string;
}

export interface DeveloperApiKeyService {
  listForPlayer(playerId: string): Promise<DeveloperApiKeyMetadata[]>;
  createForPlayer(
    playerId: string,
    name: string,
  ): Promise<CreatedDeveloperApiKey>;
  revokeForPlayer(
    playerId: string,
    keyId: string,
  ): Promise<DeveloperApiKeyMetadata>;
  authenticate(apiKey: string): Promise<AuthenticatedDeveloperApiKey | null>;
}

export interface DeveloperApiKeyDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  connect(): Promise<pg.PoolClient>;
}

export class DeveloperApiKeyLimitReachedError extends Error {
  constructor() {
    super('The account already has the maximum number of active API keys.');
    this.name = 'DeveloperApiKeyLimitReachedError';
  }
}

export class DeveloperApiKeyNotFoundError extends Error {
  constructor() {
    super('The requested developer API key was not found.');
    this.name = 'DeveloperApiKeyNotFoundError';
  }
}

export class DeveloperApiKeyAccountUnavailableError extends Error {
  constructor() {
    super('The developer API key owner account is unavailable.');
    this.name = 'DeveloperApiKeyAccountUnavailableError';
  }
}

interface KeyRow extends pg.QueryResultRow {
  id: string;
  name: string;
  public_id: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

interface AuthenticationRow extends pg.QueryResultRow {
  id: string;
  owner_player_id: string;
  secret_hash: Buffer;
}

interface CountRow extends pg.QueryResultRow {
  count: number;
}

export function createDeveloperApiKeyService(
  database: DeveloperApiKeyDatabase,
): DeveloperApiKeyService {
  return {
    async listForPlayer(playerId) {
      const result = await database.query<KeyRow>(
        `select id::text, name, public_id, created_at, last_used_at, revoked_at
           from private.developer_api_keys
          where owner_player_id = $1::uuid
          order by created_at desc, id desc`,
        [playerId],
      );

      return result.rows.map(mapMetadata);
    },

    async createForPlayer(playerId, rawName) {
      const name = normalizeKeyName(rawName);
      const client = await database.connect();

      try {
        await client.query('begin');

        const owner = await client.query<{ id: string }>(
          `select id::text
             from public.players
            where id = $1::uuid
              and lifecycle_status = 'active'
            for update`,
          [playerId],
        );
        if (!owner.rows[0]) {
          throw new DeveloperApiKeyAccountUnavailableError();
        }

        const count = await client.query<CountRow>(
          `select count(*)::integer as count
             from private.developer_api_keys
            where owner_player_id = $1::uuid
              and revoked_at is null`,
          [playerId],
        );
        if ((count.rows[0]?.count ?? 0) >= DEVELOPER_API_ACTIVE_KEY_LIMIT) {
          throw new DeveloperApiKeyLimitReachedError();
        }

        const publicId = randomBytes(KEY_PUBLIC_ID_BYTES).toString('hex');
        const secret = randomBytes(KEY_SECRET_BYTES).toString('base64url');
        const apiKey = `${KEY_PREFIX}${publicId}_${secret}`;
        const secretHash = hashSecret(secret);

        const inserted = await client.query<KeyRow>(
          `insert into private.developer_api_keys (
             owner_player_id, name, public_id, secret_hash
           ) values ($1::uuid, $2, $3, $4::bytea)
           returning id::text, name, public_id, created_at, last_used_at, revoked_at`,
          [playerId, name, publicId, secretHash],
        );
        const row = inserted.rows[0];
        if (!row)
          throw new Error('Developer API key creation returned no row.');

        await client.query('commit');
        return { apiKey, key: mapMetadata(row) };
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async revokeForPlayer(playerId, keyId) {
      const result = await database.query<KeyRow>(
        `update private.developer_api_keys
            set revoked_at = coalesce(revoked_at, clock_timestamp())
          where id = $1::uuid
            and owner_player_id = $2::uuid
        returning id::text, name, public_id, created_at, last_used_at, revoked_at`,
        [keyId, playerId],
      );
      const row = result.rows[0];
      if (!row) throw new DeveloperApiKeyNotFoundError();
      return mapMetadata(row);
    },

    async authenticate(apiKey) {
      const parsed = parseDeveloperApiKey(apiKey);
      if (!parsed) return null;

      const result = await database.query<AuthenticationRow>(
        `select key.id::text,
                key.owner_player_id::text,
                key.secret_hash
           from private.developer_api_keys key
           join public.players owner
             on owner.id = key.owner_player_id
          where key.public_id = $1
            and key.revoked_at is null
            and owner.lifecycle_status = 'active'`,
        [parsed.publicId],
      );
      const row = result.rows[0];
      if (!row) return null;

      const providedHash = hashSecret(parsed.secret);
      if (
        row.secret_hash.length !== providedHash.length ||
        !timingSafeEqual(row.secret_hash, providedHash)
      ) {
        return null;
      }

      await database.query(
        `update private.developer_api_keys
            set last_used_at = clock_timestamp()
          where id = $1::uuid
            and (
              last_used_at is null
              or last_used_at < clock_timestamp() - interval '1 minute'
            )`,
        [row.id],
      );

      return { id: row.id, ownerPlayerId: row.owner_player_id };
    },
  };
}

export function parseDeveloperApiKey(
  apiKey: string,
): { publicId: string; secret: string } | null {
  const match = KEY_PATTERN.exec(apiKey);
  if (!match?.[1] || !match[2]) return null;
  return { publicId: match[1], secret: match[2] };
}

function normalizeKeyName(name: string): string {
  const normalized = name.trim();
  if (
    normalized.length < 1 ||
    normalized.length > DEVELOPER_API_KEY_NAME_MAX_LENGTH
  ) {
    throw new Error('Developer API key name is invalid.');
  }
  return normalized;
}

function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function mapMetadata(row: KeyRow): DeveloperApiKeyMetadata {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: `${KEY_PREFIX}${row.public_id}_…`,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    status: row.revoked_at ? 'revoked' : 'active',
  };
}
