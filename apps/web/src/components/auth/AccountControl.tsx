import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import {
  clearAuthenticatedPlayerBinding,
  hasAuthenticatedPlayerBinding,
} from '../../auth/player-session-binding';

export function AccountControl() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, logout } =
    useAuth0();
  const [actionFailed, setActionFailed] = useState(false);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const disclosureId = useId();
  const disclosureRef = useRef<HTMLDivElement>(null);
  const disclosureTriggerRef = useRef<HTMLButtonElement>(null);
  const [, navigate] = useLocation();
  const { state: currentPlayer } = useCurrentPlayer();
  const [isProtectedExploreRoute] = useRoute('/explore');
  const [isProtectedCollectionRoute] = useRoute('/collection');
  const [isProtectedAuthorRoute] = useRoute('/author');

  useEffect(() => {
    if (!isDisclosureOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!disclosureRef.current?.contains(event.target as Node)) {
        setIsDisclosureOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDisclosureOpen(false);
        disclosureTriggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isDisclosureOpen]);

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

  function choosePlayerName() {
    setIsDisclosureOpen(false);
    navigate('/explore');
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
        <div className="account-disclosure" ref={disclosureRef}>
          <button
            aria-controls={disclosureId}
            aria-expanded={isDisclosureOpen}
            className="button button--quiet account-disclosure__trigger"
            onClick={() => setIsDisclosureOpen((isOpen) => !isOpen)}
            ref={disclosureTriggerRef}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="account-disclosure__icon"
              fill="none"
              focusable="false"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="8" r="3.25" />
              <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            </svg>
            <span>Account</span>
            <svg
              aria-hidden="true"
              className="account-disclosure__chevron"
              fill="none"
              focusable="false"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 16 16"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>

          {isDisclosureOpen ? (
            <div
              aria-label="Account options"
              className="account-disclosure__panel"
              id={disclosureId}
            >
              {currentPlayer.status === 'ready' &&
              currentPlayer.player.playerName ? (
                <p className="account-control__identity">
                  Signed in as{' '}
                  <strong>{currentPlayer.player.playerName}</strong>
                </p>
              ) : null}
              {currentPlayer.status === 'ready' &&
              !currentPlayer.player.playerName ? (
                <button
                  className="button button--quiet"
                  onClick={choosePlayerName}
                  type="button"
                >
                  Choose Player Name
                </button>
              ) : null}
              <button
                className="button button--quiet"
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
              {actionFailed ? (
                <span className="account-control__error" role="alert">
                  The account action could not start. Try again.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
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
              Switch account
            </button>
          ) : null}
        </>
      )}
      {actionFailed && !isAuthenticated ? (
        <span className="account-control__error" role="alert">
          The account action could not start. Try again.
        </span>
      ) : null}
    </div>
  );
}
