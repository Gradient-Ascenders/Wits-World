import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  AuthorApiError,
  createAuthorChallenge,
  createAuthorEvent,
  createAuthorQuestion,
  listAuthorChallenges,
  listAuthorEvents,
  listAuthorQuestions,
  publishAuthorChallenge,
  publishAuthorEvent,
  publishAuthorQuestion,
  retireAuthorChallenge,
  retireAuthorEvent,
  retireAuthorQuestion,
  updateAuthorEvent,
  updateAuthorQuestion,
  type AuthorCard,
  type AuthorChallenge,
  type AuthorEvent,
  type AuthorEventInput,
  type AuthorQuestion,
  type AuthorQuestionInput,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import type { MapFactory } from '../exploration/map-provider';
import { AuthorFeedback } from './AuthorFeedback';
import { AuthorLocationMap } from './AuthorLocationMap';

interface EventWorkspaceProps {
  apiBaseUrl: string;
  cards: readonly AuthorCard[];
  cardsState: 'error' | 'loading' | 'ready';
  getAccessToken: ApiAccessTokenProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
  onOpenCards: () => void;
  onReloadCards: () => void;
}

type LoadState = 'error' | 'loading' | 'ready';

export function EventWorkspace({
  apiBaseUrl,
  cards,
  cardsState,
  getAccessToken,
  mapFactory,
  mapboxAccessToken,
  onOpenCards,
  onReloadCards,
}: EventWorkspaceProps) {
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dirtyEventId, setDirtyEventId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const interactionRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingEventsRef = useRef(new Map<string, AuthorEvent>());

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState('loading');

    try {
      const nextEvents = await listAuthorEvents({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setEvents(nextEvents);
      setSelectedId((current) => {
        const next =
          current && nextEvents.some((event) => event.eventId === current)
            ? current
            : (nextEvents[0]?.eventId ?? null);
        selectedIdRef.current = next;
        creatingRef.current = false;
        interactionRef.current += 1;
        return next;
      });
      setState('ready');
      setLoadError('');
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(
        error instanceof AuthorApiError
          ? error.detail
          : 'Events could not be loaded.',
      );
      setState('error');
    }
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, [load]);

  const selected = events.find((event) => event.eventId === selectedId) ?? null;

  function selectEvent(eventId: string | null, creatingEvent = false) {
    interactionRef.current += 1;
    if (eventId) {
      const pending = pendingEventsRef.current.get(eventId);
      if (pending) {
        setEvents((current) => reconcileEventById(current, pending));
        pendingEventsRef.current.delete(eventId);
      }
    }
    selectedIdRef.current = eventId;
    creatingRef.current = creatingEvent;
    setCreating(creatingEvent);
    setSelectedId(eventId);
    setMessage('');
  }

  function updateEvent(
    event: AuthorEvent,
    ownerId: string | 'new',
    interaction: number,
    notice?: string,
  ) {
    const isCurrentInteraction =
      mountedRef.current &&
      interactionRef.current === interaction &&
      (ownerId === 'new'
        ? creatingRef.current
        : selectedIdRef.current === ownerId);
    const wouldReplaceNewerDraft =
      selectedIdRef.current === event.eventId && !isCurrentInteraction;

    if (wouldReplaceNewerDraft)
      pendingEventsRef.current.set(event.eventId, event);
    else setEvents((current) => reconcileEventById(current, event));

    if (!isCurrentInteraction) return;
    selectedIdRef.current = event.eventId;
    creatingRef.current = false;
    setSelectedId(event.eventId);
    setCreating(false);
    setDirtyEventId((current) => (current === event.eventId ? null : current));
    if (notice)
      announce(
        notice,
        setMessage,
        feedbackRef,
        () =>
          mountedRef.current &&
          interactionRef.current === interaction &&
          selectedIdRef.current === event.eventId,
      );
  }

  const updateEventDirty = useCallback((eventId: string, dirty: boolean) => {
    setDirtyEventId((current) =>
      dirty ? eventId : current === eventId ? null : current,
    );
  }, []);

  return (
    <section
      aria-labelledby="events-workspace-title"
      className="author-workspace"
    >
      <header className="author-workspace__heading">
        <div>
          <p className="eyebrow">Playable content</p>
          <h2 id="events-workspace-title">Events & challenges</h2>
        </div>
        <button
          className="button"
          onClick={() => selectEvent(null, true)}
          type="button"
        >
          Create event
        </button>
      </header>

      <AuthorFeedback message={message} refObject={feedbackRef} />

      {state === 'loading' ? (
        <p className="author-state" role="status">
          Loading authored events…
        </p>
      ) : null}

      {state === 'error' ? (
        <div className="author-state author-state--error" role="alert">
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

      {state === 'ready' && events.length === 0 && !creating ? (
        <div className="author-state">
          <strong>No authored events yet.</strong>
          <p>Create a draft event to begin the Basic publication workflow.</p>
        </div>
      ) : null}

      {state === 'ready' && (events.length > 0 || creating) ? (
        <div
          className={`author-split-view${events.length === 0 ? ' author-split-view--single' : ''}`}
        >
          {events.length > 0 ? (
            <aside aria-label="Authored events" className="author-record-list">
              <p className="author-record-list__label">Events</p>
              <ul>
                {events.map((event) => (
                  <li key={event.eventId}>
                    <button
                      aria-current={
                        selectedId === event.eventId ? 'true' : undefined
                      }
                      className="author-record-list__item"
                      onClick={() => selectEvent(event.eventId)}
                      type="button"
                    >
                      <span>{event.title}</span>
                      <StatusBadge status={event.authoringStatus} />
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <div className="author-editor">
            {creating ? (
              <EventForm
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
                key="new-event"
                mapFactory={mapFactory}
                mapboxAccessToken={mapboxAccessToken}
                interaction={interactionRef.current}
                onDirtyChange={updateEventDirty}
                onCancel={() => {
                  selectEvent(events[0]?.eventId ?? null);
                }}
                onSaved={updateEvent}
              />
            ) : selected ? (
              <>
                <EventForm
                  apiBaseUrl={apiBaseUrl}
                  event={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  key={`${selected.eventId}:${selected.updatedAt}:${selected.authoringStatus}`}
                  mapFactory={mapFactory}
                  mapboxAccessToken={mapboxAccessToken}
                  onDirtyChange={updateEventDirty}
                  onSaved={updateEvent}
                />
                <ChallengeWorkspace
                  apiBaseUrl={apiBaseUrl}
                  cards={cards}
                  cardsState={cardsState}
                  event={selected}
                  eventDirty={dirtyEventId === selected.eventId}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  key={selected.eventId}
                  onEventChanged={updateEvent}
                  onOpenCards={onOpenCards}
                  onReloadCards={onReloadCards}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface EventFormProps {
  apiBaseUrl: string;
  event?: AuthorEvent;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
  onCancel?: () => void;
  onDirtyChange: (eventId: string, dirty: boolean) => void;
  onSaved: (
    event: AuthorEvent,
    ownerId: string | 'new',
    interaction: number,
    notice?: string,
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

function EventForm({
  apiBaseUrl,
  event,
  getAccessToken,
  interaction,
  mapFactory,
  mapboxAccessToken,
  onCancel,
  onDirtyChange,
  onSaved,
}: EventFormProps) {
  const [draft, setDraft] = useState<EventDraft>(() => eventDraft(event));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);

  useEffect(() => {
    setDraft(eventDraft(event));
    setErrors({});
    setApiError(null);
    setConfirmRetire(false);
  }, [event]);

  useEffect(() => {
    interactionActiveRef.current = true;
    return () => {
      interactionActiveRef.current = false;
    };
  }, []);

  const dirty = Boolean(
    event && JSON.stringify(draft) !== JSON.stringify(eventDraft(event)),
  );

  useEffect(() => {
    if (event) onDirtyChange(event.eventId, dirty);
    return () => {
      if (event) onDirtyChange(event.eventId, false);
    };
  }, [dirty, event, onDirtyChange]);

  const coordinate = parseCoordinate(draft.latitude, draft.longitude);
  const editable =
    event?.authoringStatus !== 'published' &&
    event?.authoringStatus !== 'retired';

  function setField(field: keyof EventDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
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

    try {
      const saved = event
        ? await updateAuthorEvent({
            apiBaseUrl,
            eventId: event.eventId,
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
      onSaved(
        saved,
        ownerId,
        interaction,
        event ? 'Event changes saved.' : 'Draft event created.',
      );
    } catch (error) {
      if (operationRef.current !== controller || !interactionActiveRef.current)
        return;
      handleOperationError(error, setApiError, setErrors, formRef, feedbackRef);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        if (interactionActiveRef.current) setBusy(false);
      }
    }
  }

  async function retireEvent() {
    if (!event) return;
    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = event.eventId;

    try {
      const next = await retireAuthorEvent({
        apiBaseUrl,
        eventId: event.eventId,
        getAccessToken,
        signal: controller.signal,
      });
      if (operationRef.current !== controller) return;
      onSaved(next, ownerId, interaction, 'Event retired.');
      if (interactionActiveRef.current) setConfirmRetire(false);
    } catch (error) {
      if (operationRef.current !== controller || !interactionActiveRef.current)
        return;
      handleOperationError(error, setApiError, setErrors, formRef, feedbackRef);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        if (interactionActiveRef.current) setBusy(false);
      }
    }
  }

  return (
    <section aria-labelledby="event-editor-title" className="author-panel">
      <header className="author-panel__heading">
        <div>
          <p className="eyebrow">Event definition</p>
          <h3 id="event-editor-title">{event ? event.title : 'New event'}</h3>
        </div>
        {event ? <StatusBadge status={event.authoringStatus} /> : null}
      </header>

      {!editable ? (
        <p className="author-notice">
          Published and retired event definitions are read-only. Retire a live
          event and create a replacement to change its content.
        </p>
      ) : null}

      <AuthorFeedback error={apiError} refObject={feedbackRef} />

      <form className="author-form" noValidate onSubmit={save} ref={formRef}>
        <FormField error={errors.title} label="Event title" name="event-title">
          <input
            aria-describedby={errors.title ? 'event-title-error' : undefined}
            aria-invalid={Boolean(errors.title)}
            disabled={!editable || busy}
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
            disabled={!editable || busy}
            id="event-description"
            onChange={(change) => setField('description', change.target.value)}
            rows={3}
            value={draft.description}
          />
        </FormField>

        <fieldset className="author-fieldset" disabled={!editable || busy}>
          <legend>Event position and radius</legend>
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
                onChange={(change) => setField('latitude', change.target.value)}
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
            <FormField
              error={errors.radiusMetres}
              label="Radius (metres)"
              name="event-radius"
            >
              <input
                aria-describedby={
                  errors.radiusMetres ? 'event-radius-error' : undefined
                }
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
            </FormField>
          </div>
        </fieldset>

        {coordinate ? (
          <AuthorLocationMap
            coordinate={coordinate}
            mapboxAccessToken={mapboxAccessToken}
            mapFactory={mapFactory}
            onChange={(next) => {
              setField('latitude', String(Number(next.latitude.toFixed(6))));
              setField('longitude', String(Number(next.longitude.toFixed(6))));
            }}
          />
        ) : (
          <p className="author-notice">
            Enter valid latitude and longitude values to open the placement map.
          </p>
        )}

        <fieldset className="author-fieldset" disabled={!editable || busy}>
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

        <div className="author-actions">
          {editable ? (
            <button className="button" disabled={busy} type="submit">
              {busy ? 'Saving…' : event ? 'Save event' : 'Create draft event'}
            </button>
          ) : null}
          {onCancel ? (
            <button
              className="button button--quiet"
              disabled={busy}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          ) : null}
          {event && event.authoringStatus !== 'retired' ? (
            <button
              className="button button--danger"
              disabled={busy}
              onClick={() => setConfirmRetire(true)}
              type="button"
            >
              Retire event
            </button>
          ) : null}
        </div>

        {confirmRetire ? (
          <div className="author-confirmation" role="alert">
            <strong>Retire this event permanently?</strong>
            <p>It will leave player discovery and cannot be republished.</p>
            <div className="author-actions">
              <button
                className="button button--danger"
                disabled={busy}
                onClick={() => void retireEvent()}
                type="button"
              >
                Confirm retirement
              </button>
              <button
                className="button button--quiet"
                disabled={busy}
                onClick={() => setConfirmRetire(false)}
                type="button"
              >
                Keep event
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

interface ChallengeWorkspaceProps {
  apiBaseUrl: string;
  cards: readonly AuthorCard[];
  cardsState: 'error' | 'loading' | 'ready';
  event: AuthorEvent;
  eventDirty: boolean;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  onEventChanged: (
    event: AuthorEvent,
    ownerId: string,
    interaction: number,
    notice?: string,
  ) => void;
  onOpenCards: () => void;
  onReloadCards: () => void;
}

function ChallengeWorkspace({
  apiBaseUrl,
  cards,
  cardsState,
  event,
  eventDirty,
  getAccessToken,
  interaction,
  onEventChanged,
  onOpenCards,
  onReloadCards,
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
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const challengeRequestRef = useRef<AbortController | null>(null);
  const questionRequestRef = useRef<AbortController | null>(null);
  const operationRef = useRef<AbortController | null>(null);
  const selectedChallengeIdRef = useRef<string | null>(null);
  const challengeInteractionRef = useRef(0);
  const interactionActiveRef = useRef(true);

  const loadChallenges = useCallback(async () => {
    challengeRequestRef.current?.abort();
    const controller = new AbortController();
    challengeRequestRef.current = controller;
    setState('loading');
    setChallenges([]);
    selectedChallengeIdRef.current = null;
    challengeInteractionRef.current += 1;
    setSelectedChallengeId(null);
    setQuestions([]);
    setQuestionsState('loading');
    setQuestionsError(null);
    setApiError(null);

    try {
      const next = await listAuthorChallenges({
        apiBaseUrl,
        eventId: event.eventId,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setChallenges(next);
      setSelectedChallengeId((current) => {
        const nextId =
          current && next.some((challenge) => challenge.challengeId === current)
            ? current
            : (next.find((challenge) => challenge.status !== 'retired')
                ?.challengeId ??
              next[0]?.challengeId ??
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
  }, [apiBaseUrl, event.eventId, getAccessToken]);

  useEffect(() => {
    interactionActiveRef.current = true;
    void loadChallenges();
    return () => {
      interactionActiveRef.current = false;
      challengeRequestRef.current?.abort();
      questionRequestRef.current?.abort();
    };
  }, [loadChallenges]);

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
    setQuestionsState('loading');
    try {
      const next = await listAuthorQuestions({
        apiBaseUrl,
        challengeId: selectedChallengeId,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setQuestions(next);
      setQuestionsState('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setQuestions([]);
      setQuestionsError(toAuthorError(error));
      setQuestionsState('error');
    }
  }, [apiBaseUrl, getAccessToken, selectedChallengeId]);

  useEffect(() => {
    void loadQuestions();
    return () => questionRequestRef.current?.abort();
  }, [loadQuestions]);

  useEffect(() => setConfirmRetire(false), [selectedChallengeId]);

  const selected =
    challenges.find(
      (challenge) => challenge.challengeId === selectedChallengeId,
    ) ?? null;
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

  function beginOperation() {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
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
    setConfirmRetire(false);
    selectedChallengeIdRef.current = challengeId;
    setSelectedChallengeId(challengeId);
    setQuestions([]);
    setQuestionsState('loading');
    setQuestionsError(null);
    setMessage('');
    setApiError(null);
  }

  async function createChallenge() {
    const controller = beginOperation();
    const startingChallengeId = selectedChallengeIdRef.current;
    const startingInteraction = challengeInteractionRef.current;
    let focusChallengeId: string | null = null;
    let focusInteraction: number | null = null;
    try {
      const challenge = await createAuthorChallenge({
        apiBaseUrl,
        eventId: event.eventId,
        getAccessToken,
        signal: controller.signal,
      });
      if (operationRef.current !== controller) return;
      if (interactionActiveRef.current)
        setChallenges((current) => reconcileChallengeById(current, challenge));
      if (
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === startingChallengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        selectChallenge(challenge.challengeId);
        focusChallengeId = challenge.challengeId;
        focusInteraction = challengeInteractionRef.current;
        setMessage('Draft challenge associated with this event.');
      }
    } catch (error) {
      if (
        operationRef.current === controller &&
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

  async function challengeLifecycle(action: 'publish' | 'retire') {
    if (!selected) return;
    const controller = beginOperation();
    const challengeId = selected.challengeId;
    const startingInteraction = challengeInteractionRef.current;
    let shouldFocus = false;
    try {
      const next =
        action === 'publish'
          ? await publishAuthorChallenge({
              apiBaseUrl,
              challengeId,
              getAccessToken,
              signal: controller.signal,
            })
          : await retireAuthorChallenge({
              apiBaseUrl,
              challengeId,
              getAccessToken,
              signal: controller.signal,
            });
      if (operationRef.current !== controller) return;
      if (interactionActiveRef.current)
        setChallenges((current) => reconcileChallengeById(current, next));
      if (
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === challengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        setMessage(
          action === 'publish' ? 'Challenge published.' : 'Challenge retired.',
        );
        setConfirmRetire(false);
        shouldFocus = true;
      }
    } catch (error) {
      if (
        operationRef.current === controller &&
        interactionActiveRef.current &&
        selectedChallengeIdRef.current === challengeId &&
        challengeInteractionRef.current === startingInteraction
      ) {
        setApiError(toAuthorError(error));
        shouldFocus = true;
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

  async function publishEvent() {
    if (eventDirty) return;
    const controller = beginOperation();
    let shouldFocus = false;
    try {
      const next = await publishAuthorEvent({
        apiBaseUrl,
        eventId: event.eventId,
        getAccessToken,
        signal: controller.signal,
      });
      if (operationRef.current !== controller) return;
      onEventChanged(next, event.eventId, interaction);
      if (interactionActiveRef.current) {
        setMessage(
          'Event published and available to the player API according to its active times.',
        );
        shouldFocus = true;
      }
    } catch (error) {
      if (operationRef.current === controller && interactionActiveRef.current) {
        setApiError(toAuthorError(error));
        shouldFocus = true;
      }
    } finally {
      if (finishOperation(controller) && shouldFocus)
        window.setTimeout(() => {
          if (interactionActiveRef.current) feedbackRef.current?.focus();
        });
    }
  }

  return (
    <section aria-labelledby="challenge-editor-title" className="author-panel">
      <header className="author-panel__heading">
        <div>
          <p className="eyebrow">Content association</p>
          <h3 id="challenge-editor-title">Challenge & publication</h3>
        </div>
        <button
          className="button button--quiet"
          disabled={busy}
          onClick={() => void createChallenge()}
          type="button"
        >
          Create challenge
        </button>
      </header>

      <AuthorFeedback
        error={apiError}
        message={message}
        refObject={feedbackRef}
      />

      <div className="readiness-grid" aria-label="Publication requirements">
        <ReadinessItem
          ready={
            challenges.filter((challenge) => challenge.status === 'published')
              .length === 1
          }
          title="Published challenge"
        >
          Exactly one is required.
        </ReadinessItem>
        <ReadinessItem
          ready={publishedQuestions >= 5}
          title="Published questions"
        >
          {publishedQuestions} of at least 5 in the selected challenge.
        </ReadinessItem>
        <ReadinessItem
          ready={hasAuthoritativeCommon}
          title="Common reward catalogue"
        >
          {cardsState === 'loading'
            ? 'Checking catalogue…'
            : cardsState === 'error'
              ? 'Catalogue could not be checked.'
              : hasActiveCommon
                ? 'At least one active Common card is available.'
                : 'Publish a Common card for server-selected rewards.'}
        </ReadinessItem>
      </div>
      <p className="field-help">
        This summary is guidance. The API rechecks every authoritative rule at
        publication time. Rewards use the global active catalogue; Basic has no
        event-to-card assignment.
      </p>
      <div className="author-actions">
        <button
          className="button button--quiet"
          onClick={onOpenCards}
          type="button"
        >
          Open card catalogue
        </button>
        {cardsState === 'error' ? (
          <button
            className="button button--quiet"
            onClick={onReloadCards}
            type="button"
          >
            Check catalogue again
          </button>
        ) : null}
        {event.authoringStatus === 'draft' ? (
          <button
            className="button"
            aria-describedby={eventDirty ? 'event-publish-dirty' : undefined}
            disabled={busy || eventDirty}
            onClick={() => void publishEvent()}
            type="button"
          >
            Ask API to publish event
          </button>
        ) : null}
      </div>
      {eventDirty ? (
        <p className="author-notice" id="event-publish-dirty" role="status">
          Save event changes before publishing.
        </p>
      ) : null}

      {state === 'loading' ? (
        <p className="author-state" role="status">
          Loading event challenges…
        </p>
      ) : null}
      {state === 'error' ? (
        <button
          className="button button--quiet"
          onClick={() => void loadChallenges()}
          type="button"
        >
          Reload challenges
        </button>
      ) : null}
      {state === 'ready' && challenges.length === 0 ? (
        <div className="author-state">
          <strong>No challenge is associated.</strong>
          <p>
            Create one, add at least five questions, publish each question, then
            publish the challenge.
          </p>
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
              <option key={challenge.challengeId} value={challenge.challengeId}>
                Challenge {index + 1} — {challenge.status}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {selected ? (
        <>
          <div className="author-actions">
            {selected.status === 'draft' ? (
              <button
                className="button button--quiet"
                disabled={busy}
                onClick={() => void challengeLifecycle('publish')}
                type="button"
              >
                Publish challenge
              </button>
            ) : null}
            {selected.status !== 'retired' ? (
              <button
                className="button button--danger"
                disabled={busy}
                onClick={() => setConfirmRetire(true)}
                type="button"
              >
                Retire challenge
              </button>
            ) : null}
          </div>
          {confirmRetire ? (
            <div className="author-confirmation" role="alert">
              <strong>Retire this challenge permanently?</strong>
              <p>It cannot be edited or published again.</p>
              <div className="author-actions">
                <button
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => void challengeLifecycle('retire')}
                  type="button"
                >
                  Confirm retirement
                </button>
                <button
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => setConfirmRetire(false)}
                  type="button"
                >
                  Keep challenge
                </button>
              </div>
            </div>
          ) : null}
          {questionsState === 'loading' ? (
            <p className="author-state" role="status">
              Loading challenge questions…
            </p>
          ) : null}
          {questionsState === 'error' ? (
            <div className="author-state author-state--error" role="alert">
              <strong>Questions are unavailable.</strong>
              <p>{questionsError?.detail}</p>
              <button
                className="button button--quiet"
                onClick={() => void loadQuestions()}
                type="button"
              >
                Reload questions
              </button>
            </div>
          ) : null}
          {questionsState === 'ready' ? (
            <QuestionWorkspace
              apiBaseUrl={apiBaseUrl}
              challenge={selected}
              getAccessToken={getAccessToken}
              key={selected.challengeId}
              onQuestionsChange={setQuestions}
              questions={questions.filter(
                (question) => question.challengeId === selected.challengeId,
              )}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

interface QuestionWorkspaceProps {
  apiBaseUrl: string;
  challenge: AuthorChallenge;
  getAccessToken: ApiAccessTokenProvider;
  onQuestionsChange: React.Dispatch<React.SetStateAction<AuthorQuestion[]>>;
  questions: AuthorQuestion[];
}

function QuestionWorkspace({
  apiBaseUrl,
  challenge,
  getAccessToken,
  onQuestionsChange,
  questions,
}: QuestionWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | 'new'>('new');
  const [message, setMessage] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | 'new'>('new');
  const interactionRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingQuestionsRef = useRef(new Map<string, AuthorQuestion>());
  const selected = questions.find(
    (question) => question.questionId === selectedId,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      selectedId !== 'new' &&
      !questions.some((question) => question.questionId === selectedId)
    ) {
      interactionRef.current += 1;
      setSelectedId('new');
      selectedIdRef.current = 'new';
    }
  }, [questions, selectedId]);

  function selectQuestion(questionId: string | 'new') {
    interactionRef.current += 1;
    if (questionId !== 'new') {
      const pending = pendingQuestionsRef.current.get(questionId);
      if (pending) {
        onQuestionsChange((current) => reconcileQuestionById(current, pending));
        pendingQuestionsRef.current.delete(questionId);
      }
    }
    selectedIdRef.current = questionId;
    setSelectedId(questionId);
    setMessage('');
  }

  function updateQuestion(
    question: AuthorQuestion,
    ownerId: string | 'new',
    interaction: number,
    notice?: string,
  ) {
    if (!mountedRef.current) return;
    const isCurrentInteraction =
      interactionRef.current === interaction &&
      selectedIdRef.current === ownerId;
    const wouldReplaceNewerDraft =
      selectedIdRef.current === question.questionId && !isCurrentInteraction;

    if (wouldReplaceNewerDraft)
      pendingQuestionsRef.current.set(question.questionId, question);
    else
      onQuestionsChange((current) => reconcileQuestionById(current, question));

    if (!isCurrentInteraction) return;
    selectedIdRef.current = question.questionId;
    setSelectedId(question.questionId);
    if (notice)
      announce(
        notice,
        setMessage,
        feedbackRef,
        () =>
          mountedRef.current &&
          interactionRef.current === interaction &&
          selectedIdRef.current === question.questionId,
      );
  }

  return (
    <section aria-labelledby="questions-title" className="question-workspace">
      <div className="author-panel__heading">
        <div>
          <p className="eyebrow">Question bank</p>
          <h4 id="questions-title">Questions</h4>
        </div>
        <button
          className="button button--quiet"
          disabled={challenge.status === 'retired'}
          onClick={() => selectQuestion('new')}
          type="button"
        >
          Create question
        </button>
      </div>
      {questions.length === 0 ? (
        <p className="author-state">
          No questions yet. A published challenge needs at least five published
          questions.
        </p>
      ) : (
        <ul className="question-tabs" aria-label="Questions">
          {questions.map((question, index) => (
            <li key={question.questionId}>
              <button
                aria-current={
                  selectedId === question.questionId ? 'true' : undefined
                }
                className="question-tabs__item"
                onClick={() => selectQuestion(question.questionId)}
                type="button"
              >
                Q{index + 1} <StatusBadge status={question.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AuthorFeedback message={message} refObject={feedbackRef} />
      <QuestionForm
        apiBaseUrl={apiBaseUrl}
        challenge={challenge}
        getAccessToken={getAccessToken}
        interaction={interactionRef.current}
        key={
          selected
            ? `${selected.questionId}:${selected.updatedAt}:${selected.status}`
            : 'new-question'
        }
        onSaved={updateQuestion}
        question={selected}
      />
    </section>
  );
}

interface QuestionFormProps {
  apiBaseUrl: string;
  challenge: AuthorChallenge;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  onSaved: (
    question: AuthorQuestion,
    ownerId: string | 'new',
    interaction: number,
    notice?: string,
  ) => void;
  question?: AuthorQuestion;
}

function QuestionForm({
  apiBaseUrl,
  challenge,
  getAccessToken,
  interaction,
  onSaved,
  question,
}: QuestionFormProps) {
  const [draft, setDraft] = useState<AuthorQuestionInput>(() =>
    questionDraft(question),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);

  useEffect(() => {
    setDraft(questionDraft(question));
    setErrors({});
    setApiError(null);
    setConfirmRetire(false);
  }, [question]);

  useEffect(() => {
    interactionActiveRef.current = true;
    return () => {
      interactionActiveRef.current = false;
    };
  }, []);

  const dirty = Boolean(
    question &&
    JSON.stringify(draft) !== JSON.stringify(questionDraft(question)),
  );

  const editable =
    challenge.status !== 'retired' &&
    (!question || question.status === 'draft');

  async function save(submission: FormEvent) {
    submission.preventDefault();
    const nextErrors = validateQuestion(draft);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      window.setTimeout(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = question?.questionId ?? 'new';
    try {
      const saved = question
        ? await updateAuthorQuestion({
            apiBaseUrl,
            getAccessToken,
            input: draft,
            questionId: question.questionId,
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
      onSaved(
        saved,
        ownerId,
        interaction,
        question ? 'Question changes saved.' : 'Draft question created.',
      );
    } catch (error) {
      if (operationRef.current !== controller || !interactionActiveRef.current)
        return;
      handleOperationError(error, setApiError, setErrors, formRef, feedbackRef);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        if (interactionActiveRef.current) setBusy(false);
      }
    }
  }

  async function lifecycle(action: 'publish' | 'retire') {
    if (!question || (action === 'publish' && dirty)) return;
    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = question.questionId;
    try {
      const next =
        action === 'publish'
          ? await publishAuthorQuestion({
              apiBaseUrl,
              getAccessToken,
              questionId: question.questionId,
              signal: controller.signal,
            })
          : await retireAuthorQuestion({
              apiBaseUrl,
              getAccessToken,
              questionId: question.questionId,
              signal: controller.signal,
            });
      if (operationRef.current !== controller) return;
      onSaved(
        next,
        ownerId,
        interaction,
        action === 'publish' ? 'Question published.' : 'Question retired.',
      );
      if (interactionActiveRef.current) setConfirmRetire(false);
    } catch (error) {
      if (operationRef.current !== controller || !interactionActiveRef.current)
        return;
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
      className="author-form question-form"
      noValidate
      onSubmit={save}
      ref={formRef}
    >
      <div className="author-panel__heading">
        <h5>{question ? 'Edit question' : 'New question'}</h5>
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
          disabled={!editable || busy}
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
          disabled={!editable || busy}
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
      <fieldset className="author-fieldset" disabled={!editable || busy}>
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
                setDraft((current) => ({
                  ...current,
                  acceptedChoicePosition: index + 1,
                }))
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
                  setDraft((current) => ({
                    ...current,
                    choices: current.choices.map((item, itemIndex) =>
                      itemIndex === index ? change.target.value : item,
                    ),
                  }))
                }
                required
                type="text"
                value={choice}
              />
            </FormField>
          </div>
        ))}
      </fieldset>
      <FormField
        error={errors.explanation}
        label="Author explanation"
        name="question-explanation"
      >
        <textarea
          aria-describedby={`${errors.explanation ? 'question-explanation-error ' : ''}question-explanation-help`.trim()}
          aria-invalid={Boolean(errors.explanation)}
          disabled={!editable || busy}
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
          Required for publication and excluded from player responses.
        </span>
      </FormField>
      <div className="author-actions">
        {editable ? (
          <button className="button" disabled={busy} type="submit">
            {busy
              ? 'Saving…'
              : question
                ? 'Save question'
                : 'Create draft question'}
          </button>
        ) : null}
        {question?.status === 'draft' ? (
          <button
            className="button button--quiet"
            aria-describedby={dirty ? 'question-publish-dirty' : undefined}
            disabled={busy || dirty}
            onClick={() => void lifecycle('publish')}
            type="button"
          >
            Publish question
          </button>
        ) : null}
        {question && question.status !== 'retired' ? (
          <button
            className="button button--danger"
            disabled={busy}
            onClick={() => setConfirmRetire(true)}
            type="button"
          >
            Retire question
          </button>
        ) : null}
      </div>
      {dirty ? (
        <p className="author-notice" id="question-publish-dirty" role="status">
          Unsaved question changes. Save before publishing.
        </p>
      ) : null}
      {confirmRetire ? (
        <div className="author-confirmation" role="alert">
          <strong>Retire this question?</strong>
          <p>
            A published challenge must retain at least five published questions.
          </p>
          <div className="author-actions">
            <button
              className="button button--danger"
              disabled={busy}
              onClick={() => void lifecycle('retire')}
              type="button"
            >
              Confirm retirement
            </button>
            <button
              className="button button--quiet"
              onClick={() => setConfirmRetire(false)}
              type="button"
            >
              Keep question
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function StatusBadge({
  status,
}: {
  status: 'draft' | 'published' | 'retired';
}) {
  return (
    <span className={`status-badge status-badge--author-${status}`}>
      {status}
    </span>
  );
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

function questionDraft(question?: AuthorQuestion): AuthorQuestionInput {
  return question
    ? {
        acceptedChoicePosition: question.acceptedChoicePosition ?? 1,
        choices: [...question.choices]
          .sort((a, b) => a.position - b.position)
          .map((choice) => choice.text),
        difficulty: question.difficulty,
        explanation: question.explanation ?? '',
        prompt: question.prompt,
      }
    : {
        acceptedChoicePosition: 1,
        choices: ['', '', '', ''],
        difficulty: 1,
        explanation: '',
        prompt: '',
      };
}

function validateQuestion(draft: AuthorQuestionInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.prompt.trim()) errors.prompt = 'Enter a question prompt.';
  if (![1, 2, 3].includes(draft.difficulty))
    errors.difficulty = 'Choose difficulty 1, 2, or 3.';
  draft.choices.forEach((choice, index) => {
    if (!choice.trim()) errors[`choice${index}`] = 'Enter choice text.';
  });
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
  if (normalized === 'radiusMetres') return 'radiusMetres';
  return normalized;
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
