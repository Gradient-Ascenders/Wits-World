import { QuestMarker } from '../branding/QuestMarker';
import './author-loading.css';

export function AuthorLoadingState({
  label,
  description,
  page = false,
}: {
  label: string;
  description?: string;
  page?: boolean;
}) {
  return (
    <div
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
      className={`author-loading-state state-message${page ? ' page-loading-state' : ''}`}
      role="status"
    >
      <QuestMarker className="author-loading-state__marker" />
      {page ? (
        <h1 className="author-loading-state__label">{label}</h1>
      ) : (
        <strong className="author-loading-state__label">{label}</strong>
      )}
      {description ? (
        <p className="author-loading-state__description">{description}</p>
      ) : null}
    </div>
  );
}
