import { describe, expect, it, vi } from 'vitest';

import {
  createCardEvolutionService,
  EvolutionCopiesTradeReservedError,
  EvolutionReplayConflictError,
  type CardEvolutionDatabase,
  type CardEvolutionTransactionClient,
} from '../src/cards/card-evolution.js';

const PLAYER_ID = 'b1000000-0000-4000-8000-000000000001';
const SOURCE_ID = 'b2000000-0000-4000-8000-000000000001';
const TARGET_ID = 'b2000000-0000-4000-8000-000000000002';
const SUBMISSION_ID = 'b3000000-0000-4000-8000-000000000001';
const EVOLUTION_ID = 'b4000000-0000-4000-8000-000000000001';
const GRANTED_ID = 'b5000000-0000-4000-8000-000000000001';
const COMPLETED_AT = new Date('2026-09-28T10:00:00.000Z');

describe('card evolution service', () => {
  it('previews eligible and locked copies with the authoritative target', async () => {
    const copies = [
      ownedCopy(1),
      ownedCopy(2, { deck_locked: true }),
      ownedCopy(3, { trade_reserved: true }),
      ownedCopy(4),
    ];
    const { database, release } = evolutionDatabase(
      async (statement, values) => {
        const sql = normalizedSql(statement);
        if (sql.includes('target.evolves_from_definition_id')) {
          return { rows: [relationshipRow()] };
        }
        if (sql.includes('from public.card_definitions definition')) {
          return {
            rows: [definitionRow(String(values?.[0]))],
          };
        }
        if (sql.includes('from public.player_cards owned')) {
          return { rows: copies };
        }
        return { rows: [] };
      },
    );

    await expect(
      createCardEvolutionService(database).previewEvolution(
        PLAYER_ID,
        SOURCE_ID,
      ),
    ).resolves.toMatchObject({
      copiesRequired: 3,
      ownedCopyCount: 4,
      eligibleCopyCount: 2,
      deckLockedCopyCount: 1,
      tradeReservedCopyCount: 1,
      canEvolve: false,
      unavailableReason: 'trade_reservation',
      target: {
        cardDefinitionId: TARGET_ID,
        deckPointCost: 2,
      },
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it('consumes exactly three eligible copies and returns the persisted grant', async () => {
    const { database, query, release } = evolutionDatabase(
      async (statement, values) => {
        const sql = normalizedSql(statement);
        if (
          sql.includes('from public.players') &&
          sql.includes("lifecycle_status = 'active'")
        ) {
          return { rows: [{ id: PLAYER_ID }] };
        }
        if (sql.includes('from public.card_evolution_transactions')) {
          return { rows: [] };
        }
        if (sql.includes('target.evolves_from_definition_id')) {
          return { rows: [relationshipRow()] };
        }
        if (
          sql.startsWith('select') &&
          sql.includes('from public.player_cards owned')
        ) {
          return { rows: [ownedCopy(1), ownedCopy(2), ownedCopy(3)] };
        }
        if (sql.includes('from private.card_trade_reservations')) {
          return { rows: [] };
        }
        if (sql.includes('insert into public.card_evolution_transactions')) {
          return { rows: [transactionRow()] };
        }
        if (sql.includes('insert into public.card_evolution_consumptions')) {
          return { rows: [], rowCount: 3 };
        }
        if (sql.includes('delete from public.player_cards')) {
          return { rows: [], rowCount: 3 };
        }
        if (sql.includes('from public.card_evolution_consumptions')) {
          return {
            rows: [1, 2, 3].map((index) => ({
              owned_card_id: ownedCopyId(index),
            })),
          };
        }
        if (sql.includes('from public.card_definitions definition')) {
          return { rows: [definitionRow(String(values?.[0]))] };
        }
        return { rows: [] };
      },
    );

    await expect(
      createCardEvolutionService(database).evolveCards({
        playerId: PLAYER_ID,
        sourceCardDefinitionId: SOURCE_ID,
        submissionId: SUBMISSION_ID,
      }),
    ).resolves.toMatchObject({
      evolutionId: EVOLUTION_ID,
      replayed: false,
      consumedOwnedCardIds: [ownedCopyId(1), ownedCopyId(2), ownedCopyId(3)],
      newCard: {
        ownedCardId: GRANTED_ID,
        acquisitionKind: 'evolution',
      },
    });
    expect(query).toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects reserved copies without mutating the collection', async () => {
    const { database, query } = evolutionDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('from public.players')) {
        return { rows: [{ id: PLAYER_ID }] };
      }
      if (sql.includes('from public.card_evolution_transactions')) {
        return { rows: [] };
      }
      if (sql.includes('target.evolves_from_definition_id')) {
        return { rows: [relationshipRow()] };
      }
      if (sql.includes('from public.player_cards owned')) {
        return {
          rows: [ownedCopy(1), ownedCopy(2), ownedCopy(3)],
        };
      }
      if (sql.includes('from private.card_trade_reservations')) {
        return { rows: [{ owned_card_id: ownedCopyId(3) }] };
      }
      return { rows: [] };
    });

    await expect(
      createCardEvolutionService(database).evolveCards({
        playerId: PLAYER_ID,
        sourceCardDefinitionId: SOURCE_ID,
        submissionId: SUBMISSION_ID,
      }),
    ).rejects.toBeInstanceOf(EvolutionCopiesTradeReservedError);
    expect(query).toHaveBeenCalledWith('rollback');
  });

  it('records a replay conflict as trust evidence while preserving the error', async () => {
    const recordSubmissionConflict = vi.fn(async () => true);
    const { database } = evolutionDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('from public.players')) {
        return { rows: [{ id: PLAYER_ID }] };
      }
      if (sql.includes('from public.card_evolution_transactions')) {
        return {
          rows: [
            transactionRow({
              source_definition_id: 'b2000000-0000-4000-8000-000000000099',
            }),
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      createCardEvolutionService(database, {
        trustService: { recordSubmissionConflict },
      }).evolveCards({
        playerId: PLAYER_ID,
        sourceCardDefinitionId: SOURCE_ID,
        submissionId: SUBMISSION_ID,
      }),
    ).rejects.toBeInstanceOf(EvolutionReplayConflictError);
    expect(recordSubmissionConflict).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      operation: 'card_evolution',
      resourceIdentifier: SOURCE_ID,
      submissionId: SUBMISSION_ID,
    });
  });
});

function evolutionDatabase(
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
  const client = {
    query,
    release,
  } as unknown as CardEvolutionTransactionClient;
  const database: CardEvolutionDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { database, query, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function relationshipRow() {
  return {
    source_definition_id: SOURCE_ID,
    target_definition_id: TARGET_ID,
    copies_required: 3,
  };
}

function definitionRow(cardDefinitionId: string) {
  return {
    card_definition_id: cardDefinitionId,
    name: cardDefinitionId === SOURCE_ID ? 'Campus Seed' : 'Campus Bloom',
    category: 'creature',
    affinity: 'wit',
    rarity: cardDefinitionId === SOURCE_ID ? 'common' : 'rare',
    hp: 90,
    power: 10,
    description: 'A campus Creature.',
    image_alt: 'A campus Creature.',
    image_url: '/cards/campus.webp',
    is_active: true,
    moves: [],
    effects: [],
  };
}

function ownedCopy(
  index: number,
  overrides: Partial<{
    deck_locked: boolean;
    trade_reserved: boolean;
  }> = {},
) {
  return {
    owned_card_id: ownedCopyId(index),
    acquired_at: new Date(
      `2026-09-${String(index).padStart(2, '0')}T08:00:00.000Z`,
    ),
    acquisition_kind: 'challenge_reward',
    deck_locked: false,
    trade_reserved: false,
    ...overrides,
  };
}

function ownedCopyId(index: number) {
  return `b6000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    evolution_id: EVOLUTION_ID,
    submission_id: SUBMISSION_ID,
    source_definition_id: SOURCE_ID,
    target_definition_id: TARGET_ID,
    granted_owned_card_id: GRANTED_ID,
    granted_acquired_at: COMPLETED_AT,
    completed_at: COMPLETED_AT,
    ...overrides,
  };
}
