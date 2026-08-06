import { describe, expect, it } from 'vitest';

describe('CI failure evidence', () => {
  it('deliberately fails to demonstrate CI enforcement', () => {
    expect(true).toBe(false);
  });
});
