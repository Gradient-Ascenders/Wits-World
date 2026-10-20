import { describe, expect, it, vi } from 'vitest';
import type { BattleState } from '@wits-world/game-rules';
import {
  createLivePvpService,
  type LivePvpDatabase,
} from '../src/matches/live-pvp-service.js';

const now = new Date('2026-10-19T12:00:00Z');
const creature = (id: string) => ({
  card: { id, affinity: 'wit' as const, maxHp: 100, maxPower: 10, moves: [] },
  currentHp: 80,
  remainingPower: 8,
  defeated: false,
  modifiers: [],
});
const participant = (side: string) => ({
  creatures: [creature(`${side}-active`), creature(`${side}-hidden`)],
  powerCards: [{ id: `${side}-power`, affinity: null, effects: [] }],
  usedPowerCardIds: [],
  activeCreatureId: `${side}-active`,
});
const state: BattleState = {
  phase: 'active',
  affinityRulesVersion: 2,
  turnNumber: 2,
  currentSide: 'player',
  replacementSide: null,
  firstSide: 'player',
  selections: { player: null, cpu: null },
  winner: null,
  participants: { player: participant('one'), cpu: participant('two') },
};

function fixture() {
  const rows = [
    {
      player_id: 'one',
      participant_side: 'player_one',
      player_name: 'Player one',
    },
    {
      player_id: 'two',
      participant_side: 'player_two',
      player_name: 'Player two',
    },
  ].map((row) => ({
    ...row,
    consecutive_timeout_count: 0,
    connection_generation: 1,
    outcome: null,
  }));
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from public.live_pvp_matches match'))
      return {
        rows: [
          {
            id: 'match',
            status: 'active',
            version: 4,
            phase: 'active',
            current_actor_player_id: 'one',
            turn_deadline: new Date(now.getTime() + 60_000),
            started_at: now,
            updated_at: now,
            completed_at: null,
            completion_reason: null,
            battle_state: state,
          },
        ],
      };
    if (sql.includes('join public.players player')) return { rows };
    if (sql.includes('from private.live_pvp_deck_snapshot_cards card'))
      return {
        rows: [
          { battle_card_id: 'one-active', name: 'Quillip', rarity: 'rare' },
          {
            battle_card_id: 'one-hidden',
            name: 'Axiomar',
            rarity: 'legendary',
          },
          { battle_card_id: 'one-power', name: 'Field Kit', rarity: 'common' },
          { battle_card_id: 'two-active', name: 'Ciphra', rarity: 'epic' },
          {
            battle_card_id: 'two-hidden',
            name: 'Hidden opponent card',
            rarity: 'legendary',
          },
          {
            battle_card_id: 'two-power',
            name: 'Hidden opponent power',
            rarity: 'rare',
          },
        ],
      };
    if (sql.includes('from private.live_pvp_connection_access\n'))
      return {
        rows: [
          {
            match_id: 'match',
            player_id: 'one',
            role: 'participant',
            participant_generation: 1,
            closed_at: null,
            close_reason: null,
          },
        ],
      };
    return { rows: [] };
  });
  const release = vi.fn();
  const database = {
    connect: async () => ({ query, release }),
    query,
  } as unknown as LivePvpDatabase;
  return { service: createLivePvpService(database), query, release };
}

describe('live card presentation projections', () => {
  it.each(['http', 'socket'] as const)(
    'preserves names and rarity for %s participants without revealing opponent reserves',
    async (transport) => {
      const { service, release } = fixture();
      const match =
        transport === 'http'
          ? await service.getProjection({ matchId: 'match', playerId: 'one' })
          : await service.getProjectionForConnection({
              accessId: 'access',
              matchId: 'match',
              playerId: 'one',
              role: 'participant',
              participantGeneration: 1,
            });
      expect(match).toMatchObject({
        self: {
          creatures: [
            { name: 'Quillip', rarity: 'rare' },
            { name: 'Axiomar', rarity: 'legendary' },
          ],
          powerCards: [{ name: 'Field Kit' }],
        },
        opponent: { activeCreature: { name: 'Ciphra', rarity: 'epic' } },
      });
      expect(JSON.stringify(match)).not.toContain('Hidden opponent');
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it('shows only revealed card presentation to spectators', async () => {
    const { service } = fixture();
    const match = await service.getProjection({
      matchId: 'match',
      playerId: 'observer',
    });
    expect(match).toMatchObject({
      playerOne: { activeCreature: { name: 'Quillip', rarity: 'rare' } },
      playerTwo: { activeCreature: { name: 'Ciphra', rarity: 'epic' } },
    });
    expect(JSON.stringify(match)).not.toMatch(
      /Axiomar|Hidden opponent|Field Kit/,
    );
  });
});
