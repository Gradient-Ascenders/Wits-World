import { describe, expect, it } from 'vitest';

import {
  planPlacement,
  sitePairKey,
  validatePlacementEntries,
  type PlacementInput,
} from '../src/placement/placement-planner.js';

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

function fixture(): PlacementInput {
  const zoneIds = ids('zone', 3);
  const siteIds = ids('site', 9);
  const eventIds = ids('event', 9);
  const siteDistances: Record<string, number> = {};
  for (const left of siteIds)
    for (const right of siteIds) {
      if (left !== right) siteDistances[sitePairKey(left, right)] = 500;
    }
  return {
    policy: {
      id: 'placement-v1',
      target: 6,
      preferredPerZone: 2,
      mandatoryPerZone: 1,
      separationMetres: 150,
      replacements: 2,
      cooldownBuckets: 2,
    },
    zones: zoneIds.map((id) => ({ id, key: id })),
    sites: siteIds.map((id, index) => ({
      id,
      zoneId: zoneIds[Math.floor(index / 3)]!,
      maximumRadiusMetres: 60,
      lastEndedAt: null,
      lifetimeCount: 0,
      coolingDown: false,
    })),
    events: eventIds.map((id) => ({
      id,
      radiusMetres: 50,
      lastEndedAt: null,
      lifetimeCount: 0,
    })),
    current: [],
    pins: [],
    excludedSiteIds: [],
    siteDistances,
    fixedDistances: {},
  };
}

function twoZoneSeparationFixture(): PlacementInput {
  const input = fixture();
  input.policy = {
    ...input.policy,
    target: 2,
    preferredPerZone: 1,
    replacements: 0,
  };
  input.zones = input.zones.slice(0, 2);
  input.sites = [
    { ...input.sites[0]!, id: 'A1', zoneId: 'zone1' },
    { ...input.sites[1]!, id: 'A2', zoneId: 'zone1' },
    { ...input.sites[3]!, id: 'B1', zoneId: 'zone2' },
  ];
  input.events = input.events.slice(0, 2);
  input.siteDistances = {
    [sitePairKey('A1', 'A2')]: 100,
    [sitePairKey('A1', 'B1')]: 100,
    [sitePairKey('A2', 'B1')]: 200,
  };
  return input;
}

describe('automatic placement planner', () => {
  it('fills six slots with two per zone deterministically under shuffled rows', () => {
    const input = fixture();
    const first = planPlacement(input);
    const shuffled = planPlacement({
      ...input,
      zones: [...input.zones].reverse(),
      sites: [...input.sites].reverse(),
      events: [...input.events].reverse(),
    });
    expect(first.status).toBe('valid');
    expect(Object.values(first.zoneCounts)).toEqual([2, 2, 2]);
    expect(shuffled).toEqual(first);
  });

  it('accepts the exact separation boundary and rejects a closer site', () => {
    const input = fixture();
    const pair = sitePairKey('site1', 'site4');
    input.siteDistances[pair] = 150;
    expect(
      validatePlacementEntries(input, [
        {
          eventId: 'event1',
          siteId: 'site1',
          zoneId: 'zone1',
          origin: 'automatic',
          preserved: false,
        },
        {
          eventId: 'event2',
          siteId: 'site4',
          zoneId: 'zone2',
          origin: 'automatic',
          preserved: false,
        },
      ]).exceptions,
    ).not.toContain('invalid_rollback_assignment');
    input.siteDistances[pair] = 149.999;
    expect(
      validatePlacementEntries(input, [
        {
          eventId: 'event1',
          siteId: 'site1',
          zoneId: 'zone1',
          origin: 'automatic',
          preserved: false,
        },
        {
          eventId: 'event2',
          siteId: 'site4',
          zoneId: 'zone2',
          origin: 'automatic',
          preserved: false,
        },
      ]).exceptions,
    ).toContain('invalid_rollback_assignment');
  });

  it('revisits ranked site choices to serve every feasible zone', () => {
    const input = twoZoneSeparationFixture();

    const result = planPlacement(input);
    expect(result.status).toBe('valid');
    expect(result.entries.map((entry) => entry.siteId)).toEqual(['A2', 'B1']);
    expect(result.zoneCounts).toEqual({ zone1: 1, zone2: 1 });
    expect(
      planPlacement({
        ...input,
        zones: [...input.zones].reverse(),
        sites: [...input.sites].reverse(),
        events: [...input.events].reverse(),
      }),
    ).toEqual(result);
  });

  it('replaces a blocking current assignment when the rotation budget allows it', () => {
    const input = twoZoneSeparationFixture();
    input.policy.replacements = 1;
    input.current = [
      {
        eventId: 'event1',
        siteId: 'A1',
        zoneId: 'zone1',
        origin: 'automatic',
        preserved: true,
        startedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const result = planPlacement(input);
    expect(result.status).toBe('valid');
    expect(result.entries.map((entry) => entry.siteId)).toEqual(['A2', 'B1']);
    expect(result.entries.every((entry) => !entry.preserved)).toBe(true);
  });

  it('tries an older current assignment when the newest one blocks a zone', () => {
    const input = twoZoneSeparationFixture();
    input.policy.replacements = 1;
    input.events = fixture().events.slice(0, 3);
    input.siteDistances[sitePairKey('A1', 'A2')] = 200;
    input.current = [
      {
        eventId: 'event1',
        siteId: 'A1',
        zoneId: 'zone1',
        origin: 'automatic',
        preserved: true,
        startedAt: '2026-09-02T00:00:00.000Z',
      },
      {
        eventId: 'event2',
        siteId: 'A2',
        zoneId: 'zone1',
        origin: 'automatic',
        preserved: true,
        startedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const result = planPlacement(input);
    expect(result.status).toBe('valid');
    expect(result.entries).toContainEqual(
      expect.objectContaining({ siteId: 'A2', preserved: true }),
    );
    expect(result.entries.some((entry) => entry.siteId === 'A1')).toBe(false);
    expect(result.zoneCounts).toEqual({ zone1: 1, zone2: 1 });
  });

  it('revisits ranked event choices when a later zone needs a smaller radius', () => {
    const input = twoZoneSeparationFixture();
    input.sites = [
      { ...input.sites[0]!, id: 'A1' },
      { ...input.sites[2]!, id: 'B1', maximumRadiusMetres: 50 },
    ];
    input.siteDistances = { [sitePairKey('A1', 'B1')]: 200 };
    input.events[1]!.radiusMetres = 60;

    const result = planPlacement(input);
    expect(result.status).toBe('valid');
    expect(
      result.entries.map(({ eventId, siteId }) => [eventId, siteId]),
    ).toEqual([
      ['event2', 'A1'],
      ['event1', 'B1'],
    ]);
  });

  it('uses fixed-event radius and reserves pinned slots', () => {
    const input = fixture();
    input.fixedDistances.site1 = [{ distanceMetres: 170, radiusMetres: 130 }];
    input.pins = [{ eventId: 'event1', siteId: 'site4' }];
    const result = planPlacement(input);
    expect(result.entries).toContainEqual(
      expect.objectContaining({
        eventId: 'event1',
        siteId: 'site4',
        origin: 'pin',
      }),
    );
    expect(result.entries.some((entry) => entry.siteId === 'site1')).toBe(
      false,
    );
    expect(result.entries).toHaveLength(6);
  });

  it('reports an unserved zone instead of applying an invalid plan', () => {
    const input = fixture();
    input.excludedSiteIds = ['site7', 'site8', 'site9'];
    const result = planPlacement(input);
    expect(result.status).toBe('unserved');
    expect(result.exceptions).toContain('unserved_zone');
    expect(result.validation.coverage).toContainEqual({
      actual: 0,
      mandatory: 1,
      preferred: 2,
      status: 'unserved',
      zoneId: 'zone3',
    });
  });

  it('explains candidate sites blocked by authoritative separation rules', () => {
    const input = twoZoneSeparationFixture();
    input.policy.target = 3;
    input.policy.preferredPerZone = 2;
    input.events = fixture().events.slice(0, 3);

    const result = planPlacement(input);

    expect(result.status).toBe('degraded');
    expect(result.validation.separation).toMatchObject({
      minimumMetres: 150,
      blockedSites: expect.arrayContaining([
        expect.objectContaining({
          conflictsWithFixedEvent: false,
          relatedSiteIds: ['A2'],
          siteId: 'A1',
          zoneId: 'zone1',
        }),
      ]),
    });
  });

  it('does not treat a fully suspended catalogue as a successful empty plan', () => {
    const input = fixture();
    input.zones = [];
    expect(planPlacement(input)).toMatchObject({
      status: 'unserved',
      exceptions: ['no_active_zones'],
    });
  });

  it('rejects an invalid pin and never uses radius-incompatible sites', () => {
    const input = fixture();
    input.events[0]!.radiusMetres = 70;
    input.pins = [{ eventId: 'event1', siteId: 'site1' }];
    expect(planPlacement(input).exceptions).toContain('invalid_pin');
  });
});
