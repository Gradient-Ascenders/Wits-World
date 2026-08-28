import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createStarterGrantService,
  StarterAffinityNotAllowedError,
  type StarterGrantDatabase,
} from '../src/cards/starter-grant.js';
import { starterPackageDefinitions } from '../src/cards/starter-packages.js';
import type { StarterAffinity } from '../src/cards/card-types.js';

const PLAYER_ID = uuid(1);
const GRANT_ID = uuid(2);
const GRANTED_AT = new Date('2026-08-16T08:00:00.000Z');

describe('starter grant service invariants', () => {
  it('loads the 15 configured canonical definitions once in package order', async () => {
    const definitionRows = buildConfiguredDefinitionRows([
      'spark',
      'grit',
      'wit',
    ]);
    const expectedDefinitionIds = definitionRows.map(
      (row) => row.card_definition_id,
    );
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      const sql = normalizeSql(statement);

      if (
        sql.includes('from public.card_definitions definition') &&
        sql.includes('definition.id = any($1::uuid[])')
      ) {
        expect(values?.[0]).toEqual(expectedDefinitionIds);
        expect(sql).toContain(
          'order by array_position($1::uuid[], definition.id)',
        );
        expect(sql).not.toContain('for share');
        return { rows: definitionRows };
      }

      throw new Error(`Unexpected starter query: ${sql}`);
    });
    const database: StarterGrantDatabase = {
      async connect() {
        return {
          async query<T extends pg.QueryResultRow>(
            statement: string,
            values?: unknown[],
          ) {
            const result = await query(statement, values);
            return { rows: result.rows as unknown as T[] };
          },
          release: vi.fn(),
        };
      },
    };

    const options =
      await createStarterGrantService(database).listStarterOptions();

    expect(options.map((option) => option.affinity)).toEqual([
      'spark',
      'grit',
      'wit',
    ]);
    expect(options[0]).toMatchObject({
      title: 'Pressure',
      composition: { creatureCount: 3, powerCardCount: 2 },
    });
    expect(options[0]?.creatures[0]).toMatchObject({
      name: 'spark creature 1',
    });
    expect(options[0]?.creatures[0]?.moves[0]).not.toHaveProperty('id');
    expect(options[0]?.powerCards[0]?.effects[0]).not.toHaveProperty('id');
    expect(
      query.mock.calls.filter(([statement]) =>
        normalizeSql(statement).includes(
          'from public.card_definitions definition',
        ),
      ),
    ).toHaveLength(1);
    expect(query).toHaveBeenCalledOnce();
  });

  it.each(['spirit', 'mystic'] as const)(
    'rejects the progression-only %s affinity for a player without a grant',
    async (affinity) => {
      const query = vi.fn(async (statement: string) => {
        const sql = normalizeSql(statement);

        if (sql.includes('from public.player_starter_grants')) {
          return { rows: [] };
        }

        if (sql === 'begin' || sql === 'rollback') {
          return { rows: [] };
        }

        throw new Error(`Unexpected starter query: ${sql}`);
      });
      const connect = vi.fn<StarterGrantDatabase['connect']>(async () => ({
        async query<T extends pg.QueryResultRow>(statement: string) {
          const result = await query(statement);
          return { rows: result.rows as T[] };
        },
        release: vi.fn(),
      }));
      const service = createStarterGrantService({ connect });

      await expect(
        service.selectStarter({
          affinity,
          playerId: PLAYER_ID,
        }),
      ).rejects.toBeInstanceOf(StarterAffinityNotAllowedError);
      expect(connect).toHaveBeenCalledOnce();
      expect(
        query.mock.calls.some(([statement]) =>
          normalizeSql(statement).includes('from public.card_definitions'),
        ),
      ).toBe(false);
      expect(query).toHaveBeenCalledWith('rollback');
    },
  );

  it.each(['spirit', 'mystic'] as const)(
    'returns an existing historical %s grant idempotently',
    async (affinity) => {
      const rows = [1, 2, 3, 4, 5].map((index) => ({
        acquired_at: GRANTED_AT,
        affinity,
        card_definition_id: uuid(100 + index),
        category: index <= 3 ? 'creature' : 'power',
        description: null,
        effects: [],
        hp: index <= 3 ? 100 : null,
        image_url: null,
        is_active: true,
        moves: [],
        name: `Historical ${affinity} card ${index}`,
        owned_card_id: uuid(200 + index),
        power: index <= 3 ? 10 : null,
        rarity: 'common',
      }));
      const query = vi.fn(async (statement: string) => {
        const sql = normalizeSql(statement);

        if (sql === 'begin' || sql === 'commit') {
          return { rows: [] };
        }

        if (sql.includes('from public.player_starter_grants')) {
          return {
            rows: [
              {
                affinity,
                granted_at: GRANTED_AT,
                starter_grant_id: GRANT_ID,
              },
            ],
          };
        }

        if (sql.includes('from public.player_cards owned')) {
          return { rows };
        }

        throw new Error(`Unexpected starter query: ${sql}`);
      });
      const database: StarterGrantDatabase = {
        async connect() {
          return {
            async query<T extends pg.QueryResultRow>(statement: string) {
              const result = await query(statement);
              return { rows: result.rows as unknown as T[] };
            },
            release: vi.fn(),
          };
        },
      };

      await expect(
        createStarterGrantService(database).selectStarter({
          affinity,
          playerId: PLAYER_ID,
        }),
      ).resolves.toMatchObject({
        created: false,
        grant: { affinity, cards: expect.arrayContaining([]) },
      });
      expect(
        query.mock.calls.some(([statement]) =>
          normalizeSql(statement).includes('from public.card_definitions'),
        ),
      ).toBe(false);
    },
  );

  it('rolls back rather than committing a malformed persisted composition', async () => {
    const configuredPackage = starterPackageDefinitions.wit;
    const creatureIds = [...configuredPackage.creatureDefinitionIds];
    const powerIds = [...configuredPackage.powerCardDefinitionIds];
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
          sql.includes('from public.card_definitions definition') &&
          sql.includes('definition.id = any($1::uuid[])')
        ) {
          expect(values?.[0]).toEqual(selectedIds);
          return { rows: buildConfiguredDefinitionRows(['wit']) };
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
    const candidateStatements = executedStatements.filter((statement) =>
      statement.includes('definition.id = any($1::uuid[])'),
    );

    expect(candidateStatements).toHaveLength(1);
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

function buildConfiguredDefinitionRows(affinities: readonly StarterAffinity[]) {
  return affinities.flatMap((affinity) => {
    const packageDefinition = starterPackageDefinitions[affinity];
    const creatures = packageDefinition.creatureDefinitionIds.map(
      (cardDefinitionId, index) => ({
        affinity,
        authoring_status: 'published',
        card_definition_id: cardDefinitionId,
        category: 'creature',
        effects: [],
        hp: 90 + index,
        is_active: true,
        moves: [1, 2, 3, 4].map((position) => ({
          effectType: 'damage',
          effectValue: 10 + position,
          id: uuid(400 + index * 10 + position),
          modifierDurationTurns: null,
          modifierOperation: null,
          modifierStat: null,
          moveType: position === 1 ? 'basic' : affinity,
          name: `${affinity} move ${position}`,
          position,
          powerCost: position - 1,
        })),
        name: `${affinity} creature ${index + 1}`,
        power: 10 + index,
        rarity: 'common',
      }),
    );
    const powerCards = packageDefinition.powerCardDefinitionIds.map(
      (cardDefinitionId, index) => ({
        affinity,
        authoring_status: 'published',
        card_definition_id: cardDefinitionId,
        category: 'power',
        effects: [
          {
            effectType: 'damage',
            effectValue: 12,
            id: uuid(800 + index),
            modifierDurationTurns: null,
            modifierOperation: null,
            modifierStat: null,
            position: 1,
          },
        ],
        hp: null,
        is_active: true,
        moves: [],
        name: `${affinity} power ${index + 1}`,
        power: null,
        rarity: 'common',
      }),
    );

    return [...creatures, ...powerCards];
  });
}
