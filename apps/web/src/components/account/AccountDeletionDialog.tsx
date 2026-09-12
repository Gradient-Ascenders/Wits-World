import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';

interface AccountDeletionDialogProps {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  phase: 'confirm' | 'prepare';
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function AccountDeletionDialog({
  busy,
  onCancel,
  onConfirm,
  phase,
  returnFocusRef,
}: AccountDeletionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmationId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const isFinalConfirmation = phase === 'confirm';

  useEffect(() => {
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && !element.contains(dialogRef.current),
    );
    const previousInert = background.map((element) => element.inert);
    const previousOverflow = document.body.style.overflow;
    background.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    return () => {
      background.forEach((element, index) => {
        element.inert = previousInert[index] ?? false;
      });
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    );

    if (!controls || controls.length === 0) {
      event.preventDefault();
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return createPortal(
    <div className="account-dialog-backdrop">
      <div
        aria-busy={busy ? 'true' : undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`account-dialog${isFinalConfirmation ? '' : ' account-dialog--prepare'}`}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        {isFinalConfirmation ? (
          <p className="eyebrow">Permanent account deletion</p>
        ) : null}
        <h2 id={titleId}>
          {isFinalConfirmation
            ? 'Permanently delete account?'
            : 'Delete account?'}
        </h2>

        <div className="account-dialog__description" id={descriptionId}>
          {isFinalConfirmation ? (
            <>
              <p>
                This immediately locks your account. Your cards, decks, coins,
                active game data, and identifying account information will be
                permanently removed under the Wits World retention policy.
              </p>
              <label
                className="account-dialog__acknowledgement"
                htmlFor={confirmationId}
              >
                <input
                  checked={acknowledged}
                  disabled={busy}
                  id={confirmationId}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I understand this cannot be undone and I will lose access to
                  this Wits World account.
                </span>
              </label>
            </>
          ) : (
            <p>
              For your security, you’ll need to sign in again with Auth0 before
              permanently deleting your account. Wits World never receives your
              credentials, and nothing is deleted until you confirm the next
              step.
            </p>
          )}
        </div>

        <div className="account-dialog__actions">
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Cancel deletion
          </button>
          <button
            className={isFinalConfirmation ? 'button button--danger' : 'button'}
            disabled={busy || (isFinalConfirmation && !acknowledged)}
            onClick={onConfirm}
            type="button"
          >
            {busy
              ? 'Deleting account…'
              : isFinalConfirmation
                ? 'Permanently delete account'
                : 'Sign in again'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
