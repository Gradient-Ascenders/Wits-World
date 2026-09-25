import { createPortal } from 'react-dom';
import { useId, useRef, type KeyboardEvent, type RefObject } from 'react';

import { useModalFocus } from '../useModalFocus';

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

  const keepFocusInside = useModalFocus({
    busy,
    dialogRef,
    initialFocusRef: cancelRef,
    returnFocusRef,
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    keepFocusInside(event);
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
        tabIndex={-1}
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
