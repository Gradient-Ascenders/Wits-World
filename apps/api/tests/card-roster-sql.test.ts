import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getMigrationsDirectory,
  getSeedsDirectory,
} from '../src/database/paths.js';
import { completeCatalogueCardIds } from './fixtures/complete-card-catalogue.js';

const seedPath = join(getSeedsDirectory(), '0002_basic_card_catalogue.sql');
const migrationPath = join(
  getMigrationsDirectory(),
  '0041_complete_card_catalogue.sql',
);

describe('complete card-catalogue SQL', () => {
  it('keeps all 30 approved stable IDs in the versioned migration', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(completeCatalogueCardIds).toHaveLength(30);
    for (const id of completeCatalogueCardIds) {
      expect(migration).toContain(id);
    }

    expect(migration).toContain(
      '(select count(*) from complete_catalogue_cards) <> 30',
    );
  });

  it('keeps the repeatable seed as a 30-card readiness assertion', async () => {
    const [seed, migration] = await Promise.all([
      readFile(seedPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);

    expect(seed).toContain('ordinary_count <> 30');
    expect(seed).not.toContain('insert into public.card_definitions');
    expect(migration).toContain("catalogue_class = 'ordinary'");
  });
});
