import { UpdatingIndicator } from '../LoadingState';
import { useAuthorRetainedResource } from './AuthorRetainedReads';
import { createAppDateTimeFormatter } from '../../date-time';
import { authorErrorDetail } from './author-error-copy';
import { StateIcon } from '../StatusMessage';
import { AuthorLoadingState } from './AuthorLoadingState';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AuthorApiError,
  getAuthorContentHistory,
  type AuthorContentEntityType,
  type AuthorContentHistoryItem,
  type AuthorPage,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';

interface AuthorHistoryPanelProps {
  defaultOpen?: boolean;
  apiBaseUrl: string;
  entityId: string;
  entityType: AuthorContentEntityType;
  getAccessToken: ApiAccessTokenProvider;
  revision?: number;
}

export function AuthorHistoryPanel({
  apiBaseUrl,
  defaultOpen = false,
  entityId,
  entityType,
  getAccessToken,
  revision = 0,
}: AuthorHistoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);
  const {
    value: result,
    setValue: setResult,
    confirmed,
    previous,
    confirm,
    revoke,
    beginRead,
  } = useAuthorRetainedResource<AuthorPage<AuthorContentHistoryItem> | null>(
    `history:${entityType}:${entityId}:${page}`,
    null,
    `history:${entityType}:${entityId}`,
  );
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'ready'>(
    'idle',
  );
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const canApplyRead = beginRead();
    const controller = new AbortController();
    requestRef.current = controller;
    setState('loading');
    try {
      const next = await getAuthorContentHistory({
        apiBaseUrl,
        entityId,
        entityType,
        getAccessToken,
        page,
        pageSize: 10,
        signal: controller.signal,
      });
      if (!controller.signal.aborted && canApplyRead()) {
        setResult(next);
        confirm();
        setError('');
        setState('ready');
      }
    } catch (caught) {
      if (!controller.signal.aborted && canApplyRead()) {
        revoke(caught);
        setError(
          caught instanceof AuthorApiError
            ? authorErrorDetail(caught)
            : 'Review history could not be loaded.',
        );
        setState('error');
      }
    }
  }, [
    apiBaseUrl,
    entityId,
    entityType,
    getAccessToken,
    page,
    confirm,
    revoke,
    setResult,
    beginRead,
  ]);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    setPage(1);
    setState('idle');
  }, [entityId, entityType]);
  useEffect(() => {
    if (open) void load();
  }, [load, open, revision]);

  return (
    <details
      className="author-history"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Review history</summary>
      <div className="author-history__body">
        {state === 'loading' && !confirmed ? (
          <AuthorLoadingState label="Loading review history…" />
        ) : null}
        {confirmed ? (
          <UpdatingIndicator
            active={state === 'loading'}
            label="Updating review history…"
            previous={previous}
            onRetry={load}
          />
        ) : null}
        {state === 'error' ? (
          <div
            className="author-state author-state--error state-message state-message--error"
            role="alert"
          >
            <StateIcon tone="error" />
            <strong>Review history is unavailable.</strong>
            <p>{error}</p>
            <button
              className="button button--quiet"
              onClick={() => void load()}
              type="button"
            >
              Retry history
            </button>
          </div>
        ) : null}
        {(state === 'ready' || confirmed) && result?.items.length === 0 ? (
          <p className="author-state">No review history has been recorded.</p>
        ) : null}
        {(state === 'ready' || confirmed) &&
        result &&
        result.items.length > 0 ? (
          <ol className="author-history__list">
            {result.items.map((item) => (
              <li key={item.auditId}>
                <div>
                  <strong>{historyAction(item)}</strong>
                  <span>Version {item.resultingVersion}</span>
                </div>
                <p>
                  {item.actorPlayerName} ·{' '}
                  <time dateTime={item.occurredAt}>
                    {formatDateTime(item.occurredAt)}
                  </time>
                </p>
                {item.note ? <blockquote>{item.note}</blockquote> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {(state === 'ready' || confirmed) && result && result.totalPages > 1 ? (
          <nav aria-label="Review history pages" className="author-pagination">
            <button
              className="button button--quiet"
              disabled={state === 'loading' || result.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {result.page} of {result.totalPages}
            </span>
            <button
              className="button button--quiet"
              disabled={state === 'loading' || result.page >= result.totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next
            </button>
          </nav>
        ) : null}
      </div>
    </details>
  );
}

function historyAction(item: AuthorContentHistoryItem) {
  const action = item.action[0]!.toUpperCase() + item.action.slice(1);
  return item.fromStatus
    ? `${action}: ${statusLabel(item.fromStatus)} to ${statusLabel(item.toStatus)}`
    : `${action}: ${statusLabel(item.toStatus)}`;
}

function statusLabel(value: string) {
  return value.replace('_', ' ');
}

function formatDateTime(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
