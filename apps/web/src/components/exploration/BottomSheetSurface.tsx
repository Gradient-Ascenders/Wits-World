import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react';

export type BottomSheetSnap = 'expanded' | 'medium' | 'peek';

export interface BottomSheetSnapPoints {
  expanded: number;
  medium: number;
  peek: number;
}

interface ResolveBottomSheetSnapOptions {
  currentVisibleHeight: number;
  movementY: number;
  points: BottomSheetSnapPoints;
  startSnap: BottomSheetSnap;
  velocityY: number;
}

interface BottomSheetSurfaceProps {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  id: string;
  onSnapChange: (snap: BottomSheetSnap) => void;
  panelRef: RefObject<HTMLElement | null>;
  snap: BottomSheetSnap;
  sheetName?: string;
  view: string;
}

interface DragState {
  lastTime: number;
  lastY: number;
  moved: boolean;
  pointerId: number;
  startSnap: BottomSheetSnap;
  startTime: number;
  startVisibleHeight: number;
  startY: number;
}

const DRAG_THRESHOLD_PX = 8;
const FLICK_VELOCITY_PX_PER_MS = 0.45;
const SNAP_ORDER: readonly BottomSheetSnap[] = ['peek', 'medium', 'expanded'];

export function getBottomSheetSnapPoints(
  panelHeight: number,
): BottomSheetSnapPoints {
  const expanded = Math.max(1, panelHeight);
  const peek = Math.min(expanded, 100);
  const medium = Math.min(
    expanded,
    Math.max(peek, 280, Math.round(expanded * 0.52)),
  );

  return { expanded, medium, peek };
}

export function resolveBottomSheetSnap({
  currentVisibleHeight,
  movementY,
  points,
  startSnap,
  velocityY,
}: ResolveBottomSheetSnapOptions): BottomSheetSnap {
  if (
    Math.abs(movementY) < DRAG_THRESHOLD_PX &&
    Math.abs(velocityY) < FLICK_VELOCITY_PX_PER_MS
  ) {
    return startSnap;
  }

  const nearest = SNAP_ORDER.reduce((closest, candidate) => {
    const candidateDistance = Math.abs(
      points[candidate] - currentVisibleHeight,
    );
    const closestDistance = Math.abs(points[closest] - currentVisibleHeight);
    return candidateDistance < closestDistance ? candidate : closest;
  }, startSnap);

  if (Math.abs(velocityY) < FLICK_VELOCITY_PX_PER_MS) {
    return nearest;
  }

  const nearestIndex = SNAP_ORDER.indexOf(nearest);
  const directionalIndex = velocityY < 0 ? nearestIndex + 1 : nearestIndex - 1;
  return SNAP_ORDER[
    Math.max(0, Math.min(SNAP_ORDER.length - 1, directionalIndex))
  ]!;
}

export function BottomSheetSurface({
  ariaLabel,
  children,
  className,
  id,
  onSnapChange,
  panelRef,
  snap,
  sheetName = 'event',
  view,
}: BottomSheetSurfaceProps) {
  const pointsRef = useRef<BottomSheetSnapPoints>(
    getBottomSheetSnapPoints(480),
  );
  const currentVisibleHeightRef = useRef(pointsRef.current[snap]);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const applyVisibleHeight = useCallback(
    (visibleHeight: number, dragging: boolean): void => {
      const panel = panelRef.current;
      const explorationView = panel?.parentElement;
      if (!panel || !explorationView) {
        return;
      }

      const boundedVisibleHeight = Math.max(
        pointsRef.current.peek,
        Math.min(pointsRef.current.expanded, visibleHeight),
      );
      currentVisibleHeightRef.current = boundedVisibleHeight;
      panel.style.setProperty(
        '--sheet-translate-y',
        `${Math.max(0, pointsRef.current.expanded - boundedVisibleHeight)}px`,
      );
      explorationView.style.setProperty(
        '--event-panel-height',
        `${boundedVisibleHeight}px`,
      );
      explorationView.dataset.sheetDragging = String(dragging);
    },
    [panelRef],
  );

  const measure = useCallback((): void => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const panelHeight = panel.offsetHeight;
    if (panelHeight <= 0) {
      return;
    }

    pointsRef.current = getBottomSheetSnapPoints(panelHeight);
    applyVisibleHeight(pointsRef.current[snap], false);
  }, [applyVisibleHeight, panelRef, snap]);

  useLayoutEffect(() => {
    measure();
    const panel = panelRef.current;
    const explorationView = panel?.parentElement;
    if (!panel || !explorationView) {
      return;
    }

    const resize = (): void => measure();
    window.addEventListener('resize', resize);
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => measure());
    resizeObserver?.observe(panel);
    resizeObserver?.observe(explorationView);

    return () => {
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      explorationView.style.removeProperty('--event-panel-height');
      delete explorationView.dataset.sheetDragging;
    };
  }, [measure, panelRef]);

  useLayoutEffect(() => {
    applyVisibleHeight(pointsRef.current[snap], false);
  }, [applyVisibleHeight, snap]);

  const releasePointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressClickRef.current = false;
    dragRef.current = {
      lastTime: event.timeStamp,
      lastY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      startSnap: snap,
      startTime: event.timeStamp,
      startVisibleHeight: currentVisibleHeightRef.current,
      startY: event.clientY,
    };
    applyVisibleHeight(currentVisibleHeightRef.current, true);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    const movementY = event.clientY - drag.startY;
    drag.moved = drag.moved || Math.abs(movementY) >= DRAG_THRESHOLD_PX;
    if (drag.moved) {
      event.preventDefault();
    }
    event.stopPropagation();
    drag.lastTime = event.timeStamp;
    drag.lastY = event.clientY;
    applyVisibleHeight(drag.startVisibleHeight - movementY, true);
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.moved) {
      event.preventDefault();
    }
    event.stopPropagation();
    releasePointer(event);
    const movementY = event.clientY - drag.startY;
    const sampleDuration = Math.max(1, event.timeStamp - drag.lastTime);
    const gestureDuration = Math.max(1, event.timeStamp - drag.startTime);
    const recentVelocity = (event.clientY - drag.lastY) / sampleDuration;
    const gestureVelocity = movementY / gestureDuration;
    const velocityY =
      Math.abs(recentVelocity) > Math.abs(gestureVelocity)
        ? recentVelocity
        : gestureVelocity;
    const nextSnap = resolveBottomSheetSnap({
      currentVisibleHeight: currentVisibleHeightRef.current,
      movementY,
      points: pointsRef.current,
      startSnap: drag.startSnap,
      velocityY,
    });

    dragRef.current = null;
    suppressClickRef.current = drag.moved;
    applyVisibleHeight(pointsRef.current[nextSnap], false);
    if (drag.moved) {
      onSnapChange(nextSnap);
    }
  };

  const handlePointerCancel = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    releasePointer(event);
    dragRef.current = null;
    suppressClickRef.current = true;
    applyVisibleHeight(pointsRef.current[snap], false);
  };

  const handleClick = (): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    onSnapChange(
      snap === 'peek' ? 'medium' : snap === 'medium' ? 'expanded' : 'medium',
    );
  };

  const handleLabel =
    snap === 'peek'
      ? `Expand ${sheetName} sheet`
      : snap === 'medium'
        ? `Expand ${sheetName} sheet fully`
        : `Lower ${sheetName} sheet`;

  return (
    <aside
      aria-label={ariaLabel}
      className={className}
      data-sheet-snap={snap}
      data-sheet-view={view}
      id={id}
      ref={panelRef}
    >
      <div className="event-panel__drag-region">
        <button
          aria-controls={`${id}-content`}
          aria-expanded={snap !== 'peek'}
          aria-label={handleLabel}
          className="event-panel__drag-handle"
          onClick={handleClick}
          onPointerCancel={handlePointerCancel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      </div>
      <div className="event-panel__content" id={`${id}-content`}>
        {children}
      </div>
    </aside>
  );
}
