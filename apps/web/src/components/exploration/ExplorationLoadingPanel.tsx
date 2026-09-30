import { QuestMarker } from '../branding/QuestMarker';

export function ExplorationLoadingPanel({
  className = '',
  description,
  label,
}: {
  className?: string;
  description?: string;
  label: string;
}) {
  return (
    <div
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
      className={`exploration-loading-panel state-message ${className}`}
      role="status"
    >
      <QuestMarker className="exploration-loading-panel__marker" />
      <strong>{label}</strong>
      {description ? (
        <span className="exploration-loading-panel__description">
          {description}
        </span>
      ) : null}
    </div>
  );
}
