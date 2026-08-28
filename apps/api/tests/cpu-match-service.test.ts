import { describe, expect, it, vi } from 'vitest';

import {
  createBattleState,
  type BattleCreatureCard,
  type BattleDeck,
  type BattlePowerCard,
  type BattleState,
} from '@wits-world/game-rules';

import {
  BASIC_CPU_DECK_CONFIGURATION,
  type BasicCpuDeckCardConfiguration,
} from '../src/matches/basic-cpu-deck.js';
import {
  createCpuMatchService,
  CpuMatchDeckError,
  CpuMatchVersionConflictError,
  type CpuMatchClient,
  type CpuMatchDatabase,
} from '../src/matches/cpu-match-service.js';

const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const MATCH_ID = 'a2000000-0000-4000-8000-000000000001';
const DECK_ID = 'a6000000-0000-4000-8000-000000000001';

describe('CPU match service', () => {
  it('defines the approved Basic CPU deck with exactly three Creatures and two Power cards', () => {
    expect(BASIC_CPU_DECK_CONFIGURATION).toEqual([
      {
        cardDefinitionId: 'c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac',
        category: 'creature',
      },
      {
        cardDefinitionId: 'a230fdda-cec0-c127-b4a2-e4dd20660e3a',
        category: 'creature',
      },
      {
        cardDefinitionId: '0cba869b-d777-11f8-6b8c-c47d4d626558',
        category: 'creature',
      },
      {
        cardDefinitionId: '49e45cbb-f419-bf5c-2868-757646cb8dc9',
        category: 'power',
      },
      {
        cardDefinitionId: '76f057c6-efab-38d9-9bcf-298d5c794f1a',
        category: 'power',
      },
    ]);
    expect(
      BASIC_CPU_DECK_CONFIGURATION.filter(
        ({ category }) => category === 'creature',
      ),
    ).toHaveLength(3);
    expect(
      BASIC_CPU_DECK_CONFIGURATION.filter(
        ({ category }) => category === 'power',
      ),
    ).toHaveLength(2);
  });

  it('preserves unexpected create failures as internal errors', async () => {
    const databaseError = new Error(
      'duplicate key value violates unique constraint',
    );
    const query = vi.fn(async (...args: [string, unknown[]?]) => {
      const [statement] = args;
      if (statement === 'begin') {
        return { rows: [] };
      }

      throw databaseError;
    });

    const service = createCpuMatchService(fakeDatabase(query));

    await expect(
      service.createMatch({
        playerId: PLAYER_ID,
        deckId: DECK_ID,
      }),
    ).rejects.toBe(databaseError);
    expect(databaseError).not.toBeInstanceOf(CpuMatchDeckError);
  });

  it.each([
    {
      condition: 'missing',
      change: (row: ConfiguredCpuCardFixture): ConfiguredCpuCardFixture => ({
        ...row,
        card_definition_id: null,
        name: null,
        category: null,
        affinity: null,
        rarity: null,
        is_active: null,
        authoring_status: null,
      }),
      message: 'does not exist',
    },
    {
      condition: 'inactive',
      change: (row: ConfiguredCpuCardFixture): ConfiguredCpuCardFixture => ({
        ...row,
        is_active: false,
      }),
      message: 'is not active and published',
    },
    {
      condition: 'unpublished',
      change: (row: ConfiguredCpuCardFixture): ConfiguredCpuCardFixture => ({
        ...row,
        authoring_status: 'draft',
      }),
      message: 'is not active and published',
    },
    {
      condition: 'wrong-category',
      change: (row: ConfiguredCpuCardFixture): ConfiguredCpuCardFixture => ({
        ...row,
        category: 'power' as const,
        hp: null,
        power: null,
      }),
      message: 'must be a creature card',
    },
    {
      condition: 'non-common',
      change: (row: ConfiguredCpuCardFixture): ConfiguredCpuCardFixture => ({
        ...row,
        rarity: 'rare',
      }),
      message: 'must be common',
    },
  ])(
    'fails safely when a configured CPU card is $condition',
    async ({ change, message }) => {
      const cpuRows = configuredCpuCardRows();
      cpuRows[0] = change(cpuRows[0]!);
      const query = createCpuConfigurationQuery(cpuRows);
      const service = createCpuMatchService(fakeDatabase(query));

      await expect(
        service.createMatch({ playerId: PLAYER_ID, deckId: DECK_ID }),
      ).rejects.toThrow(message);

      expect(query).toHaveBeenCalledWith('rollback');
      expect(query).not.toHaveBeenCalledWith('commit');
      expect(
        query.mock.calls.some(([statement]) =>
          statement.includes('insert into public.cpu_matches'),
        ),
      ).toBe(false);
    },
  );

  it('rejects a configured CPU card that is not battle-ready', async () => {
    const query = createCpuConfigurationQuery(configuredCpuCardRows(), {
      incompleteCreatureId: BASIC_CPU_DECK_CONFIGURATION[0].cardDefinitionId,
    });
    const service = createCpuMatchService(fakeDatabase(query));

    await expect(
      service.createMatch({ playerId: PLAYER_ID, deckId: DECK_ID }),
    ).rejects.toThrow('must define exactly four moves before battle use');

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes('insert into public.cpu_matches'),
      ),
    ).toBe(false);
  });

  it('applies the player action and server CPU action in one transaction', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const query = vi.fn(async (...args: [string, unknown[]?]) => {
      const [statement] = args;
      if (statement === 'begin' || statement === 'commit') {
        return { rows: [] };
      }

      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              id: MATCH_ID,
              player_id: PLAYER_ID,
              status: 'active',
              state,
              version: 0,
              turn_started_at: null,
              turn_deadline: null,
              winner: null,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              completed_at: null,
            },
          ],
        };
      }

      if (statement.includes('with sequence_base as materialized')) {
        return { rows: [persistenceResult(2)] };
      }

      if (statement.includes('select response')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${statement}`);
    });

    const database = fakeDatabase(query);
    const randomInt = vi
      .fn<(maximumExclusive: number) => number>()
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(0);
    const service = createCpuMatchService(database, {
      clock: { now: () => new Date('2026-08-16T00:00:01.000Z') },
      randomInt,
    });

    const response = await service.submitAction({
      playerId: PLAYER_ID,
      matchId: MATCH_ID,
      submissionId: 'a5000000-0000-4000-8000-000000000001',
      expectedVersion: 0,
      action: {
        type: 'select_initial_creature',
        creatureId: 'player-creature-1',
      },
    });

    expect(response.version).toBe(1);
    expect(response.state.phase).toBe('active');
    expect(response.state.selections).toEqual({
      player: 'player-creature-1',
      cpu: 'cpu-creature-3',
    });
    expect(response.state.currentSide).toBe('player');
    expect(randomInt.mock.calls).toEqual([[3], [2]]);
    expect(
      query.mock.calls.filter(([statement]) => statement === 'begin'),
    ).toHaveLength(1);
    expect(
      query.mock.calls.filter(([statement]) => statement === 'commit'),
    ).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(5);
    const persistenceCall = query.mock.calls.find(([statement]) =>
      statement.includes('with sequence_base as materialized'),
    );
    expect(persistenceCall).toBeDefined();
    expect(persistenceCall?.[0]).toContain('jsonb_array_elements');
    expect(persistenceCall?.[0]).toContain('with ordinality');
    expect(persistenceCall?.[0]).toContain('coalesce(max(sequence), 0)');
    expect(persistenceCall?.[0]).toContain(
      'insert into public.cpu_match_rounds',
    );
    expect(persistenceCall?.[0]).toContain(
      'insert into public.cpu_match_actions',
    );
    expect(persistenceCall?.[0]).toContain('update public.cpu_matches');
    expect(JSON.parse(String(persistenceCall?.[1]?.[5]))).toHaveLength(2);
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes('select count(*)::text'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes('update public.cpu_match_actions'),
      ),
    ).toBe(false);
  });

  it('rolls back when combined persistence invariants are not satisfied', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const query = vi.fn(async (statement: string) => {
      if (statement === 'begin' || statement === 'rollback') {
        return { rows: [] };
      }
      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              id: MATCH_ID,
              player_id: PLAYER_ID,
              status: 'active',
              state,
              version: 0,
              turn_started_at: null,
              turn_deadline: null,
              winner: null,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              completed_at: null,
            },
          ],
        };
      }
      if (statement.includes('with sequence_base as materialized')) {
        return {
          rows: [{ ...persistenceResult(2), match_update_count: 0 }],
        };
      }
      if (statement.includes('select response')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const service = createCpuMatchService(fakeDatabase(query), {
      randomInt: () => 0,
    });

    await expect(
      service.submitAction({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        submissionId: 'a5000000-0000-4000-8000-000000000003',
        expectedVersion: 0,
        action: {
          type: 'select_initial_creature',
          creatureId: 'player-creature-1',
        },
      }),
    ).rejects.toThrow('transition persistence invariant failed');

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
  });

  it('recovers one active match and its latest action in one read snapshot', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      expect(values).toEqual([PLAYER_ID, null, true]);
      expect(statement).toContain("match.status = 'active'");
      expect(statement).toContain('select action.result');
      expect(statement).toContain('order by action.sequence desc');

      return {
        rows: [
          {
            id: MATCH_ID,
            player_id: PLAYER_ID,
            status: 'active',
            state,
            version: 3,
            turn_started_at: new Date('2026-08-16T00:00:00.000Z'),
            turn_deadline: new Date('2026-08-16T00:01:30.000Z'),
            winner: null,
            started_at: new Date('2026-08-15T23:59:00.000Z'),
            completed_at: null,
            latest_action: null,
          },
        ],
      };
    });
    const service = createCpuMatchService(fakeDatabase(query));

    const recovered = await service.getActiveMatch(PLAYER_ID);

    expect(recovered).toMatchObject({
      matchId: MATCH_ID,
      status: 'active',
      version: 3,
      winner: null,
      completedAt: null,
      lastAction: null,
      state: {
        phase: 'initial_selection',
        turnDeadline: '2026-08-16T00:01:30.000Z',
      },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(
      query.mock.calls.some(([statement]) =>
        /\b(begin|commit|update|insert|delete)\b/i.test(statement),
      ),
    ).toBe(false);
  });

  it('serializes ordered effects, zero cost, stacked modifiers, and a clamped 150% debuff', async () => {
    const base = createBattleState(effectRichDeck('player'), deck('cpu'));
    const firstCreature = base.participants.player.creatures[0]!;
    const firstPowerCard = base.participants.player.powerCards[0]!;
    const state: BattleState = {
      ...base,
      phase: 'active',
      turnNumber: 4,
      currentSide: 'player',
      firstSide: 'player',
      selections: {
        player: firstCreature.card.id,
        cpu: base.participants.cpu.creatures[0]!.card.id,
      },
      participants: {
        ...base.participants,
        player: {
          ...base.participants.player,
          activeCreatureId: firstCreature.card.id,
          creatures: [
            {
              ...firstCreature,
              modifiers: [
                {
                  id: 'active-one',
                  stat: 'damage_multiplier',
                  operation: 'multiply',
                  value: 1.1,
                  remainingTurns: 2,
                  createdOnTurn: 1,
                },
                {
                  id: 'active-two',
                  stat: 'damage_multiplier',
                  operation: 'multiply',
                  value: 1.1,
                  remainingTurns: null,
                  createdOnTurn: 2,
                },
              ],
            },
            ...base.participants.player.creatures.slice(1),
          ],
        },
        cpu: {
          ...base.participants.cpu,
          activeCreatureId: base.participants.cpu.creatures[0]!.card.id,
          creatures: [
            {
              ...base.participants.cpu.creatures[0]!,
              modifiers: [
                {
                  id: 'overkill-debuff-effect',
                  stat: 'damage_multiplier',
                  operation: 'multiply',
                  value: 0,
                  remainingTurns: 2,
                  createdOnTurn: 3,
                },
              ],
            },
            ...base.participants.cpu.creatures.slice(1),
          ],
        },
      },
    };
    const latestAction = {
      action: {
        type: 'use_power_card' as const,
        powerCardId: firstPowerCard.id,
      },
      defeatedCreatureId: null,
      effects: [
        {
          effectId: 'player-power-effect-3',
          effectType: 'buff' as const,
          targetSide: 'player' as const,
          targetCreatureId: firstCreature.card.id,
          amount: 3,
          damageMultiplier: null,
        },
      ],
      side: 'player' as const,
      turnEnded: true,
      winner: null,
    };
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          card_names: {
            [firstCreature.card.id]: 'Campus Scholar',
            [firstPowerCard.id]: 'Tactical Surge',
          },
          completed_at: null,
          id: MATCH_ID,
          latest_action: latestAction,
          player_id: PLAYER_ID,
          started_at: new Date('2026-08-16T00:00:00.000Z'),
          state,
          status: 'active',
          turn_deadline: new Date('2026-08-16T00:01:30.000Z'),
          turn_started_at: new Date('2026-08-16T00:00:00.000Z'),
          version: 4,
          winner: null,
        },
      ],
    });
    const service = createCpuMatchService(fakeDatabase(query));

    const response = await service.getMatch(PLAYER_ID, MATCH_ID);

    expect(response.state.player.creatures[0]).toMatchObject({
      name: 'Campus Scholar',
      moves: expect.arrayContaining([
        expect.objectContaining({ powerCost: 0 }),
      ]),
      activeModifiers: [
        { percentage: 10, remainingTurns: 2 },
        { percentage: 10, remainingTurns: null },
      ],
    });
    expect(response.state.player.powerCards[0]).toMatchObject({
      name: 'Tactical Surge',
      effects: [
        { effectType: 'damage', effectValue: 8, modifier: null },
        { effectType: 'heal', effectValue: 5, modifier: null },
        {
          effectType: 'buff',
          effectValue: 3,
          modifier: expect.objectContaining({ stat: 'power' }),
        },
        {
          effectType: 'debuff',
          effectValue: 2,
          modifier: expect.objectContaining({ stat: 'power' }),
        },
        {
          effectType: 'buff',
          effectValue: 15,
          modifier: expect.objectContaining({ durationTurns: 3 }),
        },
        {
          effectType: 'debuff',
          effectValue: 150,
          damageMultiplier: 0,
          modifier: expect.objectContaining({ durationTurns: null }),
        },
      ],
    });
    expect(response.state.cpu.activeCreature?.activeModifiers).toEqual([
      {
        stat: 'damage_multiplier',
        operation: 'multiply',
        percentage: -100,
        remainingTurns: 2,
      },
    ]);
    expect(response.lastAction?.effects[0]?.modifier).toMatchObject({
      stat: 'power',
      operation: 'add',
    });
  });

  it.each([
    {
      completedAt: null,
      phase: 'initial_selection' as const,
      status: 'active' as const,
      winner: null,
    },
    {
      completedAt: new Date('2026-08-16T00:04:00.000Z'),
      phase: 'completed' as const,
      status: 'completed' as const,
      winner: 'player' as const,
    },
  ])(
    'reads a $status match and latest action through one ownership-scoped statement',
    async ({ completedAt, phase, status, winner }) => {
      const state = {
        ...createBattleState(deck('player'), deck('cpu')),
        phase,
        winner,
      };
      const latestAction = {
        action: { type: 'timeout' as const },
        defeatedCreatureId: null,
        effects: [],
        side: 'cpu' as const,
        turnEnded: true,
        winner,
      };
      const query = vi.fn(async (statement: string, values?: unknown[]) => {
        expect(values).toEqual([PLAYER_ID, MATCH_ID, false]);
        expect(statement).toContain('match.player_id = $1::uuid');
        expect(statement).toContain('match.id = $2::uuid');
        expect(statement).toContain('select action.result');
        expect(statement).toContain('order by action.sequence desc');

        return {
          rows: [
            {
              completed_at: completedAt,
              id: MATCH_ID,
              latest_action: latestAction,
              player_id: PLAYER_ID,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              state,
              status,
              turn_deadline: null,
              turn_started_at: null,
              version: 4,
              winner,
            },
          ],
        };
      });
      const service = createCpuMatchService(fakeDatabase(query));

      const response = await service.getMatch(PLAYER_ID, MATCH_ID);

      expect(response).toMatchObject({
        completedAt: completedAt?.toISOString() ?? null,
        lastAction: latestAction,
        matchId: MATCH_ID,
        status,
        version: 4,
        winner,
      });
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it('fails safely if the one-active-match invariant is violated', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const row = {
      id: MATCH_ID,
      player_id: PLAYER_ID,
      status: 'active' as const,
      state,
      version: 0,
      turn_started_at: null,
      turn_deadline: null,
      winner: null,
      started_at: new Date('2026-08-16T00:00:00.000Z'),
      completed_at: null,
      latest_action: null,
    };
    const query = vi.fn().mockResolvedValue({
      rows: [
        row,
        {
          ...row,
          id: 'a2000000-0000-4000-8000-000000000002',
        },
      ],
    });
    const service = createCpuMatchService(fakeDatabase(query));

    await expect(service.getActiveMatch(PLAYER_ID)).rejects.toThrow(
      'active-state invariant was violated',
    );
  });

  it('rejects a stale action before writing a round or action', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const query = vi.fn(async (statement: string) => {
      if (statement === 'begin') {
        return { rows: [] };
      }

      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              id: MATCH_ID,
              player_id: PLAYER_ID,
              status: 'active',
              state,
              version: 2,
              turn_started_at: null,
              turn_deadline: null,
              winner: null,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              completed_at: null,
            },
          ],
        };
      }

      if (statement.includes('submission_id =')) {
        return { rows: [] };
      }

      if (statement === 'rollback') {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${statement}`);
    });

    const service = createCpuMatchService(fakeDatabase(query), {
      randomInt: () => 0,
    });

    await expect(
      service.submitAction({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        submissionId: 'a5000000-0000-4000-8000-000000000002',
        expectedVersion: 1,
        action: {
          type: 'select_initial_creature',
          creatureId: 'player-creature-1',
        },
      }),
    ).rejects.toBeInstanceOf(CpuMatchVersionConflictError);

    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes('insert into public.cpu_match_rounds'),
      ),
    ).toBe(false);
  });
});

function fakeDatabase(query: ReturnType<typeof vi.fn>): CpuMatchDatabase {
  const client: CpuMatchClient = {
    query: query as CpuMatchClient['query'],
    release: vi.fn(),
  };

  return {
    connect: vi.fn().mockResolvedValue(client),
  };
}

interface ConfiguredCpuCardFixture {
  position: number;
  configured_card_definition_id: string;
  expected_category: BasicCpuDeckCardConfiguration['category'];
  card_definition_id: string | null;
  name: string | null;
  category: BasicCpuDeckCardConfiguration['category'] | null;
  affinity: 'grit' | 'spirit' | 'mystic' | null;
  rarity: 'common' | 'rare' | null;
  hp: number | null;
  power: number | null;
  is_active: boolean | null;
  authoring_status: 'draft' | 'published' | 'retired' | null;
}

function configuredCpuCardRows(): ConfiguredCpuCardFixture[] {
  const names = [
    'Grit Creature 2',
    'Spirit Creature 1',
    'Mystic Creature 1',
    'Grit Power 1',
    'Mystic Power 1',
  ];
  const affinities = ['grit', 'spirit', 'mystic', 'grit', 'mystic'] as const;

  return BASIC_CPU_DECK_CONFIGURATION.map((configured, index) => ({
    position: index + 1,
    configured_card_definition_id: configured.cardDefinitionId,
    expected_category: configured.category,
    card_definition_id: configured.cardDefinitionId,
    name: names[index]!,
    category: configured.category,
    affinity: affinities[index]!,
    rarity: 'common',
    hp: configured.category === 'creature' ? 10 : null,
    power: configured.category === 'creature' ? 10 : null,
    is_active: true,
    authoring_status: 'published',
  }));
}

function createCpuConfigurationQuery(
  cpuRows: ConfiguredCpuCardFixture[],
  options: { incompleteCreatureId?: string } = {},
) {
  const playerRows = selectedPlayerDeckRows();
  const categoryByDefinition = new Map(
    [...playerRows, ...cpuRows].map((row) => [
      row.card_definition_id,
      row.category,
    ]),
  );

  return vi.fn(async (statement: string, values?: unknown[]) => {
    if (statement === 'begin' || statement === 'rollback') {
      return { rows: [] };
    }

    if (statement.includes('from public.player_deck_selections')) {
      return { rows: [{ deck_id: DECK_ID }] };
    }

    if (statement.includes('from public.player_deck_cards')) {
      return { rows: playerRows };
    }

    if (statement.includes('from unnest($1::uuid[], $2::text[])')) {
      expect(values).toEqual([
        BASIC_CPU_DECK_CONFIGURATION.map(
          ({ cardDefinitionId }) => cardDefinitionId,
        ),
        BASIC_CPU_DECK_CONFIGURATION.map(({ category }) => category),
      ]);
      expect(statement).toContain('order by configured.position');
      expect(statement).not.toContain('order by definition.name');
      return { rows: cpuRows };
    }

    if (statement.includes('from public.card_moves')) {
      const definitionIds = values?.[0] as string[];
      return {
        rows: definitionIds.flatMap((definitionId) => {
          if (categoryByDefinition.get(definitionId) !== 'creature') return [];
          const moveCount =
            definitionId === options.incompleteCreatureId ? 3 : 4;

          return Array.from({ length: moveCount }, (_, index) => ({
            id: `${definitionId.slice(0, 24)}${String(index + 1).padStart(12, '0')}`,
            card_definition_id: definitionId,
            position: index + 1,
            name: `Move ${index + 1}`,
            move_type: 'basic',
            effect_type: 'damage',
            effect_value: 1,
            modifier_stat: null,
            modifier_operation: null,
            modifier_duration_turns: null,
            power_cost: 0,
          }));
        }),
      };
    }

    if (statement.includes('from public.card_effects')) {
      const definitionIds = values?.[0] as string[];
      return {
        rows: definitionIds.flatMap((definitionId) =>
          categoryByDefinition.get(definitionId) === 'power'
            ? [
                {
                  id: `${definitionId.slice(0, 24)}000000000001`,
                  card_definition_id: definitionId,
                  position: 1,
                  effect_type: 'heal',
                  effect_value: 1,
                  modifier_stat: null,
                  modifier_operation: null,
                  modifier_duration_turns: null,
                },
              ]
            : [],
        ),
      };
    }

    throw new Error(`Unexpected SQL: ${statement}`);
  });
}

function selectedPlayerDeckRows() {
  return [1, 2, 3, 4, 5].map((position) => {
    const category = position <= 3 ? ('creature' as const) : ('power' as const);

    return {
      position,
      owned_card_id: `a7000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      card_definition_id: `a8000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      name: `Player card ${position}`,
      category,
      affinity: 'wit' as const,
      rarity: 'common' as const,
      hp: category === 'creature' ? 10 : null,
      power: category === 'creature' ? 10 : null,
      is_active: true,
    };
  });
}

function persistenceResult(actionCount: number) {
  const roundId = 'a3000000-0000-4000-8000-000000000001';

  return {
    action_count: actionCount,
    action_match_matches: true,
    action_round_matches: true,
    base_sequence: 0,
    first_sequence: 1,
    last_sequence: actionCount,
    match_update_count: 1,
    player_receipt_count: 1,
    round_count: 1,
    round_id: roundId,
    round_match_id: MATCH_ID,
    unexpected_receipt_count: 0,
    updated_match_id: MATCH_ID,
  };
}

function deck(prefix: 'player' | 'cpu'): BattleDeck {
  const creatures: BattleCreatureCard[] = [1, 2, 3].map((index) => ({
    id: `${prefix}-creature-${index}`,
    affinity: 'wit',
    maxHp: 10,
    maxPower: 10,
    moves: [1, 2, 3, 4].map((position) => ({
      id: `${prefix}-move-${index}-${position}`,
      name: position === 1 ? 'Strike' : `Fixture move ${position}`,
      moveType: 'basic',
      powerCost: position === 1 ? 0 : 11,
      effects: [
        {
          id: `${prefix}-effect-${index}-${position}`,
          effectType: 'damage',
          effectValue: 1,
        },
      ],
    })),
  }));

  const powerCards: BattlePowerCard[] = [1, 2].map((index) => ({
    id: `${prefix}-power-${index}`,
    affinity: 'wit',
    effects: [
      {
        id: `${prefix}-power-effect-${index}`,
        effectType: 'heal',
        effectValue: 1,
      },
    ],
  }));

  return { creatureCards: creatures, powerCards };
}

function effectRichDeck(prefix: 'player' | 'cpu'): BattleDeck {
  const result = deck(prefix);
  const power = result.powerCards[0]!;

  return {
    ...result,
    powerCards: [
      {
        ...power,
        effects: [
          {
            id: `${prefix}-power-effect-1`,
            effectType: 'damage',
            effectValue: 8,
          },
          {
            id: `${prefix}-power-effect-2`,
            effectType: 'heal',
            effectValue: 5,
          },
          {
            id: `${prefix}-power-effect-3`,
            effectType: 'buff',
            effectValue: 3,
            modifier: { stat: 'power', operation: 'add' },
          },
          {
            id: `${prefix}-power-effect-4`,
            effectType: 'debuff',
            effectValue: 2,
            modifier: { stat: 'power', operation: 'add' },
          },
          {
            id: `${prefix}-power-effect-5`,
            effectType: 'buff',
            effectValue: 15,
            modifier: {
              stat: 'damage_multiplier',
              operation: 'multiply',
              durationTurns: 3,
            },
          },
          {
            id: `${prefix}-power-effect-6`,
            effectType: 'debuff',
            effectValue: 150,
            modifier: {
              stat: 'damage_multiplier',
              operation: 'multiply',
              durationTurns: null,
            },
          },
        ],
      },
      result.powerCards[1]!,
    ],
  };
}
