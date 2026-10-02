import { SelectField } from '../fields/SelectField';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  listAuthorAdvancedQuestionAnalytics,
  listAuthorCardIssuanceAnalytics,
  listAuthorChallenges,
  listAuthorEventLocationAnalytics,
  listAuthorEvents,
  type AuthorAdvancedQuestionAnalyticsItem,
  type AuthorAdvancedQuestionAnalyticsPage,
  type AuthorAnalyticsLocationMode,
  type AuthorCardIssuanceAnalyticsPage,
  type AuthorChallenge,
  type AuthorEvent,
  type AuthorEventLocationAnalyticsPage,
  type ChallengeFormat,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { LoadingState } from '../LoadingState';
import { StateIcon } from '../StatusMessage';
import { AnalyticsBarChart } from './AnalyticsCharts';
import { authorErrorDetail } from './author-error-copy';
import { authorPaths } from './author-routing';

interface Props {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
}

interface DateDraft {
  start: string;
  end: string;
}

interface DateRange {
  fromDate?: string;
  toDate?: string;
}

interface QuestionFilters {
  eventId: string;
  challengeId: string;
  format: '' | ChallengeFormat;
  difficulty: '' | '1' | '2' | '3';
}

type LoadState = 'loading' | 'ready' | 'error';

const emptyDateDraft: DateDraft = { start: '', end: '' };
const emptyQuestionFilters: QuestionFilters = {
  eventId: '',
  challengeId: '',
  format: '',
  difficulty: '',
};
const dayMilliseconds = 86_400_000;
const maximumDateRangeDays = 366;

export function AnalyticsWorkspace({ apiBaseUrl, getAccessToken }: Props) {
  const [dateDraft, setDateDraft] = useState<DateDraft>(emptyDateDraft);
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [dateError, setDateError] = useState('');
  const [dateVersion, setDateVersion] = useState(0);

  function applyDateRange(event: FormEvent) {
    event.preventDefault();
    const validation = validateDateDraft(dateDraft);
    if ('error' in validation) {
      setDateError(validation.error);
      return;
    }

    setDateError('');
    setDateRange(validation.range);
    setDateVersion((value) => value + 1);
  }

  function clearDateRange() {
    setDateDraft(emptyDateDraft);
    setDateError('');
    setDateRange({});
    setDateVersion((value) => value + 1);
  }

  return (
    <section
      aria-labelledby="advanced-analytics-title"
      className="author-panel analytics-workspace"
    >
      <header>
        <p className="eyebrow">Privacy-safe operational reporting</p>
        <h2 id="advanced-analytics-title">Advanced analytics</h2>
        <p className="author-panel__intro">
          Compare location activity, question difficulty, and historical card
          issuance using server-authoritative aggregate data. Positive samples
          below the reporting threshold are intentionally hidden rather than
          estimated.
        </p>
      </header>

      <form
        className="author-filters analytics-filters analytics-date-filters"
        onSubmit={applyDateRange}
      >
        <div className="analytics-filters__heading">
          <h3>Reporting period</h3>
          <p>Dates use UTC. The selected end date includes that full day.</p>
        </div>
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
        <div className="author-actions analytics-filters__actions">
          <button className="button button--primary" type="submit">
            Apply period
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={clearDateRange}
          >
            Clear period
          </button>
        </div>
        {dateError ? (
          <p className="analytics-filter-error" role="alert">
            {dateError}
          </p>
        ) : null}
      </form>

      <LocationAnalyticsSection
        apiBaseUrl={apiBaseUrl}
        dateRange={dateRange}
        dateVersion={dateVersion}
        getAccessToken={getAccessToken}
      />
      <QuestionAnalyticsSection
        apiBaseUrl={apiBaseUrl}
        dateRange={dateRange}
        dateVersion={dateVersion}
        getAccessToken={getAccessToken}
      />
      <CardIssuanceAnalyticsSection
        apiBaseUrl={apiBaseUrl}
        dateRange={dateRange}
        dateVersion={dateVersion}
        getAccessToken={getAccessToken}
      />
    </section>
  );
}

function LocationAnalyticsSection({
  apiBaseUrl,
  dateRange,
  dateVersion,
  getAccessToken,
}: Props & { dateRange: DateRange; dateVersion: number }) {
  const [mode, setMode] = useState<AuthorAnalyticsLocationMode>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuthorEventLocationAnalyticsPage | null>(
    null,
  );
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => setPage(1), [dateVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void listAuthorEventLocationAnalytics({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
      ...dateRange,
      mode,
      page,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        if (
          next.totalItems > 0 &&
          next.items.length === 0 &&
          next.totalPages > 0 &&
          page > next.totalPages
        ) {
          setPage(next.totalPages);
          return;
        }
        setResult(next);
        setError('');
        setState('ready');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          analyticsErrorDetail(
            caught,
            'Location analytics could not be loaded.',
          ),
        );
        setState('error');
      });
    return () => controller.abort();
  }, [apiBaseUrl, dateRange, getAccessToken, mode, page, retryVersion]);

  const chartItems = result?.items.slice(0, 6) ?? [];

  return (
    <section
      aria-labelledby="location-analytics-title"
      className="analytics-section"
    >
      <div className="analytics-section__heading">
        <div>
          <p className="eyebrow">Location activity</p>
          <h3 id="location-analytics-title">Popular and ignored locations</h3>
          <p>
            These are independent aggregate stages, not player-level conversion
            cohorts. A start can therefore exist without a view in the same
            reporting window.
          </p>
        </div>
        <SelectField
          label="Location view"
          className="author-filter analytics-section__mode"
          value={mode}
          onChange={(value) => {
            setMode(value as AuthorAnalyticsLocationMode);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All locations' },
            { value: 'popular', label: 'Popular locations' },
            { value: 'ignored', label: 'Ignored locations' },
          ]}
        />
      </div>
      <p className="analytics-policy">{locationModeDescription(mode)}</p>

      {state === 'loading' ? (
        <LoadingState label="Loading location analytics…" />
      ) : null}
      {state === 'error' ? (
        <AnalyticsError
          error={error}
          onRetry={() => setRetryVersion((value) => value + 1)}
        />
      ) : null}
      {state === 'ready' && result?.totalItems === 0 ? (
        <AnalyticsEmpty
          heading="No location activity"
          message="Try a wider reporting period or choose another location view."
        />
      ) : null}
      {state === 'ready' && result && result.items.length > 0 ? (
        <>
          <AnalyticsBarChart
            title={`Activity stages for the first ${chartItems.length} location${chartItems.length === 1 ? '' : 's'} on this page`}
            groups={chartItems.map((item) => ({
              key: `${item.locationKind}:${item.locationId}`,
              label: item.locationName,
              metrics: [
                analyticsMetric('Views', item.viewCount, item.suppressed),
                analyticsMetric(
                  'Reachable',
                  item.eligibleCount,
                  item.suppressed,
                ),
                analyticsMetric('Starts', item.startCount, item.suppressed),
                analyticsMetric(
                  'Completions',
                  item.completionCount,
                  item.suppressed,
                ),
              ],
            }))}
          />
          <AnalyticsTableHint id="location-analytics-table-hint" />
          <div
            aria-describedby="location-analytics-table-hint"
            aria-label="Location analytics results"
            className="analytics-table-wrap"
            role="region"
            tabIndex={0}
          >
            <table className="analytics-table">
              <caption className="sr-only">
                Aggregate location views, reachable decisions, challenge starts,
                and event completions
              </caption>
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">Views</th>
                  <th scope="col">Reachable</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Completions</th>
                  <th scope="col">Privacy</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={`${item.locationKind}:${item.locationId}`}>
                    <th scope="row">
                      <span>{item.locationName}</span>
                      <small>
                        {item.eventTitle} ·{' '}
                        {item.locationKind === 'authored'
                          ? 'Authored location'
                          : 'Placement site'}
                      </small>
                    </th>
                    <td>
                      {formatCount(item.viewCount, result.minimumSampleSize)}
                    </td>
                    <td>
                      {formatCount(
                        item.eligibleCount,
                        result.minimumSampleSize,
                      )}
                    </td>
                    <td>
                      {formatCount(item.startCount, result.minimumSampleSize)}
                    </td>
                    <td>
                      {formatCount(
                        item.completionCount,
                        result.minimumSampleSize,
                      )}
                    </td>
                    <td>
                      <span
                        className={`analytics-signal analytics-signal--${item.suppressed ? 'insufficient' : 'clear'}`}
                      >
                        {item.suppressed
                          ? `Some values suppressed (<${result.minimumSampleSize})`
                          : 'Reportable'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AnalyticsPagination
            label="Location analytics pages"
            page={page}
            resultPage={result.page}
            totalPages={result.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </section>
  );
}

function QuestionAnalyticsSection({
  apiBaseUrl,
  dateRange,
  dateVersion,
  getAccessToken,
}: Props & { dateRange: DateRange; dateVersion: number }) {
  const [draft, setDraft] = useState<QuestionFilters>(emptyQuestionFilters);
  const [filters, setFilters] = useState<QuestionFilters>(emptyQuestionFilters);
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [challenges, setChallenges] = useState<AuthorChallenge[]>([]);
  const [eventOptionsError, setEventOptionsError] = useState('');
  const [challengeOptionsError, setChallengeOptionsError] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] =
    useState<AuthorAdvancedQuestionAnalyticsPage | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => setPage(1), [dateVersion]);

  useEffect(() => {
    const controller = new AbortController();
    void listAuthorEvents({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setEvents(next);
          setEventOptionsError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEventOptionsError(
            'Event filter options could not be loaded. The unfiltered report is still available.',
          );
        }
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    const controller = new AbortController();
    if (!draft.eventId) {
      setChallenges([]);
      setChallengeOptionsError('');
      return () => controller.abort();
    }
    void listAuthorChallenges({
      apiBaseUrl,
      eventId: draft.eventId,
      getAccessToken,
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setChallenges(next);
          setChallengeOptionsError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setChallenges([]);
          setChallengeOptionsError(
            'Challenge filter options could not be loaded. Clear the event filter to continue without them.',
          );
        }
      });
    return () => controller.abort();
  }, [apiBaseUrl, draft.eventId, getAccessToken]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setState('loading');
      try {
        const next = await listAuthorAdvancedQuestionAnalytics({
          apiBaseUrl,
          getAccessToken,
          signal,
          ...dateRange,
          page,
          eventId: filters.eventId || undefined,
          challengeId: filters.challengeId || undefined,
          format: filters.format || undefined,
          difficulty: filters.difficulty
            ? (Number(filters.difficulty) as 1 | 2 | 3)
            : undefined,
        });
        if (signal.aborted) return;
        if (
          next.totalItems > 0 &&
          next.items.length === 0 &&
          next.totalPages > 0 &&
          page > next.totalPages
        ) {
          setPage(next.totalPages);
          return;
        }
        setResult(next);
        setError('');
        setState('ready');
      } catch (caught) {
        if (signal.aborted) return;
        setError(
          analyticsErrorDetail(
            caught,
            'Question analytics could not be loaded.',
          ),
        );
        setState('error');
      }
    },
    [apiBaseUrl, dateRange, filters, getAccessToken, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retryVersion]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  }

  function clearFilters() {
    setDraft(emptyQuestionFilters);
    setFilters(emptyQuestionFilters);
    setPage(1);
  }

  return (
    <section
      aria-labelledby="question-analytics-title"
      className="analytics-section"
    >
      <div className="analytics-section__heading">
        <div>
          <p className="eyebrow">Question difficulty</p>
          <h3 id="question-analytics-title">Question response signals</h3>
          <p>
            Signals are classified by the API. The browser does not recalculate
            difficulty thresholds or reveal small positive samples.
          </p>
        </div>
      </div>

      <form
        className="author-filters analytics-filters analytics-question-filters"
        onSubmit={applyFilters}
      >
        <SelectField
          label="Event"
          className="author-filter"
          value={draft.eventId}
          onChange={(value) =>
            setDraft({
              ...draft,
              eventId: value,
              challengeId: '',
            })
          }
          options={[
            { value: '', label: 'All events' },
            ...events.map((event) => ({
              value: event.eventId,
              label: event.title,
            })),
          ]}
        />
        <SelectField
          label="Challenge"
          className="author-filter"
          disabled={!draft.eventId || Boolean(challengeOptionsError)}
          value={draft.challengeId}
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
          className="author-filter"
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
          className="author-filter"
          value={draft.difficulty}
          onChange={(value) =>
            setDraft({
              ...draft,
              difficulty: value as QuestionFilters['difficulty'],
            })
          }
          options={[
            { value: '', label: 'All difficulties' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
        />
        <div className="author-actions analytics-filters__actions">
          <button className="button button--primary" type="submit">
            Apply question filters
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={clearFilters}
          >
            Clear question filters
          </button>
        </div>
        {eventOptionsError ? (
          <p className="analytics-filter-note" role="status">
            {eventOptionsError}
          </p>
        ) : null}
        {challengeOptionsError ? (
          <p className="analytics-filter-note" role="status">
            {challengeOptionsError}
          </p>
        ) : null}
      </form>

      {state === 'loading' ? (
        <LoadingState label="Loading question analytics…" />
      ) : null}
      {state === 'error' ? (
        <AnalyticsError
          error={error}
          onRetry={() => setRetryVersion((value) => value + 1)}
        />
      ) : null}
      {state === 'ready' && result?.totalItems === 0 ? (
        <AnalyticsEmpty
          heading="No completed question outcomes"
          message="Try a wider reporting period or remove a question filter."
        />
      ) : null}
      {state === 'ready' && result && result.items.length > 0 ? (
        <>
          <p className="analytics-policy">
            Potentially too easy means at least{' '}
            {formatRate(result.easyCorrectRate)} correct. Potentially too hard
            means at least {formatRate(result.problematicIncorrectRate)}
            incorrect. Positive samples below {result.minimumSampleSize} are
            suppressed.
          </p>
          <AnalyticsTableHint id="question-analytics-table-hint" />
          <div
            aria-describedby="question-analytics-table-hint"
            aria-label="Question analytics results"
            className="analytics-table-wrap"
            role="region"
            tabIndex={0}
          >
            <table className="analytics-table">
              <caption className="sr-only">
                Privacy-safe aggregate question outcomes and server-classified
                difficulty signals
              </caption>
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">Format</th>
                  <th scope="col">Outcomes</th>
                  <th scope="col">Correct</th>
                  <th scope="col">Incorrect</th>
                  <th scope="col">Timeouts</th>
                  <th scope="col">Signal</th>
                  <th scope="col">Content</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr className={questionRowClass(item)} key={item.questionId}>
                    <th scope="row">
                      <span>{item.prompt}</span>
                      <small>
                        {item.eventTitle} · Difficulty {item.difficulty} ·{' '}
                        {formatAuthoringStatus(item.status)}
                      </small>
                    </th>
                    <td>
                      {item.format === 'multiple_choice' ? 'MCQ' : 'Ordering'}
                    </td>
                    <td>
                      {formatCount(item.answerCount, result.minimumSampleSize)}
                    </td>
                    <td>
                      {formatCountWithRate(
                        item.correctCount,
                        item.correctRate,
                        result.minimumSampleSize,
                      )}
                    </td>
                    <td>
                      {formatCountWithRate(
                        item.incorrectCount,
                        item.incorrectRate,
                        result.minimumSampleSize,
                      )}
                    </td>
                    <td>
                      {formatCount(item.timeoutCount, result.minimumSampleSize)}
                    </td>
                    <td>
                      {renderQuestionSignal(item, result.minimumSampleSize)}
                    </td>
                    <td>
                      <Link
                        className="button button--quiet"
                        href={authorPaths.question(
                          item.eventId,
                          item.challengeId,
                          item.questionId,
                        )}
                      >
                        Open question
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AnalyticsPagination
            label="Question analytics pages"
            page={page}
            resultPage={result.page}
            totalPages={result.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </section>
  );
}

function CardIssuanceAnalyticsSection({
  apiBaseUrl,
  dateRange,
  dateVersion,
  getAccessToken,
}: Props & { dateRange: DateRange; dateVersion: number }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuthorCardIssuanceAnalyticsPage | null>(
    null,
  );
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => setPage(1), [dateVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void listAuthorCardIssuanceAnalytics({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
      ...dateRange,
      page,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        if (
          next.totalItems > 0 &&
          next.items.length === 0 &&
          next.totalPages > 0 &&
          page > next.totalPages
        ) {
          setPage(next.totalPages);
          return;
        }
        setResult(next);
        setError('');
        setState('ready');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          analyticsErrorDetail(
            caught,
            'Card issuance analytics could not be loaded.',
          ),
        );
        setState('error');
      });
    return () => controller.abort();
  }, [apiBaseUrl, dateRange, getAccessToken, page, retryVersion]);

  return (
    <section
      aria-labelledby="card-analytics-title"
      className="analytics-section"
    >
      <div className="analytics-section__heading">
        <div>
          <p className="eyebrow">Reward balance</p>
          <h3 id="card-analytics-title">Card issuance and rarity balance</h3>
          <p>
            Historical issuance comes from the immutable completion-reward
            ledger. Rarity totals are used exactly as returned by the API so a
            suppressed card cannot be reconstructed from sibling totals.
          </p>
        </div>
      </div>

      {state === 'loading' ? (
        <LoadingState label="Loading card issuance analytics…" />
      ) : null}
      {state === 'error' ? (
        <AnalyticsError
          error={error}
          onRetry={() => setRetryVersion((value) => value + 1)}
        />
      ) : null}
      {state === 'ready' && result ? (
        <>
          <AnalyticsBarChart
            title="Issuances per 100 completions by rarity"
            groups={result.rarities.map((item) => ({
              key: item.rarity,
              label: capitalize(item.rarity),
              metrics: [
                {
                  label: 'Per 100 completions',
                  value: item.issuancesPer100Completions,
                  displayValue: formatPer100(
                    item.issuancesPer100Completions,
                    item.suppressed,
                    result.minimumSampleSize,
                  ),
                },
              ],
            }))}
          />

          <AnalyticsTableHint id="rarity-analytics-table-hint" />
          <div
            aria-describedby="rarity-analytics-table-hint"
            aria-label="Rarity issuance summary"
            className="analytics-table-wrap analytics-table-wrap--compact"
            role="region"
            tabIndex={0}
          >
            <table className="analytics-table analytics-table--compact">
              <caption className="sr-only">
                Server-provided historical card issuance summaries by rarity
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rarity</th>
                  <th scope="col">Issued</th>
                  <th scope="col">Per 100 completions</th>
                  <th scope="col">Privacy</th>
                </tr>
              </thead>
              <tbody>
                {result.rarities.map((item) => (
                  <tr key={item.rarity}>
                    <th scope="row">{capitalize(item.rarity)}</th>
                    <td>
                      {formatSuppressedNumber(
                        item.issuanceCount,
                        item.suppressed,
                        result.minimumSampleSize,
                      )}
                    </td>
                    <td>
                      {formatPer100(
                        item.issuancesPer100Completions,
                        item.suppressed,
                        result.minimumSampleSize,
                      )}
                    </td>
                    <td>
                      <span
                        className={`analytics-signal analytics-signal--${item.suppressed ? 'insufficient' : 'clear'}`}
                      >
                        {item.suppressed
                          ? `Suppressed (<${result.minimumSampleSize})`
                          : 'Reportable'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.totalItems === 0 ? (
            <AnalyticsEmpty
              heading="No card issuance rows"
              message="There are no eligible or historically issued card definitions for this report."
            />
          ) : result.items.length > 0 ? (
            <>
              <AnalyticsTableHint id="card-analytics-table-hint" />
              <div
                aria-describedby="card-analytics-table-hint"
                aria-label="Card issuance results"
                className="analytics-table-wrap"
                role="region"
                tabIndex={0}
              >
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
                      <th scope="col">Privacy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item) => (
                      <tr key={item.cardDefinitionId}>
                        <th scope="row">{item.cardName}</th>
                        <td>{capitalize(item.rarity)}</td>
                        <td>
                          {item.rewardEligible
                            ? 'Currently reward eligible'
                            : 'Historical only'}
                        </td>
                        <td>
                          {formatSuppressedNumber(
                            item.issuanceCount,
                            item.suppressed,
                            result.minimumSampleSize,
                          )}
                        </td>
                        <td>
                          {formatPer100(
                            item.issuancesPer100Completions,
                            item.suppressed,
                            result.minimumSampleSize,
                          )}
                        </td>
                        <td>
                          <span
                            className={`analytics-signal analytics-signal--${item.suppressed ? 'insufficient' : 'clear'}`}
                          >
                            {item.suppressed
                              ? `Suppressed (<${result.minimumSampleSize})`
                              : 'Reportable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnalyticsPagination
                label="Card issuance analytics pages"
                page={page}
                resultPage={result.page}
                totalPages={result.totalPages}
                onPageChange={setPage}
              />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AnalyticsPagination({
  label,
  page,
  resultPage,
  totalPages,
  onPageChange,
}: {
  label: string;
  page: number;
  resultPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="author-actions author-pagination" aria-label={label}>
      <button
        className="button button--quiet"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        Previous
      </button>
      <span>
        Page {resultPage} of {Math.max(totalPages, 1)}
      </span>
      <button
        className="button button--quiet"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        Next
      </button>
    </nav>
  );
}

function AnalyticsTableHint({ id }: { id: string }) {
  return (
    <p className="analytics-table-hint" id={id}>
      On narrow screens, focus the table and scroll horizontally to see every
      column.
    </p>
  );
}

function AnalyticsError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="author-feedback state-message state-message--error"
      role="alert"
    >
      <p>{error}</p>
      <button className="button button--quiet" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function AnalyticsEmpty({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <div className="author-empty-state state-message state-message--empty">
      <StateIcon tone="empty" />
      <h4>{heading}</h4>
      <p>{message}</p>
    </div>
  );
}

function renderQuestionSignal(
  item: AuthorAdvancedQuestionAnalyticsItem,
  minimumSampleSize: number,
) {
  if (item.classification === 'suppressed') {
    return (
      <span className="analytics-signal analytics-signal--insufficient">
        Suppressed (&lt;{minimumSampleSize})
      </span>
    );
  }
  if (item.classification === 'easy') {
    return (
      <span className="analytics-signal analytics-signal--easy">
        Potentially too easy
      </span>
    );
  }
  if (item.classification === 'problematic') {
    return (
      <span className="analytics-signal analytics-signal--problem">
        Potentially too hard
      </span>
    );
  }
  if (item.answerCount === 0) {
    return (
      <span className="analytics-signal analytics-signal--insufficient">
        No outcomes
      </span>
    );
  }
  return (
    <span className="analytics-signal analytics-signal--clear">
      In expected range
    </span>
  );
}

function questionRowClass(item: AuthorAdvancedQuestionAnalyticsItem) {
  if (item.classification === 'problematic') {
    return 'analytics-table__problematic';
  }
  if (item.classification === 'easy') return 'analytics-table__easy';
  return undefined;
}

function locationModeDescription(mode: AuthorAnalyticsLocationMode) {
  if (mode === 'popular') {
    return 'Popular is the API view of locations with a reportable view or reachable sample, ordered by activity.';
  }
  if (mode === 'ignored') {
    return 'Ignored is the API view of locations with reportable views but zero reachable decisions, starts, and completions.';
  }
  return 'All locations includes any location with activity in at least one reported stage.';
}

function analyticsMetric(
  label: string,
  value: number | null,
  suppressed: boolean,
) {
  return {
    label,
    value,
    displayValue:
      value === null && suppressed ? 'Suppressed' : String(value ?? '—'),
  };
}

function analyticsErrorDetail(caught: unknown, fallback: string) {
  return caught instanceof AuthorApiError
    ? authorErrorDetail(caught)
    : fallback;
}

function formatCount(value: number | null, minimumSampleSize: number) {
  return value === null ? `Suppressed (<${minimumSampleSize})` : String(value);
}

function formatCountWithRate(
  count: number | null,
  rate: number | null,
  minimumSampleSize: number,
) {
  if (count === null || rate === null) {
    return `Suppressed (<${minimumSampleSize})`;
  }
  return `${count} (${formatRate(rate)})`;
}

function formatSuppressedNumber(
  value: number | null,
  suppressed: boolean,
  minimumSampleSize: number,
) {
  if (suppressed) return `Suppressed (<${minimumSampleSize})`;
  return value === null ? 'Not available' : String(value);
}

function formatPer100(
  value: number | null,
  suppressed: boolean,
  minimumSampleSize: number,
) {
  if (suppressed) return `Suppressed (<${minimumSampleSize})`;
  return value === null ? 'Not available' : value.toFixed(1);
}

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatAuthoringStatus(status: string) {
  return status
    .split('_')
    .map((part) => capitalize(part))
    .join(' ');
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function validateDateDraft(
  draft: DateDraft,
): { range: DateRange } | { error: string } {
  if (!draft.start && !draft.end) return { range: {} };
  if (!draft.start || !draft.end) {
    return { error: 'Choose both a start date and an end date.' };
  }

  const start = parseUtcCalendarDate(draft.start);
  const end = parseUtcCalendarDate(draft.end);
  if (!start || !end) {
    return { error: 'Choose valid calendar dates.' };
  }
  if (end.getTime() < start.getTime()) {
    return { error: 'The end date cannot be earlier than the start date.' };
  }

  const inclusiveDays =
    Math.round((end.getTime() - start.getTime()) / dayMilliseconds) + 1;
  if (inclusiveDays > maximumDateRangeDays) {
    return {
      error: `The reporting period cannot exceed ${maximumDateRangeDays} days.`,
    };
  }

  return {
    range: {
      fromDate: draft.start,
      toDate: new Date(end.getTime() + dayMilliseconds)
        .toISOString()
        .slice(0, 10),
    },
  };
}

function parseUtcCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return parsed;
}
