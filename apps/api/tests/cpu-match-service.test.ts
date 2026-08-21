import { describe, expect, it, vi } from 'vitest';

import {
  createBattleState,
  type BattleCreatureCard,
  type BattleDeck,
  type BattlePowerCard,
} from '@wits-world/game-rules';

import {
  createCpuMatchService,
  CpuMatchDeckError,
  CpuMatchVersionConflictError,
  type CpuMatchClient,
  type CpuMatchDatabase,
} from '../src/matches/cpu-match-service.js';

const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const MATCH_ID = 'a2000000-0000-4000-8000-000000000001';

describe('CPU match service', () => {
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
        deckId: 'a6000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBe(databaseError);
    expect(databaseError).not.toBeInstanceOf(CpuMatchDeckError);
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
    const service = createCpuMatchService(database, {
      clock: { now: () => new Date('2026-08-16T00:00:01.000Z') },
      randomInt: () => 0,
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
      cpu: 'cpu-creature-1',
    });
    expect(response.state.currentSide).toBe('player');
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
    moves: [
      {
        id: `${prefix}-move-${index}`,
        name: 'Strike',
        moveType: 'basic',
        powerCost: 0,
        effects: [
          {
            id: `${prefix}-effect-${index}`,
            effectType: 'damage',
            effectValue: 1,
          },
        ],
      },
    ],
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
