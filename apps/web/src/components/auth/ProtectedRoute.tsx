import { StateIcon } from '../StatusMessage';
import { useAuth0 } from '@auth0/auth0-react';
import { confirmOfflineSignOut } from '../../offline/store';
import { Fragment, useCallback, useState, type ReactNode } from 'react';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import { clearAuthenticatedPlayerBinding } from '../../auth/player-session-binding';
import { PlayerNameSetup } from './PlayerNameSetup';
import { LoadingRecovery, LoadingState } from '../LoadingState';
import { useLoadingPhase } from '../loading-policy';

interface ProtectedRouteProps {
  allowPlayerNameSetupRequired?: boolean;
  children: ReactNode;
  destination?: string;
  loadingFallback?: ReactNode;
}

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function ProtectedRoute({
  allowPlayerNameSetupRequired = false,
  children,
  destination = 'explore Wits World',
  loadingFallback,
}: ProtectedRouteProps) {
  const { error, isAuthenticated, isLoading, loginWithRedirect, logout } =
    useAuth0();
  const { reload, state: currentPlayer } = useCurrentPlayer();
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const loadingPhase = useLoadingPhase(
    isLoading || (isAuthenticated && currentPlayer.status === 'loading'),
    isLoading ? 'authentication' : loadingAttempt,
  );
  const [actionFailed, setActionFailed] = useState(false);
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => {
    heading?.focus();
  }, []);

  async function startSignIn() {
    setActionFailed(false);

    try {
      await loginWithRedirect({
        appState: {
          returnTo: currentRoute(),
        },
      });
    } catch {
      setActionFailed(true);
    }
  }

  async function signOut() {
    if ((await confirmOfflineSignOut()) === 'cancelled') return;
    setActionFailed(false);
    clearAuthenticatedPlayerBinding();

    try {
      await logout({
        logoutParams: { returnTo: window.location.origin },
      });
    } catch {
      setActionFailed(true);
    }
  }

  function retryPlayer() {
    setLoadingAttempt((current) => current + 1);
    reload();
  }

  if (isLoading) {
    return (
      <>
        {loadingFallback ?? (
          <LoadingState
            prominent
            label="Checking sign-in"
            onRetry={() => window.location.reload()}
          />
        )}
        {loadingFallback && loadingPhase === 'slow' && (
          <section className="auth-state state-message">
            <LoadingRecovery
              message="Sign-in is taking longer than usual."
              onRetry={() => window.location.reload()}
            />
          </section>
        )}
      </>
    );
  }

  if (error || actionFailed) {
    return (
      <section
        className="auth-state state-message state-message--error"
        role="alert"
      >
        <StateIcon tone="error" />
        <p className="eyebrow">Player access</p>
        <h1>We could not complete sign-in</h1>
        <p>
          Your account details remain private. Check your connection and try the
          secure sign-in page again.
        </p>
        <button className="button" onClick={startSignIn} type="button">
          Try sign-in again
        </button>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-state">
        <p className="eyebrow">Player access</p>
        <h1>Sign in to {destination}</h1>
        <p>
          Continue to Auth0's secure sign-in page, then return here to open the
          protected player experience.
        </p>
        <button className="button" onClick={startSignIn} type="button">
          {destination === 'explore Wits World'
            ? 'Sign in to explore'
            : `Sign in to ${destination}`}
        </button>
      </section>
    );
  }

  if (currentPlayer.status === 'loading') {
    return (
      <>
        {loadingFallback ?? (
          <LoadingState
            prominent
            label="Confirming player"
            onRetry={retryPlayer}
            resetKey={loadingAttempt}
          />
        )}
        {loadingFallback && loadingPhase === 'slow' && (
          <section className="auth-state state-message">
            <LoadingRecovery
              message="Player confirmation is taking longer than usual."
              onRetry={retryPlayer}
            />
          </section>
        )}
      </>
    );
  }

  if (currentPlayer.status !== 'ready') {
    return (
      <section
        className="auth-state state-message state-message--error"
        role="alert"
      >
        <StateIcon tone="error" />
        <p className="eyebrow">Player access</p>
        <h1 ref={focusHeading} tabIndex={-1}>
          Your player session could not be restored
        </h1>
        <p>
          {currentPlayer.status === 'error' &&
          currentPlayer.failure === 'identity_changed'
            ? 'The restored Auth0 session did not match the Wits World player who was active in this browser. Wits World signed out instead of opening another player.'
            : currentPlayer.status === 'error' &&
                currentPlayer.failure === 'authorization'
              ? 'The API rejected the restored sign-in. Sign out and sign in again before retrying.'
              : currentPlayer.status === 'error' &&
                  currentPlayer.failure === 'identity_conflict'
                ? 'This Player Name is already linked to another account. Sign out and use the same sign-in method you originally used. If this keeps happening, contact the Wits World team to check your account link.'
                : currentPlayer.status === 'error' &&
                    currentPlayer.failure === 'timeout'
                  ? 'Checking your player account timed out. Check your connection and try again; your protected data remains hidden.'
                  : 'We could not load your player account. Check your connection and try again.'}
        </p>
        <div className="state-message__actions">
          <button className="button" onClick={reload} type="button">
            Check session again
          </button>
          <a className="button button--quiet" href="/">
            Return home
          </a>
          <a className="button button--quiet" href="/offline">
            Open saved events
          </a>
          {currentPlayer.status === 'error' &&
          currentPlayer.failure === 'identity_conflict' ? (
            <button
              className="button button--quiet"
              onClick={signOut}
              type="button"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (
    currentPlayer.player.playerNameSetupRequired &&
    !allowPlayerNameSetupRequired
  ) {
    return <PlayerNameSetup />;
  }

  // A confirmed identity/role change must destroy protected snapshots and drafts.
  return (
    <Fragment key={`${currentPlayer.player.id}:${currentPlayer.player.role}`}>
      {children}
    </Fragment>
  );
}
