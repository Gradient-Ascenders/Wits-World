import { describe, expect, it } from 'vitest';

import {
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
  playerNameValidationMessage,
  validatePlayerName,
} from '../src/index.js';

describe('Player Name policy', () => {
  it.each([
    ['minimum boundary', 'abc', 'abc'],
    ['maximum boundary', 'a'.repeat(20), 'a'.repeat(20)],
    ['Auth0 punctuation', "quest_+-.!#$^`~@'", "quest_+-.!#$^`~@'"],
    ['ordinary underscore name', 'normal_player', 'normal_player'],
    ['lowercase canonicalization', 'Kevin_19', 'kevin_19'],
    ['surrounding whitespace', '  naledi  ', 'naledi'],
  ])('accepts the %s', (_label, input, expected) => {
    expect(validatePlayerName(input)).toEqual({
      playerName: expected,
      valid: true,
    });
  });

  it.each([
    ['blank input', '   ', 'required'],
    ['below minimum', 'a'.repeat(PLAYER_NAME_MIN_LENGTH - 1), 'length'],
    ['above maximum', 'a'.repeat(PLAYER_NAME_MAX_LENGTH + 1), 'length'],
    ['spaces', 'player name', 'characters'],
    ['Unicode', 'naledi星', 'characters'],
    ['control characters', 'naledi\n', 'characters'],
    ['email format', 'bob@example.com', 'format'],
    ['email format with a single-label domain', 'player@example', 'format'],
    ['international phone number format', '+27123456789', 'format'],
    ['phone number format without a plus', '27123456789', 'format'],
  ] as const)('rejects %s', (_label, input, failure) => {
    expect(validatePlayerName(input)).toEqual({ failure, valid: false });
    expect(playerNameValidationMessage(failure)).not.toHaveLength(0);
  });
});
