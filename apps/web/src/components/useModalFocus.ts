import { useEffect, type KeyboardEvent, type RefObject } from 'react';

const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

export function useModalFocus({
  busy,
  dialogRef,
  fallbackFocusRef,
  initialFocusRef,
  returnFocusRef,
}: {
  busy: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && !element.contains(dialog),
    );
    const previousInert = background.map((element) => element.inert);
    const previousOverflow = document.body.style.overflow;

    background.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = 'hidden';
    (initialFocusRef?.current ?? fallbackFocusRef?.current ?? dialog)?.focus();

    return () => {
      background.forEach((element, index) => {
        element.inert = previousInert[index] ?? false;
      });
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef?.current;
      if (target?.isConnected) target.focus();
      else if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [dialogRef, fallbackFocusRef, initialFocusRef, returnFocusRef]);

  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy, dialogRef]);

  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (controls.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (!controls.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
