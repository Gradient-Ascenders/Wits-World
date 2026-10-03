import {
  ArrowCounterClockwiseIcon,
  MinusIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

const initialCrop = { zoom: 1, x: 50, y: 50 };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function AvatarCrop({
  file,
  disabled,
  onReady,
  onError,
}: {
  file: File;
  disabled: boolean;
  onReady: (data: string) => void;
  onError: () => void;
}) {
  const aperture = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [diameter, setDiameter] = useState(0);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState(initialCrop);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    crop: typeof initialCrop;
  } | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const element = aperture.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setDiameter(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setImage(null);
    setCrop(initialCrop);
    drag.current = null;
    setDragging(false);
    const source = URL.createObjectURL(file);
    const photo = new Image();
    photo.onload = () => {
      if (active) setImage(photo);
    };
    photo.onerror = () => {
      if (active) errorRef.current();
    };
    photo.src = source;
    return () => {
      active = false;
      URL.revokeObjectURL(source);
    };
  }, [file]);

  useEffect(() => {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) {
      errorRef.current();
      return;
    }
    const size = Math.min(image.naturalWidth, image.naturalHeight) / crop.zoom;
    context.fillStyle = '#0d1b31';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      ((image.naturalWidth - size) * crop.x) / 100,
      ((image.naturalHeight - size) * crop.y) / 100,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    readyRef.current(canvas.current.toDataURL('image/jpeg', 0.82));
  }, [image, crop]);

  const scale = image
    ? (diameter * crop.zoom) / Math.min(image.naturalWidth, image.naturalHeight)
    : 0;
  const width = (image?.naturalWidth ?? 0) * scale;
  const height = (image?.naturalHeight ?? 0) * scale;
  function pan(from: typeof initialCrop, dx: number, dy: number) {
    setCrop({
      ...from,
      x:
        width > diameter
          ? clamp(from.x - (dx * 100) / (width - diameter), 0, 100)
          : from.x,
      y:
        height > diameter
          ? clamp(from.y - (dy * 100) / (height - diameter), 0, 100)
          : from.y,
    });
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  }
  function zoomBy(amount: number) {
    setCrop((previous) => ({
      ...previous,
      zoom: clamp(previous.zoom + amount, 1, 3),
    }));
  }

  return (
    <div className="avatar-crop">
      <button
        type="button"
        className={`avatar-crop-stage${dragging ? ' is-dragging' : ''}`}
        aria-label="Move profile picture"
        aria-describedby="avatar-crop-hint"
        disabled={disabled || !image}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            crop,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.id === event.pointerId)
            pan(start.crop, event.clientX - start.x, event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          endDrag(event);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 24 : 8;
          const movement: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const delta = movement[event.key];
          if (delta) {
            event.preventDefault();
            event.stopPropagation();
            pan(crop, delta[0], delta[1]);
          }
        }}
      >
        <span ref={aperture} className="avatar-crop-aperture">
          {image ? (
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width,
                height,
                left: ((diameter - width) * crop.x) / 100,
                top: ((diameter - height) * crop.y) / 100,
              }}
            />
          ) : null}
          <span className="avatar-crop-mask" />
        </span>
        {!image ? (
          <span className="avatar-crop-loading">Preparing picture…</span>
        ) : null}
      </button>
      <div className="avatar-crop-toolbar">
        <button
          type="button"
          className="button button--quiet avatar-crop-icon"
          aria-label="Zoom out"
          disabled={disabled || crop.zoom <= 1}
          onClick={() => zoomBy(-0.1)}
        >
          <MinusIcon size={18} aria-hidden="true" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={3}
          step={0.05}
          value={crop.zoom}
          disabled={disabled}
          onChange={(event) =>
            setCrop((previous) => ({
              ...previous,
              zoom: Number(event.target.value),
            }))
          }
        />
        <button
          type="button"
          className="button button--quiet avatar-crop-icon"
          aria-label="Zoom in"
          disabled={disabled || crop.zoom >= 3}
          onClick={() => zoomBy(0.1)}
        >
          <PlusIcon size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="button button--quiet avatar-crop-reset"
          aria-label="Reset crop"
          disabled={disabled}
          onClick={() => setCrop(initialCrop)}
        >
          <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
          Reset
        </button>
      </div>
      <p className="profile-field-hint" id="avatar-crop-hint">
        Drag to reposition, or use the arrow keys.
      </p>
      <canvas ref={canvas} width={256} height={256} hidden />
    </div>
  );
}
