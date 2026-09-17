import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createPlayerIdentityService,
  DeletedIdentityTokenError,
  InvalidPlayerNameError,
  PlayerNameAlreadyAssignedError,
  PlayerNameConflictError,
} from '../src/players/player-identity.js';

const trustedPrincipal = {
  connectionStrategy: 'auth0' as const,
  issuer: 'https://auth.example.test/',
  playerName: 'naledi',
  subject: 'auth0|player-123',
  tokenIssuedAt: new Date('2026-08-30T12:00:00.000Z'),
};

describe('local player identity', () => {
  it('reads unchanged identity once without a transaction or cached authorization', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'player',
          player_name: 'naledi',
          role: 'player',
          lifecycle_status: 'active',
          identity_denied: false,
        },
      ],
    });
    const connect = vi.fn();
    const service = createPlayerIdentityService({
      query,
      connect,
    } as unknown as Pick<pg.Pool, 'query' | 'connect'>);
    expect(await service.resolve(trustedPrincipal)).toMatchObject({
      id: 'player',
      role: 'player',
    });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'player',
          player_name: 'naledi',
          role: 'author',
          lifecycle_status: 'active',
          identity_denied: false,
        },
      ],
    });
    expect(await service.resolve(trustedPrincipal)).toMatchObject({
      role: 'author',
      lifecycleStatus: 'active',
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(connect).not.toHaveBeenCalled();
    expect(query.mock.calls[0]?.[0]).toContain('for key share of p');
    expect(query.mock.calls[0]?.[0]).toContain(
      'deleted_identity_token_denials',
    );
  });

  it('shares only the stable identity result and rechecks concurrent authorization', async () => {
    const initialResult = {
      rows: [
        {
          id: 'player',
          player_name: 'naledi',
          role: 'player' as const,
          lifecycle_status: 'active' as const,
          identity_denied: false as const,
        },
      ],
    };
    const updatedResult = {
      rows: [
        {
          ...initialResult.rows[0],
          role: 'author' as const,
        },
      ],
    };
    let releaseQuery!: (value: typeof initialResult) => void;
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof initialResult>((resolve) => {
            releaseQuery = resolve;
          }),
      )
      .mockResolvedValue(updatedResult);
    const service = createPlayerIdentityService({
      query,
      connect: vi.fn(),
    } as unknown as Pick<pg.Pool, 'query' | 'connect'>);

    const first = service.resolve(trustedPrincipal);
    const concurrent = service.resolve(trustedPrincipal);

    expect(query).toHaveBeenCalledOnce();
    releaseQuery(initialResult);
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      expect.objectContaining({ id: 'player', role: 'player' }),
      expect.objectContaining({ id: 'player', role: 'author' }),
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]).toEqual([
      trustedPrincipal.issuer,
      trustedPrincipal.subject,
      trustedPrincipal.tokenIssuedAt,
      trustedPrincipal.playerName,
      true,
      'player',
    ]);

    await expect(service.resolve(trustedPrincipal)).resolves.toMatchObject({
      id: 'player',
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects a denied token even when the unchanged player exists', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ id: 'player', identity_denied: true }] });
    const connect = vi.fn();
    const service = createPlayerIdentityService({
      query,
      connect,
    } as unknown as Pick<pg.Pool, 'query' | 'connect'>);
    await expect(service.resolve(trustedPrincipal)).rejects.toBeInstanceOf(
      DeletedIdentityTokenError,
    );
    expect(connect).not.toHaveBeenCalled();
  });
  it('provisions a Google player without fabricating a Player Name', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
          lifecycle_status: 'active',
          player_name: null,
          role: 'player',
        },
      ],
    });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        connectionStrategy: 'google-oauth2',
        issuer: trustedPrincipal.issuer,
        playerName: null,
        subject: 'google-player',
        tokenIssuedAt: trustedPrincipal.tokenIssuedAt,
      }),
    ).resolves.toMatchObject({ playerName: null });
    expect(query.mock.calls[0]?.[1]).toEqual([
      expect.any(String),
      trustedPrincipal.issuer,
      'google-player',
      null,
      false,
      trustedPrincipal.tokenIssuedAt,
    ]);
  });

  it('preserves an existing Google Player Name during identity resolution', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
          lifecycle_status: 'active',
          player_name: 'google-player',
          role: 'player',
        },
      ],
    });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        connectionStrategy: 'google-oauth2',
        issuer: trustedPrincipal.issuer,
        playerName: null,
        subject: 'google-player',
        tokenIssuedAt: trustedPrincipal.tokenIssuedAt,
      }),
    ).resolves.toMatchObject({ playerName: 'google-player' });
  });

  it('resolves a local player from the validated external identity', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
          role: 'player',
          player_name: trustedPrincipal.playerName,
          lifecycle_status: 'active',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(service.resolve(trustedPrincipal)).resolves.toEqual({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      role: 'player',
      playerName: trustedPrincipal.playerName,
      lifecycleStatus: 'active',
    });

    expect(query).toHaveBeenCalledOnce();

    expect(query.mock.calls[0]?.[1]).toEqual([
      expect.any(String),
      'https://auth.example.test/',
      'auth0|player-123',
      trustedPrincipal.playerName,
      true,
      trustedPrincipal.tokenIssuedAt,
    ]);
  });

  it('uses a parameterised query for external identity values', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '0cf0ddaa-a0af-4ce8-92bc-c437f123db6a',
          role: 'player',
          player_name: 'trusted-name',
          lifecycle_status: 'active',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    const hostileSubject = `auth0|'; drop table public.players; --`;

    await service.resolve({
      connectionStrategy: 'auth0',
      issuer: 'https://auth.example.test/',
      playerName: 'trusted-name',
      subject: hostileSubject,
      tokenIssuedAt: trustedPrincipal.tokenIssuedAt,
    });

    const [statement, parameters] = query.mock.calls[0] ?? [];

    expect(statement).not.toContain(hostileSubject);

    expect(parameters).toEqual([
      expect.any(String),
      'https://auth.example.test/',
      hostileSubject,
      'trusted-name',
      true,
      trustedPrincipal.tokenIssuedAt,
    ]);
  });

  it('preserves a server-stored author role returned by the database', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'dbbd9ecb-ae87-4c11-846c-9d11f253877c',
          role: 'author',
          player_name: 'professor-nova',
          lifecycle_status: 'active',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        playerName: 'professor-nova',
        subject: 'auth0|author-123',
        tokenIssuedAt: trustedPrincipal.tokenIssuedAt,
      }),
    ).resolves.toMatchObject({
      playerName: 'professor-nova',
      role: 'author',
    });
  });

  it('preserves a deletion-pending lifecycle state returned by the database', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '77d10277-279f-46ad-be09-bb1a2658eea4',
          role: 'player',
          player_name: 'pending-player',
          lifecycle_status: 'deletion_pending',
        },
      ],
    });

    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        playerName: 'pending-player',
        subject: 'auth0|pending-123',
        tokenIssuedAt: trustedPrincipal.tokenIssuedAt,
      }),
    ).resolves.toMatchObject({
      playerName: 'pending-player',
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

    await expect(service.resolve(trustedPrincipal)).rejects.toThrow(
      'Local player resolution returned no player.',
    );
  });

  it('synchronizes the trusted claim through the same issuer-subject upsert', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
          role: 'author',
          player_name: 'renamed-player',
          lifecycle_status: 'active',
        },
      ],
    });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.resolve({ ...trustedPrincipal, playerName: 'renamed-player' }),
    ).resolves.toMatchObject({
      id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
      playerName: 'renamed-player',
      role: 'author',
    });

    const [statement, parameters] = query.mock.calls[0] ?? [];
    expect(statement).toContain('on conflict (auth_issuer, auth_subject)');
    expect(statement).toContain('when $5 then excluded.player_name');
    expect(parameters).toEqual([
      expect.any(String),
      trustedPrincipal.issuer,
      trustedPrincipal.subject,
      'renamed-player',
      true,
      trustedPrincipal.tokenIssuedAt,
    ]);
  });

  it('does not provision a player for a token denied after account deletion', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: null,
          identity_denied: true,
          lifecycle_status: null,
          player_name: null,
          role: null,
        },
      ],
    });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(service.resolve(trustedPrincipal)).rejects.toBeInstanceOf(
      DeletedIdentityTokenError,
    );

    const statement = String(query.mock.calls[0]?.[0]);
    expect(statement).toContain('deleted_identity_token_denials');
    expect(statement).toContain(
      'where not (select denied from identity_decision)',
    );
  });

  it('preserves a genuine Player Name conflict with another identity', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce({
        code: '23505',
        constraint: 'players_player_name_case_insensitive_unique',
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(service.resolve(trustedPrincipal)).rejects.toBeInstanceOf(
      PlayerNameConflictError,
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it('does not recover unrelated database errors', async () => {
    const error = {
      code: '23505',
      constraint: 'players_auth_identity_unique',
    };
    const query = vi.fn().mockRejectedValue(error);
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(service.resolve(trustedPrincipal)).rejects.toBe(error);
    expect(query).toHaveBeenCalledOnce();
  });

  it('canonicalizes and assigns an initial Player Name', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
          lifecycle_status: 'active',
          player_name: 'google-player',
          role: 'player',
        },
      ],
    });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.assignInitialPlayerName(
        '6fe7dc26-cdea-4275-a2df-861724137cbc',
        '  Google-Player  ',
      ),
    ).resolves.toMatchObject({ playerName: 'google-player' });
    expect(query.mock.calls[0]?.[1]).toEqual([
      '6fe7dc26-cdea-4275-a2df-861724137cbc',
      'google-player',
    ]);
  });

  it('rejects an invalid initial Player Name before querying', async () => {
    const query = vi.fn();
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.assignInitialPlayerName(
        '6fe7dc26-cdea-4275-a2df-861724137cbc',
        'not allowed',
      ),
    ).rejects.toBeInstanceOf(InvalidPlayerNameError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a second Player Name assignment', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createPlayerIdentityService(
      createDatabaseQueryTarget(query),
    );

    await expect(
      service.assignInitialPlayerName(
        '6fe7dc26-cdea-4275-a2df-861724137cbc',
        'another-player',
      ),
    ).rejects.toBeInstanceOf(PlayerNameAlreadyAssignedError);
  });
});

function createDatabaseQueryTarget(query: ReturnType<typeof vi.fn>) {
  const client = {
    async query(statement: string, parameters?: unknown[]) {
      const normalized = statement.trim().toLowerCase();

      if (
        normalized === 'begin' ||
        normalized === 'commit' ||
        normalized === 'rollback' ||
        normalized.includes('pg_advisory_xact_lock')
      ) {
        return { rows: [] };
      }

      return (
        query as unknown as (
          statement: string,
          parameters?: unknown[],
        ) => Promise<unknown>
      )(statement, parameters);
    },
    release: vi.fn(),
  };

  return {
    query: (statement: string, parameters?: unknown[]) =>
      statement.includes('from public.players p')
        ? Promise.resolve({ rows: [] })
        : client.query(statement, parameters),
    connect: vi.fn(async () => client),
  } as unknown as Pick<pg.Pool, 'query' | 'connect'>;
}
