import { UpdatingIndicator } from '../LoadingState';
import { useAuthorRetainedResource } from './AuthorRetainedReads';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'wouter';
import {
  AuthorApiError,
  listAuthorAdvancedQuestionAnalytics,
  listAuthorCardIssuanceAnalytics,
  listAuthorChallenges,
  listAuthorEventAttention,
  listAuthorEventLocationAnalytics,
  listAuthorEvents,
  type AuthorAdvancedQuestionAnalyticsItem,
  type AuthorAdvancedQuestionAnalyticsPage,
  type AuthorAnalyticsLocationMode,
  type AuthorChallenge,
  type AuthorEvent,
  type AuthorEventAttentionPage,
  type AuthorEventLocationAnalyticsItem,
  type AuthorPage,
  type ChallengeFormat,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { SelectField } from '../fields/SelectField';
import { AuthorLoadingState } from './AuthorLoadingState';
import { AnalyticsComparisonChart } from './AnalyticsCharts';
import {
  authorPaths,
  parseAuthorWorkspaceRoute,
  type AnalyticsReport,
} from './author-routing';
import './author-analytics.css';

interface Props {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
}
interface DateRange {
  fromDate?: string;
  toDate?: string;
}
interface DateDraft {
  start: string;
  end: string;
}
interface QuestionFilters {
  eventId: string;
  challengeId: string;
  format: '' | ChallengeFormat;
  difficulty: '' | '1' | '2' | '3';
}
const emptyFilters: QuestionFilters = {
  eventId: '',
  challengeId: '',
  format: '',
  difficulty: '',
};
const reportNames: Record<AnalyticsReport, string> = {
  overview: 'Overview',
  locations: 'Locations',
  questions: 'Questions',
  rewards: 'Rewards',
};
const dayMilliseconds = 86_400_000;

export function AnalyticsWorkspace({ apiBaseUrl, getAccessToken }: Props) {
  const [pathname] = useLocation();
  const route = parseAuthorWorkspaceRoute(pathname);
  const report =
    route.section === 'analytics' ? (route.report ?? 'overview') : 'overview';
  const [visited, setVisited] = useState<AnalyticsReport[]>([report]);
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [dateDraft, setDateDraft] = useState<DateDraft>({ start: '', end: '' });
  const [period, setPeriod] = useState('all');
  const [customOpen, setCustomOpen] = useState(false);
  const [dateError, setDateError] = useState('');
  useEffect(
    () =>
      setVisited((current) =>
        current.includes(report) ? current : [...current, report],
      ),
    [report],
  );

  function selectPeriod(value: string) {
    setPeriod(value);
    setDateError('');
    setCustomOpen(value === 'custom');
    if (value === 'custom') return;
    if (value === 'all') {
      setDateRange({});
      setDateDraft({ start: '', end: '' });
      return;
    }
    const today = new Date();
    const end = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const start = end - (Number(value) - 1) * dayMilliseconds;
    const draft = {
      start: new Date(start).toISOString().slice(0, 10),
      end: new Date(end).toISOString().slice(0, 10),
    };
    setDateDraft(draft);
    setDateRange({
      fromDate: draft.start,
      toDate: new Date(end + dayMilliseconds).toISOString().slice(0, 10),
    });
  }
  function applyDates(event: FormEvent) {
    event.preventDefault();
    const validation = validateDateDraft(dateDraft);
    if ('error' in validation) {
      setDateError(validation.error);
      return;
    }
    setDateError('');
    setDateRange(validation.range);
    setCustomOpen(false);
  }
  const props = { apiBaseUrl, getAccessToken, dateRange };
  const mounted = visited.includes(report) ? visited : [...visited, report];

  return (
    <section
      className="author-workspace analytics-workspace"
      aria-labelledby="analytics-title"
    >
      <header className="analytics-header">
        <div>
          <h2 id="analytics-title">Analytics</h2>
          <nav className="analytics-tabs" aria-label="Analytics reports">
            {(Object.keys(reportNames) as AnalyticsReport[]).map((tab) => (
              <Link
                key={tab}
                href={authorPaths.analyticsReport(tab)}
                aria-current={tab === report ? 'page' : undefined}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView?.({
                    block: 'nearest',
                    inline: 'nearest',
                  })
                }
              >
                {reportNames[tab]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="analytics-period">
          <SelectField
            label="Reporting period"
            value={period}
            onChange={selectPeriod}
            options={[
              { value: 'all', label: 'All time' },
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom dates' },
            ]}
          />
          <span className="analytics-period__caption">
            {dateRange.fromDate ? `${periodDescription(dateRange)} · ` : ''}UTC
          </span>
          {period === 'custom' && !customOpen && (
            <button
              type="button"
              className="analytics-text-button"
              onClick={() => setCustomOpen(true)}
            >
              Edit dates
            </button>
          )}
        </div>
      </header>
      {customOpen && (
        <form className="analytics-custom-period" onSubmit={applyDates}>
          <label className="author-filter">
            <span>Start date</span>
            <input
              type="date"
              value={dateDraft.start}
              onChange={(event) =>
                setDateDraft({ ...dateDraft, start: event.target.value })
              }
            />
          </label>
          <label className="author-filter">
            <span>End date</span>
            <input
              type="date"
              value={dateDraft.end}
              onChange={(event) =>
                setDateDraft({ ...dateDraft, end: event.target.value })
              }
            />
          </label>
          <button className="button button--primary" type="submit">
            Apply period
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => selectPeriod('all')}
          >
            Clear period
          </button>
          <p className="analytics-custom-period__note">
            End date included · up to 366 days
          </p>
          {dateError && (
            <p className="analytics-filter-error" role="alert">
              {dateError}
            </p>
          )}
        </form>
      )}
      {mounted.map((tab) => (
        <div key={tab} hidden={report !== tab}>
          {tab === 'overview' ? (
            <AttentionReport {...props} />
          ) : tab === 'locations' ? (
            <LocationReport {...props} />
          ) : tab === 'questions' ? (
            <QuestionReport {...props} />
          ) : (
            <RewardReport {...props} />
          )}
        </div>
      ))}
    </section>
  );
}

type ReportProps = Props & { dateRange: DateRange };

/** Changing filters resets the effective page before requesting; aborted reads never replace a newer report. */
function useReport<T extends AuthorPage<unknown>>(
  load: (page: number, signal: AbortSignal) => Promise<T>,
  resetKey: string,
  reportName: string,
) {
  const [pagination, setPagination] = useState({ key: resetKey, page: 1 });
  const page = pagination.key === resetKey ? pagination.page : 1;
  const {
    value: result,
    setValue: setResult,
    confirmed,
    previous,
    confirm,
    revoke,
    beginRead,
  } = useAuthorRetainedResource<T | null>(
    `analytics:${reportName}:${resetKey}:${page}`,
    null,
    `analytics:${reportName}`,
  );
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  const setPage = useCallback(
    (next: number) => setPagination({ key: resetKey, page: next }),
    [resetKey],
  );
  useEffect(() => {
    const canApplyRead = beginRead();
    const controller = new AbortController();
    setState('loading');
    void load(page, controller.signal)
      .then((next) => {
        if (controller.signal.aborted || !canApplyRead()) return;
        if (
          next.totalItems > 0 &&
          next.items.length === 0 &&
          page > next.totalPages &&
          next.totalPages > 0
        ) {
          setPage(next.totalPages);
          return;
        }
        setResult(next);
        confirm();
        setError('');
        setState('ready');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || !canApplyRead()) return;
        revoke(caught);
        setError(
          caught instanceof AuthorApiError && caught.failure !== 'unavailable'
            ? caught.detail
            : 'Couldn’t load this report. Check your connection.',
        );
        setState('error');
      });
    return () => controller.abort();
  }, [
    load,
    page,
    retryVersion,
    setPage,
    confirm,
    revoke,
    setResult,
    beginRead,
  ]);
  return {
    result,
    confirmed,
    previous,
    state,
    error,
    page,
    setPage,
    retry: () => setRetryVersion((value) => value + 1),
  };
}

type ReportState = {
  state: 'loading' | 'ready' | 'error';
  confirmed: boolean;
  previous: boolean;
  error: string;
  retry: () => void;
};
function ReportFeedback({
  state,
  error,
  retry,
  confirmed,
  previous,
}: ReportState) {
  if (confirmed)
    return (
      <UpdatingIndicator
        active={state === 'loading'}
        label="Updating report…"
        previous={previous}
        error={state === 'error' ? error : undefined}
        onRetry={retry}
      />
    );
  if (state === 'loading')
    return <AuthorLoadingState label="Loading report…" />;
  if (state === 'error')
    return (
      <div
        className="author-feedback state-message state-message--error"
        role="alert"
      >
        <p>{error}</p>
        <button className="button button--quiet" type="button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  return null;
}
function ReportHeader({ title }: { title: string }) {
  return (
    <header className="analytics-report-header">
      <h3>{title}</h3>
    </header>
  );
}
function AboutReport({ children }: { children: ReactNode }) {
  return (
    <details className="analytics-about">
      <summary>About this report</summary>
      <div>{children}</div>
    </details>
  );
}
function EmptyReport({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="analytics-empty">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}
function TableRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="analytics-table-wrap"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
function Pagination({
  report,
  label,
}: {
  report: {
    result: AuthorPage<unknown> | null;
    page: number;
    setPage: (page: number) => void;
  };
  label: string;
}) {
  if (!report.result || report.result.totalPages <= 1) return null;
  return (
    <nav className="author-actions author-pagination" aria-label={label}>
      <button
        className="button button--quiet"
        type="button"
        disabled={report.page <= 1}
        onClick={() => report.setPage(report.page - 1)}
      >
        Previous
      </button>
      <span>
        Page {report.result.page} of {report.result.totalPages}
      </span>
      <button
        className="button button--quiet"
        type="button"
        disabled={report.page >= report.result.totalPages}
        onClick={() => report.setPage(report.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
function PageScope({
  result,
  noun,
}: {
  result: AuthorPage<unknown>;
  noun: string;
}) {
  const first = (result.page - 1) * result.pageSize + 1;
  return (
    <p className="analytics-results">
      {result.totalItems === 0
        ? `0 ${noun}`
        : `${first}–${first + result.items.length - 1} of ${result.totalItems} ${noun}`}
    </p>
  );
}

function AttentionReport({
  apiBaseUrl,
  getAccessToken,
  dateRange,
}: ReportProps) {
  const load = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorEventAttention({
        apiBaseUrl,
        getAccessToken,
        ...dateRange,
        page,
        signal,
      }),
    [apiBaseUrl, getAccessToken, dateRange],
  );
  const report = useReport<AuthorEventAttentionPage>(
    load,
    JSON.stringify(dateRange),
    'overview',
  );
  const result = report.result;
  const chartItems = result?.items.slice(0, 6) ?? [];
  return (
    <section className="analytics-report" aria-label="Overview report">
      <ReportHeader title="Events needing attention" />
      <AboutReport>
        <p>
          Events are listed when viewed locations have no onward activity or
          questions may be too easy or hard. Location signals need at least 10
          views; question signals need at least 10 outcomes. Signals suggest
          what to review. Events are sorted by title.
        </p>
      </AboutReport>
      <ReportFeedback {...report} />
      {(report.state === 'ready' || report.confirmed) &&
        result &&
        (result.totalItems === 0 ? (
          <EmptyReport title="No attention signals">
            Try another period or open a detailed report. Small samples are
            hidden.
          </EmptyReport>
        ) : (
          <>
            <PageScope result={result} noun="events" />
            <div className="analytics-overview-plots">
              <AnalyticsComparisonChart
                title="Locations with no onward activity"
                unit="Locations"
                scope={`First ${chartItems.length} events on this page`}
                rows={chartItems.map((item) => ({
                  key: item.eventId,
                  label: item.eventTitle,
                  value: item.ignoredLocationCount,
                  displayValue: String(item.ignoredLocationCount),
                  detail:
                    'Reportable views; no reachable decisions, starts, or completions',
                }))}
              />
              <AnalyticsComparisonChart
                title="Question signals"
                unit="Question signals"
                scope={`First ${chartItems.length} events on this page`}
                rows={chartItems.map((item) => ({
                  key: item.eventId,
                  label: item.eventTitle,
                  value: item.hardQuestionCount + item.easyQuestionCount,
                  displayValue: String(
                    item.hardQuestionCount + item.easyQuestionCount,
                  ),
                  detail: `${item.hardQuestionCount} may be too hard · ${item.easyQuestionCount} may be too easy`,
                }))}
              />
            </div>
            <TableRegion label="Event attention results">
              <table className="analytics-table">
                <caption className="sr-only">
                  Server-provided event attention signals for the reporting
                  period
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Ignored locations</th>
                    <th scope="col">May be too hard</th>
                    <th scope="col">May be too easy</th>
                    <th scope="col">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.eventId}>
                      <th scope="row">
                        <Link href={authorPaths.event(item.eventId)}>
                          {item.eventTitle}
                        </Link>
                      </th>
                      <td>{item.ignoredLocationCount}</td>
                      <td>{item.hardQuestionCount}</td>
                      <td>{item.easyQuestionCount}</td>
                      <td>
                        {item.questionId && item.challengeId ? (
                          <Link
                            href={authorPaths.question(
                              item.eventId,
                              item.challengeId,
                              item.questionId,
                            )}
                          >
                            Review question
                          </Link>
                        ) : (
                          <Link href={authorPaths.event(item.eventId)}>
                            Open event
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
            <Pagination report={report} label="Event attention pages" />
          </>
        ))}
    </section>
  );
}

const locationMetrics = {
  viewCount: 'Views',
  eligibleCount: 'Reachable',
  startCount: 'Starts',
  completionCount: 'Completions',
} as const;
function LocationReport({
  apiBaseUrl,
  getAccessToken,
  dateRange,
}: ReportProps) {
  const [mode, setMode] = useState<AuthorAnalyticsLocationMode>('all');
  const [metric, setMetric] =
    useState<keyof typeof locationMetrics>('viewCount');
  const load = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorEventLocationAnalytics({
        apiBaseUrl,
        getAccessToken,
        ...dateRange,
        mode,
        page,
        signal,
      }),
    [apiBaseUrl, getAccessToken, dateRange, mode],
  );
  const report = useReport(
    load,
    JSON.stringify([dateRange, mode]),
    'locations',
  );
  const result = report.result;
  return (
    <section className="analytics-report" aria-label="Locations report">
      <ReportHeader title="Location activity" />
      <div className="analytics-toolbar">
        <SelectField
          label="Location view"
          value={mode}
          onChange={(value) => setMode(value as AuthorAnalyticsLocationMode)}
          options={[
            { value: 'all', label: 'All locations' },
            { value: 'popular', label: 'Popular locations' },
            { value: 'ignored', label: 'Ignored locations' },
          ]}
        />
        <SelectField
          label="Chart metric"
          value={metric}
          onChange={(value) => setMetric(value as keyof typeof locationMetrics)}
          options={Object.entries(locationMetrics).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <AboutReport>
        <p>
          Counts are independent: a start may have no view in this period.
          Popular and ignored locations follow the reporting rules.
        </p>
      </AboutReport>
      <ReportFeedback {...report} />
      {(report.state === 'ready' || report.confirmed) &&
        result &&
        (result.totalItems === 0 ? (
          <EmptyReport title="No location activity">
            Try a wider period or another location view.
          </EmptyReport>
        ) : (
          <>
            <PageScope result={result} noun="locations" />
            <AnalyticsComparisonChart
              title={`${locationMetrics[metric]} by location`}
              unit={locationMetrics[metric]}
              scope={`First ${Math.min(result.items.length, 8)} locations on this page`}
              rows={result.items.slice(0, 8).map((item) => ({
                key: locationKey(item),
                label: item.locationName,
                value: item[metric],
                displayValue: count(item[metric]),
                detail: `${item.eventTitle} · ${item.locationKind === 'authored' ? 'Authored location' : 'Placement site'}`,
              }))}
            />
            <TableRegion label="Location analytics results">
              <table className="analytics-table">
                <caption className="sr-only">
                  Disclosed aggregate activity by location
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Location</th>
                    <th scope="col">Views</th>
                    <th scope="col">Reachable</th>
                    <th scope="col">Starts</th>
                    <th scope="col">Completions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={locationKey(item)}>
                      <th scope="row">
                        <Link href={authorPaths.event(item.eventId)}>
                          {item.locationName}
                        </Link>
                        <small>
                          {item.eventTitle} ·{' '}
                          {item.locationKind === 'authored'
                            ? 'Authored location'
                            : 'Placement site'}
                        </small>
                      </th>
                      <td>{count(item.viewCount)}</td>
                      <td>{count(item.eligibleCount)}</td>
                      <td>{count(item.startCount)}</td>
                      <td>{count(item.completionCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
            <p className="analytics-footnote">
              Hidden: 1–9 observations. Counts are independent.
            </p>
            <Pagination report={report} label="Location analytics pages" />
          </>
        ))}
    </section>
  );
}
function locationKey(item: AuthorEventLocationAnalyticsItem) {
  return `${item.eventId}:${item.locationKind}:${item.locationId}`;
}

function QuestionReport({
  apiBaseUrl,
  getAccessToken,
  dateRange,
}: ReportProps) {
  const [draft, setDraft] = useState<QuestionFilters>(emptyFilters);
  const [filters, setFilters] = useState<QuestionFilters>(emptyFilters);
  const {
    value: events,
    setValue: setEvents,
    confirm: confirmEvents,
    revoke: revokeOptions,
    beginRead: beginOptionsRead,
  } = useAuthorRetainedResource<AuthorEvent[]>('analytics-event-options', []);
  const {
    value: challenges,
    setValue: setChallenges,
    confirm: confirmChallenges,
  } = useAuthorRetainedResource<AuthorChallenge[]>(
    `analytics-challenge-options:${draft.eventId}`,
    [],
  );
  const [optionsError, setOptionsError] = useState('');
  const [challengeError, setChallengeError] = useState('');
  useEffect(() => {
    const canApplyRead = beginOptionsRead();
    const controller = new AbortController();
    void listAuthorEvents({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted && canApplyRead()) {
          setEvents(next);
          confirmEvents();
          setOptionsError('');
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && canApplyRead()) revokeOptions(error);
        if (!controller.signal.aborted && canApplyRead())
          setOptionsError(
            'Couldn’t load event filters. You can still view all questions.',
          );
      });
    return () => controller.abort();
  }, [
    apiBaseUrl,
    getAccessToken,
    beginOptionsRead,
    confirmEvents,
    revokeOptions,
    setEvents,
  ]);
  useEffect(() => {
    const canApplyRead = beginOptionsRead();
    const controller = new AbortController();
    setChallengeError('');
    if (draft.eventId)
      void listAuthorChallenges({
        apiBaseUrl,
        getAccessToken,
        eventId: draft.eventId,
        signal: controller.signal,
      })
        .then((next) => {
          if (!controller.signal.aborted && canApplyRead()) {
            setChallenges(next);
            confirmChallenges();
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && canApplyRead())
            revokeOptions(error);
          if (!controller.signal.aborted && canApplyRead())
            setChallengeError(
              'Couldn’t load challenges. Clear the event filter to continue.',
            );
        });
    return () => controller.abort();
  }, [
    apiBaseUrl,
    getAccessToken,
    draft.eventId,
    beginOptionsRead,
    confirmChallenges,
    revokeOptions,
    setChallenges,
  ]);
  const load = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorAdvancedQuestionAnalytics({
        apiBaseUrl,
        getAccessToken,
        ...dateRange,
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
        ...(filters.challengeId ? { challengeId: filters.challengeId } : {}),
        ...(filters.format ? { format: filters.format } : {}),
        ...(filters.difficulty
          ? { difficulty: Number(filters.difficulty) as 1 | 2 | 3 }
          : {}),
        page,
        signal,
      }),
    [apiBaseUrl, getAccessToken, dateRange, filters],
  );
  const report = useReport<AuthorAdvancedQuestionAnalyticsPage>(
    load,
    JSON.stringify([dateRange, filters]),
    'questions',
  );
  const result = report.result;
  const activeSecondary = [
    filters.challengeId,
    filters.format,
    filters.difficulty,
  ].filter(Boolean).length;
  const hasFilters =
    Object.values(draft).some(Boolean) || Object.values(filters).some(Boolean);
  return (
    <section className="analytics-report" aria-label="Questions report">
      <ReportHeader title="Question performance" />
      <form
        className="analytics-question-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...draft });
        }}
      >
        <SelectField
          label="Event"
          value={draft.eventId}
          onChange={(value) =>
            setDraft({ ...draft, eventId: value, challengeId: '' })
          }
          options={[
            { value: '', label: 'All events' },
            ...events.map((event) => ({
              value: event.eventId,
              label: event.title,
            })),
          ]}
        />
        <details className="analytics-more-filters">
          <summary>
            More filters{activeSecondary > 0 ? ` (${activeSecondary})` : ''}
          </summary>
          <div>
            <SelectField
              label="Challenge"
              value={draft.challengeId}
              disabled={!draft.eventId || Boolean(challengeError)}
              onChange={(value) => setDraft({ ...draft, challengeId: value })}
              options={[
                { value: '', label: 'All challenges' },
                ...challenges.map((challenge, index) => ({
                  value: challenge.challengeId,
                  label: `${challenge.format === 'ordering' ? 'Ordering' : 'MCQ'} challenge ${index + 1}`,
                })),
              ]}
            />
            <SelectField
              label="Format"
              value={draft.format}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  format: value as QuestionFilters['format'],
                })
              }
              options={[
                { value: '', label: 'All formats' },
                { value: 'multiple_choice', label: 'Multiple choice' },
                { value: 'ordering', label: 'Ordering' },
              ]}
            />
            <SelectField
              label="Difficulty"
              value={draft.difficulty}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  difficulty: value as QuestionFilters['difficulty'],
                })
              }
              options={[
                { value: '', label: 'All difficulties' },
                ...['1', '2', '3'].map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        </details>
        <button className="button button--primary" type="submit">
          Apply filters
        </button>
        {hasFilters && (
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters(emptyFilters);
            }}
          >
            Clear filters
          </button>
        )}
        {optionsError && (
          <p className="analytics-filter-note" role="status">
            {optionsError}
          </p>
        )}
        {challengeError && (
          <p className="analytics-filter-note" role="status">
            {challengeError}
          </p>
        )}
      </form>
      <AboutReport>
        <p>
          Questions need at least 10 outcomes. May be too easy means at least{' '}
          {result ? rate(result.easyCorrectRate) : '90%'} correct; may be too
          hard means at least{' '}
          {result ? rate(result.problematicIncorrectRate) : '70%'} incorrect.
        </p>
      </AboutReport>
      <ReportFeedback {...report} />
      {(report.state === 'ready' || report.confirmed) &&
        result &&
        (result.totalItems === 0 ? (
          <EmptyReport title="No question outcomes">
            Try a wider period or clear filters.
          </EmptyReport>
        ) : (
          <>
            <PageScope result={result} noun="questions" />
            <AnalyticsComparisonChart
              title="Correctness by question"
              unit="Correct outcomes (%)"
              kind="dot"
              scope={`First ${Math.min(result.items.length, 8)} questions on this page`}
              references={[
                {
                  value: (1 - result.problematicIncorrectRate) * 100,
                  label: 'Hard reference',
                },
                {
                  value: result.easyCorrectRate * 100,
                  label: 'Easy reference',
                },
              ]}
              rows={result.items.slice(0, 8).map((item) => ({
                key: item.questionId,
                label: item.prompt,
                value:
                  item.answerCount === 0 || item.correctRate === null
                    ? null
                    : item.correctRate * 100,
                displayValue: item.suppressed
                  ? 'Hidden'
                  : item.answerCount === 0
                    ? 'No outcomes'
                    : rate(item.correctRate),
                detail: `${item.eventTitle} · ${questionSignal(item)}`,
                tone:
                  item.classification === 'problematic'
                    ? 'danger'
                    : item.classification === 'easy'
                      ? 'warning'
                      : 'blue',
              }))}
            />
            <TableRegion label="Question analytics results">
              <table className="analytics-table analytics-table--questions">
                <caption className="sr-only">
                  Disclosed question outcomes and server-classified signals
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Outcomes</th>
                    <th scope="col">Correct</th>
                    <th scope="col">Incorrect</th>
                    <th scope="col">Timeouts</th>
                    <th scope="col">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.questionId}>
                      <th scope="row">
                        <Link
                          href={authorPaths.question(
                            item.eventId,
                            item.challengeId,
                            item.questionId,
                          )}
                        >
                          {item.prompt}
                        </Link>
                        <small>
                          {item.eventTitle} ·{' '}
                          {item.format === 'multiple_choice'
                            ? 'MCQ'
                            : 'Ordering'}{' '}
                          · Difficulty {item.difficulty} ·{' '}
                          {capitalize(item.status.replaceAll('_', ' '))}
                        </small>
                      </th>
                      <td>{count(item.answerCount)}</td>
                      <td>
                        {countWithRate(item.correctCount, item.correctRate)}
                      </td>
                      <td>
                        {countWithRate(item.incorrectCount, item.incorrectRate)}
                      </td>
                      <td>{count(item.timeoutCount)}</td>
                      <td>
                        <span
                          className={`analytics-signal analytics-signal--${item.classification === 'problematic' ? 'problem' : item.classification === 'easy' ? 'easy' : 'insufficient'}`}
                        >
                          {questionSignal(item)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
            <p className="analytics-footnote">
              Hidden: 1–9 outcomes. Timeouts count as incorrect.
            </p>
            <Pagination report={report} label="Question analytics pages" />
          </>
        ))}
    </section>
  );
}

function RewardReport({ apiBaseUrl, getAccessToken, dateRange }: ReportProps) {
  const [metric, setMetric] = useState('rate');
  const load = useCallback(
    (page: number, signal: AbortSignal) =>
      listAuthorCardIssuanceAnalytics({
        apiBaseUrl,
        getAccessToken,
        ...dateRange,
        page,
        signal,
      }),
    [apiBaseUrl, getAccessToken, dateRange],
  );
  const report = useReport(load, JSON.stringify(dateRange), 'completion');
  const result = report.result;
  return (
    <section className="analytics-report" aria-label="Rewards report">
      <ReportHeader title="Card rewards" />
      <div className="analytics-toolbar">
        <SelectField
          label="Chart metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'rate', label: 'Per 100 completions' },
            { value: 'count', label: 'Cards issued' },
          ]}
        />
      </div>
      <AboutReport>
        <p>
          Counts cover cards awarded for completions, not current ownership.
          Rarity totals cover the whole period. Rates are cards per 100
          completions and can exceed 100. Some totals are hidden to protect
          small samples.
        </p>
      </AboutReport>
      <ReportFeedback {...report} />
      {(report.state === 'ready' || report.confirmed) && result && (
        <>
          <AnalyticsComparisonChart
            title={
              metric === 'rate'
                ? 'Cards per 100 completions by rarity'
                : 'Cards issued by rarity'
            }
            unit={
              metric === 'rate' ? 'Cards per 100 completions' : 'Cards issued'
            }
            scope="Entire reporting period"
            rows={result.rarities.map((item) => ({
              key: item.rarity,
              label: capitalize(item.rarity),
              value:
                metric === 'rate'
                  ? item.issuancesPer100Completions
                  : item.issuanceCount,
              displayValue: rewardValue(
                metric === 'rate'
                  ? item.issuancesPer100Completions
                  : item.issuanceCount,
                item.suppressed,
                metric === 'rate',
              ),
              detail: item.suppressed
                ? 'Hidden to protect small samples'
                : 'Historical reward issuance',
            }))}
          />
          <details className="analytics-rarity-table">
            <summary>Rarity values</summary>
            <TableRegion label="Rarity issuance summary">
              <table className="analytics-table">
                <caption className="sr-only">
                  Server-provided rarity summaries for the entire period
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rarity</th>
                    <th scope="col">Issued</th>
                    <th scope="col">Per 100 completions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rarities.map((item) => (
                    <tr key={item.rarity}>
                      <th scope="row">{capitalize(item.rarity)}</th>
                      <td>
                        {rewardValue(item.issuanceCount, item.suppressed)}
                      </td>
                      <td>
                        {rewardValue(
                          item.issuancesPer100Completions,
                          item.suppressed,
                          true,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
          </details>
          {result.totalItems === 0 ? (
            <EmptyReport title="No card rewards">
              No reward-eligible or previously awarded cards were found.
            </EmptyReport>
          ) : (
            <>
              <PageScope result={result} noun="cards" />
              <TableRegion label="Card issuance results">
                <table className="analytics-table">
                  <caption className="sr-only">
                    Historical issuance by card definition
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Card</th>
                      <th scope="col">Rarity</th>
                      <th scope="col">Reward status</th>
                      <th scope="col">Issued</th>
                      <th scope="col">Per 100 completions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item) => (
                      <tr key={item.cardDefinitionId}>
                        <th scope="row">
                          <Link href={authorPaths.card(item.cardDefinitionId)}>
                            {item.cardName}
                          </Link>
                        </th>
                        <td>{capitalize(item.rarity)}</td>
                        <td>
                          {item.rewardEligible
                            ? 'Reward eligible'
                            : 'Historical only'}
                        </td>
                        <td>
                          {rewardValue(item.issuanceCount, item.suppressed)}
                        </td>
                        <td>
                          {rewardValue(
                            item.issuancesPer100Completions,
                            item.suppressed,
                            true,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
              <Pagination
                report={report}
                label="Card issuance analytics pages"
              />
            </>
          )}
          <p className="analytics-footnote">
            Hidden: small samples or protected totals. Unavailable: no
            completions.
          </p>
        </>
      )}
    </section>
  );
}

function count(value: number | null) {
  return value === null ? 'Hidden' : value.toLocaleString('en-ZA');
}
function rate(value: number | null) {
  return value === null ? 'Hidden' : `${(value * 100).toFixed(1)}%`;
}
function countWithRate(value: number | null, fraction: number | null) {
  return value === null || fraction === null
    ? 'Hidden'
    : `${count(value)} (${rate(fraction)})`;
}
function rewardValue(
  value: number | null,
  suppressed: boolean,
  decimal = false,
) {
  return suppressed
    ? 'Hidden'
    : value === null
      ? 'Unavailable'
      : value.toLocaleString('en-ZA', {
          maximumFractionDigits: decimal ? 1 : 0,
          minimumFractionDigits: decimal ? 1 : 0,
        });
}
function questionSignal(item: AuthorAdvancedQuestionAnalyticsItem) {
  return item.classification === 'suppressed'
    ? 'Hidden (<10)'
    : item.classification === 'easy'
      ? 'May be too easy'
      : item.classification === 'problematic'
        ? 'May be too hard'
        : item.answerCount === 0
          ? 'No outcomes'
          : 'No flag';
}
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function periodDescription(range: DateRange) {
  if (!range.fromDate || !range.toDate) return 'All time';
  const end = new Date(`${range.toDate}T00:00:00Z`).getTime() - dayMilliseconds;
  const format = (value: Date) =>
    value.toLocaleDateString('en-ZA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return `${format(new Date(`${range.fromDate}T00:00:00Z`))} – ${format(new Date(end))}`;
}
function validateDateDraft(
  draft: DateDraft,
): { range: DateRange } | { error: string } {
  if (!draft.start && !draft.end) return { range: {} };
  if (!draft.start || !draft.end)
    return { error: 'Choose a start and end date.' };
  const start = parseDate(draft.start);
  const end = parseDate(draft.end);
  if (start === null || end === null) return { error: 'Enter valid dates.' };
  if (end < start) return { error: 'End date must be on or after start date.' };
  if ((end - start) / dayMilliseconds + 1 > 366)
    return { error: 'Choose a period of 366 days or less.' };
  return {
    range: {
      fromDate: draft.start,
      toDate: new Date(end + dayMilliseconds).toISOString().slice(0, 10),
    },
  };
}
function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date.getTime()
    : null;
}
