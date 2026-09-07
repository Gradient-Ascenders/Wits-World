export function Skeleton({
  layout = 'rows',
}: {
  layout?: 'rows' | 'cards' | 'battle';
}) {
  return (
    <div
      aria-hidden="true"
      className={`state-skeleton state-skeleton--${layout}`}
    >
      {Array.from(
        { length: layout === 'cards' ? 6 : layout === 'battle' ? 2 : 3 },
        (_, index) => (
          <span key={index} />
        ),
      )}
    </div>
  );
}

export function LoadingState({
  label = 'Loading this Wits World page…',
  layout = 'rows',
  compact = false,
}: {
  label?: string;
  layout?: 'rows' | 'cards' | 'battle';
  compact?: boolean;
}) {
  return (
    <div
      className={`state-message state-loading${compact ? ' state-loading--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="state-loading__label">
        <span className="state-spinner" aria-hidden="true" />
        {label}
      </p>
      {!compact && <Skeleton layout={layout} />}
    </div>
  );
}
