import type { ReactNode } from 'react';

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
  announce = true,
  label = 'Loading this Wits World page…',
  prominent = false,
  className = '',
}: {
  announce?: boolean;
  label?: string;
  prominent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`state-message state-loading${prominent ? ' page-loading-state state-loading--prominent' : ' state-loading--subtle'}${className ? ` ${className}` : ''}`}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
    >
      {prominent ? <LoadingSeal /> : null}
      <p className="state-loading__label">
        {prominent ? null : <QuestMarker />}
        {label}
      </p>
    </div>
  );
}

export function PageLoadingState({
  announce = true,
  children,
  className = '',
  description,
  title,
}: {
  announce?: boolean;
  children?: ReactNode;
  className?: string;
  description: string;
  title: string;
}) {
  return (
    <section
      aria-atomic="true"
      aria-busy="true"
      aria-live={announce ? 'polite' : undefined}
      className={`page-loading-state state-message state-loading state-loading--prominent${className ? ` ${className}` : ''}`}
      role={announce ? 'status' : undefined}
    >
      <LoadingSeal />
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  );
}
