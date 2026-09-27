import { StateIcon } from '../StatusMessage';
import { forwardRef } from 'react';
import { Link } from 'wouter';

import type { MatchApiError } from '../../api/matches';

export const MatchErrorState = forwardRef<
  HTMLElement,
  {
    error: MatchApiError;
    onRetry?: () => void;
    onSignIn: () => Promise<void>;
    reauthFailed: boolean;
    title?: string;
  }
>(function MatchErrorState(
  { error, onRetry, onSignIn, reauthFailed, title },
  ref,
) {
  const authorization = error.failure === 'authorization';
  const notFound = error.failure === 'not-found';
  const deckInvalid = error.failure === 'deck-invalid';

  return (
    <section
      className="match-state-panel state-message state-message--error"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <StateIcon tone="error" />
      <p className="eyebrow">Battle connection</p>
      <h1>
        {title ??
          (authorization
            ? 'Your session has expired'
            : notFound
              ? 'This match is not available'
              : 'The battle could not load')}
      </h1>
      <p>
        {authorization
          ? 'Sign in again to securely reload your private match state.'
          : notFound
            ? 'The match was not found for this signed-in player. Return to Battles to recover an active match or view your history.'
            : deckInvalid
              ? 'The server rejected the selected deck. Review and select a valid saved deck before starting another match.'
              : 'Check your connection, then reload the battle. Your previous action will not be repeated.'}
      </p>
      {error.options.requestId ? (
        <p className="match-support-reference">
          Support reference: {error.options.requestId}
        </p>
      ) : null}
      <div className="match-state-actions">
        {authorization ? (
          <button
            className="button"
            onClick={() => void onSignIn()}
            type="button"
          >
            Sign in again
          </button>
        ) : deckInvalid ? (
          <Link className="button" href="/collection/decks">
            Review saved decks
          </Link>
        ) : onRetry ? (
          <button className="button" onClick={onRetry} type="button">
            Try again
          </button>
        ) : null}
        <Link className="button button--quiet" href="/matches">
          Back to Battles
        </Link>
      </div>
      {reauthFailed ? <p>Sign-in could not start. Try again.</p> : null}
    </section>
  );
});
