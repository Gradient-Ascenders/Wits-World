import { createPortal } from 'react-dom';
import {
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from 'react';

import { useModalFocus } from '../useModalFocus';
import { ActionLoadingFeedback } from '../LoadingState';

interface TradeConfirmationDialogProps {
  busy: boolean;
  children?: ReactNode;
  confirmLabel: string;
  description: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  title: string;
}

export function TradeConfirmationDialog({
  busy,
  children,
  confirmLabel,
  description,
  destructive = false,
  onCancel,
  onConfirm,
  returnFocusRef,
  title,
}: TradeConfirmationDialogProps) {
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
    <div className="trade-dialog-backdrop">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`trade-dialog${children ? ' trade-dialog--review' : ''}`}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role={destructive ? 'alertdialog' : 'dialog'}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {children}
        <ActionLoadingFeedback active={busy} label={confirmLabel} />
        <div className="trade-dialog__actions" aria-busy={busy || undefined}>
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Keep reviewing
          </button>
          <button
            className={destructive ? 'button button--danger' : 'button'}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
