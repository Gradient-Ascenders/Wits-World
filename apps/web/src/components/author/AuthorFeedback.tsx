import type { RefObject } from 'react';

import type { AuthorApiError } from '../../api/author';

interface AuthorFeedbackProps {
  error?: AuthorApiError | null;
  message?: string;
  refObject: RefObject<HTMLDivElement | null>;
}

export function AuthorFeedback({
  error,
  message,
  refObject,
}: AuthorFeedbackProps) {
  if (error) {
    return (
      <div
        className="author-feedback author-feedback--error"
        ref={refObject}
        role="alert"
        tabIndex={-1}
      >
        <strong>{errorTitle(error.failure)}</strong>
        <p>{error.detail}</p>
        {error.requestId ? <p>Request reference: {error.requestId}</p> : null}
      </div>
    );
  }

  if (message) {
    return (
      <div
        aria-live="polite"
        className="author-feedback author-feedback--success"
        ref={refObject}
        role="status"
        tabIndex={-1}
      >
        {message}
      </div>
    );
  }

  return null;
}

function errorTitle(failure: AuthorApiError['failure']): string {
  if (failure === 'conflict') return 'This content changed state';
  if (failure === 'not-ready') return 'Publication requirements are not met';
  if (failure === 'forbidden') return 'Author permission was refused';
  if (failure === 'authorization') return 'Your session needs attention';
  if (failure === 'validation') return 'Some content is invalid';
  if (failure === 'not-found') return 'This content no longer exists';
  return 'The request could not be completed';
}
