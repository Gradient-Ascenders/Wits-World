import { useEffect, useState, type RefObject } from 'react';

/** Directional hysteresis keeps the mobile save bar stable during small gestures. */
export function useDeckSaveBar(
  bar: RefObject<HTMLDivElement | null>,
  keepExpanded: boolean,
) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 63.999rem)');
    let lastY = window.scrollY;
    let distance = 0;
    let direction = 0;
    let lastTime = 0;
    let frame = 0;

    function reset() {
      lastY = window.scrollY;
      distance = 0;
      direction = 0;
      setCollapsed(false);
    }

    function update() {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      const now = performance.now();
      if (now - lastTime > 200) distance = 0;
      lastTime = now;

      // Never hide a focused control or collapse an important pending decision.
      if (
        !mobile.matches ||
        keepExpanded ||
        bar.current?.contains(document.activeElement)
      ) {
        lastY = y;
        distance = 0;
        return;
      }
      const bottom = document.documentElement.scrollHeight - window.innerHeight;
      if (y <= 16) {
        reset();
        return;
      }
      if (y >= bottom - 16) {
        // Keep the end of the list clear, including during touch overscroll.
        setCollapsed(true);
        lastY = Math.min(y, bottom);
        distance = 0;
        direction = 0;
        return;
      }
      if (Math.abs(delta) < 3) return;
      const nextDirection = Math.sign(delta);
      distance =
        nextDirection === direction
          ? distance + Math.abs(delta)
          : Math.abs(delta);
      direction = nextDirection;
      lastY = y;
      if (distance >= (direction > 0 ? 48 : 24)) {
        setCollapsed(direction > 0);
        distance = 0;
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    reset();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', reset);
    mobile.addEventListener('change', reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', reset);
      mobile.removeEventListener('change', reset);
    };
  }, [bar, keepExpanded]);

  return {
    collapsed: collapsed && !keepExpanded,
    expand: () => setCollapsed(false),
  };
}
