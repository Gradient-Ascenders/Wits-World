import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createStarterGrantService,
  StarterAffinityNotAllowedError,
  type StarterGrantDatabase,
} from '../src/cards/starter-grant.js';
import type { StarterAffinity } from '../src/cards/card-types.js';

const PLAYER_ID = uuid(1);
const GRANT_ID = uuid(2);
const GRANTED_AT = new Date('2026-08-16T08:00:00.000Z');

describe('starter grant service invariants', () => {
  it.each(['spirit', 'mystic'] as const)(
    'rejects the progression-only %s affinity before opening a transaction',
    async (affinity) => {
      const connect = vi.fn<StarterGrantDatabase['connect']>();
      const service = createStarterGrantService({ connect });

      await expect(
        service.selectStarter({
          affinity: affinity as StarterAffinity,
          playerId: PLAYER_ID,
        }),
      ).rejects.toBeInstanceOf(StarterAffinityNotAllowedError);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('rolls back rather than committing a malformed persisted composition', async () => {
    const creatureIds = [uuid(101), uuid(102), uuid(103)];
    const powerIds = [uuid(104), uuid(105)];
    const selectedIds = [...creatureIds, ...powerIds];
    const query = vi.fn(
      async (
        statement: string,
        values?: unknown[],
      ): Promise<{ rows: unknown[] }> => {
        const sql = normalizeSql(statement);

        if (sql === 'begin' || sql === 'rollback' || sql === 'commit') {
          return { rows: [] };
        }

        if (sql.startsWith('select') && sql.includes('player_starter_grants')) {
          return { rows: [] };
        }

        if (
          sql.includes('from public.card_definitions') &&
          sql.includes('limit $3')
        ) {
          const ids = values?.[1] === 'creature' ? creatureIds : powerIds;

          return {
            rows: ids.map((cardDefinitionId) => ({
              card_definition_id: cardDefinitionId,
            })),
          };
        }

        if (sql.startsWith('insert into public.player_starter_grants')) {
          return {
            rows: [
              {
                affinity: 'wit',
                granted_at: GRANTED_AT,
                starter_grant_id: GRANT_ID,
              },
            ],
          };
        }

        if (sql.startsWith('insert into public.player_cards')) {
          return {
            rows: selectedIds.map((cardDefinitionId) => ({
              card_definition_id: cardDefinitionId,
            })),
          };
        }

        if (sql.includes('from public.player_cards owned')) {
          return {
            rows: selectedIds.map((_, index) => ({
              acquired_at: GRANTED_AT,
              affinity: 'mystic',
              card_definition_id: uuid(999),
              category: 'power',
              description: null,
              effects: [],
              hp: null,
              image_url: null,
              is_active: true,
              moves: [],
              name: `Malformed starter ${index + 1}`,
              owned_card_id: uuid(201 + index),
              power: null,
              rarity: 'rare',
            })),
          };
        }

        throw new Error(`Unexpected starter query: ${sql}`);
      },
    );
    const release = vi.fn();
    const database: StarterGrantDatabase = {
      async connect() {
        return {
          async query<T extends pg.QueryResultRow>(
            statement: string,
            values?: unknown[],
          ) {
            const result = await query(statement, values);

            return { rows: result.rows as T[] };
          },
          release,
        };
      },
    };
    const service = createStarterGrantService(database);

    await expect(
      service.selectStarter({ affinity: 'wit', playerId: PLAYER_ID }),
    ).rejects.toThrow('approved five-card composition');

    const executedStatements = query.mock.calls.map(([statement]) =>
      normalizeSql(statement),
    );
    const candidateStatements = executedStatements.filter(
      (statement) =>
        statement.includes('from public.card_definitions') &&
        statement.includes('limit $3'),
    );

    expect(candidateStatements).toHaveLength(2);
    expect(
      candidateStatements.every((statement) => statement.includes('for share')),
    ).toBe(true);
    expect(executedStatements).toContain('rollback');
    expect(executedStatements).not.toContain('commit');
    expect(release).toHaveBeenCalledOnce();
  });
});

function normalizeSql(statement: string) {
  return statement.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
