import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createPlayerIdentityService } from '../src/players/player-identity.js';

describe('local player identity', () => {
  it('resolves a local player from the validated external identity', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
          role: 'player',
          lifecycle_status: 'active',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        issuer: 'https://auth.example.test/',
        subject: 'auth0|player-123',
      }),
    ).resolves.toEqual({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      role: 'player',
      lifecycleStatus: 'active',
    });

    expect(query).toHaveBeenCalledOnce();

    expect(query.mock.calls[0]?.[1]).toEqual([
      expect.any(String),
      'https://auth.example.test/',
      'auth0|player-123',
    ]);
  });

  it('uses a parameterised query for external identity values', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '0cf0ddaa-a0af-4ce8-92bc-c437f123db6a',
          role: 'player',
          lifecycle_status: 'active',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    const hostileSubject = `auth0|'; drop table public.players; --`;

    await service.resolve({
      issuer: 'https://auth.example.test/',
      subject: hostileSubject,
    });

    const [statement, parameters] = query.mock.calls[0] ?? [];

    expect(statement).not.toContain(hostileSubject);

    expect(parameters).toEqual([
      expect.any(String),
      'https://auth.example.test/',
      hostileSubject,
    ]);
  });

  it('preserves a server-stored author role returned by the database', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'dbbd9ecb-ae87-4c11-846c-9d11f253877c',
          role: 'author',
          lifecycle_status: 'active',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        issuer: 'https://auth.example.test/',
        subject: 'auth0|author-123',
      }),
    ).resolves.toMatchObject({
      role: 'author',
    });
  });

  it('preserves a deletion-pending lifecycle state returned by the database', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '77d10277-279f-46ad-be09-bb1a2658eea4',
          role: 'player',
          lifecycle_status: 'deletion_pending',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        issuer: 'https://auth.example.test/',
        subject: 'auth0|pending-123',
      }),
    ).resolves.toMatchObject({
      lifecycleStatus: 'deletion_pending',
    });
  });

  it('fails if player resolution unexpectedly returns no row', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        issuer: 'https://auth.example.test/',
        subject: 'auth0|player-123',
      }),
    ).rejects.toThrow('Local player resolution returned no player.');
  });
});

function createDatabaseQueryTarget(query: ReturnType<typeof vi.fn>) {
  return {
    query,
  } as unknown as Pick<pg.Pool, 'query'>;
}
