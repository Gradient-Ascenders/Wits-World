import { authorErrorDetail } from './author-error-copy';
import { StatusMessage } from '../StatusMessage';
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
      <StatusMessage
        tone="error"
        className="author-feedback"
        ref={refObject}
        role="alert"
        tabIndex={-1}
      >
        <strong>{errorTitle(error)}</strong>
        <p>{authorErrorDetail(error)}</p>
        {error.requestId ? <p>Request reference: {error.requestId}</p> : null}
      </StatusMessage>
    );
  }

  if (message) {
    return (
      <StatusMessage
        aria-live="polite"
        tone="success"
        className="author-feedback"
        ref={refObject}
        role="status"
        tabIndex={-1}
      >
        {message}
      </StatusMessage>
    );
  }

  return null;
}

function errorTitle(error: AuthorApiError): string {
  if (error.code === 'CARD_NAME_CONFLICT') return 'Card name already in use';
  const { failure } = error;
  if (failure === 'conflict') return 'This content changed state';
  if (failure === 'not-ready') return 'Publication requirements are not met';
  if (failure === 'forbidden') return 'Author permission is required';
  if (failure === 'authorization') return 'Your session needs attention';
  if (failure === 'validation') return 'Review the highlighted fields';
  if (failure === 'not-found') return 'This content no longer exists';
  return 'The request could not be completed';
}
