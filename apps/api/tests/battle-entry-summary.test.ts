import { describe, expect, it, vi } from 'vitest';
import {
  createCpuMatchService,
  type CpuMatchClient,
} from '../src/matches/cpu-match-service.js';

const player = 'a1000000-0000-4000-8000-000000000001';

function fixture(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  const release = vi.fn();
  const connect = vi
    .fn()
    .mockResolvedValue({ query, release } as CpuMatchClient);
  return {
    service: createCpuMatchService({ connect }),
    query,
    release,
    connect,
  };
}

describe('compact CPU landing reads', () => {
  it('reads only selected deck identity/name in the same statement as active state', async () => {
    const f = fixture([
      { id: null, deck_id: player, deck_name: 'Campus Five' },
    ]);
    expect(await f.service.getBattleEntrySummary(player)).toEqual({
      activeMatch: null,
      selectedDeck: { deckId: player, name: 'Campus Five' },
    });
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls[0]![1]).toEqual([player]);
    expect(f.query.mock.calls[0]![0]).toContain(
      'deck.player_id = viewer.player_id',
    );
    expect(f.query.mock.calls[0]![0]).not.toContain('player_deck_cards');
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('retains the active-match invariant and releases on query/shape failures', async () => {
    const f = fixture([{}, {}]);
    await expect(f.service.getBattleEntrySummary(player)).rejects.toThrow(
      'invariant',
    );
    f.query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(f.service.listHistorySummaries(player, 5)).rejects.toThrow(
      'database unavailable',
    );
    expect(f.release).toHaveBeenCalledTimes(2);
  });

  it('returns compact counts without reconstructing any rounds, actions or state', async () => {
    const date = new Date('2026-10-08T12:00:00Z');
    const f = fixture([
      {
        id: player,
        winner: 'player',
        started_at: date,
        completed_at: date,
        round_count: 20,
      },
    ]);
    expect(await f.service.listHistorySummaries(player, 5)).toEqual([
      {
        matchId: player,
        status: 'completed',
        winner: 'player',
        startedAt: date.toISOString(),
        completedAt: date.toISOString(),
        roundCount: 20,
      },
    ]);
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls[0]![1]).toEqual([player, 5]);
    expect(f.query.mock.calls[0]![0]).not.toContain('cpu_match_actions');
    expect(f.query.mock.calls[0]![0]).not.toContain('state_after');
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it.each([0, 21, 1.5, NaN])(
    'rejects an unsafe bound before checkout: %s',
    async (limit) => {
      const f = fixture([]);
      await expect(
        f.service.listHistorySummaries(player, limit),
      ).rejects.toThrow(RangeError);
      expect(f.connect).not.toHaveBeenCalled();
    },
  );
});
