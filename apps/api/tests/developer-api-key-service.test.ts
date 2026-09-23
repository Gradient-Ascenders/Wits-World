import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createDeveloperApiKeyService,
  parseDeveloperApiKey,
  type DeveloperApiKeyDatabase,
} from '../src/developer/developer-api-key-service.js';

const PLAYER_ID = '17200000-0000-4000-8000-000000000001';
const KEY_ID = '18200000-0000-4000-8000-000000000001';

describe('developer API key service', () => {
  it('generates a high-entropy one-time credential and persists only its hash', async () => {
    let persistedHash: Buffer | undefined;
    let persistedPublicId = '';
    const now = new Date('2026-09-23T18:00:00.000Z');

    const client = {
      query: vi.fn(async (statement: string, values?: unknown[]) => {
        if (
          statement === 'begin' ||
          statement === 'commit' ||
          statement === 'rollback'
        ) {
          return { rows: [] };
        }
        if (statement.includes('from public.players')) {
          return { rows: [{ id: PLAYER_ID }] };
        }
        if (statement.includes('count(*)::integer')) {
          return { rows: [{ count: 0 }] };
        }
        if (statement.includes('insert into private.developer_api_keys')) {
          persistedPublicId = String(values?.[2]);
          persistedHash = values?.[3] as Buffer;
          return {
            rows: [
              {
                id: KEY_ID,
                name: values?.[1],
                public_id: persistedPublicId,
                created_at: now,
                last_used_at: null,
                revoked_at: null,
              },
            ],
          };
        }
        throw new Error(`Unexpected transaction query: ${statement}`);
      }),
      release: vi.fn(),
    } as unknown as pg.PoolClient;

    const database: DeveloperApiKeyDatabase = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(async (statement: string, values?: unknown[]) => {
        if (statement.includes('key.secret_hash')) {
          return {
            rows: [
              {
                id: KEY_ID,
                owner_player_id: PLAYER_ID,
                secret_hash: persistedHash!,
              },
            ],
          };
        }
        if (statement.startsWith('update private.developer_api_keys')) {
          return { rows: [] };
        }
        throw new Error(
          `Unexpected pool query: ${statement} ${String(values)}`,
        );
      }) as unknown as DeveloperApiKeyDatabase['query'],
    };

    const service = createDeveloperApiKeyService(database);
    const created = await service.createForPlayer(PLAYER_ID, ' Lecturer demo ');

    expect(created.apiKey).toMatch(/^ww_api_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/u);
    expect(created.key).toMatchObject({
      id: KEY_ID,
      name: 'Lecturer demo',
      keyPrefix: `ww_api_${persistedPublicId}_…`,
      status: 'active',
    });
    expect(persistedHash).toBeInstanceOf(Buffer);
    expect(persistedHash).toHaveLength(32);
    expect(persistedHash?.toString('utf8')).not.toContain(created.apiKey);

    await expect(service.authenticate(created.apiKey)).resolves.toEqual({
      id: KEY_ID,
      ownerPlayerId: PLAYER_ID,
    });

    const wrongSecret = `${created.apiKey.slice(0, -1)}${
      created.apiKey.endsWith('A') ? 'B' : 'A'
    }`;
    await expect(service.authenticate(wrongSecret)).resolves.toBeNull();
  });

  it('rejects malformed developer credentials before querying the database', async () => {
    const database: DeveloperApiKeyDatabase = {
      connect: vi.fn(),
      query: vi.fn(),
    };
    const service = createDeveloperApiKeyService(database);

    await expect(service.authenticate('not-an-api-key')).resolves.toBeNull();
    expect(database.query).not.toHaveBeenCalled();
    expect(parseDeveloperApiKey('not-an-api-key')).toBeNull();
  });
});
