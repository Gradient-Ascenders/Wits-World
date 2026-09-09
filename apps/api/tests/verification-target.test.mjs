import { describe, expect, it } from 'vitest';

import {
  confirmAdvisoryUnlock,
  databaseTargetIdentitySha256,
  resolveVerificationProfile,
  validateReleaseCommit,
  validateTestDatabaseEnvironment,
} from '../scripts/verification-target.mjs';

const environment = {
  DATABASE_URL: 'postgresql://guard:guard@127.0.0.1:1/ci_guard',
  TEST_DATABASE_IDENTITY_SHA256: databaseTargetIdentitySha256(
    'postgresql://test-db.example.invalid/wits_world_test',
  ),
  TEST_DATABASE_URL:
    'postgresql://runner:secret@test-db.example.invalid/wits_world_test?sslmode=require',
};

describe('CI verification target', () => {
  it.each(['nightly', 'release'])('accepts the %s profile', (profile) => {
    expect(resolveVerificationProfile(['--profile', profile])).toBe(profile);
  });

  it('rejects a missing or unknown profile', () => {
    expect(() => resolveVerificationProfile([])).toThrow(
      'A verification profile of nightly or release is required.',
    );
    expect(() => resolveVerificationProfile(['--profile', 'pr'])).toThrow(
      'A verification profile of nightly or release is required.',
    );
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
    ['TEST_DATABASE_IDENTITY_SHA256', undefined],
  ])('fails closed when %s is missing', (name, value) => {
    expect(() =>
      validateTestDatabaseEnvironment({ ...environment, [name]: value }),
    ).toThrow();
  });

  it('rejects the ordinary database target and approved-target mismatches', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        DATABASE_URL: environment.TEST_DATABASE_URL,
      }),
    ).toThrow('TEST_DATABASE_URL must not identify the DATABASE_URL database.');
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        TEST_DATABASE_URL:
          'postgresql://runner:secret@production.example.invalid/production?sslmode=require',
      }),
    ).toThrow(
      'TEST_DATABASE_URL does not match the repository-approved dedicated test target.',
    );
  });

  it('rejects pooled Neon endpoints before any database connection', () => {
    const pooledUrl =
      'postgresql://runner:secret@ep-example-pooler.eu-central-1.aws.neon.tech/wits_world_test?sslmode=require';
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        TEST_DATABASE_IDENTITY_SHA256: databaseTargetIdentitySha256(pooledUrl),
        TEST_DATABASE_URL: pooledUrl,
      }),
    ).toThrow('TEST_DATABASE_URL must use a direct Neon endpoint');
  });

  it('rejects malformed target fingerprints', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        ...environment,
        TEST_DATABASE_IDENTITY_SHA256: 'not-a-digest',
      }),
    ).toThrow(
      'TEST_DATABASE_IDENTITY_SHA256 must be a lowercase SHA-256 digest.',
    );
  });

  it('confirms advisory unlock only when this session held the lock', () => {
    expect(() =>
      confirmAdvisoryUnlock({ rowCount: 1, rows: [{ unlocked: true }] }),
    ).not.toThrow();
    expect(() =>
      confirmAdvisoryUnlock({ rowCount: 1, rows: [{ unlocked: false }] }),
    ).toThrow('The verification advisory lock was not held by this session.');
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
