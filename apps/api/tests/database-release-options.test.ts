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
      includeBasicDemoSeed: false,
      includeVerifiedEventsSeed: false,
      target: 'test',
    });
  });

  it('enables the verified event pack only through its explicit flag', () => {
    expect(
      parseDatabaseReleaseOptions([
        '--target',
        'production',
        '--confirm-database',
        'wits_quest',
        '--seed-verified-events',
      ]),
    ).toMatchObject({ includeVerifiedEventsSeed: true });
  });

  it('enables the demonstration seed only through its explicit flag', () => {
    expect(
      parseDatabaseReleaseOptions([
        '--target',
        'production',
        '--confirm-database',
        'wits_quest',
        '--seed-basic-demo',
      ]),
    ).toMatchObject({ includeBasicDemoSeed: true });

    expect(
      parseDatabaseReleaseOptions([
        '--target',
        'test',
        '--confirm-database',
        'wits_quest_test',
        '--seed-demo-event',
      ]),
    ).toMatchObject({ includeBasicDemoSeed: true });
  });

  it.each([
    [[], '--target is required'],
    [['--target', 'development'], '--target must be either production or test'],
    [['--target', 'test'], '--confirm-database is required'],
    [['--target'], '--target requires a value'],
    [
      [
        '--target',
        'test',
        '--confirm-database',
        'wits_quest_test',
        '--seed-basic-demo',
        '--seed-verified-events',
      ],
      'separate content packs',
    ],
    [['--unknown'], 'Unknown database release argument'],
  ])('rejects unsafe arguments %j', (arguments_, message) => {
    expect(() => parseDatabaseReleaseOptions(arguments_)).toThrow(message);
  });
});
