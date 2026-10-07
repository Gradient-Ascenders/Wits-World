import { QuestMarker } from '../branding/QuestMarker';
import { LoadingRecovery } from '../LoadingState';
import { useLoadingPhase } from '../loading-policy';

export function ExplorationLoadingPanel({
  className = '',
  description,
  label,
  onRetry,
}: {
  className?: string;
  description?: string;
  label: string;
  onRetry?: () => void;
}) {
  const phase = useLoadingPhase(true, label);
  return (
    <div
      className={`exploration-loading-panel state-message ${className}`}
      data-loading-phase={phase}
    >
      <QuestMarker className="exploration-loading-panel__marker" />
      <strong role="status">{label}</strong>
      {description ? (
        <span className="exploration-loading-panel__description">
          {description}
        </span>
      ) : null}
      {phase === 'slow' ? <LoadingRecovery onRetry={onRetry} /> : null}
    </div>
  );
}
