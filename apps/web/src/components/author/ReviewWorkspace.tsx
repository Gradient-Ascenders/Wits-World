import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import {
  useReviewQueueNavigation,
  type ReviewQueueFilter,
} from './AuthorReviewNavigation';
import { SelectField } from '../fields/SelectField';
import { createAppDateTimeFormatter } from '../../date-time';
import { authorErrorDetail } from './author-error-copy';
import { StateIcon } from '../StatusMessage';
import { LoadingState } from '../LoadingState';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  listAuthorReviewQueue,
  type AuthorPage,
  type AuthorReviewQueueItem,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { authorPaths } from './author-routing';

interface ReviewWorkspaceProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
}

export function ReviewWorkspace({
  apiBaseUrl,
  getAccessToken,
}: ReviewWorkspaceProps) {
  const navigation = useReviewQueueNavigation();
  const { state: playerState } = useCurrentPlayer();
  const [localFilter, setLocalFilter] = useState<ReviewQueueFilter>('all');
  const [localPage, setLocalPage] = useState(1);
  const filter = navigation?.filter ?? localFilter;
  const page = navigation?.page ?? localPage;
  const setFilter = navigation?.setFilter ?? setLocalFilter;
  const setPage = navigation?.setPage ?? setLocalPage;
  const restoredRef = useRef(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
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
        if (page > Math.max(1, next.totalPages)) {
          setPage(Math.max(1, next.totalPages));
          return;
        }
        setResult(next);
        setState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setApiError(toAuthorError(error));
        setState('error');
      }
    }
  }, [apiBaseUrl, filter, getAccessToken, page, setPage]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (state !== 'ready' || restoredRef.current) return;
    restoredRef.current = true;
    if (!navigation?.item) return;
    const key = `${navigation.item.entityType}:${navigation.item.entityId}`;
    const frame = window.requestAnimationFrame(() => {
      const link = Array.from(
        tableRef.current?.querySelectorAll<HTMLAnchorElement>(
          'a[data-review-key]',
        ) ?? [],
      ).find((element) => element.dataset.reviewKey === key);
      (link ?? headingRef.current)?.focus({ preventScroll: true });
      window.scrollTo({ top: navigation.scrollY, behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navigation, state]);

  return (
    <section aria-labelledby="review-workspace-title" className="author-review">
      <header className="author-section-heading author-review__heading">
        <h2 id="review-workspace-title" ref={headingRef} tabIndex={-1}>
          Content review
        </h2>
        <SelectField
          label="Content type"
          className="author-filter"
          id="review-type-filter"
          onChange={(value) => {
            setFilter(value as ReviewQueueFilter);
            setPage(1);
          }}
          value={filter}
          options={[
            { value: 'all', label: 'All content' },
            ...['event', 'challenge', 'question', 'card', 'campaign'].map(
              (type) => ({
                value: type,
                label: `${titleCase(type)}s`,
              }),
            ),
          ]}
        />
      </header>

      {state === 'loading' ? (
        <LoadingState label="Loading submissions…" />
      ) : null}
      {state === 'error' ? (
        <section
          className="author-state author-state--error state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <strong>
            {loadErrorTitle(apiError, 'Couldn’t load submissions.')}
          </strong>
          {apiError && apiError.failure !== 'unavailable' ? (
            <p>{authorErrorDetail(apiError)}</p>
          ) : null}
          <button
            className="button button--quiet"
            onClick={() => void load()}
            type="button"
          >
            Retry
          </button>
        </section>
      ) : null}
      {state === 'ready' && result?.items.length === 0 ? (
        <section className="author-state author-state--empty state-message state-message--empty">
          <StateIcon tone="empty" />
          <strong>
            {filter === 'all'
              ? 'No submissions to review.'
              : `No ${filter} submissions to review.`}
          </strong>
          {filter !== 'all' ? (
            <button
              className="button button--quiet"
              onClick={() => {
                setFilter('all');
                setPage(1);
              }}
              type="button"
            >
              Show all content
            </button>
          ) : null}
        </section>
      ) : null}
      {state === 'ready' && result && result.items.length > 0 ? (
        <div className="review-table-wrap">
          <table className="review-table" ref={tableRef}>
            <caption className="sr-only">
              Submissions awaiting independent review
            </caption>
            <thead>
              <tr>
                <th scope="col">Submission</th>
                <th scope="col">Type</th>
                <th scope="col">Author</th>
                <th scope="col">Submitted · Johannesburg</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => {
                const ownSubmission =
                  playerState.status === 'ready' &&
                  playerState.player.id === item.submittedBy;
                return (
                  <tr key={`${item.entityType}:${item.entityId}`}>
                    <th scope="row">
                      <span>{item.label}</span>
                      {!item.canReview ? (
                        <small>
                          {ownSubmission ? 'Your submission' : 'View only'}
                        </small>
                      ) : null}
                    </th>
                    <td>{titleCase(item.entityType)}</td>
                    <td>{item.submittedByName}</td>
                    <td>
                      <time dateTime={item.submittedAt}>
                        {formatDateTime(item.submittedAt)}
                      </time>
                    </td>
                    <td>
                      <Link
                        className="review-table__open"
                        href={itemPath(item)}
                        data-review-key={`${item.entityType}:${item.entityId}`}
                        aria-label={`${item.canReview ? 'Review' : 'View'} ${item.entityType}: ${item.label}`}
                        onClick={() => navigation?.open(item, itemScope(item))}
                      >
                        {item.canReview ? 'Review' : 'View'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {state === 'ready' && result && result.totalPages > 1 ? (
        <nav aria-label="Review queue pages" className="author-pagination">
          <button
            className="button button--quiet"
            disabled={result.page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
            type="button"
          >
            <CaretLeftIcon size={16} aria-hidden="true" /> Previous
          </button>
          <span>
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--quiet"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage(page + 1)}
            type="button"
          >
            Next <CaretRightIcon size={16} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function itemPath(item: AuthorReviewQueueItem) {
  if (item.entityType === 'event')
    return authorPaths.eventReview(item.entityId);
  if (item.entityType === 'challenge' && item.eventId)
    return authorPaths.challengeReview(item.eventId, item.entityId);
  if (item.entityType === 'question' && item.eventId && item.challengeId)
    return authorPaths.question(item.eventId, item.challengeId, item.entityId);
  if (item.entityType === 'card')
    return `${authorPaths.card(item.entityId)}/review`;
  if (item.entityType === 'campaign')
    return authorPaths.campaignReview(item.entityId);
  return authorPaths.review;
}

function itemScope(item: AuthorReviewQueueItem) {
  if (item.entityType === 'event') return authorPaths.event(item.entityId);
  if (item.entityType === 'card') return authorPaths.card(item.entityId);
  if (item.entityType === 'campaign')
    return authorPaths.campaign(item.entityId);
  return item.eventId ? authorPaths.event(item.eventId) : authorPaths.review;
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
    return 'Sign in again to review content.';
  if (error?.failure === 'forbidden') return 'Author access is required.';
  return fallback;
}

function titleCase(value: string) {
  return value
    .replace('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
