import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from 'react';

interface ResignMatchDialogProps {
  kind?: 'resignation' | 'cancellation';
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  opponentLabel: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function ResignMatchDialog({
  kind = 'resignation',
  busy,
  onCancel,
  onConfirm,
  opponentLabel,
  returnFocusRef,
}: ResignMatchDialogProps) {
  const cancellation = kind === 'cancellation';
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [returnFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!controls || controls.length === 0) return;
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
    <div className="pvp-resign-dialog-backdrop">
      <div
        aria-busy={busy ? 'true' : undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="pvp-resign-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
      >
        <p className="eyebrow">
          {cancellation ? 'Cancel invitation' : 'Permanent battle result'}
        </p>
        <h2 id={titleId}>
          {cancellation ? 'Cancel this challenge?' : 'Forfeit this battle?'}
        </h2>
        <div id={descriptionId}>
          <p>
            {cancellation
              ? `Cancel your pending challenge to ${opponentLabel}? This cannot be undone. No match result will be recorded.`
              : `Forfeiting immediately records a loss for you and a win for ${opponentLabel}. This result cannot be undone.`}
          </p>
        </div>
        <div className="pvp-resign-dialog__actions">
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {cancellation ? 'Keep challenge' : 'Keep playing'}
          </button>
          <button
            className="button button--danger"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {cancellation
              ? busy
                ? 'Cancelling…'
                : 'Confirm cancellation'
              : busy
                ? 'Forfeiting battle…'
                : 'Confirm forfeit'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
