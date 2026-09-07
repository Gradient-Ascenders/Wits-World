import { StateIcon } from '../StatusMessage';
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
      <section
        aria-live="polite"
        className="auth-state state-message state-loading"
        role="status"
      >
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
      <section
        className="auth-state state-message state-message--error"
        role="alert"
      >
        <StateIcon tone="error" />
        <p className="eyebrow">Author access</p>
        <h1 ref={focusHeading} tabIndex={-1}>
          Author access could not be checked
        </h1>
        <p>
          {state.failure === 'authorization'
            ? 'Your session could not be confirmed. Sign out and sign in again if retrying does not help.'
            : 'Author access is unavailable right now. Your content has not been changed.'}
        </p>
        <button className="button" onClick={reload} type="button">
          Check access again
        </button>
      </section>
    );
  }

  if (state.player.role !== 'author') {
    return (
      <section
        className="auth-state state-message state-message--permission"
        role="status"
      >
        <StateIcon tone="permission" />
        <p className="eyebrow">Author access</p>
        <h1 ref={focusHeading} tabIndex={-1}>
          Author permission is required
        </h1>
        <p>
          This account has player access. An author role is needed to manage
          campus content. You can still explore and play.
        </p>
        <a className="button button--link" href="/explore">
          Return to player exploration
        </a>
      </section>
    );
  }

  return children;
}
