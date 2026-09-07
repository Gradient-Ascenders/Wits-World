import { UserIcon, CaretDownIcon, GearIcon } from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import { confirmOfflineSignOut } from '../../offline/store';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';

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
  const [isProtectedProfileRoute] = useRoute('/profile');
  const [isProtectedAccountRoute] = useRoute('/account');
  const [isProtectedAuthorRoute] = useRoute('/author/*?');
  const playerName =
    currentPlayer.status === 'ready' ? currentPlayer.player.playerName : null;

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
    if ((await confirmOfflineSignOut()) === 'cancelled') return;
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
    if ((await confirmOfflineSignOut('switch accounts')) === 'cancelled')
      return;
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
      isProtectedProfileRoute ||
      isProtectedAccountRoute ||
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
            aria-current={
              isProtectedProfileRoute || isProtectedAccountRoute
                ? 'page'
                : undefined
            }
            aria-controls={disclosureId}
            aria-expanded={isDisclosureOpen}
            aria-label={
              playerName ? `${playerName}, account menu` : 'Account menu'
            }
            className="button button--quiet account-disclosure__trigger"
            onClick={() => setIsDisclosureOpen((isOpen) => !isOpen)}
            ref={disclosureTriggerRef}
            type="button"
          >
            <UserIcon
              aria-hidden="true"
              className="account-disclosure__icon"
              size={20}
            />
            <span className="account-disclosure__name">
              {playerName ?? 'Account'}
            </span>
            <CaretDownIcon
              aria-hidden="true"
              className="account-disclosure__chevron"
              size={16}
            />
          </button>

          {isDisclosureOpen ? (
            <div
              aria-label="Account options"
              className="account-disclosure__panel"
              id={disclosureId}
            >
              {playerName ? (
                <p className="account-control__identity">
                  Signed in as <strong>{playerName}</strong>
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
              <Link
                aria-label="Player profile, Progress and achievements"
                aria-current={isProtectedProfileRoute ? 'page' : undefined}
                className="account-disclosure__destination"
                href="/profile"
                onClick={() => setIsDisclosureOpen(false)}
              >
                <AccountDestinationIcon name="profile" />
                <span>
                  <strong>Player profile</strong>
                  <small>Progress and achievements</small>
                </span>
              </Link>
              <Link
                aria-label="Account settings, Security and account"
                aria-current={isProtectedAccountRoute ? 'page' : undefined}
                className="account-disclosure__destination"
                href="/account"
                onClick={() => setIsDisclosureOpen(false)}
              >
                <AccountDestinationIcon name="settings" />
                <span>
                  <strong>Account settings</strong>
                  <small>Security and account</small>
                </span>
              </Link>
              <div aria-hidden="true" className="account-disclosure__divider" />
              <button
                className="button button--quiet account-disclosure__sign-out"
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

function AccountDestinationIcon({ name }: { name: 'profile' | 'settings' }) {
  const Icon = name === 'profile' ? UserIcon : GearIcon;
  return (
    <Icon
      aria-hidden="true"
      className="account-disclosure__destination-icon"
      size={20}
    />
  );
}
