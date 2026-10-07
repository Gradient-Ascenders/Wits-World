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
    description?: string;
    headingLevel?: 1 | 2 | 3;
    compact?: boolean;
  }
>(function MatchErrorState(
  {
    error,
    onRetry,
    onSignIn,
    reauthFailed,
    title,
    description,
    headingLevel = 1,
    compact = false,
  },
  ref,
) {
  const authorization = error.failure === 'authorization';
  const notFound = error.failure === 'not-found';
  const deckInvalid = error.failure === 'deck-invalid';
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';

  return (
    <section
      className={`match-state-panel state-message state-message--error${compact ? ' match-state-panel--inline' : ''}`}
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <StateIcon tone="error" />
      {!compact ? <p className="eyebrow">Battle connection</p> : null}
      <Heading>
        {title ??
          (authorization
            ? 'Your session has expired'
            : notFound
              ? 'This match is not available'
              : 'The battle could not load')}
      </Heading>
      <p>
        {description ??
          (authorization
            ? 'Sign in again to securely reload your private match state.'
            : notFound
              ? 'The match was not found for this signed-in player. Return to Battles to recover an active match or view your history.'
              : deckInvalid
                ? 'The server rejected the selected deck. Review and select a valid saved deck before starting another match.'
                : 'Check your connection, then reload the battle. Your previous action will not be repeated.')}
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
        {!compact ? (
          <Link className="button button--quiet" href="/matches">
            Back to Battles
          </Link>
        ) : null}
      </div>
      {reauthFailed ? <p>Sign-in could not start. Try again.</p> : null}
    </section>
  );
});
