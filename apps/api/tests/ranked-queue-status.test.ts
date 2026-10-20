import { describe, expect, it, vi } from 'vitest';

import type { RankedDatabase } from '../src/matches/ranked-database.js';
import { createRankedService } from '../src/matches/ranked-service.js';

describe('ranked lobby queue status', () => {
  it.each(['completed', null] as const)(
    'returns idle when the latest matched queue points to a %s battle',
    async (matchStatus) => {
      const { service, release } = matchedQueue(matchStatus);

      expect(await service.status('player')).toEqual({
        status: 'idle',
        queueEntryId: null,
        seasonId: null,
        joinedAt: null,
        leaseExpiresAt: null,
        searchRange: null,
        proposalId: null,
        acceptanceDeadline: null,
        accepted: false,
        matchId: null,
      });
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it('continues to resume an active battle', async () => {
    const { service } = matchedQueue('active');

    expect(await service.status('player')).toMatchObject({
      status: 'matched',
      queueEntryId: 'queue',
      matchId: 'match',
    });
  });
});

function matchedQueue(matchStatus: 'active' | 'completed' | null) {
  const now = new Date('2026-10-19T20:00:00.000Z');
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ now }] })
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'queue',
          season_id: 'season',
          status: 'matched',
          original_joined_at: now,
          match_id: 'match',
          match_status: matchStatus,
        },
      ],
    });
  const release = vi.fn();
  const database = {
    connect: async () => ({ query, release }),
  } as unknown as RankedDatabase;
  const restrictions = {
    activeRestriction: vi.fn(async () => null),
    assertAllowed: vi.fn(async () => {}),
  };
  return { service: createRankedService(database, restrictions), release };
}
