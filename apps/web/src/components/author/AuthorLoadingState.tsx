import { PageLoadingState, RegionLoadingState } from '../LoadingState';
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
  return page ? (
    <PageLoadingState
      title={label}
      description={description}
      onRetry={onRetry}
      recovery={recovery}
    />
  ) : (
    <RegionLoadingState
      className="author-loading-state"
      label={label}
      description={description}
      onRetry={onRetry}
      recovery={recovery}
    />
  );
}
