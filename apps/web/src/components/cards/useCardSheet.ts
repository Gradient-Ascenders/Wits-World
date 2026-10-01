import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../../accessibility/preferences';

/** Keep native content scrolling until a gesture starts at its top edge. */
export function useCardSheet(
  panelRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const dismissRef = useRef<() => void>(() => {});

  useEffect(() => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (!panel || !body) return;
    const mobile = window.matchMedia('(max-width: 47.99rem)');
    let offset = 0;
    let dismissal: Animation | null = null;
    let suppressClick = false;
    let gesture: {
      x: number;
      y: number;
      time: number;
      lastTime: number;
      height: number;
      header: boolean;
      moved: boolean;
      pointerId?: number;
    } | null = null;

    function settle() {
      panel!.removeAttribute('data-dragging');
      offset = 0;
      panel!.style.removeProperty('--card-sheet-offset');
    }

    function dismiss() {
      if (dismissal) return;
      if (prefersReducedMotion()) {
        onClose();
        return;
      }
      dismissal = panel!.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: 'translateY(100%)' },
        ],
        { duration: 180, easing: 'ease-in', fill: 'forwards' },
      );
      void dismissal.finished.then(onClose).catch(() => {});
    }

    function resize() {
      gesture = null;
      settle();
    }

    function start(
      target: EventTarget | null,
      x: number,
      y: number,
      time: number,
    ) {
      if (!mobile.matches || dismissal || !(target instanceof HTMLElement))
        return;
      suppressClick = false;
      if (
        target.closest('button, a, input, select, textarea, summary') &&
        !target.closest('[data-card-sheet-handle]')
      )
        return;
      const header = !!target.closest('[data-card-sheet-header]');
      // A gesture already scrolling the body stays native for its duration.
      if (!header && (!body!.contains(target) || body!.scrollTop > 1)) return;
      gesture = {
        x,
        y,
        time,
        lastTime: time,
        height: panel!.getBoundingClientRect().height,
        header,
        moved: false,
      };
    }

    function move(x: number, y: number, time: number, event: Event) {
      const drag = gesture;
      if (!drag) return;
      const distance = y - drag.y;
      if (!drag.moved) {
        if (Math.abs(distance) < 8) return;
        if (
          Math.abs(x - drag.x) > Math.abs(distance) ||
          (!drag.header && distance < 0)
        ) {
          gesture = null;
          return;
        }
        drag.moved = true;
        if (drag.pointerId !== undefined)
          panel!.setPointerCapture?.(drag.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      drag.lastTime = time;
      suppressClick = true;
      panel!.dataset.dragging = 'true';
      offset = Math.max(0, distance);
      panel!.style.setProperty('--card-sheet-offset', `${offset}px`);
    }

    function finish(y: number, time: number, cancelled = false) {
      const drag = gesture;
      gesture = null;
      if (!drag) return;
      if (
        drag.pointerId !== undefined &&
        panel!.hasPointerCapture?.(drag.pointerId)
      )
        panel!.releasePointerCapture(drag.pointerId);
      if (!drag.moved) return;
      const movementY = y - drag.y;
      const velocity =
        time - drag.lastTime > 120
          ? 0
          : movementY / Math.max(1, time - drag.time);
      if (
        !cancelled &&
        (movementY > drag.height * 0.28 || (movementY > 50 && velocity > 0.45))
      )
        dismiss();
      else settle();
    }

    function touchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        if (gesture) finish(gesture.y, event.timeStamp, true);
        return;
      }
      const touch = event.touches[0]!;
      start(event.target, touch.clientX, touch.clientY, event.timeStamp);
    }
    function touchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (touch) move(touch.clientX, touch.clientY, event.timeStamp, event);
    }
    function touchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      if (touch)
        finish(touch.clientY, event.timeStamp, event.type === 'touchcancel');
    }
    function pointerDown(event: PointerEvent) {
      if (
        event.pointerType === 'touch' ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.closest('[data-card-sheet-header]')
      )
        return;
      start(event.target, event.clientX, event.clientY, event.timeStamp);
      if (gesture) {
        gesture.pointerId = event.pointerId;
      }
    }
    function pointerMove(event: PointerEvent) {
      if (gesture?.pointerId === event.pointerId)
        move(event.clientX, event.clientY, event.timeStamp, event);
    }
    function pointerEnd(event: PointerEvent) {
      if (gesture?.pointerId === event.pointerId)
        finish(event.clientY, event.timeStamp, event.type === 'pointercancel');
    }
    function preventDragClick(event: MouseEvent) {
      if (!suppressClick) return;
      suppressClick = false;
      if (event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
    }
    dismissRef.current = () => {
      if (mobile.matches) dismiss();
    };

    resize();
    panel.addEventListener('touchstart', touchStart, { passive: true });
    panel.addEventListener('touchmove', touchMove, { passive: false });
    panel.addEventListener('touchend', touchEnd);
    panel.addEventListener('touchcancel', touchEnd);
    panel.addEventListener('pointerdown', pointerDown);
    panel.addEventListener('pointermove', pointerMove);
    panel.addEventListener('pointerup', pointerEnd);
    panel.addEventListener('pointercancel', pointerEnd);
    panel.addEventListener('click', preventDragClick, true);
    window.addEventListener('resize', resize);
    return () => {
      dismissal?.cancel();
      panel.removeEventListener('touchstart', touchStart);
      panel.removeEventListener('touchmove', touchMove);
      panel.removeEventListener('touchend', touchEnd);
      panel.removeEventListener('touchcancel', touchEnd);
      panel.removeEventListener('pointerdown', pointerDown);
      panel.removeEventListener('pointermove', pointerMove);
      panel.removeEventListener('pointerup', pointerEnd);
      panel.removeEventListener('pointercancel', pointerEnd);
      panel.removeEventListener('click', preventDragClick, true);
      window.removeEventListener('resize', resize);
    };
  }, [bodyRef, onClose, panelRef]);

  return { dismiss: () => dismissRef.current() };
}
