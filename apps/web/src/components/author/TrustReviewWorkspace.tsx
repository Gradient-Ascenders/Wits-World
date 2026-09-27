import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  EyeIcon,
  ShieldWarningIcon,
  SidebarSimpleIcon,
  WarningDiamondIcon,
} from '@phosphor-icons/react';
import {
  type FormEvent,
  useCallback,
  useEffect,
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
import { LoadingState } from '../LoadingState';
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
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [queue, setQueue] = useState<AuthorPage<TrustCaseQueueItem> | null>(
    null,
  );
  const [queueState, setQueueState] = useState<LoadState>('loading');
  const [queueError, setQueueError] = useState<AuthorApiError | null>(null);
  const [detail, setDetail] = useState<TrustCaseDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('ready');
  const [detailError, setDetailError] = useState<AuthorApiError | null>(null);
  const queueRequestRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);

  const loadQueue = useCallback(async () => {
    queueRequestRef.current?.abort();
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
      if (!controller.signal.aborted) {
        setQueue(result);
        setQueueState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
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
  ]);

  const loadDetail = useCallback(async () => {
    if (!route.caseId) {
      setDetail(null);
      setDetailState('ready');
      setDetailError(null);
      return;
    }
    detailRequestRef.current?.abort();
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
      if (!controller.signal.aborted) {
        setDetail(result);
        setDetailState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setDetail(null);
        setDetailError(toAuthorError(error));
        setDetailState('error');
      }
    }
  }, [apiBaseUrl, getAccessToken, route.caseId]);

  useEffect(() => {
    void loadQueue();
    return () => queueRequestRef.current?.abort();
  }, [loadQueue]);

  useEffect(() => {
    void loadDetail();
    return () => detailRequestRef.current?.abort();
  }, [loadDetail]);

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
  }

  const hasFilters =
    Boolean(search) ||
    status !== 'active' ||
    band !== 'all' ||
    restrictionState !== 'all' ||
    signalType !== 'all' ||
    Boolean(openedFrom || openedTo || updatedFrom || updatedTo);

  return (
    <section
      aria-labelledby="trust-review-title"
      className={`trust-review${route.caseId ? ' trust-review--detail' : ''}`}
    >
      <header className="author-workspace__heading trust-review__heading">
        <div>
          <h2 id="trust-review-title">Player review</h2>
          <p>
            Investigate server-derived signals and record proportionate human
            decisions. Review priority is not proof of misconduct.
          </p>
        </div>
      </header>

      <div
        className={`trust-review__layout${queueCollapsed ? ' trust-review__layout--queue-collapsed' : ''}`}
      >
        <aside aria-label="Trust case queue" className="trust-review__queue">
          <div className="trust-review__queue-header">
            <h3>Case queue</h3>
            <button
              aria-expanded={!queueCollapsed}
              className="button button--quiet trust-review__queue-toggle"
              onClick={() => setQueueCollapsed((value) => !value)}
              type="button"
            >
              <SidebarSimpleIcon aria-hidden="true" size={18} />
              <span className="sr-only">
                {queueCollapsed ? 'Expand case queue' : 'Collapse case queue'}
              </span>
            </button>
          </div>
          <div className="trust-review__queue-body">
            <form
              className="trust-review__filters"
              onSubmit={submitSearch}
              role="search"
            >
              <div className="trust-review__search-row">
                <label className="author-filter">
                  <span>Search cases</span>
                  <input
                    maxLength={256}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Player, case, or player ID"
                    type="search"
                    value={searchDraft}
                  />
                </label>
                <div className="trust-review__search-actions">
                  <button className="button button--quiet" type="submit">
                    Search
                  </button>
                  {hasFilters ? (
                    <button
                      className="button button--quiet"
                      onClick={clearFilters}
                      type="button"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <label className="author-filter">
                <span>Case status</span>
                <select
                  onChange={(event) => {
                    setStatus(event.target.value as TrustCaseStatusFilter);
                    setPage(1);
                  }}
                  value={status}
                >
                  <option value="active">Active cases</option>
                  <option value="open">Open</option>
                  <option value="under_review">Under review</option>
                  <option value="resolved">Resolved</option>
                  <option value="all">All cases</option>
                </select>
              </label>
              <label className="author-filter">
                <span>Review priority</span>
                <select
                  onChange={(event) => {
                    setBand(event.target.value as TrustReviewBand | 'all');
                    setPage(1);
                  }}
                  value={band}
                >
                  <option value="all">All priorities</option>
                  <option value="urgent_review">Urgent review</option>
                  <option value="review_required">Review required</option>
                  <option value="observe">Observe</option>
                  <option value="normal">Normal</option>
                </select>
              </label>
              <details className="trust-review__advanced-filters">
                <summary>More filters</summary>
                <div className="trust-review__advanced-grid">
                  <label className="author-filter">
                    <span>Signal type</span>
                    <select
                      onChange={(event) => {
                        setSignalType(
                          event.target.value as TrustSignalType | 'all',
                        );
                        setPage(1);
                      }}
                      value={signalType}
                    >
                      <option value="all">All signal types</option>
                      <option value="impossible_movement">
                        Impossible movement
                      </option>
                      <option value="idempotency_payload_conflict">
                        Submission payload conflict
                      </option>
                      <option value="submission_conflict_pattern">
                        Submission conflict pattern
                      </option>
                      <option value="opponent_concentration">
                        Opponent concentration
                      </option>
                      <option value="one_sided_outcome_pattern">
                        One-sided outcomes
                      </option>
                    </select>
                  </label>
                  <label className="author-filter">
                    <span>Restriction state</span>
                    <select
                      onChange={(event) => {
                        setRestrictionState(
                          event.target.value as
                            TrustRestrictionStateFilter | 'all',
                        );
                        setPage(1);
                      }}
                      value={restrictionState}
                    >
                      <option value="all">Any restriction state</option>
                      <option value="active">Active restriction</option>
                      <option value="none">No active restriction</option>
                    </select>
                  </label>
                  <DateFilter
                    label="Opened from (UTC)"
                    onChange={(value) => {
                      setOpenedFrom(value);
                      setPage(1);
                    }}
                    value={openedFrom}
                  />
                  <DateFilter
                    label="Opened to (UTC)"
                    onChange={(value) => {
                      setOpenedTo(value);
                      setPage(1);
                    }}
                    value={openedTo}
                  />
                  <DateFilter
                    label="Updated from (UTC)"
                    onChange={(value) => {
                      setUpdatedFrom(value);
                      setPage(1);
                    }}
                    value={updatedFrom}
                  />
                  <DateFilter
                    label="Updated to (UTC)"
                    onChange={(value) => {
                      setUpdatedTo(value);
                      setPage(1);
                    }}
                    value={updatedTo}
                  />
                </div>
              </details>
            </form>

            <QueueContents
              error={queueError}
              onReload={() => void loadQueue()}
              queue={queue}
              selectedCaseId={route.caseId}
              state={queueState}
            />

            {queueState === 'ready' && queue && queue.totalPages > 1 ? (
              <nav
                aria-label="Trust case queue pages"
                className="author-pagination"
              >
                <button
                  className="button button--quiet"
                  disabled={queue.page <= 1}
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
                  disabled={queue.page >= queue.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </div>
        </aside>

        <main className="trust-review__case">
          {route.caseId ? (
            <Link
              className="trust-review__back"
              href={authorPaths.playerReview}
            >
              <ArrowLeftIcon aria-hidden="true" size={18} />
              Back to case queue
            </Link>
          ) : null}
          {detailState === 'loading' ? (
            <LoadingState label="Loading case details…" />
          ) : null}
          {detailState === 'error' ? (
            <CaseError error={detailError} onReload={() => void loadDetail()} />
          ) : null}
          {detailState === 'ready' && detail ? (
            <TrustCasePanel
              apiBaseUrl={apiBaseUrl}
              caseDetail={detail}
              getAccessToken={getAccessToken}
              onChanged={(next) => {
                setDetail(next);
                void loadQueue();
              }}
              onReload={() => void loadDetail()}
            />
          ) : null}
          {detailState === 'ready' && !detail && !route.caseId ? (
            <section className="author-state author-state--empty state-message state-message--empty">
              <StateIcon tone="empty" />
              <strong>Select a case to begin review.</strong>
              <p>
                A privacy-safe preview will appear before full records load.
              </p>
            </section>
          ) : null}
        </main>
      </div>
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
  selectedCaseId,
  state,
}: {
  error: AuthorApiError | null;
  onReload: () => void;
  queue: AuthorPage<TrustCaseQueueItem> | null;
  selectedCaseId?: string;
  state: LoadState;
}) {
  if (state === 'loading') return <LoadingState label="Loading case queue…" />;
  if (state === 'error') {
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
        <strong>No cases match this view.</strong>
        <p>Adjust the filters or clear the search to see other cases.</p>
      </section>
    );
  }
  return (
    <ol className="trust-review__queue-list">
      {queue.items.map((item) => (
        <li key={item.caseId}>
          <Link
            aria-current={selectedCaseId === item.caseId ? 'page' : undefined}
            className="trust-review__queue-link"
            href={authorPaths.playerReviewCase(item.caseId)}
          >
            <span className="trust-review__queue-heading">
              <strong>{item.playerName}</strong>
              <BandBadge band={item.band} />
            </span>
            <span className="trust-review__queue-meta">
              <StatusIcon status={item.status} />
              {statusLabel(item.status)} · Score {item.score} · Updated{' '}
              <time dateTime={item.updatedAt}>
                {formatCompactDate(item.updatedAt)}
              </time>
            </span>
            <span className="trust-review__queue-meta">
              {item.signalTypes.length} signal type
              {item.signalTypes.length === 1 ? '' : 's'} ·{' '}
              {item.restrictionCount} restriction record
              {item.restrictionCount === 1 ? '' : 's'}
            </span>
            {item.activeRestrictionCount > 0 ? (
              <span className="trust-review__restriction-note">
                <ShieldWarningIcon aria-hidden="true" size={16} />
                {item.activeRestrictionCount} active restriction
                {item.activeRestrictionCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
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
    initialItems: caseDetail.evidencePreview,
    keyOf: evidenceKey,
    loadPage: loadEvidence,
    refreshKey: `${caseDetail.caseId}:${caseDetail.version}`,
    totalItems: caseDetail.evidenceTotalItems,
  });
  const restrictions = useTrustCollection({
    initialItems: caseDetail.restrictionPreview,
    keyOf: restrictionKey,
    loadPage: loadRestrictions,
    refreshKey: `${caseDetail.caseId}:${caseDetail.version}`,
    totalItems: caseDetail.restrictionTotalItems,
  });
  const history = useTrustCollection({
    initialItems: caseDetail.recentHistory,
    keyOf: historyKey,
    loadPage: loadHistory,
    refreshKey: `${caseDetail.caseId}:${caseDetail.version}`,
    totalItems: Math.max(
      caseDetail.recentHistory.length,
      caseDetail.history.length,
    ),
  });

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
          <div className="trust-case-detail__labels">
            <BandBadge band={caseDetail.band} />
            <span className="trust-case-detail__status">
              <StatusIcon status={caseDetail.status} />
              {statusLabel(caseDetail.status)}
            </span>
          </div>
          <h3 id="trust-case-title" ref={headingRef} tabIndex={-1}>
            {caseDetail.playerName}
          </h3>
          <p className="trust-case-detail__id">
            Player ID {caseDetail.playerId}
          </p>
        </div>
        <div className="trust-case-detail__header-actions">
          <div
            aria-label={`Review score ${caseDetail.score} out of 100`}
            className="trust-score"
          >
            <strong>{caseDetail.score}</strong>
            <span>Review score</span>
          </div>
          <button
            className="button button--quiet"
            disabled={exporting}
            onClick={() => void exportCase()}
            type="button"
          >
            <DownloadSimpleIcon aria-hidden="true" size={18} />
            {exporting ? 'Preparing…' : 'Export safe JSON'}
          </button>
          <small>Up to 100 records per collection</small>
        </div>
      </header>
      <p className="trust-case-detail__caution">
        <WarningDiamondIcon aria-hidden="true" size={20} />
        Review priority, not proof of misconduct.
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
      <dl className="trust-case-detail__metadata">
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
      {caseDetail.resolutionReason ? (
        <p className="trust-case-detail__resolution">
          <strong>Resolution:</strong> {caseDetail.resolutionReason}
        </p>
      ) : null}

      <nav aria-label="Case investigation" className="trust-case-outline">
        <a href="#trust-case-summary">Summary</a>
        <a href="#trust-case-score">Score</a>
        <a href="#trust-case-signals">
          Signals <span>{caseDetail.evidenceTotalItems}</span>
        </a>
        <a href="#trust-case-restrictions">
          Restrictions <span>{caseDetail.restrictionTotalItems}</span>
        </a>
        <a href="#trust-case-audit">Audit</a>
        <a href="#trust-case-decision">Decision</a>
      </nav>

      <ScoreExplanation caseDetail={caseDetail} />
      <EvidenceSection collection={evidence} />
      <RestrictionSection collection={restrictions} />
      <HistorySection collection={history} />
      <DecisionSection
        apiBaseUrl={apiBaseUrl}
        caseDetail={caseDetail}
        evidence={evidence.items}
        getAccessToken={getAccessToken}
        onChanged={onChanged}
        onReload={onReload}
      />
    </article>
  );
}

function ScoreExplanation({ caseDetail }: { caseDetail: TrustCaseDetail }) {
  const score = caseDetail.scoreExplanation;
  return (
    <section
      aria-labelledby="score-explanation-title"
      className="trust-case-section"
      id="trust-case-score"
    >
      <div className="trust-case-section__heading">
        <h4 id="score-explanation-title">Score explanation</h4>
        <span>{score.sourceSignalCount} source signals</span>
      </div>
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
        under the server policy. Values shown here are not calculated by this
        page.
      </p>
    </section>
  );
}

interface TrustCollection<T> {
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
          <p>Privacy-safe evidence only</p>
        </div>
        <span>
          Showing {collection.items.length} of {collection.totalItems}
        </span>
      </div>
      <CollectionFeedback collection={collection} label="signal record" />
      {collection.items.length ? (
        <ol className="trust-timeline">
          {collection.items.map((item) => (
            <li id={`signal-${item.evidenceId}`} key={item.evidenceId}>
              <span
                className={`trust-timeline__marker trust-timeline__marker--${item.state}`}
              >
                <EyeIcon aria-hidden="true" size={17} />
              </span>
              <div>
                <div className="trust-timeline__heading">
                  <strong>{signalLabel(item.signalType)}</strong>
                  <span
                    className={`trust-severity trust-severity--${safeClass(item.severity)}`}
                  >
                    <WarningDiamondIcon aria-hidden="true" size={15} />
                    {titleCase(item.severity)} severity
                  </span>
                </div>
                <p>
                  {titleCase(item.safeSourceType)} · {item.effectivePoints}{' '}
                  effective points ({item.basePoints} base) ·{' '}
                  {evidenceStateLabel(item)}
                </p>
                <p>
                  Observed{' '}
                  <time dateTime={item.observedAt}>
                    {formatDateTime(item.observedAt)}
                  </time>{' '}
                  · expires{' '}
                  <time dateTime={item.expiresAt}>
                    {formatDateTime(item.expiresAt)}
                  </time>
                </p>
                <p>Policy {item.policyVersion}</p>
                <OpponentPatternSummary evidence={item} />
              </div>
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
          <p>Authoritative capability limits and appeal state</p>
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
}: {
  collection: TrustCollection<TrustCaseHistoryItem>;
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
          <p>Append-only actions, actors, reasons, and state changes</p>
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
                        <a href={`#signal-${id}`}>{shortIdentifier(id)}</a>
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
        <div
          aria-label={`Loading complete ${label}s`}
          className="trust-collection-loading"
          role="status"
        >
          <span />
          <span />
        </div>
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
      {collection.state === 'loading' ? 'Loading…' : `Load more ${label}`}
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
          <p>
            Apply a proportionate human judgement to the current case version
          </p>
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
                  disabled={controlsDisabled}
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
                        disabled={controlsDisabled}
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
                      disabled={controlsDisabled}
                      onChange={() => setScopes(toggleValue(scopes, scope))}
                      type="checkbox"
                    />
                    <span>{writableRestrictionLabels[scope]}</span>
                  </label>
                ))}
              </fieldset>
              <label className="author-filter">
                <span>Duration</span>
                <select
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    setDurationHours(Number(event.target.value))
                  }
                  value={durationHours}
                >
                  <option value={24}>24 hours</option>
                  <option value={72}>72 hours</option>
                  <option value={168}>7 days</option>
                </select>
              </label>
            </div>
          ) : null}

          <label className="form-field trust-decision__reason">
            <span>Reason and context</span>
            <textarea
              aria-describedby="decision-reason-hint"
              disabled={controlsDisabled}
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
          {success ? (
            <StatusMessage tone="success">
              <p>{success}</p>
            </StatusMessage>
          ) : null}

          <button
            className={
              action === 'restrict' ? 'button button--danger' : 'button'
            }
            disabled={controlsDisabled}
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
  keyOf,
  loadPage,
  refreshKey,
  totalItems,
}: {
  initialItems: T[];
  keyOf: (item: T) => string;
  loadPage: (page: number, signal: AbortSignal) => Promise<AuthorPage<T>>;
  refreshKey: string;
  totalItems: number;
}): TrustCollection<T> {
  const [items, setItems] = useState(initialItems);
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
      const controller = new AbortController();
      requestRef.current = controller;
      setState('loading');
      setError(null);
      try {
        const result = await loadPage(requestedPage, controller.signal);
        if (controller.signal.aborted) return;
        setItems((current) =>
          append ? mergeUnique(current, result.items, keyOf) : result.items,
        );
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
        if (!controller.signal.aborted) {
          setError(toAuthorError(caught));
          setState('error');
        }
      }
    },
    [keyOf, loadPage],
  );

  useEffect(() => {
    setItems(initialItems);
    setPage(initialItems.length ? 1 : 0);
    setTotalPages(initialItems.length ? 1 : 0);
    setKnownTotal(totalItems);
    setAnnouncement('');
    void load(1, false);
    return () => requestRef.current?.abort();
  }, [refreshKey, load]);

  return {
    announcement,
    error,
    items,
    loadMore: () => void load(page + 1, true),
    page,
    reload: () => void load(1, false),
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
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
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
  if (!value) return undefined;
  return `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`;
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
