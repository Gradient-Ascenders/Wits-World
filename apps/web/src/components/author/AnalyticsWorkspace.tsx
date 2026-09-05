import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  listAuthorChallenges,
  listAuthorEvents,
  listAuthorQuestionPerformance,
  type AuthorChallenge,
  type AuthorEvent,
  type AuthorQuestionPerformancePage,
  type ChallengeFormat,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { authorPaths } from './author-routing';

interface Props {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
}

interface Filters {
  eventId: string;
  challengeId: string;
  format: '' | ChallengeFormat;
  difficulty: '' | '1' | '2' | '3';
  from: string;
  to: string;
}

const emptyFilters: Filters = {
  eventId: '',
  challengeId: '',
  format: '',
  difficulty: '',
  from: '',
  to: '',
};

export function AnalyticsWorkspace({ apiBaseUrl, getAccessToken }: Props) {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [challenges, setChallenges] = useState<AuthorChallenge[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuthorQuestionPerformancePage | null>(
    null,
  );
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void listAuthorEvents({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then(setEvents)
      .catch(() => undefined);
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    const controller = new AbortController();
    if (!draft.eventId) {
      setChallenges([]);
      return () => controller.abort();
    }
    void listAuthorChallenges({
      apiBaseUrl,
      eventId: draft.eventId,
      getAccessToken,
      signal: controller.signal,
    })
      .then(setChallenges)
      .catch(() => setChallenges([]));
    return () => controller.abort();
  }, [apiBaseUrl, draft.eventId, getAccessToken]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setState('loading');
      try {
        const next = await listAuthorQuestionPerformance({
          apiBaseUrl,
          getAccessToken,
          signal,
          page,
          eventId: filters.eventId || undefined,
          challengeId: filters.challengeId || undefined,
          format: filters.format || undefined,
          difficulty: filters.difficulty
            ? (Number(filters.difficulty) as 1 | 2 | 3)
            : undefined,
          from: filters.from ? new Date(filters.from).toISOString() : undefined,
          to: filters.to ? new Date(filters.to).toISOString() : undefined,
        });
        if (!signal.aborted) {
          setResult(next);
          setError('');
          setState('ready');
        }
      } catch (caught) {
        if (!signal.aborted) {
          setError(
            caught instanceof AuthorApiError
              ? caught.detail
              : 'Question performance could not be loaded.',
          );
          setState('error');
        }
      }
    },
    [apiBaseUrl, filters, getAccessToken, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  }

  return (
    <section
      aria-labelledby="question-performance-title"
      className="author-panel analytics-workspace"
    >
      <div>
        <p className="eyebrow">Aggregate curation signals</p>
        <h2 id="question-performance-title">Question performance</h2>
        <p className="author-panel__intro">
          A question is flagged after at least 10 scored outcomes when 70% or
          more are incorrect. A timeout counts only for the next unanswered
          question, not unseen future questions.
        </p>
      </div>

      <form
        className="author-filters analytics-filters"
        onSubmit={applyFilters}
      >
        <label className="author-filter">
          <span>Event</span>
          <select
            value={draft.eventId}
            onChange={(event) =>
              setDraft({
                ...draft,
                challengeId: '',
                eventId: event.target.value,
              })
            }
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
        <label className="author-filter">
          <span>Challenge</span>
          <select
            disabled={!draft.eventId}
            value={draft.challengeId}
            onChange={(event) =>
              setDraft({ ...draft, challengeId: event.target.value })
            }
          >
            <option value="">All challenges</option>
            {challenges.map((challenge, index) => (
              <option key={challenge.challengeId} value={challenge.challengeId}>
                {challenge.format === 'ordering' ? 'Ordering' : 'MCQ'} challenge{' '}
                {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="author-filter">
          <span>Format</span>
          <select
            value={draft.format}
            onChange={(event) =>
              setDraft({
                ...draft,
                format: event.target.value as Filters['format'],
              })
            }
          >
            <option value="">All formats</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="ordering">Ordering</option>
          </select>
        </label>
        <label className="author-filter">
          <span>Difficulty</span>
          <select
            value={draft.difficulty}
            onChange={(event) =>
              setDraft({
                ...draft,
                difficulty: event.target.value as Filters['difficulty'],
              })
            }
          >
            <option value="">All difficulties</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        <label className="author-filter">
          <span>Completed from</span>
          <input
            type="datetime-local"
            value={draft.from}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
          />
        </label>
        <label className="author-filter">
          <span>Completed before</span>
          <input
            type="datetime-local"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </label>
        <div className="author-actions analytics-filters__actions">
          <button className="button button--primary" type="submit">
            Apply filters
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters(emptyFilters);
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {state === 'loading' ? (
        <p role="status">Loading question performance…</p>
      ) : null}
      {state === 'error' ? (
        <div className="author-feedback author-feedback--error" role="alert">
          <p>{error}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void load(new AbortController().signal)}
          >
            Try again
          </button>
        </div>
      ) : null}
      {state === 'ready' && result?.items.length === 0 ? (
        <div className="author-empty-state">
          <h3>No completed question outcomes</h3>
          <p>Try a wider date range or remove a filter.</p>
        </div>
      ) : null}
      {state === 'ready' && result && result.items.length > 0 ? (
        <>
          <p className="analytics-table-hint" id="analytics-table-hint">
            On narrow screens, focus the results and scroll horizontally to see
            every column.
          </p>
          <div
            aria-describedby="analytics-table-hint"
            aria-label="Question performance results"
            className="analytics-table-wrap"
            role="region"
            tabIndex={0}
          >
            <table className="analytics-table">
              <caption className="sr-only">
                Aggregate question outcome counts and rates
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
                  <tr
                    key={item.questionId}
                    className={
                      item.isProblematic
                        ? 'analytics-table__problematic'
                        : undefined
                    }
                  >
                    <th scope="row">
                      <span>{item.prompt}</span>
                      <small>
                        {item.eventTitle} · Difficulty {item.difficulty}
                      </small>
                    </th>
                    <td>
                      {item.format === 'multiple_choice' ? 'MCQ' : 'Ordering'}
                    </td>
                    <td>{item.answerCount}</td>
                    <td>
                      {item.correctCount}{' '}
                      <small>({formatRate(item.correctRate)})</small>
                    </td>
                    <td>
                      {item.incorrectCount}{' '}
                      <small>({formatRate(item.incorrectRate)})</small>
                    </td>
                    <td>{item.timeoutCount}</td>
                    <td>
                      <span
                        className={`analytics-signal analytics-signal--${item.isProblematic ? 'problem' : item.hasSufficientSample ? 'clear' : 'insufficient'}`}
                      >
                        {item.isProblematic
                          ? 'Problematic'
                          : item.hasSufficientSample
                            ? 'Not flagged'
                            : `Need ${10 - item.answerCount} more`}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="button button--secondary"
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
          <div
            className="author-actions author-pagination"
            aria-label="Question performance pages"
          >
            <button
              className="button button--secondary"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {result.page} of {Math.max(result.totalPages, 1)}
            </span>
            <button
              className="button button--secondary"
              disabled={page >= result.totalPages}
              onClick={() => setPage((value) => value + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function formatRate(rate: number) {
  return `${Math.round(rate * 100)}%`;
}
