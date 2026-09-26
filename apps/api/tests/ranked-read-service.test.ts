import { describe, expect, it } from 'vitest';

import type { RankedDatabase } from '../src/matches/ranked-database.js';
import { createRankedReadService } from '../src/matches/ranked-read-service.js';
import type { SignedCursorCodec } from '../src/security/signed-cursor.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const MATCH_ID = '20000000-0000-4000-8000-000000000001';
const SEASON_ID = '30000000-0000-4000-8000-000000000001';
const ZONE_ID = '40000000-0000-4000-8000-000000000001';

function serviceFor(row: Record<string, unknown>) {
  const database = {
    async query() {
      return { rows: [row] };
    },
  } as unknown as RankedDatabase;
  return createRankedReadService(database, {} as SignedCursorCodec);
}

function settlementRow(overrides: Record<string, unknown> = {}) {
  return {
    season_id: SEASON_ID,
    status: 'settled',
    completion_reason: 'defeat',
    outcome: 'win',
    rating_before: 1000,
    rating_after: 1018,
    applied_delta: 18,
    settled_at: new Date('2026-09-22T10:15:00.000Z'),
    territory_zone_id: ZONE_ID,
    territory_zone_name: 'East Campus',
    territory_outcome: 'accepted',
    territory_influence_points: 1,
    territory_exclusion_reason: null,
    ...overrides,
  };
}

describe('ranked settlement territory result', () => {
  it('returns the viewer-owned accepted contribution', async () => {
    const result = await serviceFor(settlementRow()).settlement(
      PLAYER_ID,
      MATCH_ID,
    );

    expect(result.territory).toEqual({
      zoneId: ZONE_ID,
      zoneName: 'East Campus',
      outcome: 'accepted',
      influencePoints: 1,
      exclusionReason: null,
    });
  });

  it('distinguishes pending and lost territory attempts', async () => {
    await expect(
      serviceFor(
        settlementRow({
          status: 'pending',
          completion_reason: null,
          outcome: null,
          rating_before: null,
          rating_after: null,
          applied_delta: null,
          settled_at: null,
          territory_outcome: null,
          territory_influence_points: null,
        }),
      ).settlement(PLAYER_ID, MATCH_ID),
    ).resolves.toMatchObject({ territory: { outcome: 'pending' } });

    await expect(
      serviceFor(
        settlementRow({
          outcome: 'loss',
          territory_outcome: null,
          territory_influence_points: null,
        }),
      ).settlement(PLAYER_ID, MATCH_ID),
    ).resolves.toMatchObject({ territory: { outcome: 'lost' } });
  });

  it('maps internal exclusion reasons to the safe player contract', async () => {
    const result = await serviceFor(
      settlementRow({
        territory_outcome: 'excluded',
        territory_influence_points: 0,
        territory_exclusion_reason: 'winner_provisional',
      }),
    ).settlement(PLAYER_ID, MATCH_ID);

    expect(result.territory).toMatchObject({
      outcome: 'excluded',
      influencePoints: 0,
      exclusionReason: 'placement_matches_remaining',
    });
  });

  it('returns no territory context for ordinary ranked play', async () => {
    const result = await serviceFor(
      settlementRow({
        territory_zone_id: null,
        territory_zone_name: null,
        territory_outcome: 'excluded',
        territory_influence_points: 0,
        territory_exclusion_reason: 'no_zone_grant',
      }),
    ).settlement(PLAYER_ID, MATCH_ID);

    expect(result.territory).toBeNull();
  });
});
