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
    const query = vi.fn(async (statement: string) => {
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
    const query = vi.fn(async (statement: string) => {
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

      if (statement.includes('submission_id =')) {
        return { rows: [] };
      }

      if (statement.includes('insert into public.cpu_match_rounds')) {
        return {
          rows: [{ id: 'a3000000-0000-4000-8000-000000000001' }],
        };
      }

      if (statement.includes('select count(*)::text')) {
        return { rows: [{ count: '0' }] };
      }

      if (statement.includes('insert into public.cpu_match_actions')) {
        return {
          rows: [{ id: 'a4000000-0000-4000-8000-000000000001' }],
        };
      }

      if (
        statement.includes('update public.cpu_match_actions') ||
        statement.includes('update public.cpu_matches')
      ) {
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
    expect(
      query.mock.calls.filter(([statement]) =>
        statement.includes('insert into public.cpu_match_actions'),
      ),
    ).toHaveLength(2);
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
