import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getMigrationsDirectory,
  getSeedsDirectory,
} from '../src/database/paths.js';
import { canonicalCardIds } from './fixtures/canonical-card-roster.js';

const seedPath = join(getSeedsDirectory(), '0002_basic_card_catalogue.sql');
const migrationPath = join(
  getMigrationsDirectory(),
  '0023_rebalance_canonical_card_roster.sql',
);

describe('canonical card-roster SQL', () => {
  it('keeps the seed and forward migration canonical content tables identical', async () => {
    const [seed, migration] = await Promise.all([
      readFile(seedPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);
    const seedContent = seed.slice(
      0,
      seed.indexOf('insert into public.card_definitions'),
    );
    const migrationContent = migration.slice(
      0,
      migration.indexOf('-- A seeded catalogue'),
    );

    expect(seedContent).toBe(migrationContent);
    for (const id of canonicalCardIds) {
      expect(seedContent).toContain(id);
    }
  });
});
