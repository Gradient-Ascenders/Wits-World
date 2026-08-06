import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { loadMigrationFiles } from '../src/database/migrations.js';

describe('migration file loading', () => {
  it('loads SQL migrations in filename order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wits-world-migrations-'));

    await writeFile(join(directory, '0002_second.sql'), 'select 2;');
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    await writeFile(join(directory, '.gitkeep'), '');

    const migrationFiles = await loadMigrationFiles(directory);

    expect(migrationFiles.map((migrationFile) => migrationFile.name)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(migrationFiles[0]?.checksum).toHaveLength(64);
  });
});
