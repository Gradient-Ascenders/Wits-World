export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 32;

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

export type DisplayNameValidationFailure =
  'control_character' | 'too_long' | 'too_short';

export class InvalidDisplayNameError extends Error {
  public constructor(public readonly failure: DisplayNameValidationFailure) {
    super(displayNameValidationMessage(failure));
    this.name = 'InvalidDisplayNameError';
  }
}

export function normalizeDisplayName(value: string): string {
  const displayName = value.trim();
  const length = [...displayName].length;

  if (length < DISPLAY_NAME_MIN_LENGTH) {
    throw new InvalidDisplayNameError('too_short');
  }

  if (length > DISPLAY_NAME_MAX_LENGTH) {
    throw new InvalidDisplayNameError('too_long');
  }

  if (CONTROL_CHARACTER_PATTERN.test(displayName)) {
    throw new InvalidDisplayNameError('control_character');
  }

  return displayName;
}

function displayNameValidationMessage(
  failure: DisplayNameValidationFailure,
): string {
  switch (failure) {
    case 'too_short':
      return 'Display name must be at least 2 characters after trimming.';
    case 'too_long':
      return 'Display name must be 32 characters or fewer after trimming.';
    case 'control_character':
      return 'Display name cannot contain control characters.';
  }
}
