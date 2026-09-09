import { describe, expect, it } from 'vitest';

import { resolveDatabaseTestWorkers } from '../scripts/database-test-workers.mjs';

describe('database integration test workers', () => {
  it.each([undefined, '', '  '])(
    'uses the conservative default when configured as %s',
    (value) => {
      expect(resolveDatabaseTestWorkers(value)).toBe(1);
    },
  );

  it('uses the configured positive worker count', () => {
    expect(resolveDatabaseTestWorkers(' 4 ')).toBe(4);
  });

  it.each(['0', '-1', '1.5', 'workers'])('rejects %s', (value) => {
    expect(() => resolveDatabaseTestWorkers(value)).toThrow(
      'DATABASE_TEST_WORKERS must be a positive integer.',
    );
  });

  it('rejects values outside the safe integer range', () => {
    expect(() =>
      resolveDatabaseTestWorkers(String(Number.MAX_SAFE_INTEGER + 1)),
    ).toThrow('DATABASE_TEST_WORKERS must be a safe positive integer.');
  });
});
