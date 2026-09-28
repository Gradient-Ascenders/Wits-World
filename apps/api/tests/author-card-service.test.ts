import { describe, expect, it, vi } from 'vitest';

import {
  AuthorCardNotFoundError,
  createAuthorCardService,
  type AuthorCardDatabase,
  type AuthorCardTransactionClient,
} from '../src/cards/author-card-service.js';
import { InvalidCardDefinitionError } from '../src/cards/card-validation.js';

const AUTHOR_ID = 'd1000000-0000-4000-8000-000000000001';
const CARD_ID = 'd2000000-0000-4000-8000-000000000001';

describe('author card service persistence', () => {
  it('creates, lists and updates a normalized draft with ordered children', async () => {
    let name = 'Archive Guardian';
    let version = 0;
    const { database, query, release } = cardDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('insert into public.card_definitions')) {
        return { rows: [{ card_id: CARD_ID }] };
      }
      if (sql.includes('select authoring_status, version')) {
        return { rows: [{ authoring_status: 'draft', version }] };
      }
      if (sql.includes('update public.card_definitions')) {
        name = 'Updated Guardian';
        version += 1;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('from public.card_definitions definition')) {
        return { rows: [cardRow({ name, version })] };
      }
      return { rows: [] };
    });
    const service = createAuthorCardService(database);

    await expect(service.createCard(validCardInput())).resolves.toMatchObject({
      id: CARD_ID,
      name: 'Archive Guardian',
      authoringStatus: 'draft',
      moves: [expect.objectContaining({ name: 'Measured Strike' })],
    });
    await expect(service.listCards()).resolves.toHaveLength(1);
    await expect(
      service.updateCard({
        ...validCardInput(),
        cardId: CARD_ID,
        expectedVersion: 0,
        name: ' Updated Guardian ',
        description: null,
      }),
    ).resolves.toMatchObject({
      id: CARD_ID,
      name: 'Updated Guardian',
      version: 1,
    });

    expect(
      query.mock.calls.some(
        ([statement, values]) =>
          String(statement).includes('insert into public.card_moves') &&
          Array.isArray(values) &&
          values.includes('Measured Strike'),
      ),
    ).toBe(true);
    expect(query).toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledTimes(3);
  });

  it('rejects blank optional metadata before opening a transaction', async () => {
    const connect = vi.fn<AuthorCardDatabase['connect']>();
    const service = createAuthorCardService({ connect });

    await expect(
      service.createCard({ ...validCardInput(), imageUrl: '   ' }),
    ).rejects.toBeInstanceOf(InvalidCardDefinitionError);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rolls back when an update cannot lock the requested card', async () => {
    const { database, query } = cardDatabase(async (statement) => {
      if (
        normalizedSql(statement).includes('select authoring_status, version')
      ) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      createAuthorCardService(database).updateCard({
        ...validCardInput(),
        cardId: CARD_ID,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(AuthorCardNotFoundError);
    expect(query).toHaveBeenCalledWith('rollback');
  });
});

function cardDatabase(
  implementation: (
    statement: string,
    values?: unknown[],
  ) => Promise<{
    rows: Record<string, unknown>[];
    rowCount?: number | null;
  }>,
) {
  const query = vi.fn(implementation);
  const release = vi.fn();
  const client = { query, release } as unknown as AuthorCardTransactionClient;
  const database: AuthorCardDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { database, query, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function validCardInput() {
  return {
    actorPlayerId: AUTHOR_ID,
    name: ' Archive Guardian ',
    category: 'creature' as const,
    affinity: 'wit' as const,
    rarity: 'common' as const,
    hp: 90,
    power: 10,
    description: ' Protects the library. ',
    imageUrl: '/cards/archive-guardian.webp',
    moves: [
      {
        position: 1,
        name: ' Measured Strike ',
        moveType: 'basic' as const,
        effectType: 'damage' as const,
        effectValue: 10,
        powerCost: 0,
      },
    ],
    effects: [],
  };
}

function cardRow({ name, version }: { name: string; version: number }) {
  const timestamp = new Date('2026-09-28T08:00:00.000Z');
  return {
    card_id: CARD_ID,
    name,
    category: 'creature',
    affinity: 'wit',
    rarity: 'common',
    hp: 90,
    power: 10,
    description: 'Protects the library.',
    image_url: '/cards/archive-guardian.webp',
    is_active: false,
    authoring_status: 'draft',
    created_at: timestamp,
    updated_at: timestamp,
    version,
    submitted_by_player_id: null,
    submitted_at: null,
    reviewed_by_player_id: null,
    reviewed_at: null,
    publication_provenance: null,
    moves: [
      {
        id: 'd3000000-0000-4000-8000-000000000001',
        position: 1,
        name: 'Measured Strike',
        moveType: 'basic',
        effectType: 'damage',
        effectValue: 10,
        modifierStat: null,
        modifierOperation: null,
        modifierDurationTurns: null,
        powerCost: 0,
      },
    ],
    effects: [],
  };
}
