import { QuestMarker } from '../branding/QuestMarker';
import { LoadingRecovery } from '../LoadingState';
import { useLoadingPhase } from '../loading-policy';
import './author-loading.css';

export function AuthorLoadingState({
  label,
  description,
  page = false,
  onRetry,
  recovery = true,
}: {
  label: string;
  description?: string;
  page?: boolean;
  onRetry?: () => void;
  recovery?: boolean;
}) {
  const phase = useLoadingPhase(true, label);
  return (
    <div
      className={`author-loading-state state-message${page ? ' page-loading-state' : ''}`}
      data-loading-phase={phase}
    >
      <QuestMarker className="author-loading-state__marker" />
      {page ? (
        <h1 className="author-loading-state__label">
          <span role="status">{label}</span>
        </h1>
      ) : (
        <strong className="author-loading-state__label" role="status">
          {label}
        </strong>
      )}
      {description ? (
        <p className="author-loading-state__description">{description}</p>
      ) : null}
      {recovery && phase === 'slow' ? (
        <LoadingRecovery onRetry={onRetry} />
      ) : null}
    </div>
  );
}
