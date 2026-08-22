import {
  PLAYER_NAME_ALLOWED_CHARACTERS,
  PLAYER_NAME_DISALLOWED_FORMATS,
  PLAYER_NAME_INPUT_PATTERN,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
  playerNameValidationMessage,
  validatePlayerName,
} from '@wits-world/account-policy';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { PlayerNameSetupError } from '../../api/authentication';
import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';

export function PlayerNameSetup() {
  const { setupPlayerName } = useCurrentPlayer();
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const errorId = useId();
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validatePlayerName(playerName);

    if (!validation.valid) {
      setError(playerNameValidationMessage(validation.failure));
      return;
    }

    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setIsSaving(true);

    try {
      await setupPlayerName(validation.playerName, controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        failure instanceof PlayerNameSetupError
          ? failure.message
          : 'Player Name could not be saved. Try again.',
      );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setIsSaving(false);
      }
    }
  }

  return (
    <section className="auth-state player-name-setup">
      <p className="eyebrow">One last step</p>
      <h1>Choose your Player Name</h1>
      <p>
        Your Player Name is how Wits World identifies you in the game. Choose
        carefully—it cannot be changed in Basic Tier.
      </p>

      <form className="player-name-setup__form" noValidate onSubmit={submit}>
        <label htmlFor="player-name">Player Name</label>
        <input
          aria-describedby={
            error ? `player-name-help ${errorId}` : 'player-name-help'
          }
          aria-invalid={error ? 'true' : undefined}
          autoComplete="username"
          autoFocus
          disabled={isSaving}
          id="player-name"
          maxLength={PLAYER_NAME_MAX_LENGTH}
          minLength={PLAYER_NAME_MIN_LENGTH}
          onChange={(event) => setPlayerName(event.target.value)}
          pattern={PLAYER_NAME_INPUT_PATTERN}
          spellCheck={false}
          type="text"
          value={playerName}
        />
        <p className="field-hint" id="player-name-help">
          {PLAYER_NAME_MIN_LENGTH}–{PLAYER_NAME_MAX_LENGTH} characters. Use{' '}
          {PLAYER_NAME_ALLOWED_CHARACTERS}; {PLAYER_NAME_DISALLOWED_FORMATS}.
          Names are saved in lowercase.
        </p>
        {error ? (
          <p className="field-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
        <div className="player-name-setup__actions">
          <button className="button" disabled={isSaving} type="submit">
            {isSaving ? 'Saving…' : 'Enter Wits World'}
          </button>
        </div>
      </form>
    </section>
  );
}
