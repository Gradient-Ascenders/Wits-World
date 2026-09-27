import { createPortal } from 'react-dom';
import {
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { useModalFocus } from '../useModalFocus';
import './author-confirmation-dialog.css';

interface AuthorConfirmationDialogProps {
  busy?: boolean;
  cancelLabel: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  confirmTone?: 'danger' | 'primary';
  description: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: string;
}

export function AuthorConfirmationDialog({
  busy = false,
  cancelLabel,
  confirmDisabled = false,
  confirmLabel,
  confirmTone = 'danger',
  description,
  initialFocusRef,
  onCancel,
  onConfirm,
  returnFocusRef,
  title,
}: AuthorConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const keepFocusInside = useModalFocus({
    busy,
    dialogRef,
    fallbackFocusRef: cancelRef,
    initialFocusRef,
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
    <div className="author-dialog-backdrop">
      <div
        aria-busy={busy || undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="author-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <p className="eyebrow">Please confirm</p>
        <h2 id={titleId}>{title}</h2>
        <div className="author-dialog__description" id={descriptionId}>
          {description}
        </div>
        <div className="author-dialog__actions">
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`button${confirmTone === 'danger' ? ' button--danger' : ''}`}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
