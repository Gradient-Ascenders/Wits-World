import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createPlayerTrailService,
  InvalidNearbyUnvisitedSearchError,
  NEARBY_UNVISITED_QUERY,
  type PlayerTrailDatabase,
} from '../src/trails/player-trail-service.js';

const PLAYER_ID = '17660000-0000-4000-8000-000000000001';
const TRAIL_ID = '17670000-0000-4000-8000-000000000001';
const NOW = new Date('2026-08-29T10:00:00.000Z');

describe('player trail service', () => {
  it('does not advance past a missing prefix completion', async () => {
    const rows = [
      trailRow(1, null),
      trailRow(2, new Date('2026-08-29T09:30:00.000Z')),
      trailRow(3, null),
    ];
    const fixture = createFixture(rows);
    const service = createPlayerTrailService(fixture.database, {
      clock: () => NOW,
    });

    const trail = await service.getTrail(PLAYER_ID, TRAIL_ID);

    expect(trail).toMatchObject({
      completedStepCount: 0,
      currentStepPosition: 1,
      progressStatus: 'in_progress',
    });
    expect(trail.steps.map((step) => step.state)).toEqual([
      'current',
      'locked',
      'locked',
    ]);
    expect(trail.steps[1]?.completedAt).toBeNull();
  });

  it('automatically incorporates an earlier out-of-order completion once the prefix closes', async () => {
    const fixture = createFixture([
      trailRow(1, new Date('2026-08-29T09:45:00.000Z')),
      trailRow(2, new Date('2026-08-29T09:30:00.000Z')),
      trailRow(3, null),
    ]);
    const service = createPlayerTrailService(fixture.database, {
      clock: () => NOW,
    });

    const trail = await service.getTrail(PLAYER_ID, TRAIL_ID);

    expect(trail.completedStepCount).toBe(2);
    expect(trail.currentStepPosition).toBe(3);
    expect(trail.steps.map((step) => step.state)).toEqual([
      'completed',
      'completed',
      'current',
    ]);
  });

  it('preserves completed history and makes remaining retired steps unavailable', async () => {
    const fixture = createFixture([
      {
        ...trailRow(1, new Date('2026-08-29T09:00:00.000Z')),
        trail_status: 'retired',
      },
      { ...trailRow(2, null), trail_status: 'retired' },
      { ...trailRow(3, null), trail_status: 'retired' },
    ]);
    const service = createPlayerTrailService(fixture.database, {
      clock: () => NOW,
    });

    const trail = await service.getTrail(PLAYER_ID, TRAIL_ID);

    expect(trail).toMatchObject({
      publicationStatus: 'retired',
      progressStatus: 'retired',
      completedStepCount: 1,
      currentStepPosition: 2,
    });
    expect(trail.steps.map((step) => step.state)).toEqual([
      'completed',
      'unavailable',
      'unavailable',
    ]);
    expect(trail.steps[1]?.unavailableReason).toBe('trail_retired');
  });

  it('reports unavailable current steps without unlocking later steps', async () => {
    const fixture = createFixture([
      trailRow(1, new Date('2026-08-29T09:00:00.000Z')),
      {
        ...trailRow(2, null),
        starts_at: new Date('2026-08-30T08:00:00.000Z'),
        ends_at: new Date('2026-08-30T12:00:00.000Z'),
      },
      trailRow(3, null),
    ]);
    const service = createPlayerTrailService(fixture.database, {
      clock: () => NOW,
    });

    const trail = await service.getTrail(PLAYER_ID, TRAIL_ID);

    expect(trail.steps[1]).toMatchObject({
      state: 'unavailable',
      unavailableReason: 'upcoming',
    });
    expect(trail.steps[2]?.state).toBe('locked');
  });

  it('groups one nearby event under every trail where it is current', async () => {
    const eventId = '17680000-0000-4000-8000-000000000001';
    const nearbyRows = [
      nearbyRow(eventId, TRAIL_ID, 'East Campus Heritage'),
      nearbyRow(
        eventId,
        '17670000-0000-4000-8000-000000000002',
        'Museum Route',
      ),
    ];
    const fixture = createFixture(nearbyRows);
    const service = createPlayerTrailService(fixture.database, {
      clock: () => NOW,
    });

    const events = await service.listNearbyUnvisited({
      playerId: PLAYER_ID,
      latitude: -26.19205,
      longitude: 28.03038,
      accuracyMetres: 20,
      maxDistanceMetres: 1_000,
      limit: 20,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.trailContexts).toHaveLength(2);
    expect(fixture.query).toHaveBeenCalledWith(NEARBY_UNVISITED_QUERY, [
      PLAYER_ID,
      NOW,
      28.03038,
      -26.19205,
      1_000,
      20,
    ]);
  });

  it('rejects invalid location and search bounds before querying', async () => {
    const fixture = createFixture([]);
    const service = createPlayerTrailService(fixture.database);

    await expect(
      service.listNearbyUnvisited({
        playerId: PLAYER_ID,
        latitude: 91,
        longitude: 28.03038,
        accuracyMetres: 20,
        maxDistanceMetres: 1_000,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(InvalidNearbyUnvisitedSearchError);

    expect(fixture.query).not.toHaveBeenCalled();
  });

  it('uses server-side completion, ordering, and PostGIS filters', () => {
    expect(NEARBY_UNVISITED_QUERY).toContain('completion.player_id = $1::uuid');
    expect(NEARBY_UNVISITED_QUERY).toContain(
      'min(position) filter (where is_completed = false)',
    );
    expect(NEARBY_UNVISITED_QUERY).toContain('st_dwithin');
    expect(NEARBY_UNVISITED_QUERY).toContain('event.is_published = true');
    expect(NEARBY_UNVISITED_QUERY).toContain('resolve_event_availability');
    expect(NEARBY_UNVISITED_QUERY).toContain('resolve_trail_availability');
    expect(NEARBY_UNVISITED_QUERY).not.toContain('eligible = true');
  });
});

function trailRow(position: number, completedAt: Date | null) {
  return {
    trail_id: TRAIL_ID,
    trail_title: 'East Campus Heritage',
    trail_description: null,
    trail_status: 'published',
    trail_availability: 'active',
    trail_starts_at: null,
    trail_ends_at: null,
    position,
    event_id: `17680000-0000-4000-8000-${position
      .toString()
      .padStart(12, '0')}`,
    event_title: `Trail event ${position}`,
    event_description: null,
    latitude: -26.19205,
    longitude: 28.03038,
    radius_metres: 75,
    starts_at: new Date('2026-08-29T08:00:00.000Z'),
    ends_at: new Date('2026-08-29T12:00:00.000Z'),
    event_is_published: true,
    event_retired_at: null,
    event_availability: 'active',
    completed_at: completedAt,
  };
}

function nearbyRow(eventId: string, trailId: string, trailTitle: string) {
  return {
    event_id: eventId,
    title: 'Origins Centre',
    description: null,
    latitude: -26.1901,
    longitude: 28.0288,
    radius_metres: 75,
    starts_at: new Date('2026-08-29T08:00:00.000Z'),
    ends_at: new Date('2026-08-29T12:00:00.000Z'),
    distance_metres: 123.5,
    trail_id: trailId,
    trail_title: trailTitle,
    trail_position: 2,
    trail_total_steps: 3,
  };
}

function createFixture(rows: pg.QueryResultRow[]) {
  const query = vi.fn(
    async (
      statement: string,
      values?: unknown[],
    ): Promise<{ rows: pg.QueryResultRow[] }> => {
      void statement;
      void values;
      return { rows };
    },
  );
  const database: PlayerTrailDatabase = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ) {
      const result = await query(statement, values);
      return { rows: result.rows as T[] };
    },
  };

  return { database, query };
}
