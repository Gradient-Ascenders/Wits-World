import { createAppDateTimeFormatter } from '../../date-time';
import { authorErrorDetail } from './author-error-copy';
import { StateIcon } from '../StatusMessage';
import { LoadingState } from '../LoadingState';
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
  const [result, setResult] =
    useState<AuthorPage<AuthorContentHistoryItem> | null>(null);
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'ready'>(
    'idle',
  );
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
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
      if (!controller.signal.aborted) {
        setResult(next);
        setError('');
        setState('ready');
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught instanceof AuthorApiError
            ? authorErrorDetail(caught)
            : 'Review history could not be loaded.',
        );
        setState('error');
      }
    }
  }, [apiBaseUrl, entityId, entityType, getAccessToken, page]);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    setPage(1);
    setResult(null);
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
        {state === 'loading' ? (
          <LoadingState label="Loading review history…" />
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
        {state === 'ready' && result?.items.length === 0 ? (
          <p className="author-state">No review history has been recorded.</p>
        ) : null}
        {state === 'ready' && result && result.items.length > 0 ? (
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
        {state === 'ready' && result && result.totalPages > 1 ? (
          <nav aria-label="Review history pages" className="author-pagination">
            <button
              className="button button--quiet"
              disabled={result.page <= 1}
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
              disabled={result.page >= result.totalPages}
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
