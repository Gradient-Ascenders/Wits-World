import { describe, expect, it, vi } from 'vitest';

import {
  AuthorCardNameConflictError,
  createAuthorCardService,
  type AuthorCardDatabase,
  type AuthorCardTransactionClient,
} from '../src/cards/author-card-service.js';

const normalizedNameIndex = 'card_definitions_normalized_name_unique_idx';

describe('author card database conflict translation', () => {
  it('translates only the normalized card-name index violation', async () => {
    const databaseError = Object.assign(new Error('unique violation'), {
      code: '23505',
      constraint: normalizedNameIndex,
    });
    const { database } = rejectingDatabase(databaseError);
    const service = createAuthorCardService(database);

    await expect(service.createCard(validInput())).rejects.toBeInstanceOf(
      AuthorCardNameConflictError,
    );
  });

  it('preserves unrelated PostgreSQL unique violations', async () => {
    const databaseError = Object.assign(new Error('unique violation'), {
      code: '23505',
      constraint: 'author_content_audit_pkey',
    });
    const { database } = rejectingDatabase(databaseError);
    const service = createAuthorCardService(database);

    await expect(service.createCard(validInput())).rejects.toBe(databaseError);
  });
});

function rejectingDatabase(databaseError: Error) {
  const query = vi.fn(async (statement: string) => {
    if (statement.includes('insert into public.card_definitions')) {
      throw databaseError;
    }

    return { rows: [] };
  });
  const client = {
    query,
    release: vi.fn(),
  } as unknown as AuthorCardTransactionClient;
  const database: AuthorCardDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };

  return { database };
}

function validInput() {
  return {
    actorPlayerId: 'a9000000-0000-4000-8000-000000000001',
    name: 'Focused Name',
    category: 'power' as const,
    affinity: 'wit' as const,
    rarity: 'common' as const,
    hp: null,
    power: null,
    description: null,
    imageUrl: null,
    moves: [],
    effects: [
      {
        position: 1,
        effectType: 'heal' as const,
        effectValue: 1,
      },
    ],
  };
}
