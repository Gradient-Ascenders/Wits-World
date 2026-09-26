import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TerritoryZoneSummary } from '../src/api/territory';
import { useTerritoryDiscovery } from '../src/components/exploration/useTerritoryDiscovery';

const territoryApi = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getStandings: vi.fn(),
  getZone: vi.fn(),
  listZones: vi.fn(),
}));

vi.mock('../src/api/territory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/territory')>();
  return {
    ...actual,
    getTerritoryHistory: territoryApi.getHistory,
    getTerritoryStandings: territoryApi.getStandings,
    getTerritoryZone: territoryApi.getZone,
    listTerritoryZones: territoryApi.listZones,
  };
});

const NOW = new Date('2026-09-26T14:00:00.000Z');
const zone: TerritoryZoneSummary = {
  geometry: {
    coordinates: [
      [
        [28.029, -26.193],
        [28.032, -26.193],
        [28.032, -26.19],
        [28.029, -26.193],
      ],
    ],
    type: 'Polygon',
  },
  name: 'East Campus',
  owner: { playerName: 'blue_witsie' },
  seasonId: '30000000-0000-4000-8000-000000000001',
  status: 'active',
  windowEnd: new Date(NOW.getTime() + 1_000).toISOString(),
  windowStart: NOW.toISOString(),
  zoneId: '20000000-0000-4000-8000-000000000001',
};
const getAccessToken = vi.fn().mockResolvedValue('access-token');
const onSelectedZoneUnavailable = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  territoryApi.listZones.mockResolvedValue([zone]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useTerritoryDiscovery', () => {
  it('refreshes on re-entry when a settlement boundary passed while hidden', async () => {
    const { rerender, result } = renderHook(
      ({ enabled }) =>
        useTerritoryDiscovery({
          apiBaseUrl: 'https://api.example.test/api/v1',
          enabled,
          getAccessToken,
          onSelectedZoneUnavailable,
          selectedZoneId: null,
        }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.list.status).toBe('ready');
    expect(territoryApi.listZones).toHaveBeenCalledOnce();

    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(4_000));
    expect(territoryApi.listZones).toHaveBeenCalledOnce();

    rerender({ enabled: true });
    await act(async () => {
      await Promise.resolve();
    });

    expect(territoryApi.listZones).toHaveBeenCalledTimes(2);
    expect(result.current.list.status).toBe('ready');
  });
});
