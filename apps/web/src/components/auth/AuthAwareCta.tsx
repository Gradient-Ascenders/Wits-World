import { useAuth0 } from '@auth0/auth0-react';
import { useState } from 'react';
import { Link } from 'wouter';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';

export function AuthAwareCta() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const { state: currentPlayer } = useCurrentPlayer();
  const [actionFailed, setActionFailed] = useState(false);
  const isRestoring =
    isLoading || (isAuthenticated && currentPlayer.status === 'loading');

  async function signIn() {
    setActionFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/explore' } });
    } catch {
      setActionFailed(true);
    }
  }

  if (isRestoring) {
    return (
      <span
        aria-hidden="true"
        className="auth-aware-cta auth-aware-cta--placeholder"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <span className="auth-aware-cta">
        <button className="button" onClick={signIn} type="button">
          Sign in to play
        </button>
        {actionFailed ? (
          <span className="auth-aware-cta__error" role="alert">
            Sign-in could not start. Try again.
          </span>
        ) : null}
      </span>
    );
  }

  if (currentPlayer.status === 'ready') {
    return (
      <span className="auth-aware-cta">
        <Link className="button button--link" href="/explore">
          {currentPlayer.player.playerNameSetupRequired
            ? 'Choose Player Name'
            : 'Explore campus'}
        </Link>
      </span>
    );
  }

  return (
    <span className="auth-aware-cta">
      <Link className="button button--link" href="/explore">
        Check your session
      </Link>
    </span>
  );
}
