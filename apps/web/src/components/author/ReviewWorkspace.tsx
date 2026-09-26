import { authorErrorDetail } from './author-error-copy';
import { StateIcon } from '../StatusMessage';
import { LoadingState } from '../LoadingState';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  listAuthorReviewQueue,
  type AuthorContentEntityType,
  type AuthorPage,
  type AuthorReviewQueueItem,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { authorPaths } from './author-routing';

interface ReviewWorkspaceProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
}

type QueueFilter = 'all' | AuthorContentEntityType;

export function ReviewWorkspace({
  apiBaseUrl,
  getAccessToken,
}: ReviewWorkspaceProps) {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] =
    useState<AuthorPage<AuthorReviewQueueItem> | null>(null);
  const [state, setState] = useState<'error' | 'loading' | 'ready'>('loading');
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState('loading');
    setApiError(null);
    try {
      const next = await listAuthorReviewQueue({
        apiBaseUrl,
        entityType: filter === 'all' ? undefined : filter,
        getAccessToken,
        page,
        pageSize: 10,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setResult(next);
        setState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setApiError(toAuthorError(error));
        setState('error');
      }
    }
  }, [apiBaseUrl, filter, getAccessToken, page]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  return (
    <section aria-labelledby="review-workspace-title" className="author-review">
      <header className="author-section-heading author-review__heading">
        <div>
          <p className="eyebrow">Independent review</p>
          <h2 id="review-workspace-title">Review queue</h2>
          <p>
            Open each submission to review its full authoritative detail before
            choosing an action.
          </p>
        </div>
        <label className="author-filter" htmlFor="review-type-filter">
          <span>Content type</span>
          <select
            id="review-type-filter"
            onChange={(event) => {
              setFilter(event.target.value as QueueFilter);
              setPage(1);
            }}
            value={filter}
          >
            <option value="all">All content</option>
            {['event', 'challenge', 'question', 'card', 'campaign'].map(
              (type) => (
                <option key={type} value={type}>
                  {titleCase(type)}s
                </option>
              ),
            )}
          </select>
        </label>
      </header>

      {state === 'loading' ? (
        <LoadingState label="Loading review queue…" />
      ) : null}
      {state === 'error' ? (
        <section
          className="author-state author-state--error state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <strong>
            {loadErrorTitle(apiError, 'The review queue is unavailable.')}
          </strong>
          <p>{apiError ? authorErrorDetail(apiError) : null}</p>
          <button
            className="button button--quiet"
            onClick={() => void load()}
            type="button"
          >
            Retry queue
          </button>
        </section>
      ) : null}
      {state === 'ready' && result?.items.length === 0 ? (
        <section className="author-state author-state--empty state-message state-message--empty">
          <StateIcon tone="empty" />
          <strong>No submissions are waiting.</strong>
          <p>
            {filter === 'all'
              ? 'The review queue is clear.'
              : `No ${filter} submissions match this filter.`}
          </p>
        </section>
      ) : null}
      {state === 'ready' && result && result.items.length > 0 ? (
        <ol className="author-review__list">
          {result.items.map((item) => (
            <li
              className="author-review__item"
              key={`${item.entityType}:${item.entityId}`}
            >
              <div className="author-review__summary">
                <div>
                  <p className="eyebrow">{titleCase(item.entityType)}</p>
                  <h3>{item.label}</h3>
                </div>
                <span className="status-badge status-badge--author-in_review">
                  In review
                </span>
              </div>
              <p>
                Submitted by {item.submittedByName} ·{' '}
                <time dateTime={item.submittedAt}>
                  {formatDateTime(item.submittedAt)}
                </time>
              </p>
              <div className="author-review__controls">
                <Link className="button" href={itemPath(item)}>
                  {item.canReview ? 'Review' : 'Open'} {item.entityType}
                  {item.entityType === 'event' ? ' package' : ''}
                </Link>
                {!item.canReview ? (
                  <p className="author-notice" role="status">
                    {item.entityType === 'event'
                      ? 'Another Author must review this event package.'
                      : 'This submission is awaiting review by another Author. Self-approval is not available.'}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {state === 'ready' && result && result.totalPages > 1 ? (
        <nav aria-label="Review queue pages" className="author-pagination">
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
    </section>
  );
}

function itemPath(item: AuthorReviewQueueItem) {
  if (item.entityType === 'event') return authorPaths.event(item.entityId);
  if (item.entityType === 'challenge' && item.eventId)
    return authorPaths.challenge(item.eventId, item.entityId);
  if (item.entityType === 'question' && item.eventId && item.challengeId)
    return authorPaths.question(item.eventId, item.challengeId, item.entityId);
  if (item.entityType === 'card') return authorPaths.card(item.entityId);
  if (item.entityType === 'campaign')
    return authorPaths.campaign(item.entityId);
  return authorPaths.review;
}

function toAuthorError(error: unknown) {
  return error instanceof AuthorApiError
    ? error
    : new AuthorApiError(
        'unavailable',
        'The API request could not be completed.',
      );
}

function loadErrorTitle(error: AuthorApiError | null, fallback: string) {
  if (error?.failure === 'authorization')
    return 'Your session needs attention.';
  if (error?.failure === 'forbidden') return 'Author permission was refused.';
  return fallback;
}

function titleCase(value: string) {
  return value
    .replace('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
