import { authorErrorDetail } from './author-error-copy';
import { StatusMessage } from '../StatusMessage';
import type { RefObject } from 'react';

import type { AuthorApiError } from '../../api/author';

interface AuthorFeedbackProps {
  compact?: boolean;
  error?: AuthorApiError | null;
  message?: string;
  refObject: RefObject<HTMLDivElement | null>;
}

export function AuthorFeedback({
  compact = false,
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
        <strong>
          {compact && error.failure === 'unavailable'
            ? 'Outcome not confirmed'
            : errorTitle(error)}
        </strong>
        <p>
          {compact && error.failure === 'unavailable'
            ? 'Reload before retrying.'
            : authorErrorDetail(error)}
        </p>
        {error.requestId ? (
          <details>
            <summary>Request details</summary>
            <p>Request reference: {error.requestId}</p>
          </details>
        ) : null}
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
        {compact ? compactNotice(message) : message}
      </StatusMessage>
    );
  }

  return null;
}

function compactNotice(message: string) {
  if (/^(Event|Question|Challenge|Card|Campaign) approved\.$/.test(message))
    return 'Approved.';
  if (
    /^(Event|Question|Challenge|Card|Campaign) returned to draft\.$/.test(
      message,
    )
  )
    return 'Returned to draft.';
  return message;
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
