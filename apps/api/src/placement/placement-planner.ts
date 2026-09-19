export interface PlacementPolicy {
  id: string;
  target: number;
  preferredPerZone: number;
  mandatoryPerZone: number;
  separationMetres: number;
  replacements: number;
  cooldownBuckets: number;
}

export interface PlacementZone {
  id: string;
  key: string;
}

export interface PlacementSite {
  id: string;
  zoneId: string;
  maximumRadiusMetres: number;
  lastEndedAt: string | null;
  lifetimeCount: number;
  coolingDown: boolean;
}

export interface PortableEvent {
  id: string;
  radiusMetres: number;
  lastEndedAt: string | null;
  lifetimeCount: number;
}

export interface PlacementEntry {
  eventId: string;
  siteId: string;
  zoneId: string;
  origin: 'automatic' | 'pin' | 'rollback';
  preserved: boolean;
  startedAt?: string;
  cooldownException?: boolean;
}

export interface PlacementInput {
  policy: PlacementPolicy;
  zones: PlacementZone[];
  sites: PlacementSite[];
  events: PortableEvent[];
  current: PlacementEntry[];
  pins: Array<{ eventId: string; siteId: string }>;
  excludedSiteIds: string[];
  /** PostGIS distances keyed by the two site IDs in ascending order. */
  siteDistances: Record<string, number>;
  /** PostGIS distance and radius for each live fixed event at each site. */
  fixedDistances: Record<
    string,
    Array<{ distanceMetres: number; radiusMetres: number }>
  >;
}

export interface PlacementResult {
  entries: PlacementEntry[];
  zoneCounts: Record<string, number>;
  status: 'valid' | 'degraded' | 'unserved';
  exceptions: string[];
}

export function sitePairKey(left: string, right: string): string {
  return [left, right].sort(compareId).join(':');
}

export function planPlacement(input: PlacementInput): PlacementResult {
  const { policy } = input;
  const zones = [...input.zones].sort((a, b) => compareId(a.id, b.id));
  if (zones.length === 0) {
    return {
      entries: [],
      zoneCounts: {},
      status: 'unserved',
      exceptions: ['no_active_zones'],
    };
  }
  const sites = new Map(input.sites.map((site) => [site.id, site]));
  const events = new Map(input.events.map((event) => [event.id, event]));
  const excluded = new Set(input.excludedSiteIds);
  const current = input.current.filter((entry) =>
    canPlace(entry.eventId, entry.siteId, [], input, sites, events, excluded),
  );
  const pins: PlacementEntry[] = [];

  for (const pin of [...input.pins].sort(
    (a, b) => compareId(a.eventId, b.eventId) || compareId(a.siteId, b.siteId),
  )) {
    if (
      !canPlace(pin.eventId, pin.siteId, pins, input, sites, events, excluded)
    ) {
      return finish([], zones, policy, ['invalid_pin']);
    }
    const site = sites.get(pin.siteId)!;
    const previous = current.find(
      (entry) => entry.eventId === pin.eventId && entry.siteId === pin.siteId,
    );
    if (site.coolingDown && !previous) {
      return finish([], zones, policy, ['pin_site_in_cooldown']);
    }
    pins.push({
      eventId: pin.eventId,
      siteId: pin.siteId,
      zoneId: site.zoneId,
      origin: 'pin',
      preserved: Boolean(previous),
      ...(previous?.startedAt ? { startedAt: previous.startedAt } : {}),
    });
  }

  if (pins.length > policy.target) {
    return finish([], zones, policy, ['too_many_pins']);
  }

  const unpinned = current
    .filter((entry) => !pins.some((pin) => pin.eventId === entry.eventId))
    .sort(
      (a, b) =>
        compareId(b.startedAt ?? '', a.startedAt ?? '') ||
        compareId(a.eventId, b.eventId),
    );
  const replacementLimit = Math.min(
    policy.replacements,
    Math.max(0, policy.target - pins.length),
  );
  let best: PlacementResult | undefined;

  for (let replacements = replacementLimit; replacements >= 0; replacements--) {
    const keepCount = Math.max(0, policy.target - pins.length - replacements);
    const selected = [...pins];
    for (const entry of unpinned) {
      if (selected.length >= pins.length + keepCount) break;
      if (
        canPlace(
          entry.eventId,
          entry.siteId,
          selected,
          input,
          sites,
          events,
          excluded,
        )
      ) {
        selected.push({ ...entry, preserved: true });
      }
    }

    fill(selected, input, zones, sites, events, excluded);
    const result = finish(selected, zones, policy, []);
    if (result.status === 'valid') return result;
    if (
      result.status === 'degraded' &&
      (!best || result.entries.length > best.entries.length)
    ) {
      best = result;
    }
  }

  return best ?? finish([], zones, policy, ['unserved_zone']);
}

export function validatePlacementEntries(
  input: PlacementInput,
  proposed: PlacementEntry[],
): PlacementResult {
  const zones = [...input.zones].sort((a, b) => compareId(a.id, b.id));
  if (zones.length === 0) {
    return {
      entries: [],
      zoneCounts: {},
      status: 'unserved',
      exceptions: ['no_active_zones'],
    };
  }
  const sites = new Map(input.sites.map((site) => [site.id, site]));
  const events = new Map(input.events.map((event) => [event.id, event]));
  const excluded = new Set(input.excludedSiteIds);
  const selected: PlacementEntry[] = [];
  for (const entry of proposed) {
    if (
      !canPlace(
        entry.eventId,
        entry.siteId,
        selected,
        input,
        sites,
        events,
        excluded,
      ) ||
      sites.get(entry.siteId)?.zoneId !== entry.zoneId
    ) {
      return finish([], zones, input.policy, ['invalid_rollback_assignment']);
    }
    selected.push(entry);
  }
  for (const pin of input.pins) {
    if (
      !selected.some(
        (entry) => entry.eventId === pin.eventId && entry.siteId === pin.siteId,
      )
    ) {
      return finish([], zones, input.policy, ['pin_not_preserved']);
    }
  }
  if (selected.length > input.policy.target) {
    return finish([], zones, input.policy, ['target_exceeded']);
  }
  return finish(selected, zones, input.policy, []);
}

function fill(
  selected: PlacementEntry[],
  input: PlacementInput,
  zones: PlacementZone[],
  sites: Map<string, PlacementSite>,
  events: Map<string, PortableEvent>,
  excluded: Set<string>,
): void {
  while (selected.length < input.policy.target) {
    const counts = countZones(selected, zones);
    const orderedZones = [...zones].sort(
      (a, b) =>
        Number(counts[a.id]! >= input.policy.mandatoryPerZone) -
          Number(counts[b.id]! >= input.policy.mandatoryPerZone) ||
        Number(counts[a.id]! >= input.policy.preferredPerZone) -
          Number(counts[b.id]! >= input.policy.preferredPerZone) ||
        counts[a.id]! - counts[b.id]! ||
        compareId(a.id, b.id),
    );
    let choice: PlacementEntry | undefined;

    for (const zone of orderedZones) {
      const candidates = [...sites.values()]
        .filter((site) => site.zoneId === zone.id)
        .sort(
          (a, b) =>
            compareAge(a.lastEndedAt, b.lastEndedAt) ||
            a.lifetimeCount - b.lifetimeCount ||
            compareId(a.id, b.id),
        );
      const passes =
        counts[zone.id]! < input.policy.mandatoryPerZone
          ? [false, true]
          : [false];
      for (const cooldownException of passes) {
        for (const site of candidates) {
          if (site.coolingDown !== cooldownException) continue;
          if (input.current.some((entry) => entry.siteId === site.id)) continue;
          const event = [...events.values()]
            .sort(
              (a, b) =>
                compareAge(a.lastEndedAt, b.lastEndedAt) ||
                a.lifetimeCount - b.lifetimeCount ||
                compareId(a.id, b.id),
            )
            .find((item) =>
              canPlace(
                item.id,
                site.id,
                selected,
                input,
                sites,
                events,
                excluded,
              ),
            );
          if (event) {
            choice = {
              eventId: event.id,
              siteId: site.id,
              zoneId: zone.id,
              origin: 'automatic',
              preserved: false,
              ...(cooldownException ? { cooldownException: true } : {}),
            };
            break;
          }
        }
        if (choice) break;
      }
      if (choice) break;
    }
    if (!choice) {
      return;
    }
    selected.push(choice);
  }
}

function canPlace(
  eventId: string,
  siteId: string,
  selected: PlacementEntry[],
  input: PlacementInput,
  sites: Map<string, PlacementSite>,
  events: Map<string, PortableEvent>,
  excluded: Set<string>,
): boolean {
  const site = sites.get(siteId);
  const event = events.get(eventId);
  if (
    !site ||
    !event ||
    !input.zones.some((zone) => zone.id === site.zoneId) ||
    excluded.has(siteId) ||
    event.radiusMetres > site.maximumRadiusMetres
  ) {
    return false;
  }
  if (
    selected.some(
      (entry) => entry.eventId === eventId || entry.siteId === siteId,
    )
  ) {
    return false;
  }
  for (const fixed of input.fixedDistances[siteId] ?? []) {
    if (
      fixed.distanceMetres <
      Math.max(
        input.policy.separationMetres,
        event.radiusMetres + fixed.radiusMetres,
      )
    )
      return false;
  }
  for (const entry of selected) {
    const other = events.get(entry.eventId);
    const distance = input.siteDistances[sitePairKey(siteId, entry.siteId)];
    if (
      !other ||
      distance === undefined ||
      distance <
        Math.max(
          input.policy.separationMetres,
          event.radiusMetres + other.radiusMetres,
        )
    )
      return false;
  }
  return true;
}

function finish(
  entries: PlacementEntry[],
  zones: PlacementZone[],
  policy: PlacementPolicy,
  exceptions: string[],
): PlacementResult {
  const zoneCounts = countZones(entries, zones);
  const unserved = zones.some(
    (zone) => zoneCounts[zone.id]! < policy.mandatoryPerZone,
  );
  const preferred = zones.every(
    (zone) => zoneCounts[zone.id]! === policy.preferredPerZone,
  );
  const status = unserved
    ? 'unserved'
    : entries.length === policy.target && preferred
      ? 'valid'
      : 'degraded';
  if (!unserved && entries.length < policy.target)
    exceptions.push('target_shortfall');
  if (entries.some((entry) => entry.cooldownException))
    exceptions.push('cooldown_floor_exception');
  if (!unserved && !preferred) exceptions.push('preferred_coverage_shortfall');
  if (unserved) exceptions.push('unserved_zone');
  return { entries, zoneCounts, status, exceptions: [...new Set(exceptions)] };
}

function countZones(
  entries: PlacementEntry[],
  zones: PlacementZone[],
): Record<string, number> {
  const counts = Object.fromEntries(
    zones.map((zone) => [zone.id, 0]),
  ) as Record<string, number>;
  for (const entry of entries)
    counts[entry.zoneId] = (counts[entry.zoneId] ?? 0) + 1;
  return counts;
}

function compareAge(left: string | null, right: string | null): number {
  return compareId(left ?? '', right ?? '');
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
