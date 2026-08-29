import { describe, expect, it, vi } from 'vitest';

import {
  createEventEligibilityService,
  type EventEligibilityQueryable,
  InvalidEventCoordinatesError,
} from '../src/events/event-eligibility.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const EVALUATED_AT = new Date('2026-08-10T12:00:00.000Z');

describe('event eligibility service', () => {
  it('returns an eligible distance result from PostGIS', async () => {
    const query = createQuery([
      {
        availability: 'available',
        distance_metres: 25.5,
        event_id: EVENT_ID,
        radius_metres: 75,
        within_radius: true,
      },
    ]);
    const service = createService(query);

    await expect(service.evaluate(validInput())).resolves.toEqual({
      outcome: 'evaluated',
      eventId: EVENT_ID,
      eligible: true,
      distanceMetres: 25.5,
      radiusMetres: 75,
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('st_distance'), [
      EVENT_ID,
      28.03038,
      -26.19205,
      EVALUATED_AT,
    ]);
    expect(query.mock.calls[0]?.[0]).toContain('st_dwithin');
    expect(query.mock.calls[0]?.[0]).toContain('resolve_event_availability');
    expect(query.mock.calls[0]?.[0]).not.toContain(EVENT_ID);
  });

  it('uses the PostGIS radius result for an ineligible location', async () => {
    const query = createQuery([
      {
        availability: 'available',
        distance_metres: 125,
        event_id: EVENT_ID,
        radius_metres: 75,
        within_radius: false,
      },
    ]);

    await expect(
      createService(query).evaluate(validInput()),
    ).resolves.toMatchObject({
      outcome: 'evaluated',
      eligible: false,
      distanceMetres: 125,
      radiusMetres: 75,
    });
  });

  it.each(['unpublished', 'not_started', 'ended'] as const)(
    'returns an unavailable result for an %s event',
    async (reason) => {
      const query = createQuery([
        {
          availability: reason,
          distance_metres: null,
          event_id: EVENT_ID,
          radius_metres: 75,
          within_radius: null,
        },
      ]);

      await expect(
        createService(query).evaluate(validInput()),
      ).resolves.toEqual({
        outcome: 'unavailable',
        eventId: EVENT_ID,
        reason,
      });
    },
  );

  it('returns not found when the event does not exist', async () => {
    const query = createQuery([]);

    await expect(createService(query).evaluate(validInput())).resolves.toEqual({
      outcome: 'not_found',
      eventId: EVENT_ID,
    });
  });

  it.each([
    ['latitude', Number.NaN],
    ['latitude', Number.POSITIVE_INFINITY],
    ['latitude', -90.1],
    ['latitude', 90.1],
    ['longitude', Number.NaN],
    ['longitude', Number.NEGATIVE_INFINITY],
    ['longitude', -180.1],
    ['longitude', 180.1],
  ] as const)('rejects an invalid %s before querying', async (field, value) => {
    const query = createQuery([]);
    const input = {
      ...validInput(),
      [field]: value,
    };

    await expect(createService(query).evaluate(input)).rejects.toMatchObject({
      field,
      name: InvalidEventCoordinatesError.name,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ])('accepts coordinate boundaries', async (coordinates) => {
    const query = createQuery([]);

    await expect(
      createService(query).evaluate({
        ...validInput(),
        ...coordinates,
      }),
    ).resolves.toMatchObject({ outcome: 'not_found' });
    expect(query).toHaveBeenCalledOnce();
  });
});

function validInput() {
  return {
    eventId: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
  };
}

function createQuery(rows: Record<string, unknown>[]) {
  return vi.fn().mockResolvedValue({ rows });
}

function createService(query: ReturnType<typeof createQuery>) {
  return createEventEligibilityService(
    { query } as unknown as EventEligibilityQueryable,
    { clock: () => EVALUATED_AT },
  );
}
