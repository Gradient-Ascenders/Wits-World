import { useAuth0 } from '@auth0/auth0-react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'wouter';

export function HomeChallengeCta() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [actionFailed, setActionFailed] = useState(false);

  async function signUp() {
    setActionFailed(false);

    try {
      await loginWithRedirect({
        appState: { returnTo: '/explore' },
        authorizationParams: { screen_hint: 'signup' },
      });
    } catch {
      setActionFailed(true);
    }
  }

  if (isAuthenticated) {
    return (
      <Link className="home-complete-link" href="/explore">
        Find more challenges
        <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
      </Link>
    );
  }

  return (
    <span className="home-complete-cta">
      <button
        className="home-complete-link"
        disabled={isLoading}
        onClick={signUp}
        type="button"
      >
        Sign up to play more
        <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
      </button>
      {actionFailed ? (
        <span className="home-complete-cta__error" role="alert">
          Sign-up could not start. Try again.
        </span>
      ) : null}
    </span>
  );
}
