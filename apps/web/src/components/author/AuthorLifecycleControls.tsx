import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { AuthorTransitionAction, AuthoringStatus } from '../../api/author';
import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import { AuthorConfirmationDialog } from './AuthorConfirmationDialog';

interface AuthorLifecycleControlsProps {
  busy: boolean;
  canReview?: boolean;
  editControl?: ReactNode;
  noun: string;
  onAction: (action: AuthorTransitionAction, reason?: string) => void;
  retirementDescription: ReactNode;
  retirementDisabled?: boolean;
  retirementDisabledDescription?: ReactNode;
  retirementTitle?: string;
  status: AuthoringStatus;
  submittedBy: string | null;
}

export function AuthorLifecycleControls({
  busy,
  canReview: canReviewOverride,
  editControl,
  noun,
  onAction,
  retirementDescription,
  retirementDisabled = false,
  retirementDisabledDescription,
  retirementTitle,
  status,
  submittedBy,
}: AuthorLifecycleControlsProps) {
  const { state } = useCurrentPlayer();
  const [dialog, setDialog] = useState<'retire' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const retireButtonRef = useRef<HTMLButtonElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const currentPlayerId = state.status === 'ready' ? state.player.id : null;
  const canReview =
    canReviewOverride ??
    Boolean(currentPlayerId && submittedBy && currentPlayerId !== submittedBy);

  useEffect(() => {
    setDialog(null);
    setReason('');
    setReasonError('');
  }, [status]);

  function submitReturn() {
    const normalized = reason.trim();
    if (normalized.length === 0) {
      setReasonError(`Enter a reason for returning this ${noun}.`);
      reasonRef.current?.focus();
      return;
    }
    if (normalized.length > 1000) {
      setReasonError('Keep the return reason to 1,000 characters or fewer.');
      reasonRef.current?.focus();
      return;
    }
    setReasonError('');
    setDialog(null);
    onAction('return', normalized);
  }

  return (
    <>
      <div className="author-actions author-actions--detail">
        {status === 'draft' ? editControl : null}
        {status === 'draft' ? (
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={() => onAction('submit')}
            type="button"
          >
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
        ) : null}
        {status === 'in_review' && canReview ? (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() => onAction('approve')}
              type="button"
            >
              {busy ? 'Approving…' : `Approve ${noun}`}
            </button>
            <button
              className="button button--quiet"
              disabled={busy}
              onClick={() => setDialog('return')}
              ref={returnButtonRef}
              type="button"
            >
              Return with reason
            </button>
          </>
        ) : null}
        {status === 'approved' ? (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() => onAction('publish')}
              type="button"
            >
              {busy ? 'Publishing…' : `Publish ${noun}`}
            </button>
            {canReview ? (
              <button
                className="button button--quiet"
                disabled={busy}
                onClick={() => setDialog('return')}
                ref={returnButtonRef}
                type="button"
              >
                Return with reason
              </button>
            ) : null}
          </>
        ) : null}
        {status === 'published' ? (
          <button
            aria-describedby={
              retirementDisabled ? `retire-${noun}-blocked` : undefined
            }
            className="button button--danger"
            disabled={busy || retirementDisabled}
            onClick={() => setDialog('retire')}
            ref={retireButtonRef}
            type="button"
          >
            Retire {noun}
          </button>
        ) : null}
      </div>

      {status === 'published' && retirementDisabled ? (
        <p
          className="author-notice"
          id={`retire-${noun}-blocked`}
          role="status"
        >
          {retirementDisabledDescription}
        </p>
      ) : null}

      {status === 'in_review' && !canReview ? (
        <p className="author-notice" role="status">
          This submission is awaiting review by another Author. Self-approval is
          not available.
        </p>
      ) : null}

      {dialog === 'return' ? (
        <AuthorConfirmationDialog
          busy={busy}
          cancelLabel={`Keep ${noun} in review`}
          confirmLabel={busy ? 'Returning…' : `Return ${noun}`}
          description={
            <div className="form-field">
              <label htmlFor={`return-${noun}-reason`}>Return reason</label>
              <textarea
                aria-describedby={
                  reasonError ? `return-${noun}-reason-error` : undefined
                }
                aria-invalid={reasonError ? 'true' : undefined}
                id={`return-${noun}-reason`}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                ref={reasonRef}
                value={reason}
              />
              {reasonError ? (
                <span
                  className="field-error"
                  id={`return-${noun}-reason-error`}
                >
                  {reasonError}
                </span>
              ) : null}
            </div>
          }
          initialFocusRef={reasonRef}
          onCancel={() => setDialog(null)}
          onConfirm={submitReturn}
          returnFocusRef={returnButtonRef}
          title={`Return this ${noun} to draft?`}
        />
      ) : null}

      {dialog === 'retire' ? (
        <AuthorConfirmationDialog
          busy={busy}
          cancelLabel={`Keep ${noun}`}
          confirmLabel={busy ? 'Retiring…' : `Retire ${noun}`}
          description={retirementDescription}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            onAction('retire');
          }}
          returnFocusRef={retireButtonRef}
          title={retirementTitle ?? `Retire this ${noun}?`}
        />
      ) : null}
    </>
  );
}
