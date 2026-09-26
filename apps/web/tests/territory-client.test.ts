import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getTerritoryHistory,
  getTerritoryStandings,
  getTerritoryZone,
  listTerritoryZones,
  TerritoryApiError,
} from '../src/api/territory';

const API_BASE_URL = 'https://api.example.test/api/v1';
const ZONE_ID = 'ebca0505-5e5d-60b4-5c06-e8f2acba42bf';
const SEEDED_ZONE_IDS = [
  ZONE_ID,
  '86083389-be58-667c-d680-e77de2b1f730',
  'aad9ded4-ba42-aa7b-f10c-40ad67fd624e',
] as const;
const SEASON_ID = '30000000-0000-4000-8000-000000000001';
const geometry = {
  coordinates: [
    [
      [28.029, -26.193],
      [28.032, -26.193],
      [28.032, -26.19],
      [28.029, -26.193],
    ],
  ],
  type: 'Polygon',
} as const;
const zone = {
  geometry,
  name: 'East Campus',
  owner: { playerName: 'blue_witsie' },
  seasonId: SEASON_ID,
  status: 'active',
  windowEnd: '2026-09-26T15:00:00.000Z',
  windowStart: '2026-09-26T14:00:00.000Z',
  zoneId: ZONE_ID,
} as const;

function options() {
  return {
    apiBaseUrl: API_BASE_URL,
    getAccessToken: vi.fn().mockResolvedValue('access-token'),
    signal: new AbortController().signal,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('territory API client', () => {
  it('parses reviewed zone geometry and sends the access token', async () => {
    const seededZones = SEEDED_ZONE_IDS.map((zoneId, index) => ({
      ...zone,
      name: ['East Campus', 'West Campus', 'Arts & Community'][index]!,
      zoneId,
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ zones: seededZones }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listTerritoryZones(options())).resolves.toEqual(seededZones);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/territory/zones`,
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
      }),
    );
  });

  it('parses detail, anonymous standings, and ownership history contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...zone,
          lastSettledAt: '2026-09-26T14:00:05.000Z',
          lifecycleVersion: 3,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          activity: { contributors: 4, influence: 9 },
          seasonId: SEASON_ID,
          top: [
            { influence: 4, rank: 1 },
            { influence: 3, rank: 2 },
          ],
          viewer: {
            dailyCap: 5,
            influence: 2,
            remainingDailyInfluence: 3,
            todayInfluence: 2,
          },
          zoneId: ZONE_ID,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            {
              effectiveAt: '2026-09-26T14:00:05.000Z',
              owner: { playerName: 'blue_witsie' },
              seasonId: SEASON_ID,
              transitionKind: 'settlement',
            },
          ],
          zoneId: ZONE_ID,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const zoneOptions = { ...options(), zoneId: ZONE_ID };

    await expect(getTerritoryZone(zoneOptions)).resolves.toMatchObject({
      lifecycleVersion: 3,
      zoneId: ZONE_ID,
    });
    await expect(getTerritoryStandings(zoneOptions)).resolves.toMatchObject({
      top: [
        { influence: 4, rank: 1 },
        { influence: 3, rank: 2 },
      ],
      viewer: { influence: 2 },
    });
    await expect(getTerritoryHistory(zoneOptions)).resolves.toMatchObject({
      entries: [{ transitionKind: 'settlement' }],
    });
  });

  it('rejects malformed or unsafe geometry instead of passing it to the map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          zones: [
            {
              ...zone,
              geometry: {
                ...geometry,
                coordinates: [
                  [
                    [280.029, -26.193],
                    [28.032, -26.193],
                    [28.032, -26.19],
                    [280.029, -26.193],
                  ],
                ],
              },
            },
          ],
        }),
      ),
    );

    await expect(listTerritoryZones(options())).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it('still rejects identifiers that are not PostgreSQL UUID text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ zones: [{ ...zone, zoneId: 'east-campus' }] }),
        ),
    );

    await expect(listTerritoryZones(options())).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it('classifies authorization and not-found responses without exposing server bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ message: 'private' }, 401))
        .mockResolvedValueOnce(jsonResponse({ message: 'private' }, 404)),
    );

    await expect(listTerritoryZones(options())).rejects.toEqual(
      new TerritoryApiError('authorization'),
    );
    await expect(
      getTerritoryZone({ ...options(), zoneId: ZONE_ID }),
    ).rejects.toEqual(new TerritoryApiError('not-found'));
  });
});
