export const PLAYER_NAME_MIN_LENGTH = 3;
export const PLAYER_NAME_MAX_LENGTH = 20;

export const PLAYER_NAME_ALLOWED_CHARACTERS =
  "letters, numbers, and _ + - . ! # $ ^ ` ~ @ '";

export const PLAYER_NAME_DISALLOWED_FORMATS =
  'email and phone number formats are not allowed';

export const PLAYER_NAME_INPUT_PATTERN = "^[a-zA-Z0-9_+\\-.!#$^`~@']{3,20}$";

const playerNameCharacters = /^[a-z0-9_+\-.!#$^`~@']+$/i;
// Auth0 documents these switches as rejecting usernames that look like the
// corresponding login identifier. Email format follows the browser/WHATWG
// address shape (including a valid single-label domain); phone format is an
// optional international prefix followed only by digits.
const emailFormat =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
const phoneNumberFormat = /^\+?[0-9]+$/;

export type PlayerNameValidationFailure =
  'characters' | 'format' | 'length' | 'required';

export type PlayerNameValidationResult =
  | { playerName: string; valid: true }
  | { failure: PlayerNameValidationFailure; valid: false };

export function validatePlayerName(value: string): PlayerNameValidationResult {
  if (containsControlCharacters(value)) {
    return { failure: 'characters', valid: false };
  }

  const playerName = value.trim().toLowerCase();

  if (playerName.length === 0) {
    return { failure: 'required', valid: false };
  }

  if (
    playerName.length < PLAYER_NAME_MIN_LENGTH ||
    playerName.length > PLAYER_NAME_MAX_LENGTH
  ) {
    return { failure: 'length', valid: false };
  }

  if (!playerNameCharacters.test(playerName)) {
    return { failure: 'characters', valid: false };
  }

  if (emailFormat.test(playerName) || phoneNumberFormat.test(playerName)) {
    return { failure: 'format', valid: false };
  }

  return { playerName, valid: true };
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    );
  });
}

export function playerNameValidationMessage(
  failure: PlayerNameValidationFailure,
): string {
  switch (failure) {
    case 'required':
      return 'Enter a Player Name.';
    case 'length':
      return `Player Name must be ${PLAYER_NAME_MIN_LENGTH}–${PLAYER_NAME_MAX_LENGTH} characters.`;
    case 'characters':
      return `Use only ${PLAYER_NAME_ALLOWED_CHARACTERS}.`;
    case 'format':
      return 'Player Name cannot be in email or phone number format.';
  }
}
