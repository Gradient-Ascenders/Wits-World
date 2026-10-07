import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useLoadingPhase } from './loading-policy';

import { StartupSeal } from './branding/StartupSeal';
import { QuestMarker } from './branding/QuestMarker';

/** Read-only refresh feedback. Keep confirmed content mounted beside this. */
export function UpdatingIndicator({
  active,
  label = 'Updating this view',
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
        {previous
          ? ' Showing the previous result until this view is confirmed.'
          : ' Showing last-confirmed content.'}
        {active && phase === 'slow'
          ? ' The update is taking longer than expected.'
          : null}
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
          ? `${label} is taking longer than expected. The result is not confirmed. Leaving does not cancel the submitted action. Check the latest status before submitting again.`
          : `${label} — awaiting confirmation…`}
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
  message = 'This is taking longer than expected. You can leave this view and try again. Leaving does not cancel any submitted action.',
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
  label = 'Loading this Wits World page…',
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
  const phase = useLoadingPhase(true, resetKey ?? label);
  if (delayed && phase === 'hidden') return null;
  return (
    <div
      className={`state-message state-loading${prominent ? ' page-loading-state state-loading--prominent' : ' state-loading--subtle'}${className ? ` ${className}` : ''}`}
      data-loading-phase={phase}
    >
      {prominent ? <LoadingSeal visible={phase !== 'hidden'} /> : null}
      <p
        className="state-loading__label"
        role={announce ? 'status' : undefined}
        aria-live={announce ? 'polite' : undefined}
      >
        {prominent ? null : <QuestMarker />}
        {label}
      </p>
      {phase === 'slow' ? (
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
  title,
  onRetry,
  resetKey,
}: {
  announce?: boolean;
  children?: ReactNode;
  className?: string;
  description: string;
  title: string;
  onRetry?: () => void;
  resetKey?: unknown;
}) {
  const phase = useLoadingPhase(true, resetKey ?? title);
  return (
    <section
      className={`page-loading-state state-message state-loading state-loading--prominent${className ? ` ${className}` : ''}`}
    >
      <LoadingSeal visible={phase !== 'hidden'} />
      <h1>{title}</h1>
      <p
        role={announce ? 'status' : undefined}
        aria-live={announce ? 'polite' : undefined}
      >
        <span className="sr-only">{title}. </span>
        {description}
      </p>
      {phase === 'slow' ? (
        <LoadingRecovery onRetry={onRetry} announce={announce} />
      ) : null}
      {children}
    </section>
  );
}
