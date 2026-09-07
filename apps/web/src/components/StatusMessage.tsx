import {
  CheckCircleIcon,
  InfoIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import type { ComponentProps } from 'react';

export type StateTone = 'info' | 'empty' | 'error' | 'permission' | 'success';

export function StateIcon({ tone = 'info' }: { tone?: StateTone }) {
  const Icon = {
    info: InfoIcon,
    empty: MagnifyingGlassIcon,
    error: WarningCircleIcon,
    permission: LockKeyIcon,
    success: CheckCircleIcon,
  }[tone];
  return (
    <Icon
      aria-hidden="true"
      size={20}
      className={`state-icon state-icon--${tone}`}
    />
  );
}

/** Local feedback keeps its recovery actions and persistent context together. */
export function StatusMessage({
  tone = 'info',
  className = '',
  children,
  ...props
}: ComponentProps<'div'> & { tone?: StateTone }) {
  return (
    <div
      className={`state-message state-message--${tone} ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
    >
      <StateIcon tone={tone} />
      {children}
    </div>
  );
}
