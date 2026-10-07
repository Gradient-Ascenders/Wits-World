import { UpdatingIndicator } from '../LoadingState';
import {
  AuthorReadFreshness,
  useAuthorRetainedResource,
} from './AuthorRetainedReads';
import './author-player-review.css';
import { SelectField } from '../fields/SelectField';
import { SearchField } from '../fields/SearchField';
import {
  appCalendarDateBoundary,
  createAppDateTimeFormatter,
} from '../../date-time';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  EyeIcon,
  ShieldWarningIcon,
  WarningDiamondIcon,
} from '@phosphor-icons/react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useContext,
  useRef,
  useState,
} from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  exportAuthorTrustCase,
  getAuthorTrustCase,
  listAuthorTrustCaseEvidence,
  listAuthorTrustCaseHistory,
  listAuthorTrustCaseRestrictions,
  listAuthorTrustCases,
  recordAuthorTrustDecision,
  type AuthorPage,
  type TrustCaseDetail,
  type TrustCaseEvidenceItem,
  type TrustCaseHistoryItem,
  type TrustCaseQueueItem,
  type TrustCaseStatus,
  type TrustCaseStatusFilter,
  type TrustRestrictionItem,
  type TrustRestrictionScope,
  type TrustRestrictionStateFilter,
  type TrustReviewAction,
  type TrustReviewBand,
  type TrustSignalType,
  type WritableTrustRestrictionScope,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { AuthorLoadingState } from './AuthorLoadingState';
import { StateIcon, StatusMessage } from '../StatusMessage';
import { AuthorConfirmationDialog } from './AuthorConfirmationDialog';
import { authorErrorDetail } from './author-error-copy';
import { authorPaths, type AuthorWorkspaceRoute } from './author-routing';

interface TrustReviewWorkspaceProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  route: Extract<AuthorWorkspaceRoute, { section: 'playerReview' }>;
}

type LoadState = 'error' | 'loading' | 'ready';

const writableRestrictionLabels: Record<WritableTrustRestrictionScope, string> =
  {
    online_verification_required: 'Require online verification',
    location_reward_challenge_hold: 'Pause location reward challenges',
    new_competitive_match_hold: 'Pause new competitive matches',
  };

const restrictionLabels: Record<TrustRestrictionScope, string> = {
  ...writableRestrictionLabels,
  card_trade_hold: 'Pause card trading',
};

const writableRestrictionScopes = Object.keys(
  writableRestrictionLabels,
) as WritableTrustRestrictionScope[];

export function TrustReviewWorkspace({
  apiBaseUrl,
  getAccessToken,
  route,
}: TrustReviewWorkspaceProps) {
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TrustCaseStatusFilter>('active');
  const [band, setBand] = useState<TrustReviewBand | 'all'>('all');
  const [restrictionState, setRestrictionState] = useState<
    TrustRestrictionStateFilter | 'all'
  >('all');
  const [signalType, setSignalType] = useState<TrustSignalType | 'all'>('all');
  const [openedFrom, setOpenedFrom] = useState('');
  const [openedTo, setOpenedTo] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [page, setPage] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const queueRestorePendingRef = useRef(false);
  const queueEntryRef = useRef<{ caseId: string; scrollY: number } | null>(
    null,
  );
  const queueKey = JSON.stringify([
    band,
    openedFrom,
    openedTo,
    page,
    restrictionState,
    search,
    signalType,
    status,
    updatedFrom,
    updatedTo,
  ]);
  const {
    value: queue,
    setValue: setQueue,
    confirmed: queueConfirmed,
    previous: queuePrevious,
    confirm: confirmQueue,
    revoke,
    beginRead,
  } = useAuthorRetainedResource<AuthorPage<TrustCaseQueueItem> | null>(
    `trust-queue:${queueKey}`,
    null,
    'trust-queue',
  );
  const [queueState, setQueueState] = useState<LoadState>('loading');
  const [queueError, setQueueError] = useState<AuthorApiError | null>(null);
  const {
    value: detail,
    setValue: setDetail,
    confirmed: detailConfirmed,
    confirm: confirmDetail,
  } = useAuthorRetainedResource<TrustCaseDetail | null>(
    `trust-detail:${route.caseId ?? ''}`,
    null,
  );
  const [detailState, setDetailState] = useState<LoadState>('ready');
  const [detailError, setDetailError] = useState<AuthorApiError | null>(null);
  const queueRequestRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);

  const loadQueue = useCallback(async () => {
    queueRequestRef.current?.abort();
    const canApplyRead = beginRead();
    const controller = new AbortController();
    queueRequestRef.current = controller;
    setQueueState('loading');
    setQueueError(null);
    try {
      const result = await listAuthorTrustCases({
        apiBaseUrl,
        band: band === 'all' ? undefined : band,
        createdFrom: dateBoundary(openedFrom, 'start'),
        createdTo: dateBoundary(openedTo, 'end'),
        getAccessToken,
        page,
        pageSize: 20,
        restrictionState:
          restrictionState === 'all' ? undefined : restrictionState,
        search: search || undefined,
        signal: controller.signal,
        signalType: signalType === 'all' ? undefined : signalType,
        status,
        updatedFrom: dateBoundary(updatedFrom, 'start'),
        updatedTo: dateBoundary(updatedTo, 'end'),
      });
      if (!controller.signal.aborted && canApplyRead()) {
        if (page > Math.max(1, result.totalPages)) {
          setPage(Math.max(1, result.totalPages));
          return;
        }
        setQueue(result);
        confirmQueue();
        setQueueState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted && canApplyRead()) {
        revoke(error);
        setQueueError(toAuthorError(error));
        setQueueState('error');
      }
    }
  }, [
    apiBaseUrl,
    band,
    getAccessToken,
    openedFrom,
    openedTo,
    page,
    restrictionState,
    search,
    signalType,
    status,
    updatedFrom,
    updatedTo,
    confirmQueue,
    revoke,
    setQueue,
    beginRead,
  ]);

  const loadDetail = useCallback(async () => {
    if (!route.caseId) {
      setDetail(null);
      setDetailState('ready');
      setDetailError(null);
      return;
    }
    detailRequestRef.current?.abort();
    const canApplyRead = beginRead();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    setDetailState('loading');
    setDetailError(null);
    try {
      const result = await getAuthorTrustCase({
        apiBaseUrl,
        caseId: route.caseId,
        getAccessToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted && canApplyRead()) {
        setDetail(result);
        confirmDetail();
        setDetailState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted && canApplyRead()) {
        revoke(error);
        setDetailError(toAuthorError(error));
        setDetailState('error');
      }
    }
  }, [
    apiBaseUrl,
    getAccessToken,
    route.caseId,
    confirmDetail,
    revoke,
    setDetail,
    beginRead,
  ]);

  useEffect(() => {
    if (!route.caseId) void loadQueue();
    return () => queueRequestRef.current?.abort();
  }, [loadQueue, route.caseId]);

  useEffect(() => {
    void loadDetail();
    return () => detailRequestRef.current?.abort();
  }, [loadDetail]);

  useEffect(() => {
    if (route.caseId) {
      queueRestorePendingRef.current = Boolean(queueEntryRef.current);
      return;
    }
    if (
      queueState !== 'ready' ||
      !queueEntryRef.current ||
      !queueRestorePendingRef.current
    )
      return;
    const entry = queueEntryRef.current;
    const frame = window.requestAnimationFrame(() => {
      const link = Array.from(
        queueRef.current?.querySelectorAll<HTMLAnchorElement>(
          'a[data-case-id]',
        ) ?? [],
      ).find((element) => element.dataset.caseId === entry.caseId);
      (link ?? headingRef.current)?.focus({ preventScroll: true });
      window.scrollTo({ top: entry.scrollY, behavior: 'instant' });
      queueRestorePendingRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [queueState, route.caseId]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft('');
    setSearch('');
    setStatus('active');
    setBand('all');
    setRestrictionState('all');
    setSignalType('all');
    setOpenedFrom('');
    setOpenedTo('');
    setUpdatedFrom('');
    setUpdatedTo('');
    setPage(1);
    searchRef.current?.focus();
  }

  const hasFilters =
    Boolean(search) ||
    status !== 'active' ||
    band !== 'all' ||
    restrictionState !== 'all' ||
    signalType !== 'all' ||
    Boolean(openedFrom || openedTo || updatedFrom || updatedTo);

  const secondaryFilterCount = [
    restrictionState !== 'all',
    signalType !== 'all',
    Boolean(openedFrom),
    Boolean(openedTo),
    Boolean(updatedFrom),
    Boolean(updatedTo),
  ].filter(Boolean).length;

  return (
    <section
      aria-label={route.caseId ? 'Player review' : undefined}
      aria-labelledby={route.caseId ? undefined : 'trust-review-title'}
      className="trust-review"
    >
      {!route.caseId ? (
        <>
          <header className="author-workspace__heading trust-review__heading">
            <h2 id="trust-review-title" ref={headingRef} tabIndex={-1}>
              Player review
            </h2>
          </header>
          <section
            aria-label="Trust case queue"
            className="trust-review__queue"
          >
            <form
              className="trust-review__filters"
              onSubmit={submitSearch}
              role="search"
            >
              <div className="trust-review__search-row">
                <SearchField
                  label="Search cases"
                  inputRef={searchRef}
                  className="author-filter"
                  maxLength={256}
                  onChange={(value) => setSearchDraft(value)}
                  placeholder="Player, case, or player ID"
                  value={searchDraft}
                />
                <div className="trust-review__search-actions">
                  <button className="button button--quiet" type="submit">
                    Search
                  </button>
                </div>
              </div>
              <SelectField
                label="Case status"
                className="author-filter"
                onChange={(value) => {
                  setStatus(value as TrustCaseStatusFilter);
                  setPage(1);
                }}
                value={status}
                options={[
                  { value: 'active', label: 'Active cases' },
                  { value: 'open', label: 'Open' },
                  { value: 'under_review', label: 'Under review' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'all', label: 'All cases' },
                ]}
              />
              <SelectField
                label="Review priority"
                className="author-filter"
                onChange={(value) => {
                  setBand(value as TrustReviewBand | 'all');
                  setPage(1);
                }}
                value={band}
                options={[
                  { value: 'all', label: 'All priorities' },
                  { value: 'urgent_review', label: 'Urgent review' },
                  { value: 'review_required', label: 'Review required' },
                  { value: 'observe', label: 'Observe' },
                  { value: 'normal', label: 'Normal' },
                ]}
              />
              <details className="author-filter-menu trust-review__advanced-filters">
                <summary>
                  Filters
                  {secondaryFilterCount > 0 ? (
                    <span
                      aria-label={`${secondaryFilterCount} active ${secondaryFilterCount === 1 ? 'filter' : 'filters'}`}
                    >
                      {secondaryFilterCount}
                    </span>
                  ) : null}
                </summary>
                <div className="author-filter-menu__panel trust-review__advanced-grid">
                  <SelectField
                    label="Signal type"
                    className="author-filter"
                    onChange={(value) => {
                      setSignalType(value as TrustSignalType | 'all');
                      setPage(1);
                    }}
                    value={signalType}
                    options={[
                      { value: 'all', label: 'All signal types' },
                      {
                        value: 'impossible_movement',
                        label: 'Impossible movement',
                      },
                      {
                        value: 'idempotency_payload_conflict',
                        label: 'Submission payload conflict',
                      },
                      {
                        value: 'submission_conflict_pattern',
                        label: 'Submission conflict pattern',
                      },
                      {
                        value: 'opponent_concentration',
                        label: 'Opponent concentration',
                      },
                      {
                        value: 'one_sided_outcome_pattern',
                        label: 'One-sided outcomes',
                      },
                    ]}
                  />
                  <SelectField
                    label="Restriction state"
                    className="author-filter"
                    onChange={(value) => {
                      setRestrictionState(
                        value as TrustRestrictionStateFilter | 'all',
                      );
                      setPage(1);
                    }}
                    value={restrictionState}
                    options={[
                      { value: 'all', label: 'Any restriction state' },
                      { value: 'active', label: 'Active restriction' },
                      { value: 'none', label: 'No active restriction' },
                    ]}
                  />
                  <DateFilter
                    label="Opened from (Johannesburg)"
                    onChange={(value) => {
                      setOpenedFrom(value);
                      setPage(1);
                    }}
                    value={openedFrom}
                  />
                  <DateFilter
                    label="Opened to (Johannesburg)"
                    onChange={(value) => {
                      setOpenedTo(value);
                      setPage(1);
                    }}
                    value={openedTo}
                  />
                  <DateFilter
                    label="Updated from (Johannesburg)"
                    onChange={(value) => {
                      setUpdatedFrom(value);
                      setPage(1);
                    }}
                    value={updatedFrom}
                  />
                  <DateFilter
                    label="Updated to (Johannesburg)"
                    onChange={(value) => {
                      setUpdatedTo(value);
                      setPage(1);
                    }}
                    value={updatedTo}
                  />
                </div>
              </details>
            </form>

            {queueState === 'ready' && queue ? (
              <div className="trust-review__results">
                <p aria-live="polite">
                  {queue.totalItems} matching{' '}
                  {queue.totalItems === 1 ? 'case' : 'cases'}
                </p>
                {hasFilters ? (
                  <button
                    className="trust-review__reset"
                    onClick={clearFilters}
                    type="button"
                  >
                    Reset filters
                  </button>
                ) : null}
              </div>
            ) : null}
            <div ref={queueRef}>
              <QueueContents
                error={queueError}
                onReload={() => void loadQueue()}
                queue={queue}
                onOpen={(caseId) => {
                  queueEntryRef.current = { caseId, scrollY: window.scrollY };
                }}
                state={queueState}
                confirmed={queueConfirmed}
                previous={queuePrevious}
              />
            </div>

            {(queueState === 'ready' || queueConfirmed) &&
            queue &&
            queue.totalPages > 1 ? (
              <nav
                aria-label="Trust case queue pages"
                className="author-pagination"
              >
                <button
                  className="button button--quiet"
                  disabled={queueState === 'loading' || queue.page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  type="button"
                >
                  Previous
                </button>
                <span>
                  Page {queue.page} of {queue.totalPages}
                </span>
                <button
                  className="button button--quiet"
                  disabled={
                    queueState === 'loading' || queue.page >= queue.totalPages
                  }
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </section>
        </>
      ) : (
        <section aria-label="Case review" className="trust-review__case">
          <Link className="trust-review__back" href={authorPaths.playerReview}>
            <ArrowLeftIcon aria-hidden="true" size={18} />
            Back to case queue
          </Link>
          {detailState === 'loading' && !detailConfirmed ? (
            <AuthorLoadingState label="Loading case details…" />
          ) : null}
          {detailConfirmed ? (
            <UpdatingIndicator
              active={detailState === 'loading'}
              label="Updating case details…"
              onRetry={loadDetail}
            />
          ) : null}
          {detailState === 'error' ? (
            <CaseError error={detailError} onReload={() => void loadDetail()} />
          ) : null}
          {(detailState === 'ready' || detailConfirmed) && detail ? (
            <AuthorReadFreshness value={detailState === 'ready'}>
              <TrustCasePanel
                key={detail.caseId}
                apiBaseUrl={apiBaseUrl}
                caseDetail={detail}
                getAccessToken={getAccessToken}
                onChanged={(next) => {
                  setDetail(next);
                  void loadQueue();
                }}
                onReload={() => void loadDetail()}
              />
            </AuthorReadFreshness>
          ) : null}
        </section>
      )}
    </section>
  );
}

function DateFilter({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="author-filter">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function QueueContents({
  error,
  onReload,
  queue,
  onOpen,
  state,
  confirmed,
  previous,
}: {
  confirmed: boolean;
  previous: boolean;
  error: AuthorApiError | null;
  onReload: () => void;
  queue: AuthorPage<TrustCaseQueueItem> | null;
  onOpen: (caseId: string) => void;
  state: LoadState;
}) {
  if (state === 'loading' && !confirmed)
    return <AuthorLoadingState label="Loading case queue…" />;
  if (state === 'error' && !confirmed) {
    return (
      <section
        className={`author-state state-message ${error?.failure === 'forbidden' ? 'state-message--permission' : 'state-message--error'}`}
        role="alert"
      >
        <StateIcon
          tone={error?.failure === 'forbidden' ? 'permission' : 'error'}
        />
        <strong>
          {error?.failure === 'forbidden'
            ? 'Reviewer permission was refused.'
            : 'The case queue is unavailable.'}
        </strong>
        <p>{error ? authorErrorDetail(error) : null}</p>
        <button
          className="button button--quiet"
          onClick={onReload}
          type="button"
        >
          Retry queue
        </button>
      </section>
    );
  }
  if (!queue?.items.length) {
    return (
      <section className="author-state author-state--empty state-message state-message--empty">
        <StateIcon tone="empty" />
        <UpdatingIndicator
          active={state === 'loading'}
          label="Updating case queue…"
          previous={previous}
          error={
            state === 'error' && error ? authorErrorDetail(error) : undefined
          }
          onRetry={onReload}
        />
        <strong>
          {previous
            ? 'No cases matched the previous filters.'
            : 'No cases match these filters.'}
        </strong>
      </section>
    );
  }
  return (
    <div className="trust-table-wrap">
      <UpdatingIndicator
        active={state === 'loading'}
        label="Updating case queue…"
        previous={previous}
        error={
          state === 'error' && error ? authorErrorDetail(error) : undefined
        }
        onRetry={onReload}
      />
      <table className="trust-table">
        <caption className="sr-only">
          Player cases for human review. Review priority is not proof of
          misconduct.
        </caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            <th scope="col">Active restrictions</th>
            <th scope="col">Updated · Johannesburg</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {queue.items.map((item) => (
            <tr key={item.caseId}>
              <th scope="row">
                <strong>{item.playerName}</strong>
                <small>Case {shortIdentifier(item.caseId)}</small>
              </th>
              <td>
                <BandBadge band={item.band} />
              </td>
              <td>
                <span className="trust-case-detail__status">
                  <StatusIcon status={item.status} />
                  {statusLabel(item.status)}
                </span>
              </td>
              <td>
                {item.activeRestrictionCount > 0 ? (
                  <span className="trust-review__restriction-note">
                    {item.activeRestrictionCount} active
                  </span>
                ) : (
                  'None'
                )}
              </td>
              <td>
                <time dateTime={item.updatedAt}>
                  {formatDateTime(item.updatedAt)}
                </time>
              </td>
              <td>
                <Link
                  className="trust-table__open"
                  href={authorPaths.playerReviewCase(item.caseId)}
                  data-case-id={item.caseId}
                  aria-label={`${item.canReview ? 'Review' : 'View'} ${item.playerName}, case ${item.caseId}`}
                  onClick={() => onOpen(item.caseId)}
                >
                  {item.canReview ? 'Review' : 'View'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrustCasePanel({
  apiBaseUrl,
  caseDetail,
  getAccessToken,
  onChanged,
  onReload,
}: {
  apiBaseUrl: string;
  caseDetail: TrustCaseDetail;
  getAccessToken: ApiAccessTokenProvider;
  onChanged: (detail: TrustCaseDetail) => void;
  onReload: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<'review' | 'restrictions' | 'history'>(
    'review',
  );
  const [pendingEvidence, setPendingEvidence] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const [evidenceNavigationNotice, setEvidenceNavigationNotice] = useState('');
  const [missingEvidenceId, setMissingEvidenceId] = useState<string | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState<AuthorApiError | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [caseDetail.caseId]);

  const loadEvidence = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorTrustCaseEvidence({
        apiBaseUrl,
        caseId: caseDetail.caseId,
        getAccessToken,
        page,
        pageSize: 20,
        signal,
      }),
    [apiBaseUrl, caseDetail.caseId, getAccessToken],
  );
  const loadRestrictions = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorTrustCaseRestrictions({
        apiBaseUrl,
        caseId: caseDetail.caseId,
        getAccessToken,
        page,
        pageSize: 20,
        signal,
      }),
    [apiBaseUrl, caseDetail.caseId, getAccessToken],
  );
  const loadHistory = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorTrustCaseHistory({
        apiBaseUrl,
        caseId: caseDetail.caseId,
        getAccessToken,
        page,
        pageSize: 20,
        signal,
      }),
    [apiBaseUrl, caseDetail.caseId, getAccessToken],
  );

  const evidence = useTrustCollection({
    resourceKey: `trust-evidence:${caseDetail.caseId}`,
    initialItems: caseDetail.evidencePreview,
    keyOf: evidenceKey,
    loadPage: loadEvidence,
    refreshKey: `${caseDetail.caseId}:${caseDetail.version}`,
    totalItems: caseDetail.evidenceTotalItems,
  });
  const restrictions = useTrustCollection({
    resourceKey: `trust-restrictions:${caseDetail.caseId}`,
    initialItems: caseDetail.restrictionPreview,
    keyOf: restrictionKey,
    loadPage: loadRestrictions,
    refreshKey: `${caseDetail.caseId}:${caseDetail.version}`,
    totalItems: caseDetail.restrictionTotalItems,
  });
  const history = useTrustCollection({
    resourceKey: `trust-history:${caseDetail.caseId}`,
    initialItems: caseDetail.recentHistory,
    keyOf: historyKey,
    loadPage: loadHistory,
    refreshKey: `${caseDetail.caseId}:${caseDetail.version}`,
    totalItems: Math.max(
      caseDetail.recentHistory.length,
      caseDetail.history.length,
    ),
  });

  useEffect(() => {
    if (!pendingEvidence) return;
    if (pendingEvidence.version !== caseDetail.version || tab !== 'review') {
      setPendingEvidence(null);
      if (pendingEvidence.version !== caseDetail.version)
        setEvidenceNavigationNotice(
          'This case changed. Select the history reference again.',
        );
      return;
    }
    const element = document.getElementById(`signal-${pendingEvidence.id}`);
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
      element.querySelector('summary')?.focus();
      element.scrollIntoView?.({ block: 'center' });
      setPendingEvidence(null);
      return;
    }
    if (evidence.state !== 'ready') return;
    if (evidence.page < evidence.totalPages) {
      evidence.loadMore();
      return;
    }
    setMissingEvidenceId(pendingEvidence.id);
    setEvidenceNavigationNotice(
      'The referenced signal was not found in the retained evidence.',
    );
    setPendingEvidence(null);
  }, [
    pendingEvidence,
    caseDetail.version,
    tab,
    evidence.items,
    evidence.state,
    evidence.page,
    evidence.totalPages,
    evidence.loadMore,
  ]);

  async function exportCase() {
    const controller = new AbortController();
    setExporting(true);
    setExportMessage('');
    setExportError(null);
    try {
      const exported = await exportAuthorTrustCase({
        apiBaseUrl,
        caseId: caseDetail.caseId,
        getAccessToken,
        signal: controller.signal,
      });
      downloadJson(
        `trust-case-${caseDetail.caseId}.json`,
        JSON.stringify(exported, null, 2),
      );
      const truncated = [
        exported.evidence,
        exported.restrictions,
        exported.history,
      ].some((page) => page.totalItems > page.items.length);
      setExportMessage(
        truncated
          ? 'Privacy-safe export downloaded. At least one collection exceeded the 100-record export limit; counts in the file show what was omitted.'
          : 'Privacy-safe export downloaded.',
      );
    } catch (error) {
      setExportError(toAuthorError(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <article aria-labelledby="trust-case-title" className="trust-case-detail">
      <header className="trust-case-detail__header" id="trust-case-summary">
        <div>
          <h3 id="trust-case-title" ref={headingRef} tabIndex={-1}>
            {caseDetail.playerName}
          </h3>
          <div className="trust-case-detail__labels">
            <BandBadge band={caseDetail.band} />
            <span className="trust-case-detail__status">
              <StatusIcon status={caseDetail.status} />
              {statusLabel(caseDetail.status)}
            </span>
            <span>
              Updated{' '}
              <time dateTime={caseDetail.updatedAt}>
                {formatDateTime(caseDetail.updatedAt)}
              </time>
            </span>
          </div>
        </div>
        <div className="trust-case-detail__header-actions">
          <button
            className="button button--quiet"
            disabled={exporting}
            aria-label="Export safe JSON"
            title="Privacy-safe JSON · up to 100 records per collection"
            onClick={() => void exportCase()}
            type="button"
          >
            <DownloadSimpleIcon aria-hidden="true" size={18} />
            {exporting ? 'Preparing case export…' : 'Export'}
          </button>
        </div>
      </header>
      {caseDetail.activeRestrictionCount > 0 ? (
        <div className="trust-case-active-restrictions">
          <ShieldWarningIcon aria-hidden="true" size={18} />
          <div>
            <strong>
              {caseDetail.activeRestrictionCount} active{' '}
              {caseDetail.activeRestrictionCount === 1
                ? 'restriction'
                : 'restrictions'}
            </strong>
            <p>
              {caseDetail.activeRestrictionScopes
                .map((scope) => restrictionLabels[scope])
                .join(' · ')}
              {caseDetail.latestRestrictionExpiry ? (
                <>
                  {' '}
                  · Latest expiry{' '}
                  <time dateTime={caseDetail.latestRestrictionExpiry}>
                    {formatDateTime(caseDetail.latestRestrictionExpiry)}
                  </time>
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}
      <p className="trust-case-detail__caution">
        Review priority is not proof of misconduct.
      </p>
      {exportError ? (
        <StatusMessage tone="error">
          <strong>The case export could not be prepared.</strong>
          <p>{authorErrorDetail(exportError)}</p>
        </StatusMessage>
      ) : null}
      {exportMessage ? (
        <StatusMessage tone="success">
          <p>{exportMessage}</p>
        </StatusMessage>
      ) : null}
      <details className="trust-case-metadata">
        <summary>Case details</summary>
        <dl className="trust-case-detail__metadata">
          <div>
            <dt>Player ID</dt>
            <dd>{caseDetail.playerId}</dd>
          </div>
          <div>
            <dt>Case</dt>
            <dd>{caseDetail.caseId}</dd>
          </div>
          <div>
            <dt>Policy</dt>
            <dd>{caseDetail.policyVersion}</dd>
          </div>
          <div>
            <dt>Opened</dt>
            <dd>
              <time dateTime={caseDetail.openedAt}>
                {formatDateTime(caseDetail.openedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              <time dateTime={caseDetail.updatedAt}>
                {formatDateTime(caseDetail.updatedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Case version</dt>
            <dd>{caseDetail.version}</dd>
          </div>
          <div>
            <dt>Restrictions</dt>
            <dd>
              {caseDetail.activeRestrictionCount} active ·{' '}
              {caseDetail.restrictionCount} total
            </dd>
          </div>
          {caseDetail.latestRestrictionExpiry ? (
            <div>
              <dt>Latest active expiry</dt>
              <dd>
                <time dateTime={caseDetail.latestRestrictionExpiry}>
                  {formatDateTime(caseDetail.latestRestrictionExpiry)}
                </time>
              </dd>
            </div>
          ) : null}
          {caseDetail.resolvedAt ? (
            <div>
              <dt>Resolved</dt>
              <dd>
                <time dateTime={caseDetail.resolvedAt}>
                  {formatDateTime(caseDetail.resolvedAt)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="trust-case-section__note">
          Exports include up to 100 records per collection.
        </p>
      </details>
      {caseDetail.resolutionReason ? (
        <p className="trust-case-detail__resolution">
          <strong>Resolution:</strong> {caseDetail.resolutionReason}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Case investigation"
        className="trust-case-tabs"
      >
        {(['review', 'restrictions', 'history'] as const).map(
          (value, index, values) => (
            <button
              key={value}
              id={`trust-tab-${value}`}
              role="tab"
              type="button"
              aria-selected={tab === value}
              aria-controls={`trust-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % values.length
                    : event.key === 'ArrowLeft'
                      ? (index + values.length - 1) % values.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? values.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(values[next]!);
                document.getElementById(`trust-tab-${values[next]}`)?.focus();
              }}
            >
              {titleCase(value)}
              {value === 'restrictions' ? (
                <span>{restrictions.totalItems}</span>
              ) : null}
            </button>
          ),
        )}
      </div>
      <div
        role="tabpanel"
        id="trust-panel-review"
        aria-labelledby="trust-tab-review"
        hidden={tab !== 'review'}
      >
        <ScoreExplanation caseDetail={caseDetail} />
        {pendingEvidence ? (
          <p role="status" className="trust-case-section__note">
            {evidence.state === 'error'
              ? 'Retry signal records below to find the referenced signal.'
              : 'Finding the referenced signal…'}
          </p>
        ) : null}
        {evidenceNavigationNotice ? (
          <StatusMessage tone="info">
            <p>{evidenceNavigationNotice}</p>
            {missingEvidenceId ? (
              <button
                className="button button--quiet"
                type="button"
                onClick={() => {
                  setEvidenceNavigationNotice('');
                  setPendingEvidence({
                    id: missingEvidenceId,
                    version: caseDetail.version,
                  });
                  setMissingEvidenceId(null);
                  evidence.reload();
                }}
              >
                Retry reference
              </button>
            ) : null}
          </StatusMessage>
        ) : null}
        <EvidenceSection collection={evidence} />
        <DecisionSection
          apiBaseUrl={apiBaseUrl}
          caseDetail={caseDetail}
          evidence={evidence.items}
          getAccessToken={getAccessToken}
          onChanged={onChanged}
          onReload={onReload}
        />
      </div>
      <div
        role="tabpanel"
        id="trust-panel-restrictions"
        aria-labelledby="trust-tab-restrictions"
        hidden={tab !== 'restrictions'}
      >
        <RestrictionSection collection={restrictions} />
      </div>
      <div
        role="tabpanel"
        id="trust-panel-history"
        aria-labelledby="trust-tab-history"
        hidden={tab !== 'history'}
      >
        <HistorySection
          collection={history}
          onOpenEvidence={(id) => {
            setTab('review');
            setEvidenceNavigationNotice('');
            setMissingEvidenceId(null);
            setPendingEvidence({ id, version: caseDetail.version });
          }}
        />
      </div>
    </article>
  );
}

function ScoreExplanation({ caseDetail }: { caseDetail: TrustCaseDetail }) {
  const score = caseDetail.scoreExplanation;
  return (
    <details className="trust-score-details" id="trust-case-score">
      <summary>
        <span>
          Review score <strong>{caseDetail.score}</strong> / 100
        </span>
        <span className="trust-score-details__toggle">Score breakdown</span>
      </summary>
      <p className="trust-case-section__note">
        {score.sourceSignalCount} source signals
      </p>
      <dl className="trust-score-breakdown">
        <ScorePart label="Movement" value={score.movementPoints} />
        <ScorePart
          label="Submission conflicts"
          value={score.submissionConflictPoints}
        />
        <ScorePart
          label="Opponent patterns"
          value={score.opponentPatternPoints}
        />
        <ScorePart label="Server final" value={score.finalScore} />
      </dl>
      <p className="trust-case-section__note">
        Evaluated{' '}
        <time dateTime={score.evaluatedAt}>
          {formatDateTime(score.evaluatedAt)}
        </time>{' '}
        under the server policy.
      </p>
    </details>
  );
}

interface TrustCollection<T> {
  confirmed: boolean;
  announcement: string;
  error: AuthorApiError | null;
  items: T[];
  loadMore: () => void;
  reload: () => void;
  state: LoadState;
  totalItems: number;
  totalPages: number;
  page: number;
}

function EvidenceSection({
  collection,
}: {
  collection: TrustCollection<TrustCaseEvidenceItem>;
}) {
  return (
    <section
      aria-labelledby="evidence-title"
      className="trust-case-section"
      id="trust-case-signals"
    >
      <div className="trust-case-section__heading">
        <div>
          <h4 id="evidence-title">Signals</h4>
        </div>
        <span>
          Showing {collection.items.length} of {collection.totalItems}
        </span>
      </div>
      <CollectionFeedback collection={collection} label="signal record" />
      {collection.items.length ? (
        <ol className="trust-evidence-list">
          {collection.items.map((item) => (
            <li key={item.evidenceId}>
              <details
                id={`signal-${item.evidenceId}`}
                className="trust-evidence"
              >
                <summary>
                  <strong>{signalLabel(item.signalType)}</strong>
                  <span>{evidenceStateLabel(item)}</span>
                  <time dateTime={item.observedAt}>
                    {formatDateTime(item.observedAt)}
                  </time>
                  <span
                    className={`trust-severity trust-severity--${safeClass(item.severity)}`}
                  >
                    {titleCase(item.severity)} severity
                  </span>
                </summary>
                <div className="trust-evidence__content">
                  <p>
                    {titleCase(item.safeSourceType)} · {item.effectivePoints}{' '}
                    effective points ({item.basePoints} base)
                  </p>
                  <p>
                    Expires{' '}
                    <time dateTime={item.expiresAt}>
                      {formatDateTime(item.expiresAt)}
                    </time>{' '}
                    · Policy {item.policyVersion}
                  </p>
                  {item.opponentPattern?.availability !== 'unavailable' ? (
                    <OpponentPatternSummary evidence={item} />
                  ) : null}
                </div>
              </details>
              {item.opponentPattern?.availability === 'unavailable' ? (
                <OpponentPatternSummary evidence={item} />
              ) : null}
            </li>
          ))}
        </ol>
      ) : collection.state === 'ready' ? (
        <p className="trust-case-section__note">
          No retained signals are available for this case.
        </p>
      ) : null}
      <CollectionLoadMore collection={collection} label="signals" />
    </section>
  );
}

function OpponentPatternSummary({
  evidence,
}: {
  evidence: TrustCaseEvidenceItem;
}) {
  const summary = evidence.opponentPattern;
  if (!summary) return null;
  if (summary.availability === 'unavailable') {
    return (
      <StatusMessage className="trust-signal-summary" tone="info">
        <strong>Reviewer-safe aggregate unavailable</strong>
        <p>
          This legacy signal predates retained aggregate summaries. Wait for a
          fresh detector evaluation before deciding if the server marks the case
          unavailable for review.
        </p>
      </StatusMessage>
    );
  }
  return (
    <details className="trust-signal-summary">
      <summary>View aggregate basis</summary>
      <dl>
        <div>
          <dt>Evaluation window</dt>
          <dd>
            <time dateTime={summary.evaluationWindowStart}>
              {formatDateTime(summary.evaluationWindowStart)}
            </time>{' '}
            to{' '}
            <time dateTime={summary.evaluationWindowEnd}>
              {formatDateTime(summary.evaluationWindowEnd)}
            </time>
          </dd>
        </div>
        {summary.kind === 'opponent_concentration' ? (
          <>
            <div>
              <dt>Completed matches</dt>
              <dd>{summary.completedMatchCount}</dd>
            </div>
            <div>
              <dt>Repeated-opponent matches</dt>
              <dd>{summary.repeatedOpponentMatchCount}</dd>
            </div>
            <div>
              <dt>Concentration</dt>
              <dd>{formatPercent(summary.opponentConcentrationRatio)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Qualifying forfeits</dt>
            <dd>{summary.qualifyingForfeitCount}</dd>
          </div>
        )}
      </dl>
      <p>
        Aggregate counts only. Opponent identities and private match records are
        not exposed.
      </p>
    </details>
  );
}

function RestrictionSection({
  collection,
}: {
  collection: TrustCollection<TrustRestrictionItem>;
}) {
  return (
    <section
      aria-labelledby="restrictions-title"
      className="trust-case-section"
      id="trust-case-restrictions"
    >
      <div className="trust-case-section__heading">
        <div>
          <h4 id="restrictions-title">Restriction history</h4>
        </div>
        <span>
          Showing {collection.items.length} of {collection.totalItems}
        </span>
      </div>
      <CollectionFeedback collection={collection} label="restriction record" />
      {collection.items.length ? (
        <ol className="trust-restriction-list">
          {collection.items.map((item) => (
            <li key={item.restrictionId}>
              <div className="trust-restriction-list__heading">
                <strong>{restrictionLabels[item.scope]}</strong>
                <span
                  className={`trust-status trust-status--${item.active ? 'active' : 'ended'}`}
                >
                  <ShieldWarningIcon aria-hidden="true" size={15} />
                  {item.active ? 'Active' : 'Ended'}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Started</dt>
                  <dd>
                    <time dateTime={item.startsAt}>
                      {formatDateTime(item.startsAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Effective expiry</dt>
                  <dd>
                    <time dateTime={item.effectiveExpiresAt}>
                      {formatDateTime(item.effectiveExpiresAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Original expiry</dt>
                  <dd>
                    <time dateTime={item.originalExpiresAt}>
                      {formatDateTime(item.originalExpiresAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Appeal</dt>
                  <dd>{titleCase(item.appealStatus)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      ) : collection.state === 'ready' ? (
        <p className="trust-case-section__note">
          No restrictions have been recorded for this case.
        </p>
      ) : null}
      <CollectionLoadMore collection={collection} label="restrictions" />
    </section>
  );
}

function HistorySection({
  collection,
  onOpenEvidence,
}: {
  collection: TrustCollection<TrustCaseHistoryItem>;
  onOpenEvidence: (id: string) => void;
}) {
  return (
    <section
      aria-labelledby="history-title"
      className="trust-case-section"
      id="trust-case-audit"
    >
      <div className="trust-case-section__heading">
        <div>
          <h4 id="history-title">Decision and audit history</h4>
        </div>
        <span>
          Showing {collection.items.length} of {collection.totalItems}
        </span>
      </div>
      <CollectionFeedback collection={collection} label="audit record" />
      {collection.items.length ? (
        <ol className="trust-timeline">
          {collection.items.map((item) => (
            <li key={item.decisionId}>
              <span className="trust-timeline__marker trust-timeline__marker--history">
                <ClockCounterClockwiseIcon aria-hidden="true" size={17} />
              </span>
              <div>
                <div className="trust-timeline__heading">
                  <strong>{titleCase(item.decisionType)}</strong>
                  <span>
                    Case version {item.caseVersionBefore} →{' '}
                    {item.caseVersionAfter}
                  </span>
                </div>
                <p>
                  {item.actorPlayerName ?? 'System'} (
                  {titleCase(item.actorType)}){' · '}
                  <time dateTime={item.occurredAt}>
                    {formatDateTime(item.occurredAt)}
                  </time>
                </p>
                <p>
                  {item.previousStatus
                    ? `${statusLabel(item.previousStatus)} → `
                    : ''}
                  {statusLabel(item.resultingStatus)} ·{' '}
                  {titleCase(item.reasonCode)} · Policy {item.policyVersion}
                </p>
                {item.reasonNote ? (
                  <blockquote>{item.reasonNote}</blockquote>
                ) : null}
                {item.evidenceIds.length ? (
                  <p className="trust-timeline__references">
                    Evidence:{' '}
                    {item.evidenceIds.map((id, index) => (
                      <span key={id}>
                        {index ? ', ' : ''}
                        <a
                          href={`#signal-${id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            onOpenEvidence(id);
                          }}
                        >
                          {shortIdentifier(id)}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                {item.falsePositiveEvidenceIds.length ? (
                  <p>
                    False-positive adjustments:{' '}
                    {item.falsePositiveEvidenceIds
                      .map(shortIdentifier)
                      .join(', ')}
                  </p>
                ) : null}
                {item.restrictions.length ? (
                  <ul className="trust-timeline__restrictions">
                    {item.restrictions.map((restriction) => (
                      <li key={restriction.restrictionId}>
                        {restrictionLabels[restriction.scope]} until{' '}
                        <time dateTime={restriction.effectiveExpiresAt}>
                          {formatDateTime(restriction.effectiveExpiresAt)}
                        </time>{' '}
                        · {restriction.active ? 'Active' : 'Ended'} · Appeal{' '}
                        {titleCase(restriction.appealStatus)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : collection.state === 'ready' ? (
        <p className="trust-case-section__note">
          No decisions have been recorded yet.
        </p>
      ) : null}
      <CollectionLoadMore collection={collection} label="audit history" />
    </section>
  );
}

function CollectionFeedback<T>({
  collection,
  label,
}: {
  collection: TrustCollection<T>;
  label: string;
}) {
  return (
    <>
      <p aria-live="polite" className="sr-only" role="status">
        {collection.announcement}
      </p>
      {collection.state === 'loading' ? (
        collection.confirmed ? (
          <UpdatingIndicator
            active
            label={`Updating ${label}s`}
            onRetry={collection.reload}
            announce={false}
          />
        ) : (
          <AuthorLoadingState label={`Loading ${label}s…`} />
        )
      ) : null}
      {collection.state === 'error' ? (
        <StatusMessage tone="error">
          <strong>The complete {label}s could not be loaded.</strong>
          <p>
            {collection.error
              ? authorErrorDetail(collection.error)
              : 'Try this section again.'}
          </p>
          <button
            className="button button--quiet"
            onClick={collection.reload}
            type="button"
          >
            Retry {label}s
          </button>
        </StatusMessage>
      ) : null}
    </>
  );
}

function CollectionLoadMore<T>({
  collection,
  label,
}: {
  collection: TrustCollection<T>;
  label: string;
}) {
  if (collection.page >= collection.totalPages) return null;
  return (
    <button
      className="button button--quiet trust-collection-more"
      disabled={collection.state === 'loading'}
      onClick={collection.loadMore}
      type="button"
    >
      {collection.state === 'loading'
        ? `Loading more ${label}…`
        : `Load more ${label}`}
    </button>
  );
}

function DecisionSection({
  apiBaseUrl,
  caseDetail,
  evidence,
  getAccessToken,
  onChanged,
  onReload,
}: {
  apiBaseUrl: string;
  caseDetail: TrustCaseDetail;
  evidence: TrustCaseEvidenceItem[];
  getAccessToken: ApiAccessTokenProvider;
  onChanged: (detail: TrustCaseDetail) => void;
  onReload: () => void;
}) {
  const fresh = useContext(AuthorReadFreshness);
  const [action, setAction] = useState<TrustReviewAction>(
    'continue_monitoring',
  );
  const [reason, setReason] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [scopes, setScopes] = useState<WritableTrustRestrictionScope[]>([]);
  const [durationHours, setDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<AuthorApiError | null>(null);
  const [validation, setValidation] = useState('');
  const [success, setSuccess] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const restrictButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setAction('continue_monitoring');
    setReason('');
    setEvidenceIds([]);
    setScopes([]);
    setDurationHours(24);
    setConfirming(false);
    setError(null);
    setValidation('');
    setSuccess('');
  }, [caseDetail.caseId]);

  const conflicted = error?.failure === 'conflict';
  const controlsDisabled = submitting || conflicted;

  function validateDecision() {
    if (!reason.trim())
      return 'Explain the evidence and context for this decision.';
    if (reason.trim().length > 1000)
      return 'Keep the decision reason to 1,000 characters or fewer.';
    if (action === 'mark_false_positive' && evidenceIds.length === 0)
      return 'Select at least one active signal to mark as a false positive.';
    if (action === 'restrict' && scopes.length === 0)
      return 'Select at least one restriction.';
    return '';
  }

  function requestDecision(event: FormEvent) {
    event.preventDefault();
    if (!fresh) return;
    setError(null);
    setSuccess('');
    const message = validateDecision();
    setValidation(message);
    if (message) {
      reasonRef.current?.focus();
      return;
    }
    if (action === 'restrict') {
      setConfirming(true);
      return;
    }
    void submitDecision();
  }

  async function submitDecision() {
    if (!fresh) return;
    const controller = new AbortController();
    setSubmitting(true);
    setError(null);
    setValidation('');
    try {
      const next = await recordAuthorTrustDecision({
        apiBaseUrl,
        caseId: caseDetail.caseId,
        getAccessToken,
        input: {
          action,
          durationHours: action === 'restrict' ? durationHours : undefined,
          evidenceIds:
            action === 'mark_false_positive' ? evidenceIds : undefined,
          expectedVersion: caseDetail.version,
          reasonNote: reason.trim(),
          restrictionScopes: action === 'restrict' ? scopes : undefined,
        },
        signal: controller.signal,
      });
      setConfirming(false);
      setAction('continue_monitoring');
      setReason('');
      setEvidenceIds([]);
      setScopes([]);
      setDurationHours(24);
      setSuccess('Decision recorded in the audit history.');
      onChanged(next);
    } catch (caught) {
      setConfirming(false);
      setError(toAuthorError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="decision-title"
      className="trust-case-section trust-decision"
      id="trust-case-decision"
    >
      <div className="trust-case-section__heading">
        <div>
          <h4 id="decision-title">Record decision</h4>
          <p>Choose an action and explain the evidence considered.</p>
        </div>
        <span>Version {caseDetail.version}</span>
      </div>
      {!caseDetail.canReview ? (
        <StatusMessage tone="permission">
          <strong>Decision controls are unavailable.</strong>
          <p>
            The server has marked this case unavailable for decisions. It may be
            resolved or awaiting a reviewer-safe aggregate summary.
          </p>
        </StatusMessage>
      ) : (
        <form onSubmit={requestDecision}>
          <fieldset className="author-fieldset trust-decision__actions">
            <legend>Decision</legend>
            {(
              [
                ['continue_monitoring', 'Continue monitoring'],
                ['dismiss', 'Dismiss case'],
                ['mark_false_positive', 'Mark signals false positive'],
                ['restrict', 'Apply temporary restriction'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  checked={action === value}
                  disabled={!fresh || controlsDisabled}
                  name="review-action"
                  onChange={() => {
                    setAction(value);
                    setValidation('');
                  }}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {action === 'mark_false_positive' ? (
            <fieldset className="author-fieldset trust-decision__options">
              <legend>Active signals to adjust</legend>
              {evidence.filter((item) => item.state === 'active').length ? (
                evidence
                  .filter((item) => item.state === 'active')
                  .map((item) => (
                    <label key={item.evidenceId}>
                      <input
                        checked={evidenceIds.includes(item.evidenceId)}
                        disabled={!fresh || controlsDisabled}
                        onChange={() =>
                          setEvidenceIds(
                            toggleValue(evidenceIds, item.evidenceId),
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        {signalLabel(item.signalType)} · {item.effectivePoints}{' '}
                        points · observed {formatDateTime(item.observedAt)}
                      </span>
                    </label>
                  ))
              ) : (
                <p>No loaded active signals are available to adjust.</p>
              )}
            </fieldset>
          ) : null}

          {action === 'restrict' ? (
            <div className="trust-decision__restriction-fields">
              <fieldset className="author-fieldset trust-decision__options">
                <legend>Temporary restrictions</legend>
                {writableRestrictionScopes.map((scope) => (
                  <label key={scope}>
                    <input
                      checked={scopes.includes(scope)}
                      disabled={!fresh || controlsDisabled}
                      onChange={() => setScopes(toggleValue(scopes, scope))}
                      type="checkbox"
                    />
                    <span>{writableRestrictionLabels[scope]}</span>
                  </label>
                ))}
              </fieldset>
              <SelectField
                label="Duration"
                className="author-filter"
                disabled={!fresh || controlsDisabled}
                onChange={(value) => setDurationHours(Number(value))}
                value={String(durationHours)}
                options={[
                  { value: '24', label: '24 hours' },
                  { value: '72', label: '72 hours' },
                  { value: '168', label: '7 days' },
                ]}
              />
            </div>
          ) : null}

          <label className="form-field trust-decision__reason">
            <span>Reason and context</span>
            <textarea
              aria-describedby="decision-reason-hint"
              disabled={!fresh || controlsDisabled}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              ref={reasonRef}
              rows={5}
              value={reason}
            />
            <small id="decision-reason-hint">
              Required. Include the evidence considered and why this action is
              proportionate. {reason.length}/1,000
            </small>
          </label>

          {validation ? (
            <StatusMessage tone="error">
              <p>{validation}</p>
            </StatusMessage>
          ) : null}
          {error ? (
            <StatusMessage tone="error">
              <strong>
                {conflicted
                  ? 'This case changed before your decision was saved.'
                  : 'The decision was not recorded.'}
              </strong>
              <p>{authorErrorDetail(error)}</p>
              {conflicted ? (
                <button
                  className="button button--quiet"
                  onClick={() => {
                    setAction('continue_monitoring');
                    setReason('');
                    setEvidenceIds([]);
                    setScopes([]);
                    setDurationHours(24);
                    setError(null);
                    onReload();
                  }}
                  type="button"
                >
                  Load latest case
                </button>
              ) : null}
            </StatusMessage>
          ) : null}
          <button
            className={
              action === 'restrict' ? 'button button--danger' : 'button'
            }
            disabled={!fresh || controlsDisabled}
            ref={restrictButtonRef}
            type="submit"
          >
            {submitting
              ? 'Recording…'
              : action === 'restrict'
                ? 'Review restriction'
                : 'Record decision'}
          </button>
        </form>
      )}

      {success ? (
        <StatusMessage tone="success">
          <p>{success}</p>
        </StatusMessage>
      ) : null}

      {confirming ? (
        <AuthorConfirmationDialog
          busy={submitting}
          cancelLabel="Go back"
          confirmLabel={`Apply ${durationHours}-hour restriction`}
          description={
            <div className="trust-decision__confirmation">
              <section
                aria-labelledby="restriction-current-state-title"
                className="trust-decision__confirmation-state"
              >
                <h3 id="restriction-current-state-title">Current state</h3>
                <dl>
                  <div>
                    <dt>Case status</dt>
                    <dd>{statusLabel(caseDetail.status)}</dd>
                  </div>
                  <div>
                    <dt>Active restriction records</dt>
                    <dd>{caseDetail.activeRestrictionCount}</dd>
                  </div>
                  <div>
                    <dt>Existing affected capabilities</dt>
                    <dd>
                      {caseDetail.activeRestrictionScopes.length ? (
                        <ul>
                          {caseDetail.activeRestrictionScopes.map((scope) => (
                            <li key={scope}>{restrictionLabels[scope]}</li>
                          ))}
                        </ul>
                      ) : (
                        'None'
                      )}
                    </dd>
                  </div>
                  {caseDetail.latestRestrictionExpiry ? (
                    <div>
                      <dt>Latest active expiry</dt>
                      <dd>
                        <time dateTime={caseDetail.latestRestrictionExpiry}>
                          {formatDateTime(caseDetail.latestRestrictionExpiry)}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Case version</dt>
                    <dd>{caseDetail.version}</dd>
                  </div>
                </dl>
              </section>
              <section
                aria-labelledby="restriction-proposed-state-title"
                className="trust-decision__confirmation-state"
              >
                <h3 id="restriction-proposed-state-title">
                  Proposed restriction
                </h3>
                <dl>
                  <div>
                    <dt>Player</dt>
                    <dd>{caseDetail.playerName}</dd>
                  </div>
                  <div>
                    <dt>Affected capabilities</dt>
                    <dd>
                      <ul>
                        {scopes.map((scope) => (
                          <li key={scope}>
                            {writableRestrictionLabels[scope]}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{durationHours} hours</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{reason.trim()}</dd>
                  </div>
                </dl>
              </section>
            </div>
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => void submitDecision()}
          returnFocusRef={restrictButtonRef}
          title={`Apply temporary restrictions to ${caseDetail.playerName}?`}
        />
      ) : null}
    </section>
  );
}

function useTrustCollection<T>({
  initialItems,
  resourceKey,
  keyOf,
  loadPage,
  refreshKey,
  totalItems,
}: {
  initialItems: T[];
  resourceKey: string;
  keyOf: (item: T) => string;
  loadPage: (page: number, signal: AbortSignal) => Promise<AuthorPage<T>>;
  refreshKey: string;
  totalItems: number;
}): TrustCollection<T> {
  const {
    value: items,
    setValue: setItems,
    confirmed,
    confirm,
    revoke,
    beginRead,
  } = useAuthorRetainedResource<T[]>(resourceKey, initialItems);
  const [page, setPage] = useState(initialItems.length ? 1 : 0);
  const [totalPages, setTotalPages] = useState(initialItems.length ? 1 : 0);
  const [knownTotal, setKnownTotal] = useState(totalItems);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<AuthorApiError | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (requestedPage: number, append: boolean) => {
      requestRef.current?.abort();
      const canApplyRead = beginRead();
      const controller = new AbortController();
      requestRef.current = controller;
      setState('loading');
      setError(null);
      try {
        const result = await loadPage(requestedPage, controller.signal);
        if (controller.signal.aborted || !canApplyRead()) return;
        setItems((current) =>
          append ? mergeUnique(current, result.items, keyOf) : result.items,
        );
        confirm();
        setPage(result.page);
        setKnownTotal(result.totalItems);
        setTotalPages(result.totalPages);
        setState('ready');
        setAnnouncement(
          append
            ? `${result.items.length} more records loaded.`
            : `${result.totalItems} records available.`,
        );
      } catch (caught) {
        if (!controller.signal.aborted && canApplyRead()) {
          revoke(caught);
          setError(toAuthorError(caught));
          setState('error');
        }
      }
    },
    [keyOf, loadPage, confirm, revoke, setItems, beginRead],
  );

  useEffect(() => {
    setPage(initialItems.length ? 1 : 0);
    setTotalPages(initialItems.length ? 1 : 0);
    setKnownTotal(totalItems);
    setAnnouncement('');
    void load(1, false);
    return () => requestRef.current?.abort();
  }, [refreshKey, load]);

  const loadMore = useCallback(() => void load(page + 1, true), [load, page]);
  const reload = useCallback(() => void load(1, false), [load]);

  return {
    announcement,
    confirmed,
    error,
    items,
    loadMore,
    page,
    reload,
    state,
    totalItems: knownTotal,
    totalPages,
  };
}

function CaseError({
  error,
  onReload,
}: {
  error: AuthorApiError | null;
  onReload: () => void;
}) {
  const forbidden = error?.failure === 'forbidden';
  return (
    <section
      className={`author-state state-message ${forbidden ? 'state-message--permission' : 'state-message--error'}`}
      role="alert"
    >
      <StateIcon tone={forbidden ? 'permission' : 'error'} />
      <strong>
        {forbidden
          ? 'Reviewer permission was refused.'
          : error?.failure === 'not-found'
            ? 'This case is no longer available.'
            : 'The case could not be loaded.'}
      </strong>
      <p>{error ? authorErrorDetail(error) : null}</p>
      <button className="button button--quiet" onClick={onReload} type="button">
        Retry case
      </button>
    </section>
  );
}

function BandBadge({ band }: { band: TrustReviewBand }) {
  const Icon =
    band === 'urgent_review' || band === 'review_required'
      ? WarningDiamondIcon
      : EyeIcon;
  return (
    <span className={`trust-band trust-band--${band}`}>
      <Icon aria-hidden="true" size={15} />
      {titleCase(band)}
    </span>
  );
}

function StatusIcon({ status }: { status: TrustCaseStatus }) {
  const Icon =
    status === 'resolved'
      ? CheckCircleIcon
      : status === 'under_review'
        ? EyeIcon
        : ShieldWarningIcon;
  return <Icon aria-hidden="true" size={15} />;
}

function ScorePart({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function mergeUnique<T>(current: T[], next: T[], keyOf: (item: T) => string) {
  const keys = new Set(current.map(keyOf));
  return [...current, ...next.filter((item) => !keys.has(keyOf(item)))];
}

function evidenceKey(item: TrustCaseEvidenceItem) {
  return item.evidenceId;
}

function restrictionKey(item: TrustRestrictionItem) {
  return item.restrictionId;
}

function historyKey(item: TrustCaseHistoryItem) {
  return item.decisionId;
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function toAuthorError(error: unknown) {
  return error instanceof AuthorApiError
    ? error
    : new AuthorApiError(
        'unavailable',
        'The API request could not be completed.',
      );
}

function statusLabel(value: TrustCaseStatus) {
  return titleCase(value);
}

function signalLabel(value: TrustCaseEvidenceItem['signalType']) {
  const labels: Record<TrustCaseEvidenceItem['signalType'], string> = {
    impossible_movement: 'Impossible movement',
    idempotency_payload_conflict: 'Submission payload conflict',
    submission_conflict_pattern: 'Submission conflict pattern',
    opponent_concentration: 'Opponent concentration',
    one_sided_outcome_pattern: 'One-sided outcome pattern',
  };
  return labels[value];
}

function evidenceStateLabel(item: TrustCaseEvidenceItem) {
  if (
    item.reviewedFalsePositive ||
    item.decayState === 'reviewed_false_positive'
  )
    return 'Reviewed false positive';
  return titleCase(item.state);
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeClass(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function formatDateTime(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value);
}

function shortIdentifier(value: string) {
  return value.slice(0, 8);
}

function dateBoundary(value: string, edge: 'end' | 'start') {
  return appCalendarDateBoundary(value, edge);
}

function downloadJson(filename: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
