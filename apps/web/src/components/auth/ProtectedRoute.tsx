import { useAuth0 } from '@auth0/auth0-react';
import { useState, type ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { error, isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [actionFailed, setActionFailed] = useState(false);

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
        <p>Please wait while Wits Quest restores your session.</p>
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
        <h1>Sign in to explore Wits Quest</h1>
        <p>
          Continue to Auth0's secure sign-in page, then return here to open the
          protected campus experience.
        </p>
        <button className="button" onClick={startSignIn} type="button">
          Sign in to explore
        </button>
      </section>
    );
  }

  return children;
}
