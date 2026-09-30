import { CaretDown, SidebarSimple } from '@phosphor-icons/react';

export function PanelCollapseButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-controls="explore-event-sheet-content"
      aria-expanded="true"
      aria-label={label}
      className="event-panel__close event-panel__collapse"
      onClick={onClick}
      title={label}
      type="button"
    >
      <SidebarSimple
        aria-hidden="true"
        className="event-panel__rail-icon"
        size={20}
      />
      <CaretDown
        aria-hidden="true"
        className="event-panel__collapse-chevron"
        size={20}
      />
    </button>
  );
}
