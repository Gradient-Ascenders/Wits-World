import { Stack, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import type { MapLayerVisibility } from './map-provider';

export function MapLayersControl({
  onChange,
  visibility,
}: {
  onChange: (visibility: MapLayerVisibility) => void;
  visibility: MapLayerVisibility;
}) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    controlRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const dismissOutside = (event: PointerEvent): void => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape, true);
    };
  }, [open]);

  return (
    <div className="map-layers-control" ref={controlRef}>
      <button
        aria-controls="explore-map-layers"
        aria-expanded={open}
        aria-label="Map layers"
        className="map-layers-control__trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="Layers"
        type="button"
      >
        <Stack aria-hidden="true" size={22} />
      </button>
      {open ? (
        <section
          aria-labelledby="explore-map-layers-heading"
          className="map-layers-control__panel"
          id="explore-map-layers"
        >
          <header>
            <h2 id="explore-map-layers-heading">Map layers</h2>
            <button aria-label="Close map layers" onClick={close} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </header>
          <fieldset>
            <legend>Overlays</legend>
            {(
              [
                ['events', 'Event markers'],
                ['radius', 'Selected challenge radius'],
                ['territories', 'Territory boundaries'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  checked={visibility[key]}
                  onChange={(event) =>
                    onChange({ ...visibility, [key]: event.target.checked })
                  }
                  type="checkbox"
                />
              </label>
            ))}
          </fieldset>
          <p>Overlays follow the current Explore view.</p>
          <fieldset>
            <legend>Map details</legend>
            {(
              [
                ['details', '3D buildings and trees'],
                ['labels', 'Map labels'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  checked={visibility[key]}
                  onChange={(event) =>
                    onChange({ ...visibility, [key]: event.target.checked })
                  }
                  type="checkbox"
                />
              </label>
            ))}
          </fieldset>
          <p>Hiding layers does not change event lists or range checks.</p>
        </section>
      ) : null}
    </div>
  );
}
