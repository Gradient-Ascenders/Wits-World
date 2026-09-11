import type { DatabaseTarget } from '../config/database.js';

export interface DatabaseReleaseCliOptions {
  confirmDatabase: string;
  includeBasicDemoSeed: boolean;
  includeVerifiedEventsSeed: boolean;
  target: Extract<DatabaseTarget, 'production' | 'test'>;
}

export function parseDatabaseReleaseOptions(
  arguments_: readonly string[],
): DatabaseReleaseCliOptions {
  let confirmDatabase: string | undefined;
  let includeBasicDemoSeed = false;
  let includeVerifiedEventsSeed = false;
  let target: DatabaseReleaseCliOptions['target'] | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--seed-basic-demo' || argument === '--seed-demo-event') {
      if (includeBasicDemoSeed) {
        throw new Error(
          '--seed-basic-demo or --seed-demo-event may only be provided once.',
        );
      }

      includeBasicDemoSeed = true;
      continue;
    }

    if (argument === '--seed-verified-events') {
      if (includeVerifiedEventsSeed) {
        throw new Error('--seed-verified-events may only be provided once.');
      }

      includeVerifiedEventsSeed = true;
      continue;
    }

    if (argument === '--target' || argument === '--confirm-database') {
      const value = arguments_[index + 1]?.trim();

      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }

      if (argument === '--target') {
        if (target !== undefined) {
          throw new Error('--target may only be provided once.');
        }

        if (value !== 'production' && value !== 'test') {
          throw new Error('--target must be either production or test.');
        }

        target = value;
      } else {
        if (confirmDatabase !== undefined) {
          throw new Error('--confirm-database may only be provided once.');
        }

        confirmDatabase = value;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown database release argument: ${argument ?? ''}`);
  }

  if (target === undefined) {
    throw new Error('--target is required and must be production or test.');
  }

  if (confirmDatabase === undefined) {
    throw new Error('--confirm-database is required before database writes.');
  }

  if (includeBasicDemoSeed && includeVerifiedEventsSeed) {
    throw new Error(
      '--seed-basic-demo and --seed-verified-events are separate content packs and cannot be combined.',
    );
  }

  return {
    confirmDatabase,
    includeBasicDemoSeed,
    includeVerifiedEventsSeed,
    target,
  };
}
