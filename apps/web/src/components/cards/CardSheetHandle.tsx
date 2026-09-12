import { useRef, useState, type RefObject } from 'react';
import {
  getBottomSheetSnapPoints,
  resolveBottomSheetSnap,
  type BottomSheetSnap,
} from '../exploration/BottomSheetSurface';

export function CardSheetHandle({
  panelRef,
  onClose,
  disabled = false,
}: {
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [snap, setSnap] = useState<BottomSheetSnap>('expanded');
  const drag = useRef<{
    y: number;
    time: number;
    height: number;
    pointer: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const settle = (next: BottomSheetSnap) => {
    const panel = panelRef.current;
    panel?.style.removeProperty('--card-sheet-drag-height');
    if (panel) panel.dataset.dragging = 'false';
    if (next === 'peek') {
      onClose();
      return;
    }
    setSnap(next);
    if (panel) panel.dataset.cardSnap = next;
  };
  return (
    <button
      type="button"
      disabled={disabled}
      className="card-sheet-handle"
      aria-label={
        snap === 'expanded' ? 'Lower card sheet' : 'Expand card sheet'
      }
      aria-controls="card-detail-content"
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        settle(snap === 'expanded' ? 'medium' : 'expanded');
      }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || !panelRef.current) return;
        suppressClick.current = false;
        drag.current = {
          y: event.clientY,
          time: event.timeStamp,
          height: panelRef.current.offsetHeight,
          pointer: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        panelRef.current.dataset.dragging = 'true';
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointer !== event.pointerId) return;
        const distance = event.clientY - start.y;
        if (Math.abs(distance) > 8) suppressClick.current = true;
        panelRef.current?.style.setProperty(
          '--card-sheet-drag-height',
          `${Math.max(100, start.height - distance)}px`,
        );
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        if (!start || start.pointer !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const movement = event.clientY - start.y;
        const expanded = Math.min(window.innerHeight * 0.88, 768);
        settle(
          resolveBottomSheetSnap({
            currentVisibleHeight: start.height - movement,
            movementY: movement,
            points: getBottomSheetSnapPoints(expanded),
            startSnap: snap,
            velocityY: movement / Math.max(1, event.timeStamp - start.time),
          }),
        );
      }}
      onPointerCancel={() => {
        drag.current = null;
        suppressClick.current = true;
        settle(snap);
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
