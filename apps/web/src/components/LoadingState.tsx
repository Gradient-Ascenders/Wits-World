import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useLoadingPhase } from './loading-policy';

import { StartupSeal } from './branding/StartupSeal';
import { QuestMarker } from './branding/QuestMarker';

/** Read-only refresh feedback. Keep confirmed content mounted beside this. */
export function UpdatingIndicator({
  active,
  label = 'Updating',
  previous = false,
  error,
  onRetry,
  announce = true,
}: {
  active: boolean;
  label?: string;
  previous?: boolean;
  error?: string;
  onRetry?: () => void;
  announce?: boolean;
}) {
  const phase = useLoadingPhase(active, label);
  if (!active && !error) return null;
  return (
    <div className="updating-indicator" data-loading-phase={phase}>
      <p role={announce ? 'status' : undefined}>
        {active && phase !== 'hidden' ? <QuestMarker /> : null}
        {active ? `${label.replace(/[.…]+$/, '')}…` : error}
        {previous ? ' Showing previous results.' : null}
      </p>
      {onRetry && (!active || phase === 'slow') ? (
        <button
          className="button button--quiet"
          type="button"
          onClick={onRetry}
        >
          Retry update
        </button>
      ) : null}
    </div>
  );
}

/** Submission feedback never offers a retry that could duplicate a transaction. */
export function ActionLoadingFeedback({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  const phase = useLoadingPhase(active, label);
  if (!active) return null;
  return (
    <div className="action-loading-feedback">
      <p role="status">
        {phase === 'slow'
          ? 'Still awaiting confirmation. Leaving does not cancel this action. Check its status before retrying.'
          : `${label.replace(/[.…]+$/, '')}…`}
      </p>
      {phase === 'slow' ? (
        <div className="state-message__actions">
          <Link className="button button--quiet" href="/">
            Return home
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingRecovery({
  onRetry,
  escapeHref = '/',
  escapeLabel = 'Return home',
  message = 'Taking longer than usual.',
  announce = true,
}: {
  onRetry?: () => void;
  escapeHref?: string;
  escapeLabel?: string;
  message?: string;
  announce?: boolean;
}) {
  return (
    <div className="loading-recovery">
      <p role={announce ? 'status' : undefined}>{message}</p>
      <div className="state-message__actions">
        {onRetry ? (
          <button className="button" type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <Link className="button button--quiet" href={escapeHref}>
          {escapeLabel}
        </Link>
        {escapeHref !== '/offline' ? (
          <Link className="button button--quiet" href="/offline">
            Open saved events
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingSeal({ visible = true }: { visible?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="loading-seal"
      style={{ visibility: visible ? 'visible' : 'hidden' }}
    >
      <StartupSeal animate={visible} />
    </span>
  );
}

export function LoadingState({
  announce = true,
  label = 'Loading…',
  prominent = false,
  className = '',
  onRetry,
  resetKey,
  delayed = false,
}: {
  announce?: boolean;
  label?: string;
  prominent?: boolean;
  className?: string;
  onRetry?: () => void;
  resetKey?: unknown;
  delayed?: boolean;
}) {
  return prominent ? (
    <PageLoadingState
      announce={announce}
      className={className}
      delayed={delayed}
      title={label}
      onRetry={onRetry}
      resetKey={resetKey}
    />
  ) : (
    <RegionLoadingState
      announce={announce}
      className={className}
      label={label}
      onRetry={onRetry}
      resetKey={resetKey}
    />
  );
}

/** Reserve the content's space without another animated loading card. */
export function RegionLoadingState({
  announce = true,
  className = '',
  description,
  immediate = false,
  label,
  onRetry,
  placeholder = true,
  recovery = true,
  resetKey,
}: {
  announce?: boolean;
  className?: string;
  description?: string;
  immediate?: boolean;
  label: string;
  onRetry?: () => void;
  placeholder?: boolean;
  recovery?: boolean;
  resetKey?: unknown;
}) {
  const phase = useLoadingPhase(true, resetKey ?? label);
  const showLabel = phase === 'slow' || immediate;
  return (
    <div
      className={`region-loading-state${phase === 'slow' ? ' region-loading-state--slow' : ''}${className ? ` ${className}` : ''}`}
      data-loading-phase={phase}
    >
      <strong
        className={showLabel ? 'region-loading-state__label' : 'sr-only'}
        role={announce ? 'status' : undefined}
      >
        {showLabel ? <QuestMarker /> : null}
        {label}
      </strong>
      {phase !== 'slow' && placeholder && !immediate ? (
        <div aria-hidden="true" className="region-loading-state__placeholder">
          <span />
          <span />
        </div>
      ) : null}
      {showLabel && description ? (
        <span className="region-loading-state__description">{description}</span>
      ) : null}
      {phase === 'slow' && recovery ? (
        <LoadingRecovery onRetry={onRetry} announce={announce} />
      ) : null}
    </div>
  );
}

export function PageLoadingState({
  announce = true,
  children,
  className = '',
  description,
  delayed = false,
  escapeHref,
  escapeLabel,
  recovery = true,
  title,
  onRetry,
  resetKey,
}: {
  announce?: boolean;
  children?: ReactNode;
  className?: string;
  description?: string;
  delayed?: boolean;
  escapeHref?: string;
  escapeLabel?: string;
  recovery?: boolean;
  title: string;
  onRetry?: () => void;
  resetKey?: unknown;
}) {
  const phase = useLoadingPhase(true, resetKey ?? title);
  if (delayed && phase === 'hidden') return null;
  return (
    <section
      className={`page-loading-state state-message state-loading state-loading--prominent${className ? ` ${className}` : ''}`}
    >
      <LoadingSeal />
      <h1>{title}</h1>
      <p
        className={description ? undefined : 'sr-only'}
        role={announce ? 'status' : undefined}
        aria-live={announce ? 'polite' : undefined}
      >
        <span className="sr-only">{title}. </span>
        {description}
      </p>
      {phase === 'slow' && recovery ? (
        <LoadingRecovery
          onRetry={onRetry}
          announce={announce}
          escapeHref={escapeHref}
          escapeLabel={escapeLabel}
        />
      ) : null}
      {escapeHref && phase !== 'slow' ? (
        <div className="state-message__actions">
          <Link className="button button--quiet" href={escapeHref}>
            {escapeLabel ?? 'Return home'}
          </Link>
        </div>
      ) : null}
      {children}
    </section>
  );
}
