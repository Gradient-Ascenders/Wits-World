import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CircleIcon,
  LockKeyIcon,
  MapPinIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import {
  applyAuthorPlacement,
  AuthorApiError,
  createAuthorPlacementOverride,
  endAuthorPlacementOverride,
  getAuthorPlacementHistory,
  getAuthorPlacementState,
  previewAuthorPlacement,
  rollbackAuthorPlacement,
  type AuthorPlacementAssignment,
  type AuthorPlacementHistoryItem,
  type AuthorPlacementOverride,
  type AuthorPlacementPlan,
  type AuthorPlacementState,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { QuestMarker } from '../branding/QuestMarker';
import { LoadingState } from '../LoadingState';
import { StatusMessage } from '../StatusMessage';
import type { MapFactory } from '../exploration/map-provider';
import { AuthorConfirmationDialog } from './AuthorConfirmationDialog';
import { authorErrorDetail } from './author-error-copy';
import { EventPlacementMap } from './EventPlacementMap';

interface EventPlacementWorkspaceProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
}

type LoadState = 'error' | 'loading' | 'ready';
type HistoryLoadState = 'error' | 'loading' | 'ready';
type PlacementDetailTab = 'changes' | 'coverage' | 'history' | 'manual';
type OverrideChoice = 'exclude' | 'pause' | 'pin';
type PreviewFeedback = {
  title: string;
  message: string;
  tone: 'error' | 'info' | 'success' | 'warning';
};

const PLACEMENT_DETAIL_TABS: Array<{
  id: PlacementDetailTab;
  label: string;
}> = [
  { id: 'changes', label: 'Changes' },
  { id: 'coverage', label: 'Coverage & sites' },
  { id: 'manual', label: 'Manual controls' },
  { id: 'history', label: 'Recent history' },
];
type PendingAction =
  | { kind: 'apply' }
  | { kind: 'end_override'; override: AuthorPlacementOverride }
  | { kind: 'exclude'; durationHours: number; siteId: string }
  | { kind: 'pause'; durationHours: number }
  | {
      kind: 'pin';
      durationHours: number;
      eventId: string;
      siteId: string;
    }
  | { kind: 'rollback'; plan: AuthorPlacementHistoryItem };

export function EventPlacementWorkspace({
  apiBaseUrl,
  getAccessToken,
  mapFactory,
  mapboxAccessToken,
}: EventPlacementWorkspaceProps) {
  const loadAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const focusReviewAfterPreviewRef = useRef(false);
  const reviewApplyRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<AuthorPlacementState | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [state, setState] = useState<AuthorPlacementState | null>(null);
  const [history, setHistory] = useState<AuthorPlacementHistoryItem[]>([]);
  const [historyLoadState, setHistoryLoadState] =
    useState<HistoryLoadState>('loading');
  const [historyError, setHistoryError] = useState('');
  const [plan, setPlan] = useState<AuthorPlacementPlan | null>(null);
  const [previewFeedback, setPreviewFeedback] =
    useState<PreviewFeedback | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [focusSiteRequest, setFocusSiteRequest] = useState(0);
  const [activeDetailTab, setActiveDetailTab] =
    useState<PlacementDetailTab>('changes');
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'error' | 'info' | 'success';
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reason, setReason] = useState('');
  const [overrideChoice, setOverrideChoice] = useState<OverrideChoice>('pause');
  const [durationHours, setDurationHours] = useState(24);
  const [overrideSiteId, setOverrideSiteId] = useState('');
  const [overrideEventId, setOverrideEventId] = useState('');
  const [overrideError, setOverrideError] = useState('');

  const loadPlacementHistory = useCallback(async (): Promise<boolean> => {
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryLoadState('loading');
    try {
      const nextHistory = await getAuthorPlacementHistory({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      setHistory(nextHistory);
      setHistoryError('');
      setHistoryLoadState('ready');
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      setHistoryError(
        error instanceof AuthorApiError
          ? authorErrorDetail(error)
          : 'Recent placement history could not be loaded.',
      );
      setHistoryLoadState('error');
      return false;
    }
  }, [apiBaseUrl, getAccessToken]);

  const loadAuthoritativeState =
    useCallback(async (): Promise<AuthorPlacementState | null> => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      if (stateRef.current === null) setLoadState('loading');

      try {
        const nextState = await getAuthorPlacementState({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return null;
        stateRef.current = nextState;
        setState(nextState);
        setLoadState('ready');
        setLoadError('');
        setSelectedSiteId((current) =>
          current && nextState.sites.some((site) => site.id === current)
            ? current
            : (nextState.sites[0]?.id ?? null),
        );
        setOverrideSiteId((current) => current || nextState.sites[0]?.id || '');
        setOverrideEventId(
          (current) => current || nextState.events[0]?.id || '',
        );
        return nextState;
      } catch (error) {
        if (controller.signal.aborted) return null;
        const message =
          error instanceof AuthorApiError
            ? authorErrorDetail(error)
            : 'Placement state could not be loaded.';
        if (stateRef.current === null) {
          setLoadState('error');
          setLoadError(message);
        } else {
          setFeedback({ message, tone: 'error' });
        }
        return null;
      }
    }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    void loadAuthoritativeState();
    void loadPlacementHistory();
    return () => {
      loadAbortRef.current?.abort();
      historyAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
    };
  }, [loadAuthoritativeState, loadPlacementHistory]);

  useEffect(() => {
    if (plan !== null && focusReviewAfterPreviewRef.current) {
      focusReviewAfterPreviewRef.current = false;
      reviewApplyRef.current?.focus();
    }
  }, [plan]);

  const eventNames = useMemo(
    () => new Map(state?.events.map((event) => [event.id, event.title]) ?? []),
    [state?.events],
  );
  const siteNames = useMemo(
    () => new Map(state?.sites.map((site) => [site.id, site.name]) ?? []),
    [state?.sites],
  );

  async function refreshWorkspace() {
    setBusyAction('refresh');
    setFeedback(null);
    const previewStateVersion = plan?.stateVersion;
    const [refreshedState] = await Promise.all([
      loadAuthoritativeState(),
      loadPlacementHistory(),
    ]);
    if (refreshedState) {
      const previewWasSuperseded =
        previewStateVersion !== undefined &&
        refreshedState.stateVersion !== previewStateVersion;
      if (previewWasSuperseded) {
        setPlan(null);
        setPreviewFeedback(null);
      }
      setFeedback({
        message: previewWasSuperseded
          ? 'Live placement refreshed. A newer placement is active, so the old preview was cleared.'
          : 'Live placement refreshed.',
        tone: previewWasSuperseded ? 'info' : 'success',
      });
    }
    setBusyAction(null);
  }

  async function createPreview() {
    const currentState = stateRef.current;
    if (currentState === null) return;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusyAction('preview');
    setFeedback(null);
    setPreviewFeedback(null);
    try {
      const nextPlan = await previewAuthorPlacement({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      let previewBaseline = currentState;
      if (previewBaseline.stateVersion !== nextPlan.stateVersion) {
        const refreshedState = await loadAuthoritativeState();
        if (controller.signal.aborted) return;
        if (
          refreshedState === null ||
          refreshedState.stateVersion !== nextPlan.stateVersion
        ) {
          setPreviewFeedback({
            title: 'Placement changed while creating this preview',
            message:
              'The live placement and preview could not be synchronized. Create a new preview to review the latest placement.',
            tone: 'info',
          });
          return;
        }
        previewBaseline = refreshedState;
      }
      const summary = placementChangeSummary(previewBaseline, nextPlan);
      const hasChanges = previewHasChanges(summary);
      focusReviewAfterPreviewRef.current =
        nextPlan.status !== 'unserved' && hasChanges;
      setPlan(nextPlan);
      setActiveDetailTab('changes');
      setPreviewFeedback(previewMessage(nextPlan, summary));
    } catch (error) {
      if (controller.signal.aborted) return;
      setPreviewFeedback({
        title: 'Preview could not be created',
        message:
          error instanceof AuthorApiError
            ? authorErrorDetail(error)
            : 'The preview could not be created. Check your connection and try again.',
        tone: 'error',
      });
    } finally {
      if (!controller.signal.aborted) setBusyAction(null);
    }
  }

  function reviewOverride() {
    if (state === null) return;
    const hours = Math.trunc(durationHours);
    const maximumDuration =
      overrideChoice === 'pause'
        ? state.policy.maximumPauseHours
        : overrideChoice === 'exclude'
          ? state.policy.maximumExclusionHours
          : state.policy.maximumPinHours;
    if (!Number.isInteger(hours) || hours < 1) {
      setOverrideError('Enter a whole number of hours greater than zero.');
      return;
    }
    if (hours > maximumDuration) {
      setOverrideError(
        `This override can last no more than ${maximumDuration} hours.`,
      );
      return;
    }
    setOverrideError('');
    if (overrideChoice === 'pause') {
      setPendingAction({ durationHours: hours, kind: 'pause' });
    } else if (overrideChoice === 'exclude' && overrideSiteId) {
      setPendingAction({
        durationHours: hours,
        kind: 'exclude',
        siteId: overrideSiteId,
      });
    } else if (overrideChoice === 'pin' && overrideSiteId && overrideEventId) {
      setPendingAction({
        durationHours: hours,
        eventId: overrideEventId,
        kind: 'pin',
        siteId: overrideSiteId,
      });
    } else {
      setOverrideError('Choose the event and site required for this override.');
    }
  }

  async function confirmAction() {
    if (pendingAction === null || state === null) return;
    if (!reason.trim()) return;
    const action = pendingAction;
    if (action.kind === 'apply') {
      if (plan === null) return;
      if (plan.status === 'unserved') return;
      if (isExpired(plan.validUntil)) {
        setPendingAction(null);
        setPlan(null);
        setPreviewFeedback(null);
        setFeedback({
          message:
            'This preview expired. Create a new preview before applying.',
          tone: 'error',
        });
        return;
      }
    }
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusyAction(action.kind);
    setFeedback(null);
    try {
      if (action.kind === 'apply') {
        if (plan === null) return;
        await applyAuthorPlacement({
          apiBaseUrl,
          expectedVersion: plan.stateVersion,
          getAccessToken,
          planId: plan.planId,
          reason: reason.trim(),
          signal: controller.signal,
        });
      } else if (action.kind === 'rollback') {
        await rollbackAuthorPlacement({
          apiBaseUrl,
          expectedVersion: state.stateVersion,
          getAccessToken,
          reason: reason.trim(),
          signal: controller.signal,
          sourcePlanId: action.plan.planId,
        });
      } else if (action.kind === 'end_override') {
        await endAuthorPlacementOverride({
          apiBaseUrl,
          expectedVersion: state.stateVersion,
          getAccessToken,
          overrideId: action.override.id,
          reason: reason.trim(),
          signal: controller.signal,
        });
      } else {
        await createAuthorPlacementOverride({
          apiBaseUrl,
          durationHours: action.durationHours,
          ...(action.kind === 'pin' ? { eventId: action.eventId } : {}),
          expectedVersion: state.stateVersion,
          getAccessToken,
          idempotencyKey: crypto.randomUUID(),
          kind:
            action.kind === 'pause'
              ? 'automation_pause'
              : action.kind === 'exclude'
                ? 'site_exclusion'
                : 'pin',
          reason: reason.trim(),
          signal: controller.signal,
          ...(action.kind === 'pin' || action.kind === 'exclude'
            ? { siteId: action.siteId }
            : {}),
        });
      }
      if (controller.signal.aborted) return;
      setPendingAction(null);
      setPlan(null);
      setPreviewFeedback(null);
      setReason('');
      const refreshed = await loadAuthoritativeState();
      void loadPlacementHistory();
      if (refreshed) {
        setFeedback({ message: successMessage(action.kind), tone: 'success' });
      } else {
        setFeedback({
          message:
            'The placement operation completed, but the latest live state could not be loaded. Use Refresh live state before making another change.',
          tone: 'error',
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setPendingAction(null);
      await handleOperationError(error, action.kind === 'apply' ? plan : null);
    } finally {
      if (!controller.signal.aborted) setBusyAction(null);
    }
  }

  async function handleOperationError(
    error: unknown,
    attemptedPlan: AuthorPlacementPlan | null = null,
  ) {
    if (error instanceof AuthorApiError && error.failure === 'conflict') {
      setPlan(null);
      setPreviewFeedback(null);
      const refreshedState = await loadAuthoritativeState();
      void loadPlacementHistory();
      const reviewedPlanIsLive =
        refreshedState !== null &&
        attemptedPlan !== null &&
        assignmentsMatchPlan(refreshedState.assignments, attemptedPlan.entries);
      const placementIsNowHealthy =
        refreshedState !== null && isPlacementHealthy(refreshedState);
      setFeedback({
        message: reviewedPlanIsLive
          ? 'Placement was completed while you were reviewing. The latest live assignments are shown; no further action is needed.'
          : refreshedState && placementIsNowHealthy
            ? 'Another placement was completed while you were reviewing. The latest live assignments are shown; review them before creating another preview.'
            : refreshedState
              ? 'Placement changed while you were reviewing. The latest live state is shown; create a new preview if coverage still needs attention.'
              : 'Placement changed while you were reviewing it, and the latest state could not be loaded. Use Refresh live state before generating another preview.',
        tone: reviewedPlanIsLive || placementIsNowHealthy ? 'success' : 'error',
      });
      return;
    }
    setFeedback({
      message:
        error instanceof AuthorApiError
          ? authorErrorDetail(error)
          : 'The placement operation could not be completed. No change was confirmed.',
      tone: 'error',
    });
  }

  if (loadState === 'loading' || state === null) {
    return (
      <section aria-labelledby="placement-title" className="author-workspace">
        <div className="author-workspace__heading">
          <div>
            <h2 id="placement-title">Event placement</h2>
            <p>Loading live assignments, placement rules, and history.</p>
          </div>
        </div>
        {loadState === 'error' ? (
          <StatusMessage tone="error">
            <div>
              <strong>Placement workspace unavailable</strong>
              <p>{loadError}</p>
              <button
                className="button button--quiet"
                onClick={() => void loadAuthoritativeState()}
                type="button"
              >
                <ArrowClockwiseIcon aria-hidden="true" size={20} /> Retry
              </button>
            </div>
          </StatusMessage>
        ) : (
          <LoadingState label="Loading event placement…" />
        )}
      </section>
    );
  }

  const confirmation = confirmationFor(pendingAction, eventNames, siteNames);
  const maximumDuration =
    overrideChoice === 'pause'
      ? state.policy.maximumPauseHours
      : overrideChoice === 'exclude'
        ? state.policy.maximumExclusionHours
        : state.policy.maximumPinHours;
  const planExpired = plan !== null && isExpired(plan.validUntil);
  const coverageComplete = state.metrics.unservedZoneCount === 0;
  const applyBlocked =
    pendingAction?.kind === 'apply' &&
    (plan === null ||
      plan.status === 'unserved' ||
      planExpired ||
      !previewHasChanges(placementChangeSummary(state, plan)));
  const changeSummary = placementChangeSummary(state, plan);
  const planHasChanges = previewHasChanges(changeSummary);
  const canApplyPlan =
    plan !== null &&
    plan.status !== 'unserved' &&
    !planExpired &&
    planHasChanges;
  const placementHealthy = isPlacementHealthy(state);
  const previewHeading =
    plan !== null
      ? 'Preview changes'
      : placementHealthy
        ? 'Current placement'
        : 'Create a placement plan';

  return (
    <section
      aria-labelledby="placement-title"
      className="author-workspace placement-workspace"
    >
      <div className="author-workspace__heading placement-workspace__heading">
        <div>
          <h2 id="placement-title">Event placement</h2>
          <p>
            Keep every campus zone covered. Preview changes before they go live.
          </p>
        </div>
        <button
          className="button button--quiet"
          disabled={busyAction !== null}
          onClick={() => void refreshWorkspace()}
          type="button"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={20} /> Refresh live state
        </button>
      </div>

      <PlacementStateRibbon state={state} />

      {feedback ? (
        <StatusMessage className="placement-feedback" tone={feedback.tone}>
          <p>{feedback.message}</p>
        </StatusMessage>
      ) : null}

      <div className="placement-stage">
        <aside
          aria-label="Preview and validate placement changes"
          className="placement-stage__rail"
        >
          <section
            aria-labelledby="placement-preview-heading"
            aria-busy={busyAction === 'preview'}
            className="placement-preview"
          >
            <div className="placement-section-heading">
              <h3 id="placement-preview-heading">{previewHeading}</h3>
              {plan ? (
                <PlanStatus hasChanges={planHasChanges} status={plan.status} />
              ) : placementHealthy ? (
                <span className="placement-plan-status placement-plan-status--valid">
                  <CheckCircleIcon aria-hidden="true" size={17} /> Live
                </span>
              ) : null}
            </div>
            {busyAction === 'preview' ? (
              <div
                className="placement-preview__feedback"
                data-tone="progress"
                role="status"
              >
                <QuestMarker className="placement-preview__loader" />
                <span>
                  <strong>Creating preview</strong>
                  Checking coverage, separation, and placement rules…
                </span>
              </div>
            ) : previewFeedback ? (
              <div
                className="placement-preview__feedback"
                data-tone={previewFeedback.tone}
                role={previewFeedback.tone === 'error' ? 'alert' : 'status'}
              >
                {previewFeedback.tone === 'error' ||
                previewFeedback.tone === 'warning' ? (
                  <WarningCircleIcon aria-hidden="true" size={19} />
                ) : previewFeedback.tone === 'success' ? (
                  <CheckCircleIcon aria-hidden="true" size={19} />
                ) : (
                  <CircleIcon aria-hidden="true" size={19} />
                )}
                <span>
                  <strong>{previewFeedback.title}</strong>
                  {previewFeedback.message}
                </span>
              </div>
            ) : null}
            {plan === null ? (
              <>
                <p className="placement-preview__lead">
                  {state.metrics.activeZoneCount === 0
                    ? 'No active coverage zones are available.'
                    : placementHealthy
                      ? 'Placement is live and fully covered.'
                      : coverageComplete
                        ? `Coverage is live, but only ${state.metrics.activeAssignmentCount} of ${state.metrics.targetAssignmentCount} events are placed.`
                        : `${state.metrics.unservedZoneCount} active zone${state.metrics.unservedZoneCount === 1 ? ' needs' : 's need'} coverage.`}
                </p>
                <p>
                  {placementHealthy
                    ? `All ${state.metrics.activeZoneCount} active zones meet minimum coverage, and ${state.metrics.activeAssignmentCount} of ${state.metrics.targetAssignmentCount} target events are live. No unresolved placement failure remains.`
                    : state.metrics.activeZoneCount === 0
                      ? 'A preview cannot place events until at least one coverage zone is active.'
                      : 'Create a server-checked proposal. Nothing changes for players until you review and apply it.'}
                </p>
                <button
                  className={`button placement-preview__primary${placementHealthy ? ' button--quiet' : ''}`}
                  disabled={
                    busyAction !== null || state.metrics.activeZoneCount === 0
                  }
                  onClick={() => void createPreview()}
                  type="button"
                >
                  {busyAction === 'preview' ? (
                    <>
                      <QuestMarker className="placement-preview__loader" />
                      Creating preview…
                    </>
                  ) : previewFeedback?.tone === 'error' ? (
                    'Try preview again'
                  ) : placementHealthy ? (
                    'Preview another rotation'
                  ) : (
                    'Create coverage preview'
                  )}
                </button>
              </>
            ) : (
              <>
                <PlacementChangeSummary summary={changeSummary} />
                <CoverageValidation plan={plan} state={state} />
                {planExpired ? (
                  <p className="field-error">
                    This preview expired. Create a new preview before applying.
                  </p>
                ) : null}
                {!planHasChanges && !planExpired ? (
                  <p className="placement-preview__no-action">
                    Current assignments already match this preview. There is
                    nothing to apply.
                  </p>
                ) : null}
                <div className="placement-preview__actions">
                  {canApplyPlan ? (
                    <button
                      className="button placement-preview__primary"
                      disabled={busyAction !== null}
                      onClick={() => setPendingAction({ kind: 'apply' })}
                      ref={reviewApplyRef}
                      type="button"
                    >
                      <CheckCircleIcon aria-hidden="true" size={20} /> Review
                      and apply
                    </button>
                  ) : null}
                  <button
                    className="button button--quiet"
                    disabled={busyAction !== null}
                    onClick={() => void createPreview()}
                    type="button"
                  >
                    <ArrowClockwiseIcon aria-hidden="true" size={18} />
                    Recalculate preview
                  </button>
                  <button
                    className="button button--quiet"
                    disabled={busyAction !== null}
                    onClick={() => {
                      setPlan(null);
                      setFeedback(null);
                      setPreviewFeedback(null);
                    }}
                    type="button"
                  >
                    Discard preview
                  </button>
                </div>
              </>
            )}
          </section>
        </aside>

        <EventPlacementMap
          eventNames={eventNames}
          focusPointRequest={focusSiteRequest}
          mapFactory={mapFactory}
          mapboxAccessToken={mapboxAccessToken}
          onSelectedSiteChange={setSelectedSiteId}
          plan={plan}
          selectedSiteId={selectedSiteId}
          state={state}
        />

        <section
          aria-labelledby="placement-details-heading"
          className="placement-details"
        >
          <div className="placement-details__heading">
            <div>
              <h3 id="placement-details-heading">Placement details</h3>
              <p>Inspect changes or open secondary placement tools.</p>
            </div>
            <PlacementDetailTabs
              activeTab={activeDetailTab}
              onChange={setActiveDetailTab}
            />
          </div>
          <div
            aria-labelledby={`placement-tab-${activeDetailTab}`}
            className="placement-details__panel"
            id={`placement-panel-${activeDetailTab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {activeDetailTab === 'changes' ? (
              <AssignmentComparison
                eventNames={eventNames}
                plan={plan}
                siteNames={siteNames}
                state={state}
              />
            ) : activeDetailTab === 'coverage' ? (
              <>
                <CoverageAndSites
                  onLocate={(siteId) => {
                    setSelectedSiteId(siteId);
                    setFocusSiteRequest((current) => current + 1);
                  }}
                  plan={plan}
                  selectedSiteId={selectedSiteId}
                  state={state}
                />
                <PlacementPolicyDetails state={state} />
              </>
            ) : activeDetailTab === 'manual' ? (
              <div className="placement-manual-grid">
                <TemporaryOverride
                  busy={busyAction !== null}
                  durationHours={durationHours}
                  error={overrideError}
                  eventId={overrideEventId}
                  maximumDuration={maximumDuration}
                  onDurationChange={(value) => {
                    setDurationHours(value);
                    setOverrideError('');
                  }}
                  onEventChange={setOverrideEventId}
                  onKindChange={(choice) => {
                    setOverrideChoice(choice);
                    setOverrideError('');
                  }}
                  onReview={reviewOverride}
                  onSiteChange={setOverrideSiteId}
                  overrideChoice={overrideChoice}
                  siteId={overrideSiteId}
                  state={state}
                />
                <ActiveOverrides
                  busy={busyAction !== null}
                  eventNames={eventNames}
                  onEnd={(override) =>
                    setPendingAction({ kind: 'end_override', override })
                  }
                  overrides={state.overrides}
                  siteNames={siteNames}
                />
              </div>
            ) : (
              <PlacementHistory
                busy={busyAction !== null}
                currentPlanId={state.currentPlanId}
                error={historyError}
                history={history}
                loadState={historyLoadState}
                onRetry={() => void loadPlacementHistory()}
                onRollback={(historyPlan) =>
                  setPendingAction({ kind: 'rollback', plan: historyPlan })
                }
              />
            )}
          </div>
        </section>
      </div>

      {pendingAction && confirmation ? (
        <AuthorConfirmationDialog
          busy={busyAction !== null}
          cancelLabel="Keep reviewing"
          confirmDisabled={!reason.trim() || applyBlocked}
          confirmLabel={confirmation.confirmLabel}
          confirmTone={confirmation.tone}
          description={
            <div className="placement-confirmation">
              {confirmation.description}
              {pendingAction.kind === 'apply' && plan ? (
                <>
                  <PlacementChangeSummary summary={changeSummary} />
                  {plan.status === 'unserved' ? (
                    <p className="field-error">
                      This preview leaves an active zone uncovered and cannot be
                      applied.
                    </p>
                  ) : planExpired ? (
                    <p className="field-error">
                      This preview expired. Close this review and create a new
                      preview.
                    </p>
                  ) : null}
                </>
              ) : null}
              <div className="placement-reason">
                <label
                  className="field-label"
                  htmlFor="placement-confirmation-reason"
                >
                  Reason for this change
                </label>
                <textarea
                  aria-describedby="placement-confirmation-reason-help"
                  id="placement-confirmation-reason"
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Record why this placement change is necessary."
                  rows={3}
                  value={reason}
                />
                <span id="placement-confirmation-reason-help">
                  Required · {reason.length}/1000 characters
                </span>
              </div>
            </div>
          }
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmAction()}
          title={confirmation.title}
        />
      ) : null}
    </section>
  );
}

function PlacementStateRibbon({ state }: { state: AuthorPlacementState }) {
  const paused = state.overrides.find(
    (override) => override.kind === 'automation_pause',
  );
  const unresolvedFailure = hasUnresolvedPlacementFailure(state);
  const belowTarget =
    state.metrics.activeAssignmentCount < state.metrics.targetAssignmentCount;
  const needsAttention =
    state.metrics.activeZoneCount === 0 ||
    state.metrics.unservedZoneCount > 0 ||
    belowTarget ||
    unresolvedFailure;
  const title = paused
    ? 'Automatic rotation paused'
    : needsAttention
      ? 'Placement needs attention'
      : 'Placement healthy';
  const detail = paused
    ? 'Current valid placements remain visible.'
    : state.metrics.activeZoneCount === 0
      ? 'No active coverage zones are available.'
      : state.metrics.unservedZoneCount > 0
        ? `${state.metrics.unservedZoneCount} active zone${state.metrics.unservedZoneCount === 1 ? ' needs' : 's need'} coverage.`
        : belowTarget
          ? `${state.metrics.activeAssignmentCount} of ${state.metrics.targetAssignmentCount} target events are placed.`
          : unresolvedFailure
            ? 'The latest rotation failed and has not been replaced by a successful plan.'
            : 'Every active zone meets minimum coverage.';
  return (
    <section
      aria-label="Live placement state"
      className="placement-state-ribbon"
    >
      <div
        className="placement-state-ribbon__lead"
        data-tone={paused || needsAttention ? 'warning' : 'success'}
      >
        {paused || needsAttention ? (
          <WarningCircleIcon aria-hidden="true" size={22} />
        ) : (
          <CheckCircleIcon aria-hidden="true" size={22} />
        )}
        <div>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Events placed</dt>
          <dd>
            {state.metrics.activeAssignmentCount} of{' '}
            {state.metrics.targetAssignmentCount}
          </dd>
        </div>
        <div>
          <dt>Next rotation</dt>
          <dd>
            {formatDateTime(
              state.nextRotationBoundary,
              state.policy.rotationTimezone,
            )}
          </dd>
        </div>
        <div>
          <dt>Automatic rotation</dt>
          <dd>{paused ? 'Paused' : 'On'}</dd>
        </div>
      </dl>
    </section>
  );
}

function CoverageValidation({
  plan,
  state,
}: {
  plan: AuthorPlacementPlan;
  state: AuthorPlacementState;
}) {
  const unservedCount = plan.validation.coverage.filter(
    (coverage) => coverage.status === 'unserved',
  ).length;
  const detailCount =
    plan.validation.separation.blockedSites.length + plan.exceptions.length;
  return (
    <section aria-labelledby="placement-validation-heading">
      <h4 id="placement-validation-heading">Coverage checks</h4>
      <p className="placement-validation__summary">
        {unservedCount > 0
          ? `${unservedCount} active zone${unservedCount === 1 ? '' : 's'} remain uncovered.`
          : 'Every active zone meets minimum coverage.'}
      </p>
      <div aria-live="polite" className="placement-validation">
        <ul>
          {plan.validation.coverage.map((coverage) => {
            const zone = state.zones.find(
              (item) => item.id === coverage.zoneId,
            );
            return (
              <li key={coverage.zoneId} data-status={coverage.status}>
                {coverage.status === 'met' ? (
                  <CheckCircleIcon aria-hidden="true" size={18} />
                ) : (
                  <WarningCircleIcon aria-hidden="true" size={18} />
                )}
                <span>
                  <strong>{zone?.name ?? 'Coverage zone'}</strong>
                  <small>
                    {coverage.actual} placed · minimum {coverage.mandatory} ·
                    goal {coverage.preferred}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
        {detailCount > 0 ? (
          <details className="placement-validation__details">
            <summary>
              {detailCount} separation or policy detail
              {detailCount === 1 ? '' : 's'}
            </summary>
            {plan.validation.separation.blockedSites.length > 0 ? (
              <ul
                aria-label="Blocked candidate sites"
                className="placement-validation__blocked-sites"
              >
                {plan.validation.separation.blockedSites.map((blockedSite) => {
                  const site = state.sites.find(
                    (candidate) => candidate.id === blockedSite.siteId,
                  );
                  const zone = state.zones.find(
                    (candidate) => candidate.id === blockedSite.zoneId,
                  );
                  const relatedSites = blockedSite.relatedSiteIds.map(
                    (relatedSiteId) =>
                      state.sites.find(
                        (candidate) => candidate.id === relatedSiteId,
                      )?.name ?? relatedSiteId,
                  );
                  return (
                    <li key={blockedSite.siteId}>
                      <strong>{site?.name ?? blockedSite.siteId}</strong>
                      <span>{zone?.name ?? 'Coverage zone'}</span>
                      <ul>
                        {blockedSite.conflictsWithFixedEvent ? (
                          <li>Too close to a live fixed-location event.</li>
                        ) : null}
                        {relatedSites.length > 0 ? (
                          <li>
                            Within {plan.validation.separation.minimumMetres} m
                            of {formatList(relatedSites)}.
                          </li>
                        ) : null}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {plan.exceptions.map((exception) => (
              <p key={exception}>{exceptionLabel(exception)}</p>
            ))}
          </details>
        ) : null}
      </div>
    </section>
  );
}

interface PlacementChangeSummaryValue {
  add: number;
  keep: number;
  move: number;
  remove: number;
}

function PlacementChangeSummary({
  summary,
}: {
  summary: PlacementChangeSummaryValue;
}) {
  return (
    <dl
      aria-label="Preview change summary"
      className="placement-change-summary"
    >
      <div>
        <dt>Added</dt>
        <dd>{summary.add}</dd>
      </div>
      <div>
        <dt>Moved</dt>
        <dd>{summary.move}</dd>
      </div>
      <div>
        <dt>Unchanged</dt>
        <dd>{summary.keep}</dd>
      </div>
      <div>
        <dt>Removed</dt>
        <dd>{summary.remove}</dd>
      </div>
    </dl>
  );
}

function PlacementDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: PlacementDetailTab;
  onChange: (tab: PlacementDetailTab) => void;
}) {
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === 'ArrowRight')
      nextIndex = (index + 1) % PLACEMENT_DETAIL_TABS.length;
    else if (event.key === 'ArrowLeft')
      nextIndex =
        (index - 1 + PLACEMENT_DETAIL_TABS.length) %
        PLACEMENT_DETAIL_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = PLACEMENT_DETAIL_TABS.length - 1;
    else return;
    event.preventDefault();
    const tab = PLACEMENT_DETAIL_TABS[nextIndex]!;
    onChange(tab.id);
    document.getElementById(`placement-tab-${tab.id}`)?.focus();
  }

  return (
    <div
      aria-label="Placement detail views"
      className="placement-details__tabs"
      role="tablist"
    >
      {PLACEMENT_DETAIL_TABS.map((tab, index) => (
        <button
          aria-controls={`placement-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          className="placement-details__tab"
          id={`placement-tab-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => moveFocus(event, index)}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function AssignmentComparison({
  eventNames,
  plan,
  siteNames,
  state,
}: {
  eventNames: ReadonlyMap<string, string>;
  plan: AuthorPlacementPlan | null;
  siteNames: ReadonlyMap<string, string>;
  state: AuthorPlacementState;
}) {
  const eventIds = [
    ...new Set([
      ...state.assignments.map((assignment) => assignment.eventId),
      ...(plan?.entries.map((entry) => entry.eventId) ?? []),
    ]),
  ].sort((left, right) =>
    (eventNames.get(left) ?? left).localeCompare(
      eventNames.get(right) ?? right,
    ),
  );
  return (
    <section
      aria-labelledby="placement-comparison-heading"
      className="placement-ledger"
    >
      <div className="placement-section-heading">
        <div>
          <h3 id="placement-comparison-heading">
            {plan ? 'What will change' : 'Current assignments'}
          </h3>
          <p>
            {plan
              ? 'Compare each live assignment with the proposed campus site.'
              : 'These assignments are currently visible to players.'}
          </p>
        </div>
        {plan ? (
          <span>
            Preview expires{' '}
            {formatDateTime(plan.validUntil, state.policy.rotationTimezone)}
          </span>
        ) : null}
      </div>
      {eventIds.length === 0 ? (
        <StatusMessage tone="empty">
          <p>
            {plan
              ? 'This preview contains no assignments. Review the coverage checks to see why it cannot be applied.'
              : 'No events are currently placed. Create a coverage preview to propose assignments.'}
          </p>
        </StatusMessage>
      ) : (
        <div className="placement-table-scroll">
          <table>
            <caption className="sr-only">
              Current and proposed event placements
            </caption>
            <thead>
              <tr>
                <th>Event</th>
                <th>Current site</th>
                <th>Proposed site</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {eventIds.map((eventId) => {
                const current = state.assignments.find(
                  (item) => item.eventId === eventId,
                );
                const proposed = plan?.entries.find(
                  (item) => item.eventId === eventId,
                );
                const change = assignmentChange(
                  current,
                  proposed,
                  plan !== null,
                );
                return (
                  <tr key={eventId}>
                    <th scope="row">
                      {eventNames.get(eventId) ?? 'Unknown portable event'}
                    </th>
                    <td data-label="Current site">
                      {current
                        ? (siteNames.get(current.siteId) ?? 'Unknown site')
                        : 'Not assigned'}
                    </td>
                    <td data-label="Previewed site">
                      {plan === null
                        ? 'No preview'
                        : proposed
                          ? (siteNames.get(proposed.siteId) ?? 'Unknown site')
                          : 'Not proposed'}
                    </td>
                    <td data-label="Change">
                      <span
                        className={`placement-change placement-change--${change.tone}`}
                      >
                        {change.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CoverageAndSites({
  onLocate,
  plan,
  selectedSiteId,
  state,
}: {
  onLocate: (siteId: string) => void;
  plan: AuthorPlacementPlan | null;
  selectedSiteId: string | null;
  state: AuthorPlacementState;
}) {
  return (
    <section
      aria-labelledby="placement-sites-heading"
      className="placement-site-register"
    >
      <div className="placement-section-heading">
        <div>
          <h3 id="placement-sites-heading">Coverage and sites</h3>
          <p>Review every coverage zone and campus placement site.</p>
        </div>
      </div>
      <div className="placement-site-register__grid">
        <div className="placement-table-scroll">
          <table>
            <caption>Coverage zones</caption>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Status</th>
                <th>Assignments</th>
              </tr>
            </thead>
            <tbody>
              {state.zones.map((zone) => {
                const validation = plan?.validation.coverage.find(
                  (item) => item.zoneId === zone.id,
                );
                const count =
                  validation?.actual ??
                  state.assignments.filter((item) => item.zoneId === zone.id)
                    .length;
                const status =
                  count < state.policy.mandatoryPerZone
                    ? 'Unserved'
                    : count < state.policy.preferredPerZone
                      ? 'Shortfall'
                      : 'Served';
                return (
                  <tr key={zone.id}>
                    <th scope="row">{zone.name}</th>
                    <td data-label="Status">{status}</td>
                    <td data-label="Assignments">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="placement-table-scroll">
          <table>
            <caption>Reviewed candidate sites</caption>
            <thead>
              <tr>
                <th>Site</th>
                <th>Zone</th>
                <th>Placement state</th>
                <th>
                  <span className="sr-only">Map action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.sites.map((site) => (
                <tr
                  key={site.id}
                  data-selected={selectedSiteId === site.id || undefined}
                >
                  <th scope="row">
                    {selectedSiteId === site.id ? (
                      <span className="sr-only">Selected site. </span>
                    ) : null}
                    {site.name}
                  </th>
                  <td data-label="Coverage zone">
                    {state.zones.find((zone) => zone.id === site.zoneId)
                      ?.name ?? 'Unknown zone'}
                  </td>
                  <td data-label="Placement state">
                    {siteStateLabels(site.id, state, plan).join(', ')}
                  </td>
                  <td data-label="Map action">
                    <button
                      className="button button--quiet placement-locate"
                      onClick={() => onLocate(site.id)}
                      type="button"
                    >
                      <MapPinIcon aria-hidden="true" size={18} /> Locate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PlacementPolicyDetails({ state }: { state: AuthorPlacementState }) {
  return (
    <section
      aria-labelledby="placement-rules-heading"
      className="placement-policy"
    >
      <div className="placement-section-heading">
        <div>
          <h3 id="placement-rules-heading">Placement rules</h3>
          <p>Server-owned limits used to create and validate every preview.</p>
        </div>
        <span className="status-badge status-badge--info">Server checked</span>
      </div>
      <dl className="placement-policy__values">
        <div>
          <dt>Target placements</dt>
          <dd>{state.policy.target}</dd>
        </div>
        <div>
          <dt>Minimum per zone</dt>
          <dd>{state.policy.mandatoryPerZone}</dd>
        </div>
        <div>
          <dt>Goal per zone</dt>
          <dd>{state.policy.preferredPerZone}</dd>
        </div>
        <div>
          <dt>Minimum separation</dt>
          <dd>{state.policy.separationMetres} m</dd>
        </div>
        <div>
          <dt>Allowed swaps</dt>
          <dd>{state.policy.replacements}</dd>
        </div>
        <div>
          <dt>Preview expires after</dt>
          <dd>{state.policy.previewTtlMinutes} min</dd>
        </div>
      </dl>
      <details className="placement-technical-details">
        <summary>Technical details</summary>
        <dl>
          <div>
            <dt>State version</dt>
            <dd>{state.stateVersion}</dd>
          </div>
          <div>
            <dt>Policy version</dt>
            <dd>{state.policyVersion}</dd>
          </div>
          <div>
            <dt>Last applied</dt>
            <dd>
              {state.metrics.lastAppliedAt
                ? formatDateTime(state.metrics.lastAppliedAt)
                : 'No plan applied yet'}
            </dd>
          </div>
          <div>
            <dt>Latest failure</dt>
            <dd>
              {state.metrics.lastFailureAt
                ? `${formatDateTime(state.metrics.lastFailureAt)}${state.metrics.lastFailureCode ? ` · ${exceptionLabel(state.metrics.lastFailureCode)}` : ''}`
                : 'None recorded'}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function TemporaryOverride({
  busy,
  durationHours,
  error,
  eventId,
  maximumDuration,
  onDurationChange,
  onEventChange,
  onKindChange,
  onReview,
  onSiteChange,
  overrideChoice,
  siteId,
  state,
}: {
  busy: boolean;
  durationHours: number;
  error: string;
  eventId: string;
  maximumDuration: number;
  onDurationChange: (value: number) => void;
  onEventChange: (value: string) => void;
  onKindChange: (value: OverrideChoice) => void;
  onReview: () => void;
  onSiteChange: (value: string) => void;
  overrideChoice: OverrideChoice;
  siteId: string;
  state: AuthorPlacementState;
}) {
  const helpId = 'placement-override-duration-help';
  const errorId = 'placement-override-duration-error';
  return (
    <section
      aria-labelledby="placement-override-heading"
      className="placement-control-section"
    >
      <div>
        <h3 id="placement-override-heading">Temporary override</h3>
        <p>
          Make a time-limited operational change outside the normal preview.
        </p>
      </div>
      <label className="field-label" htmlFor="placement-override-kind">
        Override type
      </label>
      <select
        id="placement-override-kind"
        onChange={(event) => onKindChange(event.target.value as OverrideChoice)}
        value={overrideChoice}
      >
        <option value="pause">Pause automatic rotation</option>
        <option value="pin">Pin event to site</option>
        <option value="exclude">Exclude site</option>
      </select>
      {overrideChoice !== 'pause' ? (
        <>
          {overrideChoice === 'pin' ? (
            <>
              <label className="field-label" htmlFor="placement-override-event">
                Portable event
              </label>
              <select
                id="placement-override-event"
                onChange={(event) => onEventChange(event.target.value)}
                value={eventId}
              >
                {state.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label className="field-label" htmlFor="placement-override-site">
            Reviewed site
          </label>
          <select
            id="placement-override-site"
            onChange={(event) => onSiteChange(event.target.value)}
            value={siteId}
          >
            {state.sites
              .filter((site) => site.status === 'active')
              .map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
          </select>
        </>
      ) : null}
      <label className="field-label" htmlFor="placement-override-duration">
        Duration in hours
      </label>
      <input
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
        aria-invalid={error ? true : undefined}
        id="placement-override-duration"
        max={maximumDuration}
        min={1}
        onChange={(event) => onDurationChange(Number(event.target.value))}
        type="number"
        value={durationHours}
      />
      <p className="field-help" id={helpId}>
        Maximum for this override: {maximumDuration} hours.
      </p>
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
      <button
        className="button button--quiet"
        disabled={
          busy ||
          (overrideChoice !== 'pause' &&
            !state.sites.some((site) => site.status === 'active')) ||
          (overrideChoice === 'pin' && state.events.length === 0)
        }
        onClick={onReview}
        type="button"
      >
        <LockKeyIcon aria-hidden="true" size={20} /> Review override
      </button>
    </section>
  );
}

function ActiveOverrides({
  busy,
  eventNames,
  onEnd,
  overrides,
  siteNames,
}: {
  busy: boolean;
  eventNames: ReadonlyMap<string, string>;
  onEnd: (override: AuthorPlacementOverride) => void;
  overrides: AuthorPlacementOverride[];
  siteNames: ReadonlyMap<string, string>;
}) {
  return (
    <section
      aria-labelledby="placement-overrides-heading"
      className="placement-secondary-section"
    >
      <h3 id="placement-overrides-heading">Active overrides</h3>
      {overrides.length === 0 ? (
        <p>No active pauses, pins, or site exclusions.</p>
      ) : (
        <ul className="placement-record-list">
          {overrides.map((override) => (
            <li key={override.id}>
              <div>
                <strong>{overrideLabel(override.kind)}</strong>
                <span>
                  {override.eventId
                    ? (eventNames.get(override.eventId) ?? 'Unknown event')
                    : override.siteId
                      ? (siteNames.get(override.siteId) ?? 'Unknown site')
                      : 'All automatic rotations'}
                </span>
                <span>Ends {formatDateTime(override.expiresAt)}</span>
              </div>
              <button
                className="button button--quiet"
                disabled={busy}
                onClick={() => onEnd(override)}
                type="button"
              >
                End override
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlacementHistory({
  busy,
  currentPlanId,
  error,
  history,
  loadState,
  onRetry,
  onRollback,
}: {
  busy: boolean;
  currentPlanId: string | null;
  error: string;
  history: AuthorPlacementHistoryItem[];
  loadState: HistoryLoadState;
  onRetry: () => void;
  onRollback: (plan: AuthorPlacementHistoryItem) => void;
}) {
  return (
    <section
      aria-labelledby="placement-history-heading"
      className="placement-secondary-section"
    >
      <div>
        <h3 id="placement-history-heading">Recent history</h3>
        <p>Review server-recorded plans and restore a previous placement.</p>
      </div>
      {loadState === 'loading' ? (
        <LoadingState label="Loading recent placement history…" />
      ) : loadState === 'error' ? (
        <StatusMessage tone="error">
          <div>
            <strong>Recent history unavailable</strong>
            <p>{error}</p>
            <button
              className="button button--quiet"
              onClick={onRetry}
              type="button"
            >
              <ArrowClockwiseIcon aria-hidden="true" size={18} /> Retry history
            </button>
          </div>
        </StatusMessage>
      ) : history.length === 0 ? (
        <p>No placement plans have been recorded yet.</p>
      ) : (
        <ol className="placement-record-list placement-record-list--history">
          {history.map((plan) => (
            <li key={plan.planId}>
              <div>
                <strong>{plan.status.replaceAll('_', ' ')}</strong>
                <span>
                  {plan.assignmentCount} assignments · {plan.trigger}
                </span>
                <span>{formatDateTime(plan.createdAt)}</span>
                {plan.failureCode ? (
                  <span>Failure: {exceptionLabel(plan.failureCode)}</span>
                ) : null}
              </div>
              <button
                className="button button--quiet"
                disabled={
                  busy ||
                  plan.planId === currentPlanId ||
                  plan.status === 'failed'
                }
                onClick={() => onRollback(plan)}
                type="button"
              >
                <ArrowCounterClockwiseIcon aria-hidden="true" size={18} /> Roll
                back
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PlanStatus({
  hasChanges,
  status,
}: {
  hasChanges: boolean;
  status: AuthorPlacementPlan['status'];
}) {
  const label =
    status === 'unserved'
      ? 'Cannot apply'
      : !hasChanges
        ? 'No changes'
        : status === 'valid'
          ? 'Ready to apply'
          : 'Review exceptions';
  return (
    <span className={`placement-plan-status placement-plan-status--${status}`}>
      {status === 'valid' ? (
        <CheckCircleIcon aria-hidden="true" size={17} />
      ) : status === 'unserved' ? (
        <WarningCircleIcon aria-hidden="true" size={17} />
      ) : (
        <CircleIcon aria-hidden="true" size={17} />
      )}
      {label}
    </span>
  );
}

function confirmationFor(
  action: PendingAction | null,
  eventNames: ReadonlyMap<string, string>,
  siteNames: ReadonlyMap<string, string>,
) {
  if (action === null) return null;
  if (action.kind === 'apply') {
    return {
      confirmLabel: 'Apply placement plan',
      description: (
        <p>
          This replaces current player-visible assignments with the reviewed,
          server-checked preview.
        </p>
      ),
      title: 'Apply this preview?',
      tone: 'primary' as const,
    };
  }
  if (action.kind === 'rollback') {
    return {
      confirmLabel: 'Create and apply rollback',
      description: (
        <p>
          The API will validate the historical plan against the current policy
          and apply it as a new plan. Historical assignments are not reopened.
        </p>
      ),
      title: 'Roll back to this placement?',
      tone: 'danger' as const,
    };
  }
  if (action.kind === 'end_override') {
    return {
      confirmLabel: 'End override',
      description: (
        <p>
          Ending this {overrideLabel(action.override.kind).toLowerCase()} may
          allow the next authoritative plan to change assignments.
        </p>
      ),
      title: 'End this placement override?',
      tone: 'danger' as const,
    };
  }
  if (action.kind === 'pause') {
    return {
      confirmLabel: 'Pause automation',
      description: (
        <p>
          Automatic placement will pause for {action.durationHours} hours.
          Current valid assignments remain available.
        </p>
      ),
      title: 'Pause automatic placement?',
      tone: 'primary' as const,
    };
  }
  if (action.kind === 'exclude') {
    return {
      confirmLabel: 'Exclude site',
      description: (
        <p>
          {siteNames.get(action.siteId) ?? 'This reviewed site'} will be
          excluded for {action.durationHours} hours. Its active assignment may
          end.
        </p>
      ),
      title: 'Exclude this site?',
      tone: 'danger' as const,
    };
  }
  return {
    confirmLabel: 'Pin event',
    description: (
      <p>
        {eventNames.get(action.eventId) ?? 'This portable event'} will be pinned
        to {siteNames.get(action.siteId) ?? 'the selected site'} for{' '}
        {action.durationHours} hours, subject to server validation.
      </p>
    ),
    title: 'Create this placement pin?',
    tone: 'primary' as const,
  };
}

function assignmentChange(
  current: AuthorPlacementAssignment | undefined,
  proposed: AuthorPlacementAssignment | undefined,
  hasPreview: boolean,
) {
  if (!hasPreview) return { label: 'Awaiting preview', tone: 'muted' };
  if (!current && proposed)
    return {
      label: proposed.origin === 'pin' ? 'Pinned addition' : 'Add',
      tone: 'add',
    };
  if (current && !proposed) return { label: 'Remove', tone: 'remove' };
  if (current?.siteId === proposed?.siteId)
    return {
      label: proposed?.origin === 'pin' ? 'Pinned' : 'Keep',
      tone: 'keep',
    };
  return { label: 'Move', tone: 'move' };
}

function placementChangeSummary(
  state: AuthorPlacementState,
  plan: AuthorPlacementPlan | null,
): PlacementChangeSummaryValue {
  const summary: PlacementChangeSummaryValue = {
    add: 0,
    keep: 0,
    move: 0,
    remove: 0,
  };
  if (plan === null) return summary;
  const eventIds = new Set([
    ...state.assignments.map((assignment) => assignment.eventId),
    ...plan.entries.map((entry) => entry.eventId),
  ]);
  for (const eventId of eventIds) {
    const change = assignmentChange(
      state.assignments.find((assignment) => assignment.eventId === eventId),
      plan.entries.find((entry) => entry.eventId === eventId),
      true,
    );
    if (change.tone === 'add') summary.add += 1;
    else if (change.tone === 'keep') summary.keep += 1;
    else if (change.tone === 'move') summary.move += 1;
    else if (change.tone === 'remove') summary.remove += 1;
  }
  return summary;
}

function siteStateLabels(
  siteId: string,
  state: AuthorPlacementState,
  plan: AuthorPlacementPlan | null,
): string[] {
  const labels: string[] = [];
  if (state.assignments.some((assignment) => assignment.siteId === siteId))
    labels.push('Current');
  if (plan?.entries.some((entry) => entry.siteId === siteId))
    labels.push('Proposed');
  if (state.sites.find((site) => site.id === siteId)?.excluded)
    labels.push('Excluded');
  if (
    state.overrides.some(
      (override) => override.siteId === siteId && override.kind === 'pin',
    )
  )
    labels.push('Overridden');
  return labels.length > 0 ? labels : ['Candidate'];
}

function overrideLabel(kind: AuthorPlacementOverride['kind']): string {
  return kind === 'automation_pause'
    ? 'Automation pause'
    : kind === 'site_exclusion'
      ? 'Site exclusion'
      : 'Event pin';
}

function exceptionLabel(code: string): string {
  const labels: Record<string, string> = {
    cooldown_floor_exception:
      'A cooldown exception was required to preserve mandatory zone coverage.',
    invalid_pin: 'An active pin no longer satisfies placement policy.',
    no_active_zones: 'No active coverage zones are available.',
    pin_site_in_cooldown: 'A pinned site is still in its cooldown window.',
    preferred_coverage_shortfall:
      'At least one zone is below its preferred assignment count.',
    target_shortfall: 'The plan could not reach the target assignment count.',
    too_many_pins: 'Active pins exceed the policy target.',
    unserved_zone: 'At least one active zone does not meet mandatory coverage.',
  };
  return labels[code] ?? code.replaceAll('_', ' ');
}

function formatList(items: string[]): string {
  return new Intl.ListFormat('en-ZA', {
    style: 'long',
    type: 'conjunction',
  }).format(items);
}

function successMessage(kind: PendingAction['kind']): string {
  return {
    apply:
      'Placement plan applied. The reviewed assignments are now live for players.',
    end_override: 'Placement override ended. The latest live state is shown.',
    exclude: 'Site exclusion created. The latest live state is shown.',
    pause: 'Automatic placement paused. The latest live state is shown.',
    pin: 'Placement pin created. The latest live state is shown.',
    rollback:
      'Rollback plan created and applied. The latest live state is shown.',
  }[kind];
}

function previewMessage(
  plan: AuthorPlacementPlan,
  summary: PlacementChangeSummaryValue,
): PreviewFeedback {
  if (plan.status === 'unserved') {
    return {
      title: 'No safe plan found',
      message:
        'No changes can be applied. Review the failed coverage checks and policy details below.',
      tone: 'error',
    };
  }
  if (!previewHasChanges(summary)) {
    return {
      title: 'No changes proposed',
      message:
        'Current assignments already match the server-checked plan. Nothing has changed for players.',
      tone: 'info',
    };
  }
  if (plan.status === 'degraded') {
    return {
      title: 'Plan needs review',
      message:
        'Minimum coverage is met, but the plan includes policy exceptions. Nothing has changed for players.',
      tone: 'warning',
    };
  }
  const changeCount = summary.add + summary.move + summary.remove;
  return {
    title: 'Plan ready to review',
    message: `${changeCount} placement change${changeCount === 1 ? '' : 's'} proposed. Nothing has changed for players.`,
    tone: 'success',
  };
}

function previewHasChanges(summary: PlacementChangeSummaryValue): boolean {
  return summary.add + summary.move + summary.remove > 0;
}

function assignmentsMatchPlan(
  assignments: AuthorPlacementAssignment[],
  planned: AuthorPlacementAssignment[],
): boolean {
  if (assignments.length !== planned.length) return false;
  const keys = new Set(
    assignments.map(
      (assignment) =>
        `${assignment.eventId}:${assignment.siteId}:${assignment.zoneId}`,
    ),
  );
  return planned.every((assignment) =>
    keys.has(`${assignment.eventId}:${assignment.siteId}:${assignment.zoneId}`),
  );
}

function hasUnresolvedPlacementFailure(state: AuthorPlacementState): boolean {
  if (state.metrics.lastFailureAt === null) return false;
  if (state.metrics.lastAppliedAt === null) return true;
  return (
    Date.parse(state.metrics.lastFailureAt) >
    Date.parse(state.metrics.lastAppliedAt)
  );
}

function isPlacementHealthy(state: AuthorPlacementState): boolean {
  return (
    state.metrics.activeZoneCount > 0 &&
    state.metrics.unservedZoneCount === 0 &&
    state.metrics.activeAssignmentCount >=
      state.metrics.targetAssignmentCount &&
    !hasUnresolvedPlacementFailure(state)
  );
}

function isExpired(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function formatDateTime(value: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}
