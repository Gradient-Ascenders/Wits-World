import { useAuth0 } from '@auth0/auth0-react';
import { useCallback, useState, type ReactNode } from 'react';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';

interface ProtectedRouteProps {
  children: ReactNode;
  destination?: string;
}

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function ProtectedRoute({
  children,
  destination = 'explore Wits World',
}: ProtectedRouteProps) {
  const { error, isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const { reload, state: currentPlayer } = useCurrentPlayer();
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

  if (isLoading) {
    return (
      <section aria-live="polite" className="auth-state" role="status">
        <p className="eyebrow">Player access</p>
        <h1>Checking your sign-in status</h1>
        <p>Please wait while Wits World restores your session.</p>
      </section>
    );
  }

  if (error || actionFailed) {
    return (
      <section className="auth-state" role="alert">
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
      <section aria-live="polite" className="auth-state" role="status">
        <p className="eyebrow">Player access</p>
        <h1>Confirming your Wits World player</h1>
        <p>Protected player data remains hidden until this check completes.</p>
      </section>
    );
  }

  if (currentPlayer.status !== 'ready') {
    return (
      <section className="auth-state" role="alert">
        <p className="eyebrow">Player access</p>
        <h1 ref={focusHeading} tabIndex={-1}>
          Your player session could not be restored
        </h1>
        <p>
          {currentPlayer.status === 'error' &&
          currentPlayer.failure === 'identity_changed'
            ? 'The restored Auth0 session did not match the Wits World player who was active in this browser. Wits World signed out instead of opening another player.'
            : 'Wits World could not safely confirm the current player. Protected player data remains hidden.'}
        </p>
        <button className="button" onClick={reload} type="button">
          Check session again
        </button>
      </section>
    );
  }

  return children;
}
