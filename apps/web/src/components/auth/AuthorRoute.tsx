import { useCallback, type ReactNode } from 'react';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';

interface AuthorRouteProps {
  children: ReactNode;
}

export function AuthorRoute({ children }: AuthorRouteProps) {
  const { reload, state } = useCurrentPlayer();
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => {
    heading?.focus();
  }, []);

  if (state.status === 'anonymous' || state.status === 'loading') {
    return (
      <section aria-live="polite" className="auth-state" role="status">
        <p className="eyebrow">Author access</p>
        <h1>Checking author access</h1>
        <p>
          The console opens only after Wits World confirms your current role.
        </p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="auth-state" role="alert">
        <p className="eyebrow">Author access</p>
        <h1 ref={focusHeading} tabIndex={-1}>
          Author access could not be checked
        </h1>
        <p>
          {state.failure === 'authorization'
            ? 'Your session could not be confirmed. Sign out and sign in again if retrying does not help.'
            : 'The API is unavailable right now. Your content has not been changed.'}
        </p>
        <button className="button" onClick={reload} type="button">
          Check access again
        </button>
      </section>
    );
  }

  if (state.player.role !== 'author') {
    return (
      <section className="auth-state" role="alert">
        <p className="eyebrow">Author access</p>
        <h1 ref={focusHeading} tabIndex={-1}>
          Author permission is required
        </h1>
        <p>
          This account is signed in as a Player. Author roles are assigned
          outside the browser, and the API independently protects every author
          operation.
        </p>
        <a className="button button--link" href="/explore">
          Return to player exploration
        </a>
      </section>
    );
  }

  return children;
}
