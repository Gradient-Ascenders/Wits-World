import { describe, expect, it } from 'vitest';

import {
  InvalidDisplayNameError,
  normalizeDisplayName,
  type DisplayNameValidationFailure,
} from '../src/players/display-name.js';

describe('player display-name validation', () => {
  it.each([
    ['minimum boundary', 'AB'],
    ['maximum boundary', 'A'.repeat(32)],
    ['Unicode name', 'Naledi 星'],
    ['chosen casing', 'McLeod'],
  ])('accepts a valid %s', (_label, value) => {
    expect(normalizeDisplayName(value)).toBe(value);
  });

  it('trims surrounding whitespace before returning the stored value', () => {
    expect(normalizeDisplayName(' \t Naledi 星 \n')).toBe('Naledi 星');
  });

  it.each([
    ['one character', 'A', 'too_short'],
    ['whitespace only', '   ', 'too_short'],
    ['more than 32 characters', 'A'.repeat(33), 'too_long'],
    ['a newline inside the name', 'Naledi\nStar', 'control_character'],
    ['a null control character', 'Naledi\u0000Star', 'control_character'],
  ])('rejects %s', (_label, value, failure) => {
    expect(() => normalizeDisplayName(value)).toThrowError(
      expect.objectContaining<Partial<InvalidDisplayNameError>>({
        failure: failure as DisplayNameValidationFailure,
      }),
    );
  });
});
