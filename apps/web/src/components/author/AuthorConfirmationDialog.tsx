import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

interface AuthorConfirmationDialogProps {
  busy?: boolean;
  cancelLabel: string;
  confirmLabel: string;
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
  confirmLabel,
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
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    (initialFocusRef?.current ?? cancelRef.current)?.focus();
    return () => {
      const target = returnFocusRef?.current ?? previouslyFocusedRef.current;
      target?.focus();
    };
  }, [initialFocusRef, returnFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
    <div className="author-dialog-backdrop">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="author-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
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
            className="button button--danger"
            disabled={busy}
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
