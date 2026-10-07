import { RegionLoadingState } from '../LoadingState';

export function ExplorationLoadingPanel({
  className = '',
  description,
  immediate = false,
  label,
  onRetry,
  placeholder = true,
}: {
  className?: string;
  description?: string;
  immediate?: boolean;
  label: string;
  onRetry?: () => void;
  placeholder?: boolean;
}) {
  return (
    <RegionLoadingState
      className={`exploration-loading-panel ${className}`}
      immediate={immediate}
      label={label}
      description={description}
      onRetry={onRetry}
      placeholder={placeholder}
    />
  );
}
