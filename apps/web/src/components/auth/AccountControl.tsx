import { useAuth0 } from '@auth0/auth0-react';
import { useState } from 'react';
import { useRoute } from 'wouter';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import {
  clearAuthenticatedPlayerBinding,
  hasAuthenticatedPlayerBinding,
} from '../../auth/player-session-binding';

export function AccountControl() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, logout, user } =
    useAuth0();
  const [actionFailed, setActionFailed] = useState(false);
  const { state: currentPlayer } = useCurrentPlayer();
  const [isProtectedExploreRoute] = useRoute('/explore');
  const [isProtectedCollectionRoute] = useRoute('/collection');
  const [isProtectedAuthorRoute] = useRoute('/author');

  if (isLoading) {
    return null;
  }

  async function signIn() {
    setActionFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/explore' } });
    } catch {
      setActionFailed(true);
    }
  }

  async function signOut() {
    setActionFailed(false);
    clearAuthenticatedPlayerBinding();

    try {
      await logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    } catch {
      setActionFailed(true);
    }
  }

  async function switchAccount() {
    setActionFailed(false);
    clearAuthenticatedPlayerBinding();

    try {
      await loginWithRedirect({
        appState: { returnTo: '/explore' },
        authorizationParams: { prompt: 'login' },
      });
    } catch {
      setActionFailed(true);
    }
  }

  if (error) {
    if (
      isProtectedExploreRoute ||
      isProtectedCollectionRoute ||
      isProtectedAuthorRoute
    ) {
      return null;
    }

    return (
      <div className="account-control account-control--error">
        <span className="account-control__error" role="alert">
          {actionFailed
            ? 'The account action could not start. Try again later.'
            : 'Sign-in is unavailable right now.'}
        </span>
        <button className="button button--quiet" onClick={signIn} type="button">
          Try sign-in again
        </button>
      </div>
    );
  }

  return (
    <div className="account-control">
      {isAuthenticated ? (
        <>
          {currentPlayer.status === 'ready' ? (
            <span className="account-control__identity">
              Signed in as <strong>{user?.name ?? 'Player'}</strong>
            </span>
          ) : null}
          <button
            className="button button--quiet"
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <button
            className="button button--quiet"
            onClick={signIn}
            type="button"
          >
            Sign in
          </button>
          {hasAuthenticatedPlayerBinding() ? (
            <button
              className="button button--quiet"
              onClick={switchAccount}
              type="button"
            >
              Use a different account
            </button>
          ) : null}
        </>
      )}
      {actionFailed ? (
        <span className="account-control__error" role="alert">
          The account action could not start. Try again.
        </span>
      ) : null}
    </div>
  );
}
