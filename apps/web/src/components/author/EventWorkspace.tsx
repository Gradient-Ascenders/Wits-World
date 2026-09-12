import { authorErrorDetail } from './author-error-copy';
import { StateIcon } from '../StatusMessage';
import { LoadingState } from '../LoadingState';
import { ArrowLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { AuthorSaveBar } from './AuthorSaveBar';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  createAuthorChallenge,
  createAuthorEvent,
  createAuthorQuestion,
  isAuthorContentConflict,
  listAuthorChallenges,
  listAuthorEvents,
  listAuthorQuestions,
  transitionAuthorContent,
  updateAuthorEvent,
  updateAuthorQuestion,
  type AuthorCard,
  type AuthorChallenge,
  type AuthorEvent,
  type AuthorEventInput,
  type AuthorQuestion,
  type AuthorQuestionInput,
  type AuthorTransitionAction,
  type ChallengeFormat,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import type { MapFactory } from '../exploration/map-provider';
import { AuthorFeedback } from './AuthorFeedback';
import { AuthorHistoryPanel } from './AuthorHistoryPanel';
import { AuthorLifecycleControls } from './AuthorLifecycleControls';
import { AuthorLocationMap } from './AuthorLocationMap';
import { useUnsavedAuthorChanges } from './AuthorNavigationGuard';
import { authorPaths, type AuthorWorkspaceRoute } from './author-routing';
import {
  type AuthorMutationCoordinator,
  type AuthorMutationTicket,
  type AuthorRecordKey,
  reconcileAuthorMutationResults,
  useAuthorDraftSession,
  useAuthorMutationRevision,
} from './author-mutation-coordinator';

interface EventWorkspaceProps {
  apiBaseUrl: string;
  cards: readonly AuthorCard[];
  cardsState: 'error' | 'loading' | 'ready';
  getAccessToken: ApiAccessTokenProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
  mutationCoordinator: AuthorMutationCoordinator;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  onOpenCards: () => void;
  onReloadCards: () => void;
  route: Extract<AuthorWorkspaceRoute, { section: 'events' }>;
}

type LoadState = 'error' | 'loading' | 'ready';

export function EventWorkspace({
  apiBaseUrl,
  cards,
  cardsState,
  getAccessToken,
  mapFactory,
  mapboxAccessToken,
  mutationCoordinator,
  navigate,
  onOpenCards,
  onReloadCards,
  route,
}: EventWorkspaceProps) {
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'schedule' | 'updated'>(
    'schedule',
  );
  const [message, setMessage] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const catalogueRef = useRef<HTMLElement>(null);
  const recordViewRef = useRef<HTMLDivElement>(null);
  const focusRouteRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const routeContextRef = useRef('');
  const interactionRef = useRef(0);
  const mountedRef = useRef(true);
  const appliedEventResultsRef = useRef(new Map<AuthorRecordKey, number>());
  const mutationRevision = useAuthorMutationRevision(mutationCoordinator);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const loadStartedAt = mutationCoordinator.beginCollectionLoad();
    setState('loading');

    try {
      const nextEvents = await listAuthorEvents({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      mutationCoordinator.completeCollectionLoad('events', loadStartedAt);
      setEvents(
        reconcileAuthorMutationResults(
          nextEvents,
          mutationCoordinator.getResults<AuthorEvent>('events'),
          (event) => event.eventId,
          appliedEventResultsRef.current,
          true,
        ),
      );
      setState('ready');
      setLoadError('');
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(
        error instanceof AuthorApiError
          ? authorErrorDetail(error)
          : 'Events could not be loaded.',
      );
      setState('error');
    }
  }, [apiBaseUrl, getAccessToken, mutationCoordinator]);

  const reloadAfterLifecycleConflict = useCallback(async () => {
    await load();
    if (mountedRef.current)
      setMessage(
        'The content changed on the server. Its authoritative state was reloaded.',
      );
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    setEvents((current) =>
      reconcileAuthorMutationResults(
        current,
        mutationCoordinator.getResults<AuthorEvent>('events'),
        (event) => event.eventId,
        appliedEventResultsRef.current,
      ),
    );
  }, [mutationCoordinator, mutationRevision]);

  const selectedId = 'eventId' in route ? route.eventId : null;
  const routeContext = `${route.mode}:${selectedId ?? ''}`;
  if (routeContextRef.current !== routeContext) {
    routeContextRef.current = routeContext;
    interactionRef.current += 1;
    selectedIdRef.current = selectedId;
  }

  useEffect(() => {
    if (state !== 'ready') return;
    if (focusRouteRef.current === null) {
      focusRouteRef.current = routeContext;
      return;
    }
    if (focusRouteRef.current === routeContext) return;
    focusRouteRef.current = routeContext;
    const timer = window.setTimeout(() => {
      (route.mode === 'list'
        ? catalogueRef.current
        : recordViewRef.current
      )?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [route.mode, routeContext, state]);

  const selected = events.find((event) => event.eventId === selectedId) ?? null;
  const visibleEvents = useMemo(
    () =>
      [...events]
        .filter((event) => {
          const query = searchQuery.trim().toLocaleLowerCase();
          const schedule = eventScheduleState(event);
          return (
            (!query ||
              event.title.toLocaleLowerCase().includes(query) ||
              event.description?.toLocaleLowerCase().includes(query)) &&
            (lifecycleFilter === 'all' ||
              event.authoringStatus === lifecycleFilter) &&
            (scheduleFilter === 'all' || schedule === scheduleFilter)
          );
        })
        .sort((left, right) => {
          if (sortOrder === 'name')
            return left.title.localeCompare(right.title);
          if (sortOrder === 'updated')
            return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
          return Date.parse(left.startsAt) - Date.parse(right.startsAt);
        }),
    [events, lifecycleFilter, scheduleFilter, searchQuery, sortOrder],
  );

  useEffect(() => {
    setMessage('');
  }, [route.mode, selectedId]);

  useEffect(() => {
    if (
      selectedId &&
      route.mode !== 'edit' &&
      mutationCoordinator.isCollectionUncertain('events')
    )
      void load();
  }, [load, mutationCoordinator, mutationRevision, route.mode, selectedId]);

  function updateEvent(
    event: AuthorEvent,
    ownerId: string | 'new',
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
    operationContextIsCurrent?: () => boolean,
  ): boolean {
    const recordKey = `event:${event.eventId}` as const;
    if (!mutationCoordinator.acceptSuccess(ticket, recordKey, event))
      return false;
    const isCurrentInteraction =
      mountedRef.current &&
      interactionRef.current === interaction &&
      (ownerId === 'new'
        ? route.mode === 'new'
        : selectedIdRef.current === ownerId) &&
      (operationContextIsCurrent?.() ?? true);
    const canApply = mutationCoordinator
      .getResults<AuthorEvent>('events')
      .some((result) => result.recordKey === recordKey);
    if (canApply) setEvents((current) => reconcileEventById(current, event));

    if (!isCurrentInteraction) return true;
    selectedIdRef.current = event.eventId;
    const targetContext = `overview:${event.eventId}`;
    navigate(authorPaths.event(event.eventId));
    if (notice)
      announce(
        notice,
        setMessage,
        feedbackRef,
        () => mountedRef.current && routeContextRef.current === targetContext,
      );
    return true;
  }

  return (
    <section
      aria-labelledby="events-workspace-title"
      className="author-workspace"
    >
      <header className="author-workspace__heading">
        <div>
          <p className="eyebrow">Playable content</p>
          <h2 id="events-workspace-title">Events</h2>
        </div>
        {state === 'ready' ? (
          <Link className="button" href={authorPaths.newEvent}>
            New event
          </Link>
        ) : (
          <button
            aria-describedby="event-create-unavailable"
            className="button"
            disabled
            type="button"
          >
            New event
          </button>
        )}
      </header>

      {state !== 'ready' ? (
        <p className="author-create-guidance" id="event-create-unavailable">
          Load the event catalogue before creating an event.
        </p>
      ) : null}

      <AuthorFeedback message={message} refObject={feedbackRef} />

      {state === 'loading' ? (
        <LoadingState label="Loading authored events…" />
      ) : null}

      {state === 'error' ? (
        <div
          className="author-state author-state--error state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <strong>Events are unavailable.</strong>
          <p>{loadError}</p>
          <button
            className="button button--quiet"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {state === 'ready' ? (
        <div
          className={`author-management-view${route.mode === 'list' ? ' author-management-view--list' : ' author-management-view--record'}${route.mode === 'questions' ? ' author-management-view--questions' : ''}`}
        >
          <aside
            aria-label="Authored events"
            className="author-catalogue"
            ref={catalogueRef}
            tabIndex={-1}
          >
            <EventCatalogueControls
              lifecycle={lifecycleFilter}
              onLifecycleChange={setLifecycleFilter}
              onScheduleChange={setScheduleFilter}
              onSearchChange={setSearchQuery}
              onSortChange={setSortOrder}
              schedule={scheduleFilter}
              search={searchQuery}
              sort={sortOrder}
            />
            <p aria-live="polite" className="author-catalogue__results">
              {visibleEvents.length} of {events.length}{' '}
              {events.length === 1 ? 'event' : 'events'}
            </p>
            {events.length === 0 ? (
              <div className="author-empty author-empty--compact state-message state-message--empty">
                <StateIcon tone="empty" />
                <strong>No authored events yet</strong>
                <p>Create a draft to begin the publication workflow.</p>
              </div>
            ) : null}
            {events.length > 0 && visibleEvents.length === 0 ? (
              <div className="author-empty author-empty--compact state-message state-message--empty">
                <StateIcon tone="empty" />
                <strong>No events match</strong>
                <p>Adjust the event filters.</p>
              </div>
            ) : null}
            <ul className="author-catalogue__list">
              {visibleEvents.map((event) => (
                <li key={event.eventId}>
                  <Link
                    aria-current={
                      selectedId === event.eventId ? 'true' : undefined
                    }
                    className="author-record-summary"
                    href={authorPaths.event(event.eventId)}
                  >
                    <span className="author-record-summary__heading">
                      <strong>{event.title}</strong>
                      <StatusBadge status={event.authoringStatus} />
                    </span>
                    <span className="author-record-summary__meta">
                      {eventScheduleLabel(event)}
                    </span>
                    <CaretRightIcon
                      size={16}
                      aria-hidden="true"
                      className="author-record-summary__chevron"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          <div
            aria-label="Event workspace detail"
            className="author-record-view"
            ref={recordViewRef}
            role="region"
            tabIndex={-1}
          >
            {route.mode === 'list' ? (
              <EventCatalogueWelcome count={events.length} />
            ) : route.mode === 'new' ? (
              <EventForm
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
                key="new-event"
                mapFactory={mapFactory}
                mapboxAccessToken={mapboxAccessToken}
                interaction={interactionRef.current}
                mutationCoordinator={mutationCoordinator}
                onCancel={() => navigate(authorPaths.events)}
                onSaved={updateEvent}
              />
            ) : selected ? (
              route.mode === 'edit' && selected.authoringStatus === 'draft' ? (
                <EventForm
                  apiBaseUrl={apiBaseUrl}
                  event={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  key={`event-form:${selected.eventId}`}
                  mapFactory={mapFactory}
                  mapboxAccessToken={mapboxAccessToken}
                  mutationCoordinator={mutationCoordinator}
                  onCancel={() => navigate(authorPaths.event(selected.eventId))}
                  onSaved={updateEvent}
                />
              ) : route.mode === 'challenge' || route.mode === 'questions' ? (
                <ChallengeWorkspace
                  apiBaseUrl={apiBaseUrl}
                  cards={cards}
                  cardsState={cardsState}
                  event={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  key={`challenge-workspace:${selected.eventId}`}
                  mutationCoordinator={mutationCoordinator}
                  navigate={navigate}
                  onEventChanged={updateEvent}
                  onEventConflict={reloadAfterLifecycleConflict}
                  onOpenCards={onOpenCards}
                  onReloadCards={onReloadCards}
                  route={route}
                  view={route.mode}
                />
              ) : (
                <EventOverview
                  apiBaseUrl={apiBaseUrl}
                  event={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  mutationCoordinator={mutationCoordinator}
                  onConflict={reloadAfterLifecycleConflict}
                  onSaved={updateEvent}
                />
              )
            ) : (
              <MissingEvent />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EventCatalogueControls({
  lifecycle,
  onLifecycleChange,
  onScheduleChange,
  onSearchChange,
  onSortChange,
  schedule,
  search,
  sort,
}: {
  lifecycle: string;
  onLifecycleChange: (value: string) => void;
  onScheduleChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: 'name' | 'schedule' | 'updated') => void;
  schedule: string;
  search: string;
  sort: 'name' | 'schedule' | 'updated';
}) {
  return (
    <div
      aria-label="Filter and sort events"
      className="author-filters author-filters--events"
    >
      <label className="author-filter author-filter--search">
        <span>Search</span>
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Title or description"
          type="search"
          value={search}
        />
      </label>
      <label className="author-filter">
        <span>Lifecycle</span>
        <select
          onChange={(event) => onLifecycleChange(event.target.value)}
          value={lifecycle}
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="retired">Retired</option>
        </select>
      </label>
      <label className="author-filter">
        <span>Schedule</span>
        <select
          onChange={(event) => onScheduleChange(event.target.value)}
          value={schedule}
        >
          <option value="all">All</option>
          <option value="current">In window</option>
          <option value="upcoming">Upcoming</option>
          <option value="ended">Ended</option>
        </select>
      </label>
      <label className="author-filter author-filter--wide">
        <span>Sort</span>
        <select
          onChange={(event) =>
            onSortChange(event.target.value as 'name' | 'schedule' | 'updated')
          }
          value={sort}
        >
          <option value="schedule">Start time</option>
          <option value="name">A–Z</option>
          <option value="updated">Recently updated</option>
        </select>
      </label>
    </div>
  );
}

function EventCatalogueWelcome({ count }: { count: number }) {
  return (
    <section className="author-welcome">
      <p className="eyebrow">Event management</p>
      <h3>{count > 0 ? 'Select an event' : 'Create the first event'}</h3>
      <p>
        {count > 0
          ? 'Choose an event to review its schedule, challenge, questions, and publication readiness.'
          : 'New events begin as editable drafts.'}
      </p>
      <Link className="button" href={authorPaths.newEvent}>
        New event
      </Link>
    </section>
  );
}

function MissingEvent() {
  return (
    <section
      className="author-state author-state--error state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
      <strong>This event is not in the loaded catalogue.</strong>
      <p>It may have been removed or the address may be incorrect.</p>
      <Link className="button button--quiet" href={authorPaths.events}>
        Back to events
      </Link>
    </section>
  );
}

function EventContextHeader({
  active,
  event,
}: {
  active: 'challenge' | 'overview' | 'questions';
  event: AuthorEvent;
}) {
  return (
    <>
      <Link className="author-back-link" href={authorPaths.events}>
        <ArrowLeftIcon size={16} aria-hidden="true" /> Events
      </Link>
      <header className="author-detail__heading">
        <div>
          <p className="eyebrow">Selected event</p>
          <h3>{event.title}</h3>
        </div>
        <StatusBadge status={event.authoringStatus} />
      </header>
      <nav aria-label={`${event.title} sections`} className="author-tabs">
        <Link
          aria-current={active === 'overview' ? 'page' : undefined}
          className="author-tabs__link"
          href={authorPaths.event(event.eventId)}
        >
          Overview
        </Link>
        <Link
          aria-current={active === 'challenge' ? 'page' : undefined}
          className="author-tabs__link"
          href={authorPaths.eventChallenge(event.eventId)}
        >
          Challenge
        </Link>
        <Link
          aria-current={active === 'questions' ? 'page' : undefined}
          className="author-tabs__link"
          href={authorPaths.eventQuestions(event.eventId)}
        >
          Questions
        </Link>
      </nav>
    </>
  );
}

function EventOverview({
  apiBaseUrl,
  event,
  getAccessToken,
  interaction,
  mutationCoordinator,
  onConflict,
  onSaved,
}: {
  apiBaseUrl: string;
  event: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mutationCoordinator: AuthorMutationCoordinator;
  onConflict: () => Promise<void>;
  onSaved: EventFormProps['onSaved'];
}) {
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => {
    setApiError(null);
  }, [event.authoringStatus, event.eventId]);

  async function lifecycle(action: AuthorTransitionAction, reason?: string) {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
    const ticket = mutationCoordinator.beginMutation(
      `event:${event.eventId}`,
      'events',
    );
    try {
      const next = await transitionAuthorContent({
        action,
        apiBaseUrl,
        entityId: event.eventId,
        entityType: 'event',
        expectedVersion: event.version,
        getAccessToken,
        reason,
        signal: controller.signal,
      });
      if (operationRef.current !== controller) return;
      onSaved(
        next,
        event.eventId,
        interaction,
        ticket,
        lifecycleNotice('event', next.authoringStatus),
      );
    } catch (error) {
      if (operationRef.current !== controller) return;
      if (mutationCoordinator.acceptFailure(ticket, isUncertainError(error))) {
        const nextError = toAuthorError(error);
        setApiError(nextError);
        if (isAuthorContentConflict(nextError)) await onConflict();
        else window.setTimeout(() => feedbackRef.current?.focus());
      }
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <article aria-label={`${event.title} overview`} className="author-detail">
      <EventContextHeader active="overview" event={event} />
      <AuthorFeedback error={apiError} refObject={feedbackRef} />

      <div className="author-overview-grid">
        <section className="author-summary-block">
          <p className="eyebrow">Summary</p>
          <h4>Event definition</h4>
          <p>
            {event.description?.trim() ||
              'No public description has been added.'}
          </p>
          <dl className="author-metadata">
            <div>
              <dt>Schedule</dt>
              <dd>{eventScheduleLabel(event)}</dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>
                <time dateTime={event.startsAt}>
                  {formatAuthorDateTime(event.startsAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>
                <time dateTime={event.endsAt}>
                  {formatAuthorDateTime(event.endsAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>Configured · {event.radiusMetres} m radius</dd>
            </div>
          </dl>
          {event.sourceUrls.length > 0 ? (
            <SourceEvidenceList sourceUrls={event.sourceUrls} />
          ) : null}
        </section>

        <section className="author-summary-block author-summary-block--next">
          <p className="eyebrow">Next action</p>
          <h4>
            {event.authoringStatus === 'draft'
              ? 'Prepare the event for review'
              : event.authoringStatus === 'in_review'
                ? 'Awaiting independent review'
                : event.authoringStatus === 'approved'
                  ? 'Approved for publication'
                  : event.authoringStatus === 'published'
                    ? 'Published event'
                    : 'Retired event'}
          </h4>
          <p>
            {event.authoringStatus === 'draft'
              ? 'Edit the definition, then complete its challenge and questions.'
              : event.authoringStatus === 'in_review'
                ? 'Another Author must approve this submission or return it with a reason.'
                : event.authoringStatus === 'approved'
                  ? 'The reviewed version can now be published.'
                  : event.authoringStatus === 'published'
                    ? 'Review the live definition or retire it when it should leave discovery.'
                    : 'This definition is preserved as a read-only historical record.'}
          </p>
          <AuthorLifecycleControls
            busy={busy}
            editControl={
              <Link
                className="button"
                href={authorPaths.editEvent(event.eventId)}
              >
                Edit event
              </Link>
            }
            noun="event"
            onAction={(action, reason) => void lifecycle(action, reason)}
            retirementDescription={
              <p>
                This event will leave player discovery and cannot be
                republished. Historical attempts remain intact.
              </p>
            }
            retirementTitle={`Retire ${event.title}?`}
            status={event.authoringStatus}
            submittedBy={event.submittedBy}
          />
        </section>
      </div>
      <AuthorHistoryPanel
        apiBaseUrl={apiBaseUrl}
        entityId={event.eventId}
        entityType="event"
        getAccessToken={getAccessToken}
        revision={event.version}
      />
    </article>
  );
}

interface EventFormProps {
  apiBaseUrl: string;
  event?: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
  mutationCoordinator: AuthorMutationCoordinator;
  onCancel: () => void;
  onSaved: (
    event: AuthorEvent,
    ownerId: string | 'new',
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
    operationContextIsCurrent?: () => boolean,
  ) => void;
}

interface EventDraft {
  description: string;
  endsAt: string;
  latitude: string;
  longitude: string;
  radiusMetres: string;
  startsAt: string;
  title: string;
}

const EVENT_RADIUS_PRESETS = [25, 50, 75, 100] as const;

function EventForm({
  apiBaseUrl,
  event,
  getAccessToken,
  interaction,
  mapFactory,
  mapboxAccessToken,
  mutationCoordinator,
  onCancel,
  onSaved,
}: EventFormProps) {
  const [draft, setDraft] = useState<EventDraft>(() => eventDraft(event));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);

  useEffect(() => {
    setDraft(eventDraft(event));
    setErrors({});
    setApiError(null);
  }, [event]);

  useEffect(() => {
    interactionActiveRef.current = true;
    return () => {
      interactionActiveRef.current = false;
    };
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(eventDraft(event));
  const recordKey = `event:${event?.eventId ?? 'new'}` as AuthorRecordKey;
  useAuthorDraftSession(mutationCoordinator, recordKey, dirty);
  const clearNavigationGuard = useUnsavedAuthorChanges(dirty, 'event draft');

  const coordinate = parseCoordinate(draft.latitude, draft.longitude);
  const radiusMetres = parseRadius(draft.radiusMetres);

  function setField(field: keyof EventDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  function setCoordinate(nextCoordinate: {
    latitude: number;
    longitude: number;
  }) {
    setDraft((current) => ({
      ...current,
      latitude: String(Number(nextCoordinate.latitude.toFixed(6))),
      longitude: String(Number(nextCoordinate.longitude.toFixed(6))),
    }));
    setErrors((current) => ({
      ...current,
      latitude: '',
      longitude: '',
    }));
  }

  async function save(submission: FormEvent) {
    submission.preventDefault();
    const result = validateEventDraft(draft);

    if (!result.input) {
      setErrors(result.errors);
      window.setTimeout(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      });
      return;
    }

    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = event?.eventId ?? 'new';
    const ticket = event
      ? mutationCoordinator.beginMutation(`event:${event.eventId}`, 'events')
      : mutationCoordinator.beginCreate('event', 'events');

    try {
      const saved = event
        ? await updateAuthorEvent({
            apiBaseUrl,
            eventId: event.eventId,
            expectedVersion: event.version,
            getAccessToken,
            input: result.input,
            signal: controller.signal,
          })
        : await createAuthorEvent({
            apiBaseUrl,
            getAccessToken,
            input: result.input,
            signal: controller.signal,
          });
      if (operationRef.current !== controller) return;
      clearNavigationGuard();
      onSaved(
        saved,
        ownerId,
        interaction,
        ticket,
        event ? 'Event changes saved.' : 'Draft event created.',
      );
    } catch (error) {
      if (operationRef.current !== controller) return;
      const accepted = mutationCoordinator.acceptFailure(
        ticket,
        isUncertainError(error),
      );
      if (!accepted || !interactionActiveRef.current) return;
      handleOperationError(error, setApiError, setErrors, formRef, feedbackRef);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        if (interactionActiveRef.current) setBusy(false);
      }
    }
  }

  return (
    <section
      aria-labelledby="event-editor-title"
      className="author-panel author-panel--editor"
    >
      <Link
        className="author-back-link"
        href={event ? authorPaths.event(event.eventId) : authorPaths.events}
      >
        <ArrowLeftIcon size={16} aria-hidden="true" />{' '}
        {event ? 'Event overview' : 'Events'}
      </Link>
      <header className="author-panel__heading">
        <div>
          <p className="eyebrow">Event definition</p>
          <h3 id="event-editor-title">{event ? event.title : 'New event'}</h3>
        </div>
        {event ? <StatusBadge status={event.authoringStatus} /> : null}
      </header>

      <AuthorFeedback error={apiError} refObject={feedbackRef} />

      <form className="author-form" noValidate onSubmit={save} ref={formRef}>
        <FormField error={errors.title} label="Event title" name="event-title">
          <input
            aria-describedby={errors.title ? 'event-title-error' : undefined}
            aria-invalid={Boolean(errors.title)}
            disabled={busy}
            id="event-title"
            onChange={(change) => setField('title', change.target.value)}
            required
            type="text"
            value={draft.title}
          />
        </FormField>

        <FormField
          error={errors.description}
          label="Description (optional)"
          name="event-description"
        >
          <textarea
            aria-describedby={
              errors.description ? 'event-description-error' : undefined
            }
            aria-invalid={Boolean(errors.description)}
            disabled={busy}
            id="event-description"
            onChange={(change) => setField('description', change.target.value)}
            rows={3}
            value={draft.description}
          />
        </FormField>

        <fieldset
          className="author-fieldset author-location-editor"
          disabled={busy}
        >
          <legend>Event location</legend>
          <p className="author-location-editor__intro">
            Select the event point on the campus map. The marker and radius are
            an authoring aid; the saved coordinates and distance remain exact.
          </p>
          <AuthorLocationMap
            coordinate={coordinate}
            disabled={busy}
            mapboxAccessToken={mapboxAccessToken}
            mapFactory={mapFactory}
            onChange={setCoordinate}
            radiusMetres={radiusMetres}
          />

          <section
            aria-labelledby="event-radius-heading"
            className="author-radius-editor"
          >
            <div className="author-radius-editor__heading">
              <strong id="event-radius-heading">Event radius</strong>
              <span>How close a player needs to be.</span>
            </div>
            <div
              aria-label="Common event radii"
              className="author-radius-presets"
              role="group"
            >
              {EVENT_RADIUS_PRESETS.map((radius) => (
                <button
                  aria-pressed={radiusMetres === radius}
                  className="author-radius-preset"
                  key={radius}
                  onClick={() => setField('radiusMetres', String(radius))}
                  type="button"
                >
                  {radius} m
                </button>
              ))}
            </div>
            <FormField
              error={errors.radiusMetres}
              label="Radius (metres)"
              name="event-radius"
            >
              <input
                aria-describedby={[
                  'event-radius-help',
                  errors.radiusMetres ? 'event-radius-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-invalid={Boolean(errors.radiusMetres)}
                id="event-radius"
                inputMode="numeric"
                min="1"
                onChange={(change) =>
                  setField('radiusMetres', change.target.value)
                }
                required
                step="1"
                type="number"
                value={draft.radiusMetres}
              />
              <span className="field-help" id="event-radius-help">
                Choose a preset or enter any positive whole number of metres.
              </span>
            </FormField>
          </section>

          <section
            aria-labelledby="event-coordinates-heading"
            className="author-location-advanced"
          >
            <div className="author-location-advanced__heading">
              <strong id="event-coordinates-heading">
                Advanced coordinates
              </strong>
              <span>
                Keyboard and map-fallback controls. Values stay synchronized
                with the marker.
              </span>
            </div>
            <div className="author-form__grid">
              <FormField
                error={errors.latitude}
                label="Latitude"
                name="event-latitude"
              >
                <input
                  aria-describedby={
                    errors.latitude ? 'event-latitude-error' : undefined
                  }
                  aria-invalid={Boolean(errors.latitude)}
                  id="event-latitude"
                  inputMode="decimal"
                  max="90"
                  min="-90"
                  onChange={(change) =>
                    setField('latitude', change.target.value)
                  }
                  required
                  step="any"
                  type="number"
                  value={draft.latitude}
                />
              </FormField>
              <FormField
                error={errors.longitude}
                label="Longitude"
                name="event-longitude"
              >
                <input
                  aria-describedby={
                    errors.longitude ? 'event-longitude-error' : undefined
                  }
                  aria-invalid={Boolean(errors.longitude)}
                  id="event-longitude"
                  inputMode="decimal"
                  max="180"
                  min="-180"
                  onChange={(change) =>
                    setField('longitude', change.target.value)
                  }
                  required
                  step="any"
                  type="number"
                  value={draft.longitude}
                />
              </FormField>
            </div>
          </section>
        </fieldset>

        <fieldset className="author-fieldset" disabled={busy}>
          <legend>Active times</legend>
          <div className="author-form__grid">
            <FormField
              error={errors.startsAt}
              label="Starts at"
              name="event-starts"
            >
              <input
                aria-describedby={
                  errors.startsAt ? 'event-starts-error' : undefined
                }
                aria-invalid={Boolean(errors.startsAt)}
                id="event-starts"
                onChange={(change) => setField('startsAt', change.target.value)}
                required
                type="datetime-local"
                value={draft.startsAt}
              />
            </FormField>
            <FormField error={errors.endsAt} label="Ends at" name="event-ends">
              <input
                aria-describedby={
                  errors.endsAt ? 'event-ends-error' : undefined
                }
                aria-invalid={Boolean(errors.endsAt)}
                id="event-ends"
                onChange={(change) => setField('endsAt', change.target.value)}
                required
                type="datetime-local"
                value={draft.endsAt}
              />
            </FormField>
          </div>
        </fieldset>

        <AuthorSaveBar
          busy={busy}
          dirty={dirty}
          failed={Boolean(apiError) || Object.values(errors).some(Boolean)}
          isNew={!event}
        >
          <button className="button" disabled={busy} type="submit">
            {busy ? 'Saving…' : event ? 'Save event' : 'Create draft event'}
          </button>
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </AuthorSaveBar>
      </form>
    </section>
  );
}

interface ChallengeWorkspaceProps {
  apiBaseUrl: string;
  cards: readonly AuthorCard[];
  cardsState: 'error' | 'loading' | 'ready';
  event: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mutationCoordinator: AuthorMutationCoordinator;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  onEventChanged: (
    event: AuthorEvent,
    ownerId: string,
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
    operationContextIsCurrent?: () => boolean,
  ) => boolean;
  onEventConflict: () => Promise<void>;
  onOpenCards: () => void;
  onReloadCards: () => void;
  route: Extract<AuthorWorkspaceRoute, { section: 'events' }>;
  view: 'challenge' | 'questions';
}

function ChallengeWorkspace({
  apiBaseUrl,
  cards,
  cardsState,
  event,
  getAccessToken,
  interaction,
  mutationCoordinator,
  navigate,
  onEventChanged,
  onEventConflict,
  onOpenCards,
  onReloadCards,
  route,
  view,
}: ChallengeWorkspaceProps) {
  const [challenges, setChallenges] = useState<AuthorChallenge[]>([]);
  const [questions, setQuestions] = useState<AuthorQuestion[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(
    null,
  );
  const [state, setState] = useState<LoadState>('loading');
  const [questionsState, setQuestionsState] = useState<LoadState>('loading');
  const [questionsError, setQuestionsError] = useState<AuthorApiError | null>(
    null,
  );
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [feedbackPlacement, setFeedbackPlacement] = useState<
    'challenge' | 'publication'
  >('challenge');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [newChallengeFormat, setNewChallengeFormat] =
    useState<ChallengeFormat>('multiple_choice');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const challengeRequestRef = useRef<AbortController | null>(null);
  const questionRequestRef = useRef<AbortController | null>(null);
  const operationRef = useRef<AbortController | null>(null);
  const initialRouteChallengeIdRef = useRef(
    route.mode === 'questions' || route.mode === 'challenge'
      ? route.challengeId
      : undefined,
  );
  const selectedChallengeIdRef = useRef<string | null>(null);
  const challengeInteractionRef = useRef(0);
  const interactionActiveRef = useRef(true);
  const appliedChallengeResultsRef = useRef(new Map<AuthorRecordKey, number>());
  const appliedQuestionResultsRef = useRef(new Map<AuthorRecordKey, number>());
  const mutationRevision = useAuthorMutationRevision(mutationCoordinator);

  useEffect(() => {
    if (!apiError && !message) return;
    feedbackRef.current?.focus();
  }, [apiError, feedbackPlacement, message]);

  const loadChallenges = useCallback(
    async (preferredChallengeId?: string) => {
      challengeRequestRef.current?.abort();
      const controller = new AbortController();
      challengeRequestRef.current = controller;
      const collectionKey = challengeCollectionKey(event.eventId);
      const loadStartedAt = mutationCoordinator.beginCollectionLoad();
      setState('loading');
      setChallenges([]);
      selectedChallengeIdRef.current = null;
      challengeInteractionRef.current += 1;
      setSelectedChallengeId(null);
      setQuestions([]);
      setQuestionsState('loading');
      setQuestionsError(null);
      setFeedbackPlacement('challenge');
      setApiError(null);

      try {
        const next = await listAuthorChallenges({
          apiBaseUrl,
          eventId: event.eventId,
          getAccessToken,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        mutationCoordinator.completeCollectionLoad(
          collectionKey,
          loadStartedAt,
        );
        const reconciled = reconcileAuthorMutationResults(
          next,
          mutationCoordinator.getResults<AuthorChallenge>(collectionKey),
          (challenge) => challenge.challengeId,
          appliedChallengeResultsRef.current,
          true,
          true,
        );
        setChallenges(reconciled);
        setSelectedChallengeId((current) => {
          const nextId =
            preferredChallengeId !== undefined
              ? reconciled.some(
                  (challenge) => challenge.challengeId === preferredChallengeId,
                )
                ? preferredChallengeId
                : null
              : current &&
                  reconciled.some(
                    (challenge) => challenge.challengeId === current,
                  )
                ? current
                : (reconciled.find(
                    (challenge) => challenge.status !== 'retired',
                  )?.challengeId ??
                  reconciled[0]?.challengeId ??
                  null);
          selectedChallengeIdRef.current = nextId;
          return nextId;
        });
        setState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setApiError(toAuthorError(error));
        setState('error');
      }
    },
    [apiBaseUrl, event.eventId, getAccessToken, mutationCoordinator],
  );

  useEffect(() => {
    interactionActiveRef.current = true;
    void loadChallenges(initialRouteChallengeIdRef.current);
    return () => {
      interactionActiveRef.current = false;
      challengeRequestRef.current?.abort();
      questionRequestRef.current?.abort();
    };
  }, [loadChallenges]);

  useEffect(() => {
    const routeChallengeId =
      route.mode === 'questions' || route.mode === 'challenge'
        ? route.challengeId
        : undefined;
    if (
      !routeChallengeId ||
      routeChallengeId === selectedChallengeId ||
      !challenges.some(
        (challenge) => challenge.challengeId === routeChallengeId,
      )
    )
      return;
    challengeInteractionRef.current += 1;
    selectedChallengeIdRef.current = routeChallengeId;
    setSelectedChallengeId(routeChallengeId);
    setQuestions([]);
    setQuestionsState('loading');
    setQuestionsError(null);
    setMessage('');
    setApiError(null);
  }, [challenges, route, selectedChallengeId]);

  useEffect(() => {
    if (
      view === 'questions' &&
      route.mode === 'questions' &&
      !route.challengeId &&
      selectedChallengeId
    ) {
      navigate(authorPaths.questions(event.eventId, selectedChallengeId), {
        replace: true,
      });
    }
  }, [event.eventId, navigate, route, selectedChallengeId, view]);

  const loadQuestions = useCallback(async () => {
    questionRequestRef.current?.abort();
    setQuestions([]);
    setQuestionsError(null);
    if (!selectedChallengeId) {
      setQuestionsState('ready');
      return;
    }
    const controller = new AbortController();
    questionRequestRef.current = controller;
    const collectionKey = questionCollectionKey(selectedChallengeId);
    const loadStartedAt = mutationCoordinator.beginCollectionLoad();
    setQuestionsState('loading');
    try {
      const next = await listAuthorQuestions({
        apiBaseUrl,
        challengeId: selectedChallengeId,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      mutationCoordinator.completeCollectionLoad(collectionKey, loadStartedAt);
      setQuestions(
        reconcileAuthorMutationResults(
          next,
          mutationCoordinator.getResults<AuthorQuestion>(collectionKey),
          (question) => question.questionId,
          appliedQuestionResultsRef.current,
          true,
          true,
        ),
      );
      setQuestionsState('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setQuestions([]);
      setQuestionsError(toAuthorError(error));
      setQuestionsState('error');
    }
  }, [apiBaseUrl, getAccessToken, mutationCoordinator, selectedChallengeId]);

  useEffect(() => {
    void loadQuestions();
    return () => questionRequestRef.current?.abort();
  }, [loadQuestions]);

  useEffect(() => {
    const collectionKey = challengeCollectionKey(event.eventId);
    if (state === 'ready')
      setChallenges((current) =>
        reconcileAuthorMutationResults(
          current,
          mutationCoordinator.getResults<AuthorChallenge>(collectionKey),
          (challenge) => challenge.challengeId,
          appliedChallengeResultsRef.current,
          false,
          true,
        ),
      );
    if (!selectedChallengeId || questionsState !== 'ready') return;
    const questionKey = questionCollectionKey(selectedChallengeId);
    setQuestions((current) =>
      reconcileAuthorMutationResults(
        current,
        mutationCoordinator.getResults<AuthorQuestion>(questionKey),
        (question) => question.questionId,
        appliedQuestionResultsRef.current,
        false,
        true,
      ),
    );
  }, [
    event.eventId,
    mutationCoordinator,
    mutationRevision,
    questionsState,
    selectedChallengeId,
    state,
  ]);

  const selected =
    challenges.find(
      (challenge) => challenge.challengeId === selectedChallengeId,
    ) ?? null;
  const challengeRetirementBlocked =
    selected?.status === 'published' && event.authoringStatus === 'published';
  const publishedQuestions =
    questionsState === 'ready'
      ? questions.filter(
          (question) =>
            question.challengeId === selectedChallengeId &&
            question.status === 'published',
        ).length
      : 0;
  const hasActiveCommon = cards.some(
    (card) =>
      card.authoringStatus === 'published' &&
      card.isActive &&
      card.rarity === 'common',
  );
  const hasAuthoritativeCommon = cardsState === 'ready' && hasActiveCommon;

  function beginOperation(
    placement: 'challenge' | 'publication' = 'challenge',
  ) {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setFeedbackPlacement(placement);
    setApiError(null);
    setMessage('');
    return controller;
  }

  function finishOperation(controller: AbortController) {
    if (operationRef.current !== controller) return false;
    operationRef.current = null;
    if (interactionActiveRef.current) setBusy(false);
    return true;
  }

  function selectChallenge(challengeId: string) {
    challengeInteractionRef.current += 1;
    selectedChallengeIdRef.current = challengeId;
    setSelectedChallengeId(challengeId);
    setQuestions([]);
    setQuestionsState('loading');
    setQuestionsError(null);
    setMessage('');
    setApiError(null);
    if (view === 'questions') {
      navigate(authorPaths.questions(event.eventId, challengeId));
    } else if (route.mode === 'challenge') {
      navigate(authorPaths.challenge(event.eventId, challengeId));
    }
    if (
      mutationCoordinator.isCollectionUncertain(
        challengeCollectionKey(event.eventId),
      )
    )
      void loadChallenges(challengeId);
  }

  async function createChallenge() {
    const controller = beginOperation();
    const startingChallengeId = selectedChallengeIdRef.current;
    const startingInteraction = challengeInteractionRef.current;
    const collectionKey = challengeCollectionKey(event.eventId);
    const ticket = mutationCoordinator.beginCreate('challenge', collectionKey);
    let focusChallengeId: string | null = null;
    let focusInteraction: number | null = null;
    try {
      const challenge = await createAuthorChallenge({
        apiBaseUrl,
        eventId: event.eventId,
        format: newChallengeFormat,
        getAccessToken,
        signal: controller.signal,
      });
      const recordKey = `challenge:${challenge.challengeId}` as const;
      if (!mutationCoordinator.acceptSuccess(ticket, recordKey, challenge))
        return;
      const canApply = mutationCoordinator
        .getResults<AuthorChallenge>(collectionKey)
        .some((result) => result.recordKey === recordKey);
      if (interactionActiveRef.current && canApply)
        setChallenges((current) => reconcileChallengeById(current, challenge));
      if (
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === startingChallengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        selectChallenge(challenge.challengeId);
        focusChallengeId = challenge.challengeId;
        focusInteraction = challengeInteractionRef.current;
        setMessage(
          `Draft ${challengeFormatLabel(challenge.format).toLowerCase()} challenge associated with this event.`,
        );
      }
    } catch (error) {
      const accepted = mutationCoordinator.acceptFailure(
        ticket,
        isUncertainError(error),
      );
      if (
        accepted &&
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === startingChallengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        setApiError(toAuthorError(error));
        focusChallengeId = startingChallengeId;
        focusInteraction = startingInteraction;
      }
    } finally {
      if (
        finishOperation(controller) &&
        focusInteraction !== null &&
        challengeInteractionRef.current === focusInteraction &&
        selectedChallengeIdRef.current === focusChallengeId
      )
        window.setTimeout(() => {
          if (
            interactionActiveRef.current &&
            challengeInteractionRef.current === focusInteraction &&
            selectedChallengeIdRef.current === focusChallengeId
          )
            feedbackRef.current?.focus();
        });
    }
  }

  async function challengeLifecycle(
    action: AuthorTransitionAction,
    reason?: string,
  ) {
    if (!selected) return;
    const controller = beginOperation();
    const challengeId = selected.challengeId;
    const startingInteraction = challengeInteractionRef.current;
    const collectionKey = challengeCollectionKey(event.eventId);
    const ticket = mutationCoordinator.beginMutation(
      `challenge:${challengeId}`,
      collectionKey,
    );
    let shouldFocus = false;
    try {
      const next = await transitionAuthorContent({
        action,
        apiBaseUrl,
        entityId: challengeId,
        entityType: 'challenge',
        expectedVersion: selected.version,
        getAccessToken,
        reason,
        signal: controller.signal,
      });
      const recordKey = `challenge:${next.challengeId}` as const;
      if (!mutationCoordinator.acceptSuccess(ticket, recordKey, next)) return;
      const canApply = mutationCoordinator
        .getResults<AuthorChallenge>(collectionKey)
        .some((result) => result.recordKey === recordKey);
      if (interactionActiveRef.current && canApply)
        setChallenges((current) => reconcileChallengeById(current, next));
      if (
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === challengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        setMessage(lifecycleNotice('challenge', next.status));
        shouldFocus = true;
      }
    } catch (error) {
      const accepted = mutationCoordinator.acceptFailure(
        ticket,
        isUncertainError(error),
      );
      if (
        accepted &&
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === challengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        const nextError = toAuthorError(error);
        setApiError(nextError);
        if (isAuthorContentConflict(nextError)) {
          await loadChallenges(challengeId);
          if (
            interactionActiveRef.current &&
            selectedChallengeIdRef.current === challengeId
          )
            setMessage(
              'The challenge changed on the server. Its authoritative state was reloaded.',
            );
        } else shouldFocus = true;
      }
    } finally {
      if (
        finishOperation(controller) &&
        shouldFocus &&
        interactionActiveRef.current &&
        challengeInteractionRef.current === startingInteraction &&
        selectedChallengeIdRef.current === challengeId
      )
        window.setTimeout(() => {
          if (
            interactionActiveRef.current &&
            challengeInteractionRef.current === startingInteraction &&
            selectedChallengeIdRef.current === challengeId
          )
            feedbackRef.current?.focus();
        });
    }
  }

  async function eventLifecycle(
    action: AuthorTransitionAction,
    reason?: string,
  ) {
    const controller = beginOperation('publication');
    const startingChallengeId = selectedChallengeIdRef.current;
    const startingChallengeInteraction = challengeInteractionRef.current;
    const ticket = mutationCoordinator.beginMutation(
      `event:${event.eventId}`,
      'events',
    );
    let shouldFocus = false;
    try {
      const next = await transitionAuthorContent({
        action,
        apiBaseUrl,
        entityId: event.eventId,
        entityType: 'event',
        expectedVersion: event.version,
        getAccessToken,
        reason,
        signal: controller.signal,
      });
      if (
        !onEventChanged(
          next,
          event.eventId,
          interaction,
          ticket,
          lifecycleNotice('event', next.authoringStatus),
          () =>
            interactionActiveRef.current &&
            challengeInteractionRef.current === startingChallengeInteraction &&
            selectedChallengeIdRef.current === startingChallengeId,
        )
      )
        return;
    } catch (error) {
      const accepted = mutationCoordinator.acceptFailure(
        ticket,
        isUncertainError(error),
      );
      if (
        accepted &&
        interactionActiveRef.current &&
        challengeInteractionRef.current === startingChallengeInteraction &&
        selectedChallengeIdRef.current === startingChallengeId
      ) {
        const nextError = toAuthorError(error);
        setApiError(nextError);
        if (isAuthorContentConflict(nextError)) await onEventConflict();
        else shouldFocus = true;
      }
    } finally {
      if (finishOperation(controller) && shouldFocus)
        window.setTimeout(() => {
          if (
            interactionActiveRef.current &&
            challengeInteractionRef.current === startingChallengeInteraction &&
            selectedChallengeIdRef.current === startingChallengeId
          )
            feedbackRef.current?.focus();
        });
    }
  }

  const publishedChallengeCount = challenges.filter(
    (challenge) => challenge.status === 'published',
  ).length;
  const publishedChallengeReady = publishedChallengeCount === 1;
  const questionRequirementReady =
    publishedChallengeReady ||
    (questionsState === 'ready' && publishedQuestions >= 5);
  const readinessChecking =
    state === 'loading' ||
    cardsState === 'loading' ||
    (!publishedChallengeReady &&
      Boolean(selected) &&
      questionsState === 'loading');
  const readinessUnavailable =
    state === 'error' ||
    cardsState === 'error' ||
    (!publishedChallengeReady &&
      Boolean(selected) &&
      questionsState === 'error');
  const readyCount = [
    publishedChallengeReady,
    questionRequirementReady,
    hasAuthoritativeCommon,
  ].filter(Boolean).length;
  const nextAction =
    state === 'loading'
      ? 'Checking event challenges.'
      : state === 'error'
        ? 'Reload the event challenges.'
        : publishedChallengeCount > 1
          ? 'Resolve the published challenge conflict on the server.'
          : !selected
            ? 'Create the event challenge.'
            : !publishedChallengeReady && questionsState === 'loading'
              ? 'Checking published questions.'
              : !publishedChallengeReady && questionsState === 'error'
                ? 'Reload the question readiness check.'
                : !publishedChallengeReady && selected.status === 'retired'
                  ? 'Create or select a draft challenge.'
                  : !publishedChallengeReady && publishedQuestions < 5
                    ? 'Publish at least five questions.'
                    : !publishedChallengeReady
                      ? 'Publish the completed challenge.'
                      : cardsState === 'loading'
                        ? 'Checking the reward catalogue.'
                        : cardsState === 'error'
                          ? 'Check the reward catalogue again.'
                          : !hasAuthoritativeCommon
                            ? 'Publish an active Common reward card.'
                            : 'Ask the server to publish the event.';

  return (
    <section aria-label={`${event.title} ${view}`} className="author-detail">
      <EventContextHeader active={view} event={event} />

      {view === 'questions' || feedbackPlacement === 'challenge' ? (
        <AuthorFeedback
          error={apiError}
          message={message}
          refObject={feedbackRef}
        />
      ) : null}

      {view === 'challenge' ? (
        <>
          <header className="author-section-heading">
            <div>
              <p className="eyebrow">Publication workflow</p>
              <h4>Challenge readiness</h4>
              <p>
                {readyCount} of 3 requirements ready.{' '}
                <strong>{nextAction}</strong>
              </p>
            </div>
            {state === 'ready' ? (
              <div className="challenge-create-controls">
                <label htmlFor="new-challenge-format">
                  New challenge format
                </label>
                <select
                  disabled={busy}
                  id="new-challenge-format"
                  onChange={(change) =>
                    setNewChallengeFormat(
                      change.target.value as ChallengeFormat,
                    )
                  }
                  value={newChallengeFormat}
                >
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="ordering">Ordering</option>
                </select>
                <button
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => void createChallenge()}
                  type="button"
                >
                  {busy ? 'Creating…' : 'Create challenge'}
                </button>
              </div>
            ) : null}
          </header>

          <div className="readiness-grid" aria-label="Publication requirements">
            <ReadinessItem ready={publishedChallengeReady} title="Challenge">
              {publishedChallengeReady
                ? 'Exactly one challenge is published.'
                : 'Publish exactly one challenge.'}
            </ReadinessItem>
            <ReadinessItem ready={questionRequirementReady} title="Questions">
              {publishedChallengeReady
                ? 'The published challenge meets the server-enforced question minimum.'
                : questionsState === 'loading'
                  ? 'Checking published questions…'
                  : questionsState === 'error'
                    ? 'Question readiness could not be checked.'
                    : `${publishedQuestions} of at least 5 are published in this challenge.`}
            </ReadinessItem>
            <ReadinessItem ready={hasAuthoritativeCommon} title="Rewards">
              {cardsState === 'loading'
                ? 'Checking the Common catalogue…'
                : cardsState === 'error'
                  ? 'The reward catalogue could not be checked.'
                  : hasActiveCommon
                    ? 'An active Common card is available.'
                    : 'Publish an active Common card.'}
            </ReadinessItem>
          </div>

          {state === 'loading' ? (
            <LoadingState label="Loading event challenges…" />
          ) : null}
          {state === 'error' ? (
            <div
              className="author-state author-state--error state-message state-message--error"
              role="alert"
            >
              <StateIcon tone="error" />
              <strong>Challenges are unavailable.</strong>
              <button
                className="button button--quiet"
                onClick={() => void loadChallenges()}
                type="button"
              >
                Reload challenges
              </button>
            </div>
          ) : null}

          {challenges.length > 0 ? (
            <div className="challenge-selector">
              <label htmlFor="event-challenge">Challenge</label>
              <select
                id="event-challenge"
                onChange={(change) => selectChallenge(change.target.value)}
                value={selectedChallengeId ?? ''}
              >
                {challenges.map((challenge, index) => (
                  <option
                    key={challenge.challengeId}
                    value={challenge.challengeId}
                  >
                    Challenge {index + 1} —{' '}
                    {challengeFormatLabel(challenge.format)} —{' '}
                    {challenge.status}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {selected ? (
            <section className="author-summary-block">
              <div className="author-section-heading">
                <div>
                  <p className="eyebrow">Selected challenge</p>
                  <h4>{challengeFormatLabel(selected.format)}</h4>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <p>
                {questions.length} total questions · {publishedQuestions}{' '}
                published
              </p>
              <AuthorLifecycleControls
                busy={busy}
                editControl={
                  <Link
                    className="button button--quiet"
                    href={authorPaths.questions(
                      event.eventId,
                      selected.challengeId,
                    )}
                  >
                    Manage questions
                  </Link>
                }
                noun="challenge"
                onAction={(action, reason) =>
                  void challengeLifecycle(action, reason)
                }
                retirementDescription={
                  <p>
                    This challenge cannot be edited or published again. Its
                    event must be retired first when both are published.
                  </p>
                }
                retirementDisabled={challengeRetirementBlocked}
                retirementDisabledDescription="Retire the event before retiring its published challenge."
                retirementTitle="Retire this challenge?"
                status={selected.status}
                submittedBy={selected.submittedBy}
              />
              <AuthorHistoryPanel
                apiBaseUrl={apiBaseUrl}
                entityId={selected.challengeId}
                entityType="challenge"
                getAccessToken={getAccessToken}
                revision={selected.version}
              />
            </section>
          ) : null}

          {feedbackPlacement === 'publication' ? (
            <AuthorFeedback
              error={apiError}
              message={message}
              refObject={feedbackRef}
            />
          ) : null}
          <div className="author-publish-bar">
            <div>
              <strong>
                {readinessChecking
                  ? 'Checking readiness'
                  : readinessUnavailable
                    ? 'Readiness check incomplete'
                    : readyCount === 3
                      ? 'Ready for server review'
                      : 'Publication blocked'}
              </strong>
              <p>{nextAction}</p>
            </div>
            <div className="author-actions">
              {!hasAuthoritativeCommon ? (
                <button
                  className="button button--quiet"
                  onClick={onOpenCards}
                  type="button"
                >
                  Open cards
                </button>
              ) : null}
              {cardsState === 'error' ? (
                <button
                  className="button button--quiet"
                  onClick={onReloadCards}
                  type="button"
                >
                  Check cards again
                </button>
              ) : null}
              <AuthorLifecycleControls
                busy={busy}
                noun="event"
                onAction={(action, reason) =>
                  void eventLifecycle(action, reason)
                }
                retirementDescription={
                  <p>
                    This event will leave player discovery and cannot be
                    republished. Historical attempts remain intact.
                  </p>
                }
                retirementTitle={`Retire ${event.title}?`}
                status={event.authoringStatus}
                submittedBy={event.submittedBy}
              />
            </div>
          </div>
          <p className="field-help">
            The server rechecks every lifecycle and content requirement when
            publication is requested.
          </p>
        </>
      ) : (
        <>
          <header className="author-section-heading">
            <div>
              <p className="eyebrow">Question bank</p>
              <h4>Questions</h4>
            </div>
          </header>
          {challenges.length > 1 ? (
            <div className="challenge-selector">
              <label htmlFor="question-challenge">Challenge</label>
              <select
                id="question-challenge"
                onChange={(change) => selectChallenge(change.target.value)}
                value={selectedChallengeId ?? ''}
              >
                {challenges.map((challenge, index) => (
                  <option
                    key={challenge.challengeId}
                    value={challenge.challengeId}
                  >
                    Challenge {index + 1} —{' '}
                    {challengeFormatLabel(challenge.format)} —{' '}
                    {challenge.status}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {state === 'loading' || questionsState === 'loading' ? (
            <LoadingState label="Loading challenge questions…" />
          ) : null}
          {state === 'ready' && !selected ? (
            <div className="author-state">
              <strong>No challenge is associated.</strong>
              <p>Create the event challenge before adding questions.</p>
              <Link
                className="button button--quiet"
                href={authorPaths.eventChallenge(event.eventId)}
              >
                Open challenge workflow
              </Link>
            </div>
          ) : null}
          {questionsState === 'error' ? (
            <div
              className="author-state author-state--error state-message state-message--error"
              role="alert"
            >
              <StateIcon tone="error" />
              <strong>Questions are unavailable.</strong>
              <p>{questionsError ? authorErrorDetail(questionsError) : null}</p>
              <button
                className="button button--quiet"
                onClick={() => void loadQuestions()}
                type="button"
              >
                Reload questions
              </button>
            </div>
          ) : null}
          {selected &&
          questionsState === 'ready' &&
          route.mode === 'questions' ? (
            <QuestionWorkspace
              apiBaseUrl={apiBaseUrl}
              challenge={selected}
              event={event}
              getAccessToken={getAccessToken}
              key={selected.challengeId}
              mutationCoordinator={mutationCoordinator}
              navigate={navigate}
              onLifecycleConflict={async () => {
                await loadQuestions();
                if (interactionActiveRef.current) {
                  setApiError(null);
                  setMessage(
                    'The question changed on the server. Its authoritative state was reloaded.',
                  );
                }
              }}
              onReload={loadQuestions}
              onQuestionsChange={setQuestions}
              questions={questions.filter(
                (question) => question.challengeId === selected.challengeId,
              )}
              route={route}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

interface QuestionWorkspaceProps {
  apiBaseUrl: string;
  challenge: AuthorChallenge;
  event: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  mutationCoordinator: AuthorMutationCoordinator;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  onLifecycleConflict: () => Promise<void>;
  onReload: () => Promise<void> | void;
  onQuestionsChange: React.Dispatch<React.SetStateAction<AuthorQuestion[]>>;
  questions: AuthorQuestion[];
  route: Extract<AuthorWorkspaceRoute, { mode: 'questions' }>;
}

function QuestionWorkspace({
  apiBaseUrl,
  challenge,
  event,
  getAccessToken,
  mutationCoordinator,
  navigate,
  onLifecycleConflict,
  onReload,
  onQuestionsChange,
  questions,
  route,
}: QuestionWorkspaceProps) {
  const [message, setMessage] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const catalogueRef = useRef<HTMLElement>(null);
  const recordViewRef = useRef<HTMLDivElement>(null);
  const focusRouteRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | 'new'>('new');
  const routeContextRef = useRef('');
  const interactionRef = useRef(0);
  const mountedRef = useRef(true);
  const selectedId = route.questionId ?? null;
  const routeContext = `${route.questionMode}:${selectedId ?? ''}`;
  if (routeContextRef.current !== routeContext) {
    routeContextRef.current = routeContext;
    interactionRef.current += 1;
    selectedIdRef.current =
      route.questionMode === 'new' ? 'new' : (selectedId ?? 'new');
  }
  const selected = questions.find(
    (question) => question.questionId === selectedId,
  );

  useEffect(() => {
    if (focusRouteRef.current === null) {
      focusRouteRef.current = routeContext;
      return;
    }
    if (focusRouteRef.current === routeContext) return;
    focusRouteRef.current = routeContext;
    const timer = window.setTimeout(() => {
      (route.questionMode === 'list'
        ? catalogueRef.current
        : recordViewRef.current
      )?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [route.questionMode, routeContext]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setMessage('');
    if (
      selectedId &&
      mutationCoordinator.isCollectionUncertain(
        questionCollectionKey(challenge.challengeId),
      )
    )
      onReload();
  }, [
    challenge.challengeId,
    mutationCoordinator,
    onReload,
    route.questionMode,
    selectedId,
  ]);

  function updateQuestion(
    question: AuthorQuestion,
    ownerId: string | 'new',
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
  ) {
    const recordKey = `question:${question.questionId}` as const;
    if (!mutationCoordinator.acceptSuccess(ticket, recordKey, question)) return;
    const isCurrentInteraction =
      mountedRef.current &&
      interactionRef.current === interaction &&
      selectedIdRef.current === ownerId;
    const canApply = mutationCoordinator
      .getResults<AuthorQuestion>(questionCollectionKey(challenge.challengeId))
      .some((result) => result.recordKey === recordKey);
    if (mountedRef.current && canApply)
      onQuestionsChange((current) => reconcileQuestionById(current, question));

    if (!isCurrentInteraction) return;
    selectedIdRef.current = question.questionId;
    const targetContext = `detail:${question.questionId}`;
    navigate(
      authorPaths.question(
        event.eventId,
        challenge.challengeId,
        question.questionId,
      ),
    );
    if (notice)
      announce(
        notice,
        setMessage,
        feedbackRef,
        () => mountedRef.current && routeContextRef.current === targetContext,
      );
  }

  return (
    <section
      aria-label="Questions"
      className={`question-workspace${route.questionMode === 'list' ? ' question-workspace--list' : ' question-workspace--record'}`}
    >
      <aside
        aria-label="Challenge questions"
        className="question-catalogue"
        ref={catalogueRef}
        tabIndex={-1}
      >
        <div className="author-panel__heading">
          <div>
            <p className="eyebrow">Question bank</p>
            <h5>{questions.length} questions</h5>
          </div>
          {challenge.status !== 'retired' ? (
            <Link
              className="button button--quiet"
              href={authorPaths.newQuestion(
                event.eventId,
                challenge.challengeId,
              )}
            >
              New question
            </Link>
          ) : (
            <button className="button button--quiet" disabled type="button">
              New question
            </button>
          )}
        </div>
        {questions.length === 0 ? (
          <div className="author-empty author-empty--compact state-message state-message--empty">
            <StateIcon tone="empty" />
            <strong>No questions yet</strong>
            <p>
              A published challenge needs at least five published questions.
            </p>
          </div>
        ) : (
          <ol aria-label="Questions" className="question-summary-list">
            {questions.map((question) => (
              <li key={question.questionId}>
                <Link
                  aria-current={
                    selectedId === question.questionId ? 'true' : undefined
                  }
                  className="question-summary"
                  href={authorPaths.question(
                    event.eventId,
                    challenge.challengeId,
                    question.questionId,
                  )}
                >
                  <span className="question-summary__prompt">
                    {questionPromptExcerpt(question.prompt)}
                  </span>
                  <span className="question-summary__meta">
                    Difficulty {question.difficulty} ·{' '}
                    <StatusBadge status={question.status} />
                  </span>
                  <CaretRightIcon
                    size={16}
                    aria-hidden="true"
                    className="question-summary__chevron"
                  />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <div
        aria-label="Question workspace detail"
        className="question-record-view"
        ref={recordViewRef}
        role="region"
        tabIndex={-1}
      >
        <AuthorFeedback message={message} refObject={feedbackRef} />
        {route.questionMode === 'list' ? (
          <section className="author-welcome author-welcome--compact">
            <p className="eyebrow">Question detail</p>
            <h5>
              {questions.length > 0 ? 'Select a question' : 'Create a question'}
            </h5>
            <p>
              Review one prompt at a time. Creating a question is always an
              explicit action.
            </p>
          </section>
        ) : route.questionMode === 'new' ? (
          challenge.status !== 'retired' ? (
            <QuestionForm
              apiBaseUrl={apiBaseUrl}
              challenge={challenge}
              event={event}
              getAccessToken={getAccessToken}
              interaction={interactionRef.current}
              key="new-question"
              mutationCoordinator={mutationCoordinator}
              navigate={navigate}
              onSaved={updateQuestion}
            />
          ) : (
            <section className="author-state" role="status">
              <strong>This challenge is retired.</strong>
              <p>New questions cannot be added to its historical record.</p>
              <Link
                className="button button--quiet"
                href={authorPaths.questions(
                  event.eventId,
                  challenge.challengeId,
                )}
              >
                Back to questions
              </Link>
            </section>
          )
        ) : selected ? (
          route.questionMode === 'edit' &&
          selected.status === 'draft' &&
          challenge.status !== 'retired' ? (
            <QuestionForm
              apiBaseUrl={apiBaseUrl}
              challenge={challenge}
              event={event}
              getAccessToken={getAccessToken}
              interaction={interactionRef.current}
              key={selected.questionId}
              mutationCoordinator={mutationCoordinator}
              navigate={navigate}
              onSaved={updateQuestion}
              question={selected}
            />
          ) : (
            <QuestionDetail
              apiBaseUrl={apiBaseUrl}
              challenge={challenge}
              event={event}
              getAccessToken={getAccessToken}
              interaction={interactionRef.current}
              mutationCoordinator={mutationCoordinator}
              onConflict={onLifecycleConflict}
              onSaved={updateQuestion}
              question={selected}
            />
          )
        ) : (
          <section
            className="author-state author-state--error state-message state-message--error"
            role="alert"
          >
            <StateIcon tone="error" />
            <strong>This question is not in the loaded challenge.</strong>
            <Link
              className="button button--quiet"
              href={authorPaths.questions(event.eventId, challenge.challengeId)}
            >
              Back to questions
            </Link>
          </section>
        )}
      </div>
    </section>
  );
}

function QuestionDetail({
  apiBaseUrl,
  challenge,
  event,
  getAccessToken,
  interaction,
  mutationCoordinator,
  onConflict,
  onSaved,
  question,
}: {
  apiBaseUrl: string;
  challenge: AuthorChallenge;
  event: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mutationCoordinator: AuthorMutationCoordinator;
  onConflict: () => Promise<void>;
  onSaved: QuestionFormProps['onSaved'];
  question: AuthorQuestion;
}) {
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => {
    setApiError(null);
  }, [question.questionId, question.status]);

  async function lifecycle(action: AuthorTransitionAction, reason?: string) {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
    const collectionKey = questionCollectionKey(challenge.challengeId);
    const ticket = mutationCoordinator.beginMutation(
      `question:${question.questionId}`,
      collectionKey,
    );
    try {
      const next = await transitionAuthorContent({
        action,
        apiBaseUrl,
        entityId: question.questionId,
        entityType: 'question',
        expectedVersion: question.version,
        getAccessToken,
        reason,
        signal: controller.signal,
      });
      if (operationRef.current !== controller) return;
      onSaved(
        next,
        question.questionId,
        interaction,
        ticket,
        lifecycleNotice('question', next.status),
      );
    } catch (error) {
      if (operationRef.current !== controller) return;
      if (mutationCoordinator.acceptFailure(ticket, isUncertainError(error))) {
        const nextError = toAuthorError(error);
        setApiError(nextError);
        if (isAuthorContentConflict(nextError)) await onConflict();
        else window.setTimeout(() => feedbackRef.current?.focus());
      }
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <article
      aria-labelledby="question-detail-title"
      className="question-detail"
    >
      <Link
        className="author-back-link"
        href={authorPaths.questions(event.eventId, challenge.challengeId)}
      >
        <ArrowLeftIcon size={16} aria-hidden="true" /> Questions
      </Link>
      <header className="author-detail__heading">
        <div>
          <p className="eyebrow">Question detail</p>
          <h5 id="question-detail-title">{question.prompt}</h5>
        </div>
        <StatusBadge status={question.status} />
      </header>
      <dl className="author-metadata author-metadata--compact">
        <div>
          <dt>Difficulty</dt>
          <dd>{question.difficulty}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            <time dateTime={question.updatedAt}>
              {formatAuthorDateTime(question.updatedAt)}
            </time>
          </dd>
        </div>
      </dl>
      <section className="question-answer-summary">
        <h6>
          {question.format === 'ordering'
            ? 'Correct sequence'
            : 'Choices and accepted answer'}
        </h6>
        <ol className={question.format === 'ordering' ? 'is-numbered' : ''}>
          {question.format === 'ordering'
            ? [...question.items]
                .sort((left, right) => left.position - right.position)
                .map((item) => (
                  <li key={item.itemId}>
                    <span>{item.text}</span>
                  </li>
                ))
            : [...question.choices]
                .sort((left, right) => left.position - right.position)
                .map((choice) => (
                  <li
                    className={
                      choice.choiceId === question.acceptedChoiceId
                        ? 'question-answer-summary__accepted'
                        : undefined
                    }
                    key={choice.choiceId}
                  >
                    <span>{choice.text}</span>
                    {choice.choiceId === question.acceptedChoiceId ? (
                      <strong>Accepted answer</strong>
                    ) : null}
                  </li>
                ))}
        </ol>
      </section>
      {question.explanation ? (
        <section className="author-summary-block author-summary-block--plain">
          <h6>Author explanation</h6>
          <p>{question.explanation}</p>
        </section>
      ) : null}
      {question.sourceUrls.length > 0 ? (
        <SourceEvidenceList sourceUrls={question.sourceUrls} />
      ) : null}
      <AuthorFeedback error={apiError} refObject={feedbackRef} />
      {challenge.status !== 'retired' ? (
        <AuthorLifecycleControls
          busy={busy}
          editControl={
            <Link
              className="button"
              href={authorPaths.editQuestion(
                event.eventId,
                challenge.challengeId,
                question.questionId,
              )}
            >
              Edit question
            </Link>
          }
          noun="question"
          onAction={(action, reason) => void lifecycle(action, reason)}
          retirementDescription={
            <p>
              This question cannot be published again. A published challenge
              must retain at least five published questions.
            </p>
          }
          retirementTitle="Retire this question?"
          status={question.status}
          submittedBy={question.submittedBy}
        />
      ) : null}
      <AuthorHistoryPanel
        apiBaseUrl={apiBaseUrl}
        entityId={question.questionId}
        entityType="question"
        getAccessToken={getAccessToken}
        revision={question.version}
      />
    </article>
  );
}

interface QuestionFormProps {
  apiBaseUrl: string;
  challenge: AuthorChallenge;
  event: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mutationCoordinator: AuthorMutationCoordinator;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  onSaved: (
    question: AuthorQuestion,
    ownerId: string | 'new',
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
  ) => void;
  question?: AuthorQuestion;
}

function QuestionForm({
  apiBaseUrl,
  challenge,
  event,
  getAccessToken,
  interaction,
  mutationCoordinator,
  navigate,
  onSaved,
  question,
}: QuestionFormProps) {
  const [draft, setDraft] = useState<AuthorQuestionInput>(() =>
    questionDraft(challenge.format, question),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);
  const focusInvalidFieldRef = useRef(false);

  useEffect(() => {
    setDraft(questionDraft(challenge.format, question));
    setErrors({});
    setApiError(null);
  }, [challenge.format, question]);

  useEffect(() => {
    interactionActiveRef.current = true;
    return () => {
      interactionActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusInvalidFieldRef.current) return;
    focusInvalidFieldRef.current = false;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors]);

  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify(questionDraft(challenge.format, question));
  const recordKey =
    `question:${question?.questionId ?? 'new'}` as AuthorRecordKey;
  useAuthorDraftSession(mutationCoordinator, recordKey, dirty);
  const clearNavigationGuard = useUnsavedAuthorChanges(dirty, 'question draft');

  async function save(submission: FormEvent) {
    submission.preventDefault();
    const nextErrors = validateQuestion(draft);
    if (Object.keys(nextErrors).length > 0) {
      focusInvalidFieldRef.current = true;
      setErrors(nextErrors);
      return;
    }
    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = question?.questionId ?? 'new';
    const collectionKey = questionCollectionKey(challenge.challengeId);
    const ticket = question
      ? mutationCoordinator.beginMutation(
          `question:${question.questionId}`,
          collectionKey,
        )
      : mutationCoordinator.beginCreate('question', collectionKey);
    try {
      const saved = question
        ? await updateAuthorQuestion({
            apiBaseUrl,
            getAccessToken,
            input: draft,
            questionId: question.questionId,
            expectedVersion: question.version,
            signal: controller.signal,
          })
        : await createAuthorQuestion({
            apiBaseUrl,
            challengeId: challenge.challengeId,
            getAccessToken,
            input: draft,
            signal: controller.signal,
          });
      if (operationRef.current !== controller) return;
      clearNavigationGuard();
      onSaved(
        saved,
        ownerId,
        interaction,
        ticket,
        question ? 'Question changes saved.' : 'Draft question created.',
      );
    } catch (error) {
      if (operationRef.current !== controller) return;
      const accepted = mutationCoordinator.acceptFailure(
        ticket,
        isUncertainError(error),
      );
      if (!accepted || !interactionActiveRef.current) return;
      handleOperationError(error, setApiError, setErrors, formRef, feedbackRef);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        if (interactionActiveRef.current) setBusy(false);
      }
    }
  }

  return (
    <form
      className="author-form question-form author-panel--editor"
      noValidate
      onSubmit={save}
      ref={formRef}
    >
      <Link
        className="author-back-link"
        href={
          question
            ? authorPaths.question(
                event.eventId,
                challenge.challengeId,
                question.questionId,
              )
            : authorPaths.questions(event.eventId, challenge.challengeId)
        }
      >
        <ArrowLeftIcon size={16} aria-hidden="true" />{' '}
        {question ? 'Question detail' : 'Questions'}
      </Link>
      <div className="author-panel__heading">
        <div>
          <h5>{question ? 'Edit question' : 'New question'}</h5>
          <p className="field-help">
            {challengeFormatLabel(challenge.format)} challenge
          </p>
        </div>
        {question ? <StatusBadge status={question.status} /> : null}
      </div>
      <AuthorFeedback error={apiError} refObject={feedbackRef} />
      <FormField
        error={errors.prompt}
        label="Question prompt"
        name="question-prompt"
      >
        <textarea
          aria-describedby={errors.prompt ? 'question-prompt-error' : undefined}
          aria-invalid={Boolean(errors.prompt)}
          disabled={busy}
          id="question-prompt"
          onChange={(change) =>
            setDraft((current) => ({ ...current, prompt: change.target.value }))
          }
          required
          rows={3}
          value={draft.prompt}
        />
      </FormField>
      <FormField
        error={errors.difficulty}
        label="Difficulty"
        name="question-difficulty"
      >
        <select
          aria-describedby={
            errors.difficulty ? 'question-difficulty-error' : undefined
          }
          aria-invalid={Boolean(errors.difficulty)}
          disabled={busy}
          id="question-difficulty"
          onChange={(change) =>
            setDraft((current) => ({
              ...current,
              difficulty: Number(change.target.value) as 1 | 2 | 3,
            }))
          }
          value={draft.difficulty}
        >
          <option value="1">1 — introductory</option>
          <option value="2">2 — intermediate</option>
          <option value="3">3 — demanding</option>
        </select>
      </FormField>
      {draft.format === 'ordering' ? (
        <fieldset className="author-fieldset" disabled={busy}>
          <legend>Correct sequence</legend>
          <p className="field-help">
            Enter exactly four items in their correct order. Players receive a
            shuffled sequence; only the API stores and marks this order.
          </p>
          {draft.items.map((item, index) => (
            <FormField
              error={errors[`item${index}`]}
              key={index}
              label={`Correct position ${index + 1}`}
              name={`question-item-${index + 1}`}
            >
              <input
                aria-describedby={
                  errors[`item${index}`]
                    ? `question-item-${index + 1}-error`
                    : undefined
                }
                aria-invalid={Boolean(errors[`item${index}`])}
                id={`question-item-${index + 1}`}
                onChange={(change) =>
                  setDraft((current) =>
                    current.format === 'ordering'
                      ? {
                          ...current,
                          items: current.items.map((currentItem, itemIndex) =>
                            itemIndex === index
                              ? change.target.value
                              : currentItem,
                          ),
                        }
                      : current,
                  )
                }
                required
                type="text"
                value={item}
              />
            </FormField>
          ))}
        </fieldset>
      ) : (
        <fieldset className="author-fieldset" disabled={busy}>
          <legend>Choices and accepted answer</legend>
          <p className="field-help">
            Choose exactly one accepted answer. This marking relationship is
            visible only in the protected author console.
          </p>
          {draft.choices.map((choice, index) => (
            <div className="choice-field" key={index}>
              <input
                aria-label={`Mark choice ${index + 1} as accepted`}
                checked={draft.acceptedChoicePosition === index + 1}
                name="accepted-answer"
                onChange={() =>
                  setDraft((current) =>
                    current.format === 'multiple_choice'
                      ? { ...current, acceptedChoicePosition: index + 1 }
                      : current,
                  )
                }
                type="radio"
              />
              <FormField
                error={errors[`choice${index}`]}
                label={`Choice ${index + 1}`}
                name={`question-choice-${index + 1}`}
              >
                <input
                  aria-describedby={
                    errors[`choice${index}`]
                      ? `question-choice-${index + 1}-error`
                      : undefined
                  }
                  aria-invalid={Boolean(errors[`choice${index}`])}
                  id={`question-choice-${index + 1}`}
                  onChange={(change) =>
                    setDraft((current) =>
                      current.format === 'multiple_choice'
                        ? {
                            ...current,
                            choices: current.choices.map(
                              (currentChoice, choiceIndex) =>
                                choiceIndex === index
                                  ? change.target.value
                                  : currentChoice,
                            ),
                          }
                        : current,
                    )
                  }
                  required
                  type="text"
                  value={choice}
                />
              </FormField>
            </div>
          ))}
        </fieldset>
      )}
      <FormField
        error={errors.explanation}
        label="Author explanation"
        name="question-explanation"
      >
        <textarea
          aria-describedby={`${errors.explanation ? 'question-explanation-error ' : ''}question-explanation-help`.trim()}
          aria-invalid={Boolean(errors.explanation)}
          disabled={busy}
          id="question-explanation"
          onChange={(change) =>
            setDraft((current) => ({
              ...current,
              explanation: change.target.value,
            }))
          }
          required
          rows={3}
          value={draft.explanation}
        />
        <span className="field-help" id="question-explanation-help">
          {draft.format === 'ordering'
            ? 'Required for publication and revealed only in the API-completed player review.'
            : 'Required for publication and excluded from player responses.'}
        </span>
      </FormField>
      <AuthorSaveBar
        busy={busy}
        dirty={dirty}
        failed={Boolean(apiError) || Object.values(errors).some(Boolean)}
        isNew={!question}
      >
        <button className="button" disabled={busy} type="submit">
          {busy
            ? 'Saving…'
            : question
              ? 'Save question'
              : 'Create draft question'}
        </button>
        <button
          className="button button--quiet"
          disabled={busy}
          onClick={() =>
            navigate(
              question
                ? authorPaths.question(
                    event.eventId,
                    challenge.challengeId,
                    question.questionId,
                  )
                : authorPaths.questions(event.eventId, challenge.challengeId),
            )
          }
          type="button"
        >
          Cancel
        </button>
      </AuthorSaveBar>
    </form>
  );
}

function StatusBadge({
  status,
}: {
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'retired';
}) {
  return (
    <span className={`status-badge status-badge--author-${status}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function lifecycleNotice(
  noun: 'challenge' | 'event' | 'question',
  status: 'approved' | 'draft' | 'in_review' | 'published' | 'retired',
) {
  const label = noun[0]!.toUpperCase() + noun.slice(1);
  if (noun === 'event' && status === 'published')
    return 'Event published and available to the player API according to its active times.';
  return {
    approved: `${label} approved.`,
    draft: `${label} returned to draft.`,
    in_review: `${label} submitted for independent review.`,
    published: `${label} published.`,
    retired: `${label} retired.`,
  }[status];
}

function ReadinessItem({
  children,
  ready,
  title,
}: {
  children: React.ReactNode;
  ready: boolean;
  title: string;
}) {
  return (
    <div
      className={`readiness-item readiness-item--${ready ? 'ready' : 'incomplete'}`}
    >
      <strong>
        {ready ? 'Ready' : 'Incomplete'} — {title}
      </strong>
      <p>{children}</p>
    </div>
  );
}

function FormField({
  children,
  error,
  label,
  name,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
  name: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error ? (
        <span className="field-error" id={`${name}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function eventDraft(event?: AuthorEvent): EventDraft {
  return event
    ? {
        description: event.description ?? '',
        endsAt: toDateTimeLocal(event.endsAt),
        latitude: String(event.latitude),
        longitude: String(event.longitude),
        radiusMetres: String(event.radiusMetres),
        startsAt: toDateTimeLocal(event.startsAt),
        title: event.title,
      }
    : {
        description: '',
        endsAt: '',
        latitude: '',
        longitude: '',
        radiusMetres: '',
        startsAt: '',
        title: '',
      };
}

function validateEventDraft(draft: EventDraft): {
  errors: Record<string, string>;
  input?: AuthorEventInput;
} {
  const errors: Record<string, string> = {};
  const latitude = Number(draft.latitude);
  const longitude = Number(draft.longitude);
  const radius = Number(draft.radiusMetres);
  if (!draft.title.trim()) errors.title = 'Enter an event title.';
  if (draft.description.length > 0 && !draft.description.trim())
    errors.description =
      'Remove the blank description or enter meaningful text.';
  if (
    !draft.latitude ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  )
    errors.latitude = 'Enter a latitude from -90 to 90.';
  if (
    !draft.longitude ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    errors.longitude = 'Enter a longitude from -180 to 180.';
  if (!draft.radiusMetres || !Number.isInteger(radius) || radius <= 0)
    errors.radiusMetres = 'Enter a positive whole-number radius.';
  const start = new Date(draft.startsAt);
  const end = new Date(draft.endsAt);
  if (!draft.startsAt || Number.isNaN(start.getTime()))
    errors.startsAt = 'Enter a valid start time.';
  if (!draft.endsAt || Number.isNaN(end.getTime()))
    errors.endsAt = 'Enter a valid end time.';
  else if (!errors.startsAt && end.getTime() <= start.getTime())
    errors.endsAt = 'The end time must be after the start time.';
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      description: draft.description.trim() || null,
      endsAt: end.toISOString(),
      latitude,
      longitude,
      radiusMetres: radius,
      startsAt: start.toISOString(),
      title: draft.title.trim(),
    },
  };
}

function SourceEvidenceList({ sourceUrls }: { sourceUrls: readonly string[] }) {
  return (
    <section className="author-summary-block author-summary-block--plain">
      <h6>Source evidence</h6>
      <ul>
        {sourceUrls.map((sourceUrl, index) => (
          <li key={sourceUrl}>
            <a href={sourceUrl} rel="noreferrer" target="_blank">
              Source {index + 1}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function questionDraft(
  challengeFormat: ChallengeFormat,
  question?: AuthorQuestion,
): AuthorQuestionInput {
  if (question?.format === 'ordering') {
    return {
      difficulty: question.difficulty,
      explanation: question.explanation ?? '',
      format: 'ordering',
      items: [...question.items]
        .sort((left, right) => left.position - right.position)
        .map((item) => item.text),
      prompt: question.prompt,
    };
  }

  if (question?.format === 'multiple_choice') {
    return {
      acceptedChoicePosition: question.acceptedChoicePosition ?? 1,
      choices: [...question.choices]
        .sort((left, right) => left.position - right.position)
        .map((choice) => choice.text),
      difficulty: question.difficulty,
      explanation: question.explanation ?? '',
      format: 'multiple_choice',
      prompt: question.prompt,
    };
  }

  return challengeFormat === 'ordering'
    ? {
        difficulty: 1,
        explanation: '',
        format: 'ordering',
        items: ['', '', '', ''],
        prompt: '',
      }
    : {
        acceptedChoicePosition: 1,
        choices: ['', '', '', ''],
        difficulty: 1,
        explanation: '',
        format: 'multiple_choice',
        prompt: '',
      };
}

function validateQuestion(draft: AuthorQuestionInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.prompt.trim()) errors.prompt = 'Enter a question prompt.';
  if (![1, 2, 3].includes(draft.difficulty))
    errors.difficulty = 'Choose difficulty 1, 2, or 3.';
  if (draft.format === 'ordering') {
    draft.items.forEach((item, index) => {
      if (!item.trim()) errors[`item${index}`] = 'Enter item text.';
    });
  } else {
    draft.choices.forEach((choice, index) => {
      if (!choice.trim()) errors[`choice${index}`] = 'Enter choice text.';
    });
  }
  if (!draft.explanation.trim())
    errors.explanation =
      'Enter the author explanation required for publication.';
  return errors;
}

function parseCoordinate(latitude: string, longitude: string) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return latitude &&
    longitude &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
    ? { latitude: lat, longitude: lng }
    : null;
}

function parseRadius(radiusMetres: string): number | null {
  const radius = Number(radiusMetres);
  return radiusMetres && Number.isInteger(radius) && radius > 0 ? radius : null;
}

function eventScheduleState(
  event: AuthorEvent,
): 'current' | 'ended' | 'upcoming' {
  const now = Date.now();
  if (Date.parse(event.startsAt) > now) return 'upcoming';
  if (Date.parse(event.endsAt) < now) return 'ended';
  return 'current';
}

function eventScheduleLabel(event: AuthorEvent) {
  const state = eventScheduleState(event);
  if (state === 'current') return 'In schedule window';
  if (state === 'upcoming')
    return `Starts ${formatAuthorDateTime(event.startsAt)}`;
  return `Ended ${formatAuthorDateTime(event.endsAt)}`;
}

function formatAuthorDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function questionPromptExcerpt(prompt: string) {
  const normalized = prompt.trim();
  return normalized.length > 92 ? `${normalized.slice(0, 89)}…` : normalized;
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toAuthorError(error: unknown): AuthorApiError {
  return error instanceof AuthorApiError
    ? error
    : new AuthorApiError(
        'unavailable',
        'The API is unavailable. No content change was confirmed.',
      );
}

function handleOperationError(
  error: unknown,
  setApiError: (error: AuthorApiError) => void,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  formRef: React.RefObject<HTMLFormElement | null>,
  feedbackRef: React.RefObject<HTMLDivElement | null>,
) {
  const authorError = toAuthorError(error);
  setApiError(authorError);
  if (authorError.validation.length > 0) {
    setErrors((current) => ({
      ...current,
      ...Object.fromEntries(
        authorError.validation.map((failure) => [
          apiFieldName(failure.field),
          failure.message,
        ]),
      ),
    }));
    window.setTimeout(() =>
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus(),
    );
  } else window.setTimeout(() => feedbackRef.current?.focus());
}

function apiFieldName(field: string): string {
  const normalized = field.replace(/^\/body\//, '').replace(/^\//, '');
  if (normalized.startsWith('choices/'))
    return `choice${normalized.split('/')[1] ?? '0'}`;
  if (normalized.startsWith('items/'))
    return `item${normalized.split('/')[1] ?? '0'}`;
  if (normalized === 'radiusMetres') return 'radiusMetres';
  return normalized;
}

function challengeFormatLabel(format: ChallengeFormat): string {
  return format === 'ordering' ? 'Ordering' : 'Multiple choice';
}

function challengeCollectionKey(eventId: string): `challenges:${string}` {
  return `challenges:${eventId}`;
}

function questionCollectionKey(challengeId: string): `questions:${string}` {
  return `questions:${challengeId}`;
}

function isUncertainError(error: unknown): boolean {
  return !(error instanceof AuthorApiError) || error.failure === 'unavailable';
}

function reconcileEventById(
  events: readonly AuthorEvent[],
  authoritative: AuthorEvent,
): AuthorEvent[] {
  return events.some((event) => event.eventId === authoritative.eventId)
    ? events.map((event) =>
        event.eventId === authoritative.eventId ? authoritative : event,
      )
    : [authoritative, ...events];
}

function reconcileChallengeById(
  challenges: readonly AuthorChallenge[],
  authoritative: AuthorChallenge,
): AuthorChallenge[] {
  return challenges.some(
    (challenge) => challenge.challengeId === authoritative.challengeId,
  )
    ? challenges.map((challenge) =>
        challenge.challengeId === authoritative.challengeId
          ? authoritative
          : challenge,
      )
    : [...challenges, authoritative];
}

function reconcileQuestionById(
  questions: readonly AuthorQuestion[],
  authoritative: AuthorQuestion,
): AuthorQuestion[] {
  return questions.some(
    (question) => question.questionId === authoritative.questionId,
  )
    ? questions.map((question) =>
        question.questionId === authoritative.questionId
          ? authoritative
          : question,
      )
    : [...questions, authoritative];
}

function announce(
  message: string,
  setMessage: (message: string) => void,
  feedbackRef: React.RefObject<HTMLDivElement | null>,
  isCurrent: () => boolean = () => true,
) {
  window.setTimeout(() => {
    if (!isCurrent()) return;
    setMessage(message);
    window.setTimeout(() => {
      if (isCurrent()) feedbackRef.current?.focus();
    });
  });
}
