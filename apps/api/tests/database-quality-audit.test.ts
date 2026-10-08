import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../src/config/database.js';
import { parsePlayerDataClassifications } from '../src/database/quality-audit.js';

const config: DatabaseConfig = {
  connectionString:
    'postgresql://owner:secret@database.test/neondb?sslmode=require',
  target: 'development',
  variableName: 'DATABASE_URL',
};
const PLAYER_ID = 'a1000000-0000-4000-8000-000000000001';
const manifest = {
  databaseHost: 'database.test',
  databaseName: 'neondb',
  databasePort: '5432',
  reviewedAt: '2020-01-01',
  productionPlayerIds: [] as string[],
  testPlayerIds: [PLAYER_ID],
};

afterEach(() => vi.useRealTimers());

describe('reviewed player data classifications', () => {
  it.each([
    { ...manifest, databaseHost: 'another.test' },
    { ...manifest, databaseName: 'test_database' },
    { ...manifest, databasePort: '6432' },
  ])('rejects a register for another database', (value) => {
    expect(() => parsePlayerDataClassifications(value, config)).toThrow(
      'different database target',
    );
  });

  it.each([
    { ...manifest, productionPlayerIds: [PLAYER_ID] },
    { ...manifest, testPlayerIds: [PLAYER_ID, PLAYER_ID.toUpperCase()] },
  ])('rejects conflicting origins and case-insensitive duplicates', (value) => {
    expect(() => parsePlayerDataClassifications(value, config)).toThrow(
      'duplicate or conflicting',
    );
  });

  it.each([
    { ...manifest, reviewedAt: '2020-02-31' },
    { ...manifest, reviewedAt: '2020-01-02' },
    { ...manifest, reviewedAt: 'unreviewed' },
  ])('requires a real, non-future review date', (value) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T12:00:00Z'));
    expect(() => parsePlayerDataClassifications(value, config)).toThrow(
      'review date',
    );
  });

  it.each([null, [], { ...manifest, testPlayerIds: ['not-a-player-id'] }])(
    'rejects malformed registers without echoing their contents',
    (value) => {
      expect(() => parsePlayerDataClassifications(value, config)).toThrow();
    },
  );
});
