import { describe, expect, it, vi } from 'vitest';

import {
  createTerritoryQueueGrant,
  type TerritoryQueryable,
} from '../src/territory/territory-grants.js';

const QUEUE_ID = '10000000-0000-4000-8000-000000000001';
const SEASON_ID = '20000000-0000-4000-8000-000000000001';
const PLAYER_ID = '30000000-0000-4000-8000-000000000001';
const ZONE_ID = '40000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-22T10:00:00.000Z');

function createQueryable(query: ReturnType<typeof vi.fn>): TerritoryQueryable {
  return { query } as unknown as TerritoryQueryable;
}

describe('territory-v1 location grants', () => {
  it('persists only coarse grant evidence after a strict PostGIS decision', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ maximum_claim_age_ms: 120_000, grant_lifetime_ms: 300_000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            requested_zone_active: true,
            point_inside_requested: true,
            envelope_inside_requested: true,
            envelope_intersects_other: false,
            point_active_zone_count: 1,
            zone_lifecycle_version: 3,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '50000000-0000-4000-8000-000000000001',
            queue_entry_id: QUEUE_ID,
            ranked_season_id: SEASON_ID,
            player_id: PLAYER_ID,
            zone_id: ZONE_ID,
            territory_policy_version: 'territory-v1',
            zone_lifecycle_version: 3,
            device_acquired_at: new Date('2026-09-22T09:59:30.000Z'),
            issued_at: NOW,
            expires_at: new Date('2026-09-22T10:05:00.000Z'),
            used_at: null,
            used_match_id: null,
          },
        ],
      });

    await createTerritoryQueueGrant(createQueryable(query), {
      queueEntryId: QUEUE_ID,
      seasonId: SEASON_ID,
      playerId: PLAYER_ID,
      claim: {
        zoneId: ZONE_ID,
        latitude: -26.191,
        longitude: 28.0305,
        accuracyMetres: 8,
        acquiredAt: '2026-09-22T09:59:30.000Z',
      },
      now: NOW,
    });

    const [evaluationSql, evaluationValues] = query.mock.calls[1] ?? [];
    expect(String(evaluationSql)).toContain('st_containsproperly');
    expect(String(evaluationSql)).toContain('st_intersects');
    expect(evaluationValues).toContain(-26.191);
    expect(evaluationValues).toContain(28.0305);
    expect(evaluationValues).toContain(8);

    const [insertSql, insertValues] = query.mock.calls[2] ?? [];
    expect(String(insertSql)).toContain('private.territory_zone_grants');
    expect(String(insertSql)).not.toMatch(/latitude|longitude|accuracy/i);
    expect(insertValues).not.toContain(-26.191);
    expect(insertValues).not.toContain(28.0305);
    expect(insertValues).not.toContain(8);
  });

  it('uses the neutral refresh path for stale claims before spatial evaluation', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ maximum_claim_age_ms: 120_000, grant_lifetime_ms: 300_000 }],
    });

    await expect(
      createTerritoryQueueGrant(createQueryable(query), {
        queueEntryId: QUEUE_ID,
        seasonId: SEASON_ID,
        playerId: PLAYER_ID,
        claim: {
          zoneId: ZONE_ID,
          latitude: -26.191,
          longitude: 28.0305,
          accuracyMetres: 8,
          acquiredAt: '2026-09-22T09:57:59.999Z',
        },
        now: NOW,
      }),
    ).rejects.toMatchObject({
      code: 'TERRITORY_LOCATION_REFRESH_REQUIRED',
      statusCode: 409,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns a neutral refresh when the accuracy envelope reaches another zone', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ maximum_claim_age_ms: 120_000, grant_lifetime_ms: 300_000 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            requested_zone_active: true,
            point_inside_requested: true,
            envelope_inside_requested: true,
            envelope_intersects_other: true,
            point_active_zone_count: 1,
            zone_lifecycle_version: 3,
          },
        ],
      });

    await expect(
      createTerritoryQueueGrant(createQueryable(query), {
        queueEntryId: QUEUE_ID,
        seasonId: SEASON_ID,
        playerId: PLAYER_ID,
        claim: {
          zoneId: ZONE_ID,
          latitude: -26.191,
          longitude: 28.0305,
          accuracyMetres: 20,
          acquiredAt: '2026-09-22T09:59:30.000Z',
        },
        now: NOW,
      }),
    ).rejects.toMatchObject({
      code: 'TERRITORY_LOCATION_REFRESH_REQUIRED',
      statusCode: 409,
    });
  });
});
