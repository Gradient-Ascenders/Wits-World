import { useEffect, type RefObject } from 'react';

/** Mobile sheet gestures. Consume body scroll before moving the sheet. */
export function useCreatureSheet(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
) {
  useEffect(() => {
    const sheet = ref.current;
    if (!open || !sheet) return;
    const body = sheet.querySelector<HTMLElement>(
      '.battle-creature-dialog__body',
    )!;
    const mobile = window.matchMedia('(max-width: 47.99rem)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let expanded = false;
    let offset = 0;
    let frame = 0;
    let closing = false;
    let gesture: {
      id: number;
      x: number;
      y: number;
      lastY: number;
      time: number;
      velocity: number;
      header: boolean;
      moved: boolean;
    } | null = null;
    const height = () => {
      if (expanded) return window.innerHeight * 0.98;
      const contentHeight =
        sheet!.querySelector('header')!.getBoundingClientRect().height +
        body.scrollHeight +
        2;
      return Math.min(
        window.innerHeight * 0.85,
        Math.max(window.innerHeight * 0.4, contentHeight),
      );
    };
    function paint() {
      sheet!.style.height = `${Math.min(window.innerHeight * 0.98, height() + Math.max(0, -offset))}px`;
      sheet!.style.transform = `translateY(${Math.max(0, offset)}px)`;
    }
    function settle() {
      offset = 0;
      sheet!.removeAttribute('data-dragging');
      paint();
    }
    function dismiss() {
      if (closing) return;
      closing = true;
      cancelAnimationFrame(frame);
      sheet!.removeAttribute('data-dragging');
      if (!mobile.matches || reduced.matches) {
        sheet!.close();
        return;
      }
      const animation = sheet!.animate(
        [
          { transform: `translateY(${Math.max(0, offset)}px)` },
          { transform: 'translateY(100%)' },
        ],
        { duration: 180, easing: 'ease-in', fill: 'forwards' },
      );
      void animation.finished.then(() => sheet!.close()).catch(() => {});
    }
    function down(event: PointerEvent) {
      if (!mobile.matches || !event.isPrimary || event.button !== 0 || closing)
        return;
      const target = event.target as HTMLElement;
      if (target.closest('button') || target === sheet) return;
      cancelAnimationFrame(frame);
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        lastY: event.clientY,
        time: event.timeStamp,
        velocity: 0,
        header: !!target.closest('header'),
        moved: false,
      };
    }
    function move(event: PointerEvent) {
      if (!gesture || gesture.id !== event.pointerId) return;
      const g = gesture;
      if (!g.moved) {
        if (Math.abs(event.clientY - g.y) < 6) return;
        if (Math.abs(event.clientX - g.x) > Math.abs(event.clientY - g.y)) {
          gesture = null;
          return;
        }
        g.moved = true;
        sheet!.setPointerCapture(event.pointerId);
        sheet!.dataset.dragging = 'true';
      }
      event.preventDefault();
      let delta = event.clientY - g.lastY;
      g.velocity = delta / Math.max(1, event.timeStamp - g.time);
      g.lastY = event.clientY;
      g.time = event.timeStamp;
      if (!g.header && offset === 0) {
        const oldScroll = body.scrollTop;
        body.scrollTop -= delta;
        delta -= oldScroll - body.scrollTop;
        // Upward body gestures remain content scrolling, including at the end.
        if (delta < 0) delta = 0;
      }
      offset = Math.max(
        g.header ? -window.innerHeight * 0.58 : 0,
        offset + delta,
      );
      paint();
    }
    function finish(event: PointerEvent) {
      if (!gesture || gesture.id !== event.pointerId) return;
      const g = gesture;
      gesture = null;
      if (sheet!.hasPointerCapture(event.pointerId))
        sheet!.releasePointerCapture(event.pointerId);
      if (!g.moved) return;
      if (event.type === 'pointercancel') {
        settle();
        return;
      }
      const velocity = event.timeStamp - g.time < 100 ? g.velocity : 0;
      if (offset > height() * 0.28 || (offset > 50 && velocity > 0.75)) {
        dismiss();
        return;
      }
      if (offset < -40) expanded = true;
      else if (offset > 65) expanded = false;
      const wasScrolling = !g.header && offset === 0;
      settle();
      // Retain momentum for ordinary content scrolling, never for sheet dismissal.
      if (wasScrolling && Math.abs(velocity) > 0.1 && !reduced.matches) {
        let speed = -velocity * 16;
        const coast = () => {
          const previous = body.scrollTop;
          body.scrollTop += speed;
          speed *= 0.92;
          if (Math.abs(speed) > 0.5 && body.scrollTop !== previous)
            frame = requestAnimationFrame(coast);
        };
        frame = requestAnimationFrame(coast);
      }
    }
    function click(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('[aria-label="Close Creature details"]')) {
        event.preventDefault();
        dismiss();
      }
      if (target === sheet) {
        const box = sheet!.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          dismiss();
      }
    }
    function cancel(event: Event) {
      event.preventDefault();
      dismiss();
    }
    function resize() {
      gesture = null;
      expanded = false;
      if (mobile.matches) settle();
      else {
        sheet!.style.removeProperty('height');
        sheet!.style.removeProperty('transform');
      }
    }
    resize();
    sheet.addEventListener('pointerdown', down);
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', finish);
    sheet.addEventListener('pointercancel', finish);
    sheet.addEventListener('click', click);
    sheet.addEventListener('cancel', cancel);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      sheet.removeEventListener('pointerdown', down);
      sheet.removeEventListener('pointermove', move);
      sheet.removeEventListener('pointerup', finish);
      sheet.removeEventListener('pointercancel', finish);
      sheet.removeEventListener('click', click);
      sheet.removeEventListener('cancel', cancel);
      window.removeEventListener('resize', resize);
    };
  }, [open, ref]);
}
