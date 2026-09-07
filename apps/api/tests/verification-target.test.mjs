import { describe, expect, it } from 'vitest';

import {
  resolveVerificationProfile,
  validateReleaseCommit,
  validateTestDatabaseEnvironment,
} from '../scripts/verification-target.mjs';

const environment = {
  DATABASE_URL: 'postgresql://guard:guard@127.0.0.1:1/ci_guard',
  TEST_DATABASE_HOST: 'test-db.example.invalid',
  TEST_DATABASE_NAME: 'wits_world_test',
  TEST_DATABASE_URL:
    'postgresql://runner:secret@test-db.example.invalid/wits_world_test?sslmode=require',
};

describe('CI verification target', () => {
  it.each(['pr', 'nightly', 'release'])('accepts the %s profile', (profile) => {
    expect(resolveVerificationProfile(['--profile', profile])).toBe(profile);
  });

  it('rejects a missing or unknown profile', () => {
    expect(() => resolveVerificationProfile([])).toThrow(
      'A verification profile of pr, nightly, or release is required.',
    );
    expect(() =>
      resolveVerificationProfile(['--profile', 'production']),
    ).toThrow('A verification profile of pr, nightly, or release is required.');
  });

  it('accepts an exactly confirmed dedicated test target', () => {
    expect(validateTestDatabaseEnvironment(environment)).toMatchObject({
      databaseName: 'wits_world_test',
      hostname: 'test-db.example.invalid',
    });
  });

  it.each([
    ['TEST_DATABASE_URL', undefined],
    ['DATABASE_URL', undefined],
    ['TEST_DATABASE_HOST', undefined],
    ['TEST_DATABASE_NAME', undefined],
  ])('fails closed when %s is missing', (name, value) => {
    expect(() =>
      validateTestDatabaseEnvironment({ ...environment, [name]: value }),
    ).toThrow();
  });

  it('rejects the ordinary database target and exact-confirmation mismatches', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        DATABASE_URL: environment.TEST_DATABASE_URL,
      }),
    ).toThrow('TEST_DATABASE_URL must not identify the DATABASE_URL database.');
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        TEST_DATABASE_HOST: 'production.example.invalid',
      }),
    ).toThrow(
      'TEST_DATABASE_URL does not match the configured test database host.',
    );
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        TEST_DATABASE_NAME: 'production',
      }),
    ).toThrow(
      'TEST_DATABASE_URL does not match the configured test database name.',
    );
  });

  it('requires the release gate to verify the exact checked-out commit', () => {
    const commit = 'a'.repeat(40);
    expect(() => validateReleaseCommit('release', {}, commit)).toThrow(
      'RELEASE_COMMIT_SHA must be the full lowercase commit SHA for a release gate.',
    );
    expect(() =>
      validateReleaseCommit(
        'release',
        { RELEASE_COMMIT_SHA: 'b'.repeat(40) },
        commit,
      ),
    ).toThrow('The checked-out commit does not match RELEASE_COMMIT_SHA.');
    expect(() =>
      validateReleaseCommit('release', { RELEASE_COMMIT_SHA: commit }, commit),
    ).not.toThrow();
  });
});
