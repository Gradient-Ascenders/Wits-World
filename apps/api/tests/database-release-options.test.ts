import { describe, expect, it } from 'vitest';

import { parseDatabaseReleaseOptions } from '../src/database/release-options.js';

describe('database release options', () => {
  it('requires an explicit target and exact database confirmation', () => {
    expect(
      parseDatabaseReleaseOptions([
        '--target',
        'test',
        '--confirm-database',
        'wits_quest_test',
      ]),
    ).toEqual({
      confirmDatabase: 'wits_quest_test',
      includeDemoSeed: false,
      target: 'test',
    });
  });

  it('enables the demonstration seed only through its explicit flag', () => {
    expect(
      parseDatabaseReleaseOptions([
        '--target',
        'production',
        '--confirm-database',
        'wits_quest',
        '--seed-demo-event',
      ]),
    ).toMatchObject({ includeDemoSeed: true });
  });

  it.each([
    [[], '--target is required'],
    [['--target', 'development'], '--target must be either production or test'],
    [['--target', 'test'], '--confirm-database is required'],
    [['--target'], '--target requires a value'],
    [['--unknown'], 'Unknown database release argument'],
  ])('rejects unsafe arguments %j', (arguments_, message) => {
    expect(() => parseDatabaseReleaseOptions(arguments_)).toThrow(message);
  });
});
