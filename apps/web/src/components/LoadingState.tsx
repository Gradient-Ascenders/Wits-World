import { StartupSeal } from './branding/StartupSeal';
import { QuestMarker } from './branding/QuestMarker';

export function LoadingSeal() {
  return (
    <span aria-hidden="true" className="loading-seal">
      <StartupSeal animate />
    </span>
  );
}

export function LoadingState({
  label = 'Loading this Wits World page…',
  prominent = false,
  className = '',
}: {
  label?: string;
  prominent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`state-message state-loading${prominent ? ' state-loading--prominent' : ' state-loading--subtle'}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      {prominent ? <LoadingSeal /> : null}
      <p className="state-loading__label">
        {prominent ? null : <QuestMarker />}
        {label}
      </p>
    </div>
  );
}
