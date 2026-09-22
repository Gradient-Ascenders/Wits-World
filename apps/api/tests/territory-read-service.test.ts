import { describe, expect, it } from 'vitest';

import {
  createTerritoryReadService,
  type TerritoryReadDatabase,
} from '../src/territory/territory-read-service.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SEASON_ID = '30000000-0000-4000-8000-000000000001';

describe('territory read service time sampling', () => {
  it('samples one database instant for each window-producing query', async () => {
    const statements: string[] = [];
    const database = {
      async query(statement: string) {
        statements.push(statement);
        if (
          statement.includes('from public.territory_zones zone') &&
          statement.includes('st_asgeojson')
        ) {
          return { rows: [] };
        }
        if (
          statement.includes('select id::text') &&
          statement.includes('from public.territory_zones')
        ) {
          return { rows: [{ id: ZONE_ID }] };
        }
        if (statement.includes('from public.ranked_seasons')) {
          return { rows: [{ season_id: SEASON_ID }] };
        }
        if (statement.includes('daily_influence_cap')) {
          return {
            rows: [
              {
                daily_influence_cap: 5,
                daily_cap_timezone: 'Africa/Johannesburg',
              },
            ],
          };
        }
        if (statement.includes('limit 3')) {
          return { rows: [] };
        }
        if (statement.includes('as current_influence')) {
          return {
            rows: [
              {
                current_influence: 0,
                today_influence: 0,
                activity_influence: 0,
                contributors: 0,
              },
            ],
          };
        }
        throw new Error(`Unexpected territory read query: ${statement}`);
      },
    } as unknown as TerritoryReadDatabase;

    const service = createTerritoryReadService(database);
    await service.listZones(PLAYER_ID);
    await service.standings(PLAYER_ID, ZONE_ID);

    const timeSensitive = statements.filter((statement) =>
      statement.includes('clock_timestamp()'),
    );
    expect(timeSensitive).toHaveLength(3);
    for (const statement of timeSensitive) {
      expect(statement.match(/clock_timestamp\(\)/g)).toHaveLength(1);
    }
  });
});
