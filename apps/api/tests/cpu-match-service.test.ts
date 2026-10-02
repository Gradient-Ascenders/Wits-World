import { describe, expect, it, vi } from 'vitest';

import {
  createBattleState,
  type BattleAction,
  type BattleActionResult,
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
  CpuMatchCompletedError,
  CpuMatchDeckError,
  CpuMatchActionError,
  CpuMatchSubmissionConflictError,
  CpuMatchVersionConflictError,
  type CpuMatchClient,
  type CpuMatchDatabase,
} from '../src/matches/cpu-match-service.js';
import type { ProgressionPersistence } from '../src/progression/progression-persistence.js';

const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const MATCH_ID = 'a2000000-0000-4000-8000-000000000001';
const DECK_ID = 'a6000000-0000-4000-8000-000000000001';

describe('CPU match service', () => {
  it('rejects an out-of-turn player action without persisting a transition', async () => {
    const state = { ...terminalReadyState(), currentSide: 'cpu' as const };
    const query = terminalActionQuery(state);
    const service = createCpuMatchService(fakeDatabase(query), {
      clock: { now: () => new Date('2026-08-16T00:04:00Z') },
    });
    await expect(
      service.submitAction({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        expectedVersion: 0,
        submissionId: 'a5000000-0000-4000-8000-000000000011',
        action: { type: 'use_move', moveId: 'player-move-1-1' },
      }),
    ).rejects.toThrow(CpuMatchActionError);
    expect(query).toHaveBeenCalledWith('rollback');
    expect(
      query.mock.calls.some(([sql]) => sql.includes('with sequence_base')),
    ).toBe(false);
  });
  it('defines the approved Basic CPU deck with exactly three Creatures and two Power cards', () => {
    expect(BASIC_CPU_DECK_CONFIGURATION).toEqual([
      {
        cardDefinitionId: '84790040-6ea8-6155-c4b7-dec3a22ac3ab',
        category: 'creature',
      },
      {
        cardDefinitionId: 'eca9b943-9e05-834e-c85c-1175001d897c',
        category: 'creature',
      },
      {
        cardDefinitionId: '27cbcedf-1886-aa81-04b4-089b4c10cd87',
        category: 'creature',
      },
      {
        cardDefinitionId: '0d28241f-a4f2-2cf3-52bc-dee1633b3316',
        category: 'power',
      },
      {
        cardDefinitionId: 'b7485793-8432-2db9-5f99-974164efa788',
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

  it('inserts all ten battle card snapshots in one database statement', async () => {
    const setupQuery = createCpuConfigurationQuery(configuredCpuCardRows());
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      if (statement.includes('insert into public.cpu_matches')) {
        return { rows: [{ id: MATCH_ID }] };
      }
      if (statement.includes('insert into public.cpu_match_cards')) {
        return { rows: [] };
      }
      if (statement === 'commit') return { rows: [] };
      return setupQuery(statement, values);
    });
    const service = createCpuMatchService(fakeDatabase(query));

    const match = await service.createMatch({
      playerId: PLAYER_ID,
      deckId: DECK_ID,
    });

    expect(match.matchId).toBe(MATCH_ID);
    const inserts = query.mock.calls.filter(([statement]) =>
      statement.includes('insert into public.cpu_match_cards'),
    );
    expect(inserts).toHaveLength(1);
    const [statement, values] = inserts[0]!;
    expect(statement).toContain('jsonb_to_recordset');
    expect(values?.[0]).toBe(MATCH_ID);
    const snapshots = JSON.parse(String(values?.[1])) as Array<{
      side: string;
      position: number;
      snapshot: { battleCard: { id: string } };
    }>;
    expect(snapshots).toHaveLength(10);
    expect(snapshots.map(({ side, position }) => [side, position])).toEqual([
      ...[1, 2, 3, 4, 5].map((position) => ['player', position]),
      ...[1, 2, 3, 4, 5].map((position) => ['cpu', position]),
    ]);
    expect(snapshots.every(({ snapshot }) => snapshot.battleCard.id)).toBe(
      true,
    );
    expect(query).toHaveBeenCalledWith('commit');
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
              action_sequence: 0,
              latest_battle_log: null,
              legacy_log_actions: [],
            },
          ],
        };
      }

      if (statement.includes('with sequence_base as materialized')) {
        return { rows: [persistenceResult(2)] };
      }

      if (statement.includes('submission_id =')) {
        return { rows: [] };
      }

      if (statement.includes('join public.cpu_match_rounds')) {
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
    const lockedRead = query.mock.calls.find(([statement]) =>
      statement.includes('for update of cpu_matches'),
    );
    expect(lockedRead?.[0]).toContain('action_summary.latest_battle_log');
    expect(lockedRead?.[0]).toContain("action.response -> 'battleLog'");
    expect(lockedRead?.[0]).toContain('legacy_log_actions');
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
    expect(persistenceCall?.[0]).toContain('submitted_intent');
    expect(persistenceCall?.[0]).toContain('update public.cpu_matches');
    expect(JSON.parse(String(persistenceCall?.[1]?.[5]))).toHaveLength(2);
    expect(JSON.parse(String(persistenceCall?.[1]?.[14]))).toEqual({
      type: 'select_initial_creature',
      creatureId: 'player-creature-1',
    });
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

  it('extends the latest receipt log without a full-history action query', async () => {
    const initial = createBattleState(deck('player'), deck('cpu'));
    const playerCreature = initial.participants.player.creatures[0]!;
    const cpuCreature = initial.participants.cpu.creatures[0]!;
    const state: BattleState = {
      ...initial,
      currentSide: 'player',
      firstSide: 'player',
      phase: 'active',
      selections: {
        cpu: cpuCreature.card.id,
        player: playerCreature.card.id,
      },
      turnNumber: 1,
      participants: {
        cpu: {
          ...initial.participants.cpu,
          activeCreatureId: cpuCreature.card.id,
        },
        player: {
          ...initial.participants.player,
          activeCreatureId: playerCreature.card.id,
        },
      },
    };
    const previousBattleLog = [
      {
        events: [
          {
            id: '1:0',
            kind: 'action',
            message: 'Player selected Wit Creature.',
            sequence: 1,
            side: 'player',
          },
          {
            id: '2:0',
            kind: 'action',
            message: 'CPU revealed Wit Creature.',
            sequence: 2,
            side: 'cpu',
          },
        ],
        id: 'opening',
        label: 'Opening',
        turnNumber: 0,
      },
    ];
    const query = vi.fn(async (statement: string) => {
      if (statement === 'begin' || statement === 'commit') {
        return { rows: [] };
      }
      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              action_sequence: 2,
              card_names: {},
              completed_at: null,
              id: MATCH_ID,
              latest_battle_log: previousBattleLog,
              legacy_log_actions: [],
              player_id: PLAYER_ID,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              state,
              status: 'active',
              turn_deadline: new Date('2026-08-16T00:01:30.000Z'),
              turn_started_at: new Date('2026-08-16T00:00:00.000Z'),
              version: 1,
              winner: null,
            },
          ],
        };
      }
      if (statement.includes('submitted.submission_id =')) {
        return { rows: [] };
      }
      if (statement.includes('with sequence_base as materialized')) {
        return { rows: [persistenceResult(2, 2)] };
      }

      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const service = createCpuMatchService(fakeDatabase(query), {
      clock: { now: () => new Date('2026-08-16T00:00:02.000Z') },
      randomInt: () => 0,
    });

    const response = await service.submitAction({
      action: {
        moveId: playerCreature.card.moves[0]!.id,
        type: 'use_move',
      },
      expectedVersion: 1,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      submissionId: 'a5000000-0000-4000-8000-000000000004',
    });

    expect(query).toHaveBeenCalledTimes(5);
    expect(response.battleLog[0]).toEqual(previousBattleLog[0]);
    expect(
      response.battleLog.flatMap(({ events }) => events.map(({ id }) => id)),
    ).toEqual(expect.arrayContaining(['1:0', '2:0', '3:0', '4:0']));
    expect(
      query.mock.calls.some(
        ([statement]) =>
          statement.includes('join public.cpu_match_rounds round') &&
          !statement.includes('submitted.submission_id =') &&
          !statement.includes('from public.cpu_matches'),
      ),
    ).toBe(false);
  });

  it('reconstructs a legacy duplicate through its round and preserves its last action', async () => {
    const initial = createBattleState(deck('player'), deck('cpu'));
    const playerCreature = initial.participants.player.creatures[0]!;
    const cpuCreature = initial.participants.cpu.creatures[0]!;
    const stateBefore: BattleState = {
      ...initial,
      currentSide: 'player',
      firstSide: 'player',
      phase: 'active',
      selections: {
        cpu: cpuCreature.card.id,
        player: playerCreature.card.id,
      },
      turnNumber: 1,
      participants: {
        cpu: {
          ...initial.participants.cpu,
          activeCreatureId: cpuCreature.card.id,
        },
        player: {
          ...initial.participants.player,
          activeCreatureId: playerCreature.card.id,
        },
      },
    };
    const stateAfter = {
      ...stateBefore,
      currentSide: 'player' as const,
      turnNumber: 3,
    };
    const playerResult = createLogResult('player', {
      moveId: playerCreature.card.moves[0]!.id,
      type: 'use_move',
    });
    const cpuResult = createLogResult('cpu', {
      moveId: cpuCreature.card.moves[0]!.id,
      type: 'use_move',
    });
    const legacyLogActions = [
      {
        result: playerResult,
        roundNumber: 2,
        roundStateAfter: stateAfter,
        roundStateBefore: stateBefore,
        sequence: 5,
      },
      {
        result: cpuResult,
        roundNumber: 2,
        roundStateAfter: stateAfter,
        roundStateBefore: stateBefore,
        sequence: 6,
      },
    ];
    const legacyResponse = {
      completedAt: null,
      lastAction: {
        ...cpuResult,
        effects: [
          {
            effectId: 'cpu-effect-1-1',
            effectType: 'debuff',
            effectCode: 'power_change',
            targetSide: 'player',
            targetCreatureId: playerCreature.card.id,
            amount: -1000,
            damageMultiplier: null,
            modifier: null,
          },
        ],
        expiredEffects: undefined,
      },
      matchId: MATCH_ID,
      startedAt: '2026-08-16T00:00:00.000Z',
      state: {},
      status: 'active',
      version: 2,
      winner: null,
    };
    const query = vi.fn(async (statement: string) => {
      if (statement === 'begin' || statement === 'commit') {
        return { rows: [] };
      }
      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              action_sequence: 6,
              card_names: {},
              completed_at: null,
              id: MATCH_ID,
              latest_battle_log: null,
              legacy_log_actions: legacyLogActions,
              player_id: PLAYER_ID,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              state: stateAfter,
              status: 'active',
              turn_deadline: new Date('2026-08-16T00:01:30.000Z'),
              turn_started_at: new Date('2026-08-16T00:00:00.000Z'),
              version: 2,
              winner: null,
            },
          ],
        };
      }
      if (statement.includes('submitted.submission_id =')) {
        expect(statement).toContain(
          'round_action.round_id = submitted.round_id',
        );
        expect(statement).toContain('log_action.sequence <=');
        return {
          rows: [
            {
              action: {
                moveId: playerCreature.card.moves[0]!.id,
                type: 'use_move',
              },
              expected_version: 1,
              legacy_log_actions: legacyLogActions,
              response: legacyResponse,
              sequence: 5,
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const service = createCpuMatchService(fakeDatabase(query));

    const response = await service.submitAction({
      action: {
        moveId: playerCreature.card.moves[0]!.id,
        type: 'use_move',
      },
      expectedVersion: 1,
      matchId: MATCH_ID,
      playerId: PLAYER_ID,
      submissionId: 'a5000000-0000-4000-8000-000000000005',
    });

    expect(response.lastAction?.effects).toEqual([
      {
        effectId: 'cpu-effect-1-1',
        effectType: 'debuff',
        targetSide: 'player',
        targetCreatureId: playerCreature.card.id,
        amount: -1000,
        damageMultiplier: null,
        modifier: null,
      },
    ]);
    expect(query).toHaveBeenCalledTimes(4);
    expect(response.lastAction?.effects[0]).not.toHaveProperty('effectCode');
    expect(response.lastAction?.effects[0]?.amount).toBe(-1000);
    expect(response.lastAction).toMatchObject({
      action: cpuResult.action,
      expiredEffects: [],
      side: 'cpu',
    });
    expect(
      response.battleLog.flatMap(({ events }) =>
        events.map(({ message }) => message),
      ),
    ).toEqual(
      expect.arrayContaining([
        "Player's Wit Creature used Strike.",
        "CPU's Wit Creature used Strike.",
      ]),
    );
    expect(
      response.battleLog.flatMap(({ events }) => events.map(({ id }) => id)),
    ).toEqual(expect.arrayContaining(['5:0', '6:0']));
  });

  it('records trust only after a duplicate submission changes action or expected version', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const playerCreature = state.participants.player.creatures[0]!;
    const storedAction = {
      moveId: playerCreature.card.moves[0]!.id,
      type: 'use_move' as const,
    };
    const query = vi.fn(async (statement: string) => {
      if (statement === 'begin' || statement === 'rollback') {
        return { rows: [] };
      }
      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              action_sequence: 1,
              card_names: {},
              completed_at: null,
              id: MATCH_ID,
              latest_battle_log: [],
              legacy_log_actions: [],
              player_id: PLAYER_ID,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              state,
              status: 'active',
              turn_deadline: new Date('2026-08-16T00:01:30.000Z'),
              turn_started_at: new Date('2026-08-16T00:00:00.000Z'),
              version: 1,
              winner: null,
            },
          ],
        };
      }
      if (statement.includes('submitted.submission_id =')) {
        return {
          rows: [
            {
              action: storedAction,
              submitted_intent: storedAction,
              expected_version: 1,
              legacy_log_actions: [],
              response: {
                battleLog: [],
                completedAt: null,
                lastAction: null,
                matchId: MATCH_ID,
                startedAt: '2026-08-16T00:00:00.000Z',
                state: {},
                status: 'active',
                version: 1,
                winner: null,
              },
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const recordSubmissionConflict = vi.fn().mockResolvedValue(true);
    const service = createCpuMatchService(fakeDatabase(query), {
      trustService: { recordSubmissionConflict },
    });

    await expect(
      service.submitAction({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        submissionId: 'a5000000-0000-4000-8000-000000000012',
        expectedVersion: 1,
        action: {
          type: 'select_initial_creature',
          creatureId: 'different-card',
        },
      }),
    ).rejects.toBeInstanceOf(CpuMatchSubmissionConflictError);

    expect(query).toHaveBeenCalledWith('rollback');
    expect(recordSubmissionConflict).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      operation: 'cpu_match_action',
      resourceIdentifier: MATCH_ID,
      submissionId: 'a5000000-0000-4000-8000-000000000012',
    });
    expect(
      query.mock.invocationCallOrder[
        query.mock.calls.findIndex(([statement]) => statement === 'rollback')
      ],
    ).toBeLessThan(recordSubmissionConflict.mock.invocationCallOrder[0]!);

    recordSubmissionConflict.mockClear();
    await expect(
      service.submitAction({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        submissionId: 'a5000000-0000-4000-8000-000000000012',
        expectedVersion: 2,
        action: storedAction,
      }),
    ).rejects.toBeInstanceOf(CpuMatchSubmissionConflictError);
    expect(recordSubmissionConflict).toHaveBeenCalledOnce();
  });

  it('projects stored engine effect metadata out of completed match history', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const playerCreature = state.participants.player.creatures[0]!;
    const cpuCreature = state.participants.cpu.creatures[0]!;
    const storedResult = {
      ...createLogResult('player', {
        moveId: playerCreature.card.moves[0]!.id,
        type: 'use_move',
      }),
      effects: [
        {
          amount: 1,
          damageMultiplier: null,
          effectCode: 'damage' as const,
          effectId: playerCreature.card.moves[0]!.effects[0]!.id,
          effectType: 'damage' as const,
          modifier: null,
          targetCreatureId: cpuCreature.card.id,
          targetSide: 'cpu' as const,
        },
      ],
    };
    const createdAt = new Date('2026-08-16T00:00:00.000Z');
    const completedAt = new Date('2026-08-16T00:01:00.000Z');
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('from public.cpu_matches')) {
        return {
          rows: [
            {
              completed_at: completedAt,
              id: MATCH_ID,
              player_id: PLAYER_ID,
              started_at: createdAt,
              state,
              status: 'completed',
              turn_deadline: null,
              turn_started_at: null,
              version: 3,
              winner: 'player',
            },
          ],
        };
      }
      if (statement.includes('from public.cpu_match_rounds')) {
        expect(statement).toContain('state_after');
        return {
          rows: [
            {
              created_at: createdAt,
              id: 'a3000000-0000-4000-8000-000000000001',
              match_id: MATCH_ID,
              result: [storedResult],
              round_number: 1,
              state_after: state,
              state_before: state,
            },
          ],
        };
      }
      if (statement.includes('from public.cpu_match_actions')) {
        return {
          rows: [
            {
              action: storedResult.action,
              round_id: 'a3000000-0000-4000-8000-000000000001',
              created_at: createdAt,
              result: storedResult,
              sequence: 1,
              side: 'player',
              submission_id: null,
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const service = createCpuMatchService(fakeDatabase(query));

    const history = await service.listHistory(PLAYER_ID);
    const expectedPublicEffect = {
      amount: 1,
      damageMultiplier: null,
      effectId: playerCreature.card.moves[0]!.effects[0]!.id,
      effectType: 'damage',
      modifier: null,
      targetCreatureId: cpuCreature.card.id,
      targetSide: 'cpu',
    };

    expect(history[0]?.rounds[0]?.result[0]?.effects).toEqual([
      expectedPublicEffect,
    ]);
    expect(history[0]?.rounds[0]?.actions[0]?.result.effects).toEqual([
      expectedPublicEffect,
    ]);
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
      if (statement.includes('submission_id =')) {
        return { rows: [] };
      }
      if (statement.includes('join public.cpu_match_rounds')) {
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

  it('records terminal CPU-match progression before committing', async () => {
    const state = terminalReadyState();
    const query = terminalActionQuery(state);
    const progressionPersistence = progressionMock();
    const service = createCpuMatchService(fakeDatabase(query), {
      clock: { now: () => new Date('2026-08-16T00:04:00.000Z') },
      progressionPersistence,
      randomInt: () => 0,
    });

    const response = await service.submitAction({
      playerId: PLAYER_ID,
      matchId: MATCH_ID,
      submissionId: 'a5000000-0000-4000-8000-000000000009',
      expectedVersion: 0,
      action: { type: 'use_move', moveId: 'player-move-1-1' },
    });

    expect(response).toMatchObject({ status: 'completed', winner: 'player' });
    expect(progressionPersistence.recordCpuMatch).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      MATCH_ID,
    );
    expect(
      vi.mocked(progressionPersistence.recordCpuMatch).mock
        .invocationCallOrder[0]!,
    ).toBeLessThan(
      query.mock.invocationCallOrder[
        query.mock.calls.findIndex(([statement]) => statement === 'commit')
      ]!,
    );
  });

  it('records an authoritative CPU win when the player forfeits', async () => {
    const state = terminalReadyState();
    const completedAt = new Date('2026-08-16T00:04:00.000Z');
    const query = vi.fn(async (statement: string) => {
      if (
        statement === 'begin' ||
        statement === 'commit' ||
        statement === 'rollback'
      ) {
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
              version: 3,
              turn_started_at: new Date('2026-08-16T00:03:00.000Z'),
              turn_deadline: new Date('2026-08-16T00:05:00.000Z'),
              winner: null,
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              completed_at: null,
              legacy_log_actions: [],
              card_names: {},
              card_rarities: {},
            },
          ],
        };
      }
      if (statement.includes('update public.cpu_matches')) {
        return { rows: [{ id: MATCH_ID }] };
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const progressionPersistence = progressionMock();
    const service = createCpuMatchService(fakeDatabase(query), {
      clock: { now: () => completedAt },
      progressionPersistence,
    });

    const response = await service.forfeitMatch({
      playerId: PLAYER_ID,
      matchId: MATCH_ID,
      expectedVersion: 3,
    });

    expect(response).toMatchObject({
      status: 'completed',
      version: 4,
      winner: 'cpu',
      completedAt: completedAt.toISOString(),
      state: { phase: 'completed', currentSide: null },
    });
    expect(progressionPersistence.recordCpuMatch).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      MATCH_ID,
    );
    expect(query).toHaveBeenCalledWith('commit');
  });

  it('rejects a forfeit when the match already completed', async () => {
    const state = {
      ...terminalReadyState(),
      phase: 'completed',
      winner: 'player',
    } as const;
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
              status: 'completed',
              state,
              version: 4,
              turn_started_at: null,
              turn_deadline: null,
              winner: 'player',
              started_at: new Date('2026-08-16T00:00:00.000Z'),
              completed_at: new Date('2026-08-16T00:03:30.000Z'),
              legacy_log_actions: [],
              card_names: {},
              card_rarities: {},
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const service = createCpuMatchService(fakeDatabase(query));

    await expect(
      service.forfeitMatch({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(CpuMatchCompletedError);

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
  });

  it('rolls back a terminal CPU match when progression fails', async () => {
    const state = terminalReadyState();
    const query = terminalActionQuery(state);
    const progressionPersistence = progressionMock();
    vi.mocked(progressionPersistence.recordCpuMatch).mockRejectedValueOnce(
      new Error('progression write failed'),
    );
    const service = createCpuMatchService(fakeDatabase(query), {
      clock: { now: () => new Date('2026-08-16T00:04:00.000Z') },
      progressionPersistence,
      randomInt: () => 0,
    });

    await expect(
      service.submitAction({
        playerId: PLAYER_ID,
        matchId: MATCH_ID,
        submissionId: 'a5000000-0000-4000-8000-000000000010',
        expectedVersion: 0,
        action: { type: 'use_move', moveId: 'player-move-1-1' },
      }),
    ).rejects.toThrow('progression write failed');

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
  });

  it('recovers one active match and its ordered log in one read snapshot', async () => {
    const state = createBattleState(deck('player'), deck('cpu'));
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      expect(values).toEqual([PLAYER_ID, null, true]);
      expect(statement).toContain("match.status = 'active'");
      expect(statement).toContain('jsonb_agg');
      expect(statement).toContain('order by action.sequence');

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
            log_actions: [],
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
          effectCode: 'power_change' as const,
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
          card_rarities: {
            [firstCreature.card.id]: 'epic',
          },
          completed_at: null,
          id: MATCH_ID,
          log_actions: [
            {
              result: latestAction,
              roundNumber: 4,
              roundStateAfter: state,
              roundStateBefore: state,
              sequence: 1,
            },
          ],
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
      rarity: 'epic',
      moves: expect.arrayContaining([
        expect.objectContaining({ effectiveness: 'neutral', powerCost: 0 }),
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
        value: 0,
        percentage: -100,
        remainingTurns: 2,
        remainingCharges: null,
      },
    ]);
    expect(response.lastAction?.effects[0]?.modifier).toMatchObject({
      stat: 'power',
      operation: 'add',
    });
    expect(response.lastAction?.effects[0]).not.toHaveProperty('effectCode');
  });

  it('reconstructs one deterministic chronological log from persisted player and CPU actions', async () => {
    const playerDeck = effectRichDeck('player');
    const temporaryOverkillDeck: BattleDeck = {
      ...playerDeck,
      powerCards: playerDeck.powerCards.map((powerCard, index) =>
        index === 0
          ? {
              ...powerCard,
              effects: powerCard.effects.map((effect) =>
                effect.id === 'player-power-effect-5'
                  ? {
                      ...effect,
                      effectType: 'debuff',
                      effectValue: 150,
                      modifier: {
                        stat: 'damage_multiplier',
                        operation: 'multiply',
                        durationTurns: 1,
                      },
                    }
                  : effect,
              ),
            }
          : powerCard,
      ),
    };
    const initial = createBattleState(
      temporaryOverkillDeck,
      effectRichDeck('cpu'),
    );
    const playerOne = initial.participants.player.creatures[0]!.card.id;
    const playerTwo = initial.participants.player.creatures[1]!.card.id;
    const cpuOne = initial.participants.cpu.creatures[0]!.card.id;
    const selections = { cpu: cpuOne, player: playerOne };
    const active: BattleState = {
      ...initial,
      currentSide: 'player',
      firstSide: 'player',
      phase: 'active',
      selections,
      turnNumber: 1,
      participants: {
        player: {
          ...initial.participants.player,
          activeCreatureId: playerOne,
        },
        cpu: { ...initial.participants.cpu, activeCreatureId: cpuOne },
      },
    };
    const cpuTurn: BattleState = {
      ...active,
      currentSide: 'cpu',
      turnNumber: 2,
    };
    const replacement: BattleState = {
      ...cpuTurn,
      currentSide: 'player',
      phase: 'replacement',
      replacementSide: 'player',
      turnNumber: 3,
      participants: {
        ...cpuTurn.participants,
        player: {
          ...cpuTurn.participants.player,
          activeCreatureId: null,
        },
      },
    };
    const resumed: BattleState = {
      ...replacement,
      phase: 'active',
      replacementSide: null,
      participants: {
        ...replacement.participants,
        player: {
          ...replacement.participants.player,
          activeCreatureId: playerTwo,
        },
      },
    };
    const completed: BattleState = {
      ...resumed,
      currentSide: null,
      phase: 'completed',
      winner: 'player',
    };
    const result = (
      side: 'player' | 'cpu',
      action: Parameters<typeof createLogResult>[1],
      overrides: Partial<ReturnType<typeof createLogResult>> = {},
    ) => createLogResult(side, action, overrides);
    const logActions = [
      {
        result: result(
          'player',
          {
            creatureId: playerOne,
            type: 'select_initial_creature',
          },
          { turnEnded: false },
        ),
        roundNumber: 1,
        roundStateAfter: active,
        roundStateBefore: initial,
        sequence: 1,
      },
      {
        result: result(
          'cpu',
          {
            creatureId: cpuOne,
            type: 'select_initial_creature',
          },
          { turnEnded: false },
        ),
        roundNumber: 1,
        roundStateAfter: active,
        roundStateBefore: initial,
        sequence: 2,
      },
      {
        result: result(
          'player',
          {
            powerCardId: active.participants.player.powerCards[0]!.id,
            type: 'use_power_card',
          },
          {
            effects: [
              {
                amount: 8,
                damageMultiplier: null,
                effectId: 'player-power-effect-1',
                effectType: 'damage',
                targetCreatureId: cpuOne,
                targetSide: 'cpu',
              },
              {
                amount: 5,
                damageMultiplier: null,
                effectId: 'player-power-effect-2',
                effectType: 'heal',
                targetCreatureId: playerOne,
                targetSide: 'player',
              },
              {
                amount: 3,
                damageMultiplier: null,
                effectId: 'player-power-effect-3',
                effectType: 'buff',
                targetCreatureId: playerOne,
                targetSide: 'player',
              },
              {
                amount: 150,
                damageMultiplier: 0,
                effectId: 'player-power-effect-5',
                effectType: 'debuff',
                targetCreatureId: cpuOne,
                targetSide: 'cpu',
              },
            ],
          },
        ),
        roundNumber: 2,
        roundStateAfter: cpuTurn,
        roundStateBefore: active,
        sequence: 3,
      },
      {
        result: result(
          'cpu',
          {
            moveId: cpuTurn.participants.cpu.creatures[0]!.card.moves[0]!.id,
            type: 'use_move',
          },
          {
            defeatedCreatureId: playerOne,
            effects: [
              {
                amount: 10,
                damageMultiplier: null,
                effectId: 'cpu-effect-1-1',
                effectType: 'damage',
                targetCreatureId: playerOne,
                targetSide: 'player',
              },
            ],
            expiredEffects: [
              {
                damageMultiplier: 0,
                effectId: 'player-power-effect-5',
                targetCreatureId: cpuOne,
                targetSide: 'cpu',
              },
            ],
          },
        ),
        roundNumber: 3,
        roundStateAfter: replacement,
        roundStateBefore: cpuTurn,
        sequence: 4,
      },
      {
        result: result(
          'player',
          {
            creatureId: playerTwo,
            type: 'select_replacement',
          },
          { turnEnded: false },
        ),
        roundNumber: 4,
        roundStateAfter: resumed,
        roundStateBefore: replacement,
        sequence: 5,
      },
      {
        result: result(
          'player',
          {
            moveId: resumed.participants.player.creatures[1]!.card.moves[0]!.id,
            type: 'use_move',
          },
          {
            defeatedCreatureId: cpuOne,
            effects: [
              {
                amount: 10,
                damageMultiplier: null,
                effectId: 'player-effect-2-1',
                effectType: 'damage',
                targetCreatureId: cpuOne,
                targetSide: 'cpu',
              },
            ],
            winner: 'player',
          },
        ),
        roundNumber: 5,
        roundStateAfter: completed,
        roundStateBefore: resumed,
        sequence: 6,
      },
    ];
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          card_names: {
            [active.participants.player.powerCards[0]!.id]: 'Grit Power 2',
            [cpuOne]: 'Mystic Creature 1',
            [playerOne]: 'Grit Creature 3',
            [playerTwo]: 'Wit Creature 2',
          },
          completed_at: new Date('2026-08-16T00:06:00.000Z'),
          id: MATCH_ID,
          log_actions: logActions,
          player_id: PLAYER_ID,
          started_at: new Date('2026-08-16T00:00:00.000Z'),
          state: completed,
          status: 'completed',
          turn_deadline: null,
          turn_started_at: null,
          version: 5,
          winner: 'player',
        },
      ],
    });
    const service = createCpuMatchService(fakeDatabase(query));

    const firstRead = await service.getMatch(PLAYER_ID, MATCH_ID);
    const refreshRead = await service.getMatch(PLAYER_ID, MATCH_ID);
    const messages = firstRead.battleLog.flatMap((group) =>
      group.events.map((event) => event.message),
    );

    expect(firstRead.battleLog.map((group) => group.label)).toEqual([
      'Opening',
      'Turn 1',
      'Turn 2',
      'Turn 3',
    ]);
    expect(messages).toEqual([
      'Player selected Grit Creature 3.',
      'CPU revealed Mystic Creature 1.',
      'Turn 1 began. Player has the first action.',
      'Player used Grit Power 2.',
      "CPU's Mystic Creature 1 took 8 damage.",
      "Player's Grit Creature 3 restored 5 HP.",
      "Player's Grit Creature 3 restored 3 Power.",
      "CPU's Mystic Creature 1 gained Damage −100% for 1 turn.",
      'Turn 1 ended. CPU is next.',
      "CPU's Mystic Creature 1 used Strike.",
      "Player's Grit Creature 3 took 10 damage.",
      "CPU's Mystic Creature 1 no longer has Damage −100%.",
      "Player's Grit Creature 3 was defeated.",
      'Turn 2 ended. Player must choose a replacement.',
      'Player sent out Wit Creature 2 as a replacement.',
      "Player's Wit Creature 2 used Strike.",
      "CPU's Mystic Creature 1 took 10 damage.",
      "CPU's Mystic Creature 1 was defeated.",
      'Player won the match.',
    ]);
    expect(
      new Set(
        firstRead.battleLog.flatMap((group) =>
          group.events.map(({ id }) => id),
        ),
      ).size,
    ).toBe(messages.length);
    expect(firstRead.lastAction?.winner).toBe('player');
    expect(refreshRead.battleLog).toEqual(firstRead.battleLog);
  });

  it('records an authoritative timeout and its turn transition', async () => {
    const initial = createBattleState(deck('player'), deck('cpu'));
    const state: BattleState = {
      ...initial,
      currentSide: 'cpu',
      firstSide: 'player',
      phase: 'active',
      selections: {
        cpu: initial.participants.cpu.creatures[0]!.card.id,
        player: initial.participants.player.creatures[0]!.card.id,
      },
      turnNumber: 7,
      participants: {
        cpu: {
          ...initial.participants.cpu,
          activeCreatureId: initial.participants.cpu.creatures[0]!.card.id,
        },
        player: {
          ...initial.participants.player,
          activeCreatureId: initial.participants.player.creatures[0]!.card.id,
        },
      },
    };
    const afterTimeout: BattleState = {
      ...state,
      currentSide: 'player',
      turnNumber: 8,
    };
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          card_names: {},
          completed_at: null,
          id: MATCH_ID,
          log_actions: [
            {
              result: createLogResult('cpu', { type: 'timeout' }),
              roundNumber: 1,
              roundStateAfter: afterTimeout,
              roundStateBefore: state,
              sequence: 1,
            },
          ],
          player_id: PLAYER_ID,
          started_at: new Date('2026-08-16T00:00:00.000Z'),
          state: afterTimeout,
          status: 'active',
          turn_deadline: new Date('2026-08-16T00:01:30.000Z'),
          turn_started_at: new Date('2026-08-16T00:00:00.000Z'),
          version: 1,
          winner: null,
        },
      ],
    });

    const response = await createCpuMatchService(fakeDatabase(query)).getMatch(
      PLAYER_ID,
      MATCH_ID,
    );

    expect(
      response.battleLog.flatMap(({ events }) =>
        events.map(({ message }) => message),
      ),
    ).toEqual(["CPU's turn timed out.", 'Turn 7 ended. Player is next.']);
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
        expect(statement).toContain('jsonb_agg');
        expect(statement).toContain('order by action.sequence');

        return {
          rows: [
            {
              completed_at: completedAt,
              id: MATCH_ID,
              log_actions: [
                {
                  result: latestAction,
                  roundNumber: 4,
                  roundStateAfter: state,
                  roundStateBefore: state,
                  sequence: 1,
                },
              ],
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
      log_actions: [],
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
  affinity: 'grit' | 'spark' | 'wit' | null;
  rarity: 'common' | 'rare' | null;
  hp: number | null;
  power: number | null;
  is_active: boolean | null;
  authoring_status: 'draft' | 'published' | 'retired' | null;
}

function configuredCpuCardRows(): ConfiguredCpuCardFixture[] {
  const names = ['Quillip', 'Voltiki', 'Karrik', 'Field Kit', 'Reserve Focus'];
  const affinities = ['wit', 'spark', 'grit', null, null] as const;

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

    if (statement.includes('select selection.deck_id::text')) {
      return { rows: [{ deck_id: DECK_ID }] };
    }

    if (
      statement.includes('from public.player_deck_cards') ||
      statement.includes('from public.player_decks deck')
    ) {
      return { rows: playerRows };
    }

    if (statement.includes('from private.card_trade_reservations')) {
      return { rows: [] };
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

    if (
      statement.includes('from public.card_moves') &&
      statement.includes('union all')
    ) {
      const definitionIds = values?.[0] as string[];
      return {
        rows: definitionIds.flatMap<Record<string, unknown>>((definitionId) =>
          categoryByDefinition.get(definitionId) === 'creature'
            ? Array.from({ length: 4 }, (_, index) => ({
                row_kind: 0,
                position: index + 1,
                id: `${definitionId.slice(0, 24)}${String(index + 1).padStart(12, '0')}`,
                card_definition_id: definitionId,
                card_move_id: null,
                name: `Move ${index + 1}`,
                move_type: 'basic',
                effect_type: 'damage',
                effect_value: 1,
                modifier_stat: null,
                modifier_operation: null,
                modifier_duration_turns: null,
                power_cost: 0,
                effect_code: null,
                effect_config: null,
              }))
            : [
                {
                  row_kind: 2,
                  position: 1,
                  id: `${definitionId.slice(0, 24)}000000000001`,
                  card_definition_id: definitionId,
                  card_move_id: null,
                  name: null,
                  move_type: null,
                  effect_type: 'heal',
                  effect_value: 1,
                  modifier_stat: null,
                  modifier_operation: null,
                  modifier_duration_turns: null,
                  power_cost: null,
                  effect_code: 'heal',
                  effect_config: {},
                },
              ],
        ),
      };
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

    if (statement.includes('from public.card_move_effects')) {
      return { rows: [] };
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
      affinity: category === 'creature' ? ('wit' as const) : null,
      rarity: 'common' as const,
      hp: category === 'creature' ? 10 : null,
      power: category === 'creature' ? 10 : null,
      is_active: true,
      authoring_status: 'published',
    };
  });
}

function persistenceResult(actionCount: number, baseSequence = 0) {
  const roundId = 'a3000000-0000-4000-8000-000000000001';

  return {
    action_count: actionCount,
    action_match_matches: true,
    action_round_matches: true,
    base_sequence: baseSequence,
    first_sequence: baseSequence + 1,
    last_sequence: baseSequence + actionCount,
    match_update_count: 1,
    player_receipt_count: 1,
    round_count: 1,
    round_id: roundId,
    round_match_id: MATCH_ID,
    unexpected_receipt_count: 0,
    updated_match_id: MATCH_ID,
  };
}

function createLogResult(
  side: 'player' | 'cpu',
  action: BattleAction,
  overrides: Partial<BattleActionResult> = {},
): BattleActionResult {
  return {
    action,
    defeatedCreatureId: null,
    effects: [],
    expiredEffects: [],
    side,
    turnEnded: true,
    winner: null,
    ...overrides,
  };
}

function terminalReadyState(): BattleState {
  const state = createBattleState(deck('player'), deck('cpu'));

  return {
    ...state,
    phase: 'active',
    currentSide: 'player',
    firstSide: 'player',
    selections: {
      player: 'player-creature-1',
      cpu: 'cpu-creature-1',
    },
    participants: {
      player: {
        ...state.participants.player,
        activeCreatureId: 'player-creature-1',
      },
      cpu: {
        ...state.participants.cpu,
        activeCreatureId: 'cpu-creature-1',
        creatures: state.participants.cpu.creatures.map((creature, index) => ({
          ...creature,
          currentHp: index === 0 ? 1 : 0,
          defeated: index !== 0,
        })),
      },
    },
  };
}

function terminalActionQuery(state: BattleState) {
  return vi.fn(async (statement: string) => {
    if (
      statement === 'begin' ||
      statement === 'commit' ||
      statement === 'rollback'
    ) {
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
            turn_started_at: new Date('2026-08-16T00:03:00.000Z'),
            turn_deadline: new Date('2026-08-16T00:05:00.000Z'),
            winner: null,
            started_at: new Date('2026-08-16T00:00:00.000Z'),
            completed_at: null,
            card_names: {},
          },
        ],
      };
    }

    if (statement.includes('submitted.response')) {
      return { rows: [] };
    }

    if (statement.includes('with sequence_base as materialized')) {
      return { rows: [persistenceResult(1)] };
    }

    throw new Error(`Unexpected SQL: ${statement}`);
  });
}

function progressionMock(): ProgressionPersistence {
  return {
    recordChallengeCompletion: vi.fn(),
    recordCpuMatch: vi.fn().mockResolvedValue({
      awardId: 'a9000000-0000-4000-8000-000000000001',
      playerId: PLAYER_ID,
      pointsAwarded: 25,
      ruleCode: 'cpu_match_win',
      ruleVersion: 1,
      sourceKind: 'cpu_match',
      wasCreated: true,
    }),
    recordAsynchronousPvpCompletion: vi.fn(),
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
