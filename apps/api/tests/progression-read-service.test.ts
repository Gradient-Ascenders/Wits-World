import { describe, expect, it, vi } from 'vitest';

import {
  createProgressionReadService,
  ProgressionProfileUnavailableError,
} from '../src/progression/progression-read-service.js';

const PLAYER_ID = '17200000-0000-4000-8000-000000000001';

describe('progression read service', () => {
  it('returns the current private profile without source history', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          player_name: 'campus-explorer',
          total_points: 75,
          standing_rank: 4,
          current_streak: 2,
          longest_streak: 3,
          achievements: [
            {
              code: 'first_quiz',
              title: 'First Quiz',
              description: 'Complete your first event quiz.',
              earned: true,
              progress: 2,
              target: 1,
            },
          ],
        },
      ],
    });
    const service = createProgressionReadService({ query });

    await expect(service.getCurrentProfile(PLAYER_ID)).resolves.toEqual({
      playerName: 'campus-explorer',
      points: 75,
      rank: 4,
      currentStreak: 2,
      longestStreak: 3,
      achievements: [
        {
          code: 'first_quiz',
          title: 'First Quiz',
          description: 'Complete your first event quiz.',
          earned: true,
          progress: 2,
          target: 1,
        },
      ],
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('public.player_progression_all_time_standings'),
      [PLAYER_ID],
    );
    expect(String(query.mock.calls[0]?.[0])).not.toContain('auth_subject');
    expect(String(query.mock.calls[0]?.[0])).not.toContain('location');
  });

  it('fails closed when the authenticated player leaves live standings', async () => {
    const service = createProgressionReadService({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(service.getCurrentProfile(PLAYER_ID)).rejects.toBeInstanceOf(
      ProgressionProfileUnavailableError,
    );
  });

  it('returns a deterministic all-time page and current rank outside it', async () => {
    const currentPlayer = entry('current-player', 25, 8, true);
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          entries: [entry('alpha', 100, 1), entry('beta', 90, 2)],
          current_player: currentPlayer,
          total_players: 21,
        },
      ],
    });
    const service = createProgressionReadService({ query });

    await expect(
      service.listStandings({
        playerId: PLAYER_ID,
        period: 'all_time',
        page: 1,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      period: 'all_time',
      month: null,
      entries: [entry('alpha', 100, 1), entry('beta', 90, 2)],
      currentPlayer,
      pagination: {
        page: 1,
        pageSize: 10,
        totalPlayers: 21,
        totalPages: 3,
      },
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'from public.player_progression_all_time_standings',
      ),
      [PLAYER_ID, 10, 0],
    );
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'player_name asc nulls last',
    );
  });

  it('queries a Johannesburg calendar month with the requested offset', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          entries: [],
          current_player: entry('current-player', 0, 3, true),
          total_players: 3,
        },
      ],
    });
    const service = createProgressionReadService({ query });

    const result = await service.listStandings({
      playerId: PLAYER_ID,
      period: 'monthly',
      month: '2026-08',
      page: 2,
      pageSize: 2,
    });

    expect(result.month).toBe('2026-08');
    expect(result.entries).toEqual([]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('player_progression_monthly_standings'),
      [PLAYER_ID, 2, 2, '2026-08'],
    );
  });

  it('defensively rejects invalid service inputs', async () => {
    const query = vi.fn();
    const service = createProgressionReadService({ query });

    await expect(
      service.listStandings({
        playerId: PLAYER_ID,
        period: 'monthly',
        month: '0000-08',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow('require a valid month');
    await expect(
      service.listStandings({
        playerId: PLAYER_ID,
        period: 'monthly',
        month: '2026-13',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow('require a valid month');
    await expect(
      service.listStandings({
        playerId: PLAYER_ID,
        period: 'all_time',
        month: '2026-08',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow('do not accept a month');
    await expect(
      service.listStandings({
        playerId: PLAYER_ID,
        period: 'all_time',
        page: 10_001,
        pageSize: 20,
      }),
    ).rejects.toThrow('pagination is invalid');
    await expect(
      service.listStandings({
        playerId: PLAYER_ID,
        period: 'all_time',
        page: 1,
        pageSize: 101,
      }),
    ).rejects.toThrow('pagination is invalid');
    expect(query).not.toHaveBeenCalled();
  });
});

function entry(
  playerName: string | null,
  points: number,
  rank: number,
  isCurrentPlayer = false,
) {
  return {
    playerName,
    points,
    rank,
    currentStreak: 1,
    longestStreak: 2,
    isCurrentPlayer,
  };
}
