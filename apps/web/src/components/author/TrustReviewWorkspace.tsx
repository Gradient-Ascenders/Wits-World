import {
  ArrowLeftIcon,
  CheckCircleIcon,
  EyeIcon,
  ShieldWarningIcon,
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
  getAuthorTrustCase,
  listAuthorTrustCases,
  recordAuthorTrustDecision,
  type AuthorPage,
  type TrustCaseDetail,
  type TrustCaseEvidenceItem,
  type TrustCaseQueueItem,
  type TrustCaseStatus,
  type TrustCaseStatusFilter,
  type TrustRestrictionScope,
  type TrustReviewAction,
  type TrustReviewBand,
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

const restrictionLabels: Record<TrustRestrictionScope, string> = {
  online_verification_required: 'Require online verification',
  location_reward_challenge_hold: 'Pause location reward challenges',
  new_competitive_match_hold: 'Pause new competitive matches',
};

export function TrustReviewWorkspace({
  apiBaseUrl,
  getAccessToken,
  route,
}: TrustReviewWorkspaceProps) {
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TrustCaseStatusFilter>('active');
  const [band, setBand] = useState<TrustReviewBand | 'all'>('all');
  const [page, setPage] = useState(1);
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
        getAccessToken,
        page,
        pageSize: 20,
        search: search || undefined,
        signal: controller.signal,
        status,
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
  }, [apiBaseUrl, band, getAccessToken, page, search, status]);

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

  return (
    <section
      aria-labelledby="trust-review-title"
      className={`trust-review${route.caseId ? ' trust-review--detail' : ''}`}
    >
      <header className="author-workspace__heading trust-review__heading">
        <div>
          <h2 id="trust-review-title">Player review</h2>
          <p>
            Assess server-derived signals and record proportionate, human
            decisions. Review priority is not proof of misconduct.
          </p>
        </div>
      </header>

      <div className="trust-review__layout">
        <aside aria-label="Trust case queue" className="trust-review__queue">
          <form
            className="trust-review__filters"
            onSubmit={submitSearch}
            role="search"
          >
            <div className="trust-review__search-row">
              <label className="author-filter">
                <span>Search cases</span>
                <input
                  maxLength={100}
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
                {search ? (
                  <button
                    className="button button--quiet"
                    onClick={() => {
                      setSearchDraft('');
                      setSearch('');
                      setPage(1);
                    }}
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
                The complete, privacy-safe evidence record will appear here.
              </p>
            </section>
          ) : null}
        </main>
      </div>
    </section>
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
  const [action, setAction] = useState<TrustReviewAction>(
    'continue_monitoring',
  );
  const [reason, setReason] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [scopes, setScopes] = useState<TrustRestrictionScope[]>([]);
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
    setError(null);
    setValidation('');
    setSuccess('');
  }, [caseDetail.caseId]);

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
      setSuccess('Decision recorded in the audit history.');
      onChanged(next);
    } catch (caught) {
      setConfirming(false);
      setError(toAuthorError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const score = caseDetail.scoreExplanation;
  return (
    <article aria-labelledby="trust-case-title" className="trust-case-detail">
      <header className="trust-case-detail__header">
        <div>
          <div className="trust-case-detail__labels">
            <BandBadge band={caseDetail.band} />
            <span className="trust-case-detail__status">
              <StatusIcon status={caseDetail.status} />
              {statusLabel(caseDetail.status)}
            </span>
          </div>
          <h3 id="trust-case-title">{caseDetail.playerName}</h3>
          <p className="trust-case-detail__id">
            Player ID {caseDetail.playerId}
          </p>
        </div>
        <div
          className="trust-score"
          aria-label={`Review score ${caseDetail.score} out of 100`}
        >
          <strong>{caseDetail.score}</strong>
          <span>Review score</span>
        </div>
      </header>
      <p className="trust-case-detail__caution">
        <WarningDiamondIcon aria-hidden="true" size={20} />
        Review priority, not proof of misconduct.
      </p>
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
          <dt>Version</dt>
          <dd>{caseDetail.version}</dd>
        </div>
      </dl>

      <section
        aria-labelledby="score-explanation-title"
        className="trust-case-section"
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

      <EvidenceTimeline evidence={caseDetail.evidence} />
      <HistoryTimeline history={caseDetail.history} />

      <section
        aria-labelledby="decision-title"
        className="trust-case-section trust-decision"
      >
        <h4 id="decision-title">Record decision</h4>
        {!caseDetail.canReview ? (
          <StatusMessage tone="permission">
            <strong>Decision controls are unavailable.</strong>
            <p>This is your own player case or the case is already resolved.</p>
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
                {caseDetail.evidence
                  .filter((item) => item.state === 'active')
                  .map((item) => (
                    <label key={item.evidenceId}>
                      <input
                        checked={evidenceIds.includes(item.evidenceId)}
                        onChange={() =>
                          setEvidenceIds(
                            toggleValue(evidenceIds, item.evidenceId),
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        {signalLabel(item.signalType)} · {item.effectivePoints}{' '}
                        points
                      </span>
                    </label>
                  ))}
              </fieldset>
            ) : null}

            {action === 'restrict' ? (
              <div className="trust-decision__restriction-fields">
                <fieldset className="author-fieldset trust-decision__options">
                  <legend>Temporary restrictions</legend>
                  {(
                    Object.keys(restrictionLabels) as TrustRestrictionScope[]
                  ).map((scope) => (
                    <label key={scope}>
                      <input
                        checked={scopes.includes(scope)}
                        onChange={() => setScopes(toggleValue(scopes, scope))}
                        type="checkbox"
                      />
                      <span>{restrictionLabels[scope]}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="author-filter">
                  <span>Duration</span>
                  <select
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
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                ref={reasonRef}
                rows={4}
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
                  {error.failure === 'conflict'
                    ? 'This case changed before your decision was saved.'
                    : 'The decision was not recorded.'}
                </strong>
                <p>{authorErrorDetail(error)}</p>
                {error.failure === 'conflict' ? (
                  <button
                    className="button button--quiet"
                    onClick={onReload}
                    type="button"
                  >
                    Review latest case
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
              disabled={submitting}
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
      </section>

      {confirming ? (
        <AuthorConfirmationDialog
          busy={submitting}
          cancelLabel="Go back"
          confirmLabel="Apply restriction"
          description={
            <div className="trust-decision__confirmation">
              <p>
                This will apply the following temporary limits for{' '}
                {durationHours} hours:
              </p>
              <ul>
                {scopes.map((scope) => (
                  <li key={scope}>{restrictionLabels[scope]}</li>
                ))}
              </ul>
              <p>
                <strong>Reason:</strong> {reason.trim()}
              </p>
              <p>
                The decision will be recorded against case version{' '}
                {caseDetail.version}.
              </p>
            </div>
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => void submitDecision()}
          returnFocusRef={restrictButtonRef}
          title="Apply temporary player restriction?"
        />
      ) : null}
    </article>
  );
}

function EvidenceTimeline({ evidence }: { evidence: TrustCaseEvidenceItem[] }) {
  return (
    <section aria-labelledby="evidence-title" className="trust-case-section">
      <div className="trust-case-section__heading">
        <h4 id="evidence-title">Signal timeline</h4>
        <span>Privacy-safe evidence only</span>
      </div>
      {evidence.length ? (
        <ol className="trust-timeline">
          {evidence.map((item) => (
            <li key={item.evidenceId}>
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
                    {titleCase(item.severity)}
                  </span>
                </div>
                <p>
                  {titleCase(item.safeSourceType)} · {item.effectivePoints}{' '}
                  effective points ({item.basePoints} base) ·{' '}
                  {titleCase(item.state)}
                </p>
                <p>
                  <time dateTime={item.observedAt}>
                    {formatDateTime(item.observedAt)}
                  </time>{' '}
                  · expires{' '}
                  <time dateTime={item.expiresAt}>
                    {formatDateTime(item.expiresAt)}
                  </time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="trust-case-section__note">
          No retained signals are available for this case.
        </p>
      )}
    </section>
  );
}

function HistoryTimeline({ history }: { history: TrustCaseDetail['history'] }) {
  return (
    <section aria-labelledby="history-title" className="trust-case-section">
      <h4 id="history-title">Decision and audit history</h4>
      {history.length ? (
        <ol className="trust-timeline">
          {history.map((item) => (
            <li key={item.decisionId}>
              <span className="trust-timeline__marker trust-timeline__marker--history">
                <CheckCircleIcon aria-hidden="true" size={17} />
              </span>
              <div>
                <div className="trust-timeline__heading">
                  <strong>{titleCase(item.decisionType)}</strong>
                  <span>
                    Version {item.caseVersionBefore} → {item.caseVersionAfter}
                  </span>
                </div>
                <p>
                  {item.actorPlayerName ?? 'System'} ·{' '}
                  <time dateTime={item.occurredAt}>
                    {formatDateTime(item.occurredAt)}
                  </time>
                </p>
                <p>
                  {item.previousStatus
                    ? `${statusLabel(item.previousStatus)} → `
                    : ''}
                  {statusLabel(item.resultingStatus)} ·{' '}
                  {titleCase(item.reasonCode)}
                </p>
                {item.reasonNote ? (
                  <blockquote>{item.reasonNote}</blockquote>
                ) : null}
                {item.restrictions.length ? (
                  <ul className="trust-timeline__restrictions">
                    {item.restrictions.map((restriction) => (
                      <li key={restriction.restrictionId}>
                        {restrictionLabels[restriction.scope]} until{' '}
                        <time dateTime={restriction.effectiveExpiresAt}>
                          {formatDateTime(restriction.effectiveExpiresAt)}
                        </time>
                        {restriction.active ? ' · Active' : ' · Ended'}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="trust-case-section__note">
          No decisions have been recorded yet.
        </p>
      )}
    </section>
  );
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
