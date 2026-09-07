import {
  CheckCircleIcon,
  CircleIcon,
  FloppyDiskIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export function AuthorSaveBar({
  busy,
  dirty,
  failed,
  isNew,
  children,
}: {
  busy: boolean;
  dirty: boolean;
  failed: boolean;
  isNew: boolean;
  children: ReactNode;
}) {
  const Icon = failed
    ? WarningCircleIcon
    : busy
      ? FloppyDiskIcon
      : dirty || isNew
        ? CircleIcon
        : CheckCircleIcon;
  return (
    <div className="author-save-bar">
      <p
        className={`author-save-state${failed ? ' author-save-state--error' : dirty ? ' author-save-state--dirty' : ''}`}
        role="status"
      >
        <Icon size={20} aria-hidden="true" />
        {busy
          ? 'Saving changes…'
          : failed
            ? 'Not saved. Review the errors above.'
            : dirty
              ? 'Unsaved changes'
              : isNew
                ? 'New draft · not saved'
                : 'No unsaved changes'}
      </p>
      <div className="author-actions">{children}</div>
    </div>
  );
}
