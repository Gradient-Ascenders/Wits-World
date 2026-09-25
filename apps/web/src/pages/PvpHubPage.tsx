import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { ArrowLeft } from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useLocation } from 'wouter';

import { DeckApiError, listSavedDecks, type SavedDeck } from '../api/decks';
import {
  acceptPvpInvitation,
  cancelPvpInvitation,
  createPvpInvitation,
  declinePvpInvitation,
  findPvpPlayer,
  listActivePvpMatches,
  listPvpHistory,
  listPvpInvitations,
  PvpApiError,
  type PvpApiFailure,
  type PvpHistorySummary,
  type PvpInvitation,
  type PvpMatchSummary,
  type PvpPage,
} from '../api/pvp';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { ResignMatchDialog } from '../components/matches/ResignMatchDialog';
import './matches.css';

interface HubCollections {
  active: PvpMatchSummary[];
  activeNextCursor: string | null;
  history: PvpHistorySummary[];
  historyNextCursor: string | null;
  incoming: PvpInvitation[];
  incomingNextCursor: string | null;
  outgoing: PvpInvitation[];
  outgoingNextCursor: string | null;
}

interface HubData extends HubCollections {
  decks: SavedDeck[];
}

type HubPage = 'active' | 'history' | 'incoming' | 'outgoing';
type PlayerBattleSection = 'active' | 'history' | 'invitations';

type HubState =
  | { status: 'loading' }
  | { data: HubData; status: 'ready' }
  | { error: PvpApiError; status: 'error' };

interface DeckChoice {
  deckId: string;
  initialCreatureId: string;
}

interface SubmissionAttempt extends DeckChoice {
  submissionId: string;
}

const pageLimit = 50;
const playerBattleSections: PlayerBattleSection[] = [
  'invitations',
  'active',
  'history',
];

export default function PvpHubPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [, navigate] = useLocation();
  const [state, setState] = useState<HubState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [pollWarning, setPollWarning] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [foundPlayer, setFoundPlayer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [challengeChoice, setChallengeChoice] = useState<DeckChoice>({
    deckId: '',
    initialCreatureId: '',
  });
  const [acceptChoices, setAcceptChoices] = useState<
    Record<string, DeckChoice>
  >({});
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<HubPage | null>(null);
  const [actionError, setActionError] = useState<PvpApiError | null>(null);
  const [actionErrorContext, setActionErrorContext] = useState<
    'cancellation' | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reauthFailed, setReauthFailed] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [selectedSection, setSelectedSection] =
    useState<PlayerBattleSection>('invitations');
  const request = useRef<AbortController | null>(null);
  const pollRequest = useRef<AbortController | null>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const operationInFlight = useRef(false);
  const polling = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const challengeAttempt = useRef<SubmissionAttempt | null>(null);
  const acceptAttempts = useRef<Record<string, SubmissionAttempt>>({});
  const declineAttempts = useRef<Record<string, string>>({});
  const cancelAttempts = useRef<Record<string, string>>({});
  const [cancellationTarget, setCancellationTarget] =
    useState<PvpInvitation | null>(null);
  const cancellationTrigger = useRef<HTMLButtonElement | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const actionAlert = useRef<HTMLDivElement | null>(null);

  const loadCollections = useCallback(
    async (signal: AbortSignal): Promise<HubCollections> => {
      const options = { apiBaseUrl, getAccessToken, limit: pageLimit, signal };
      const [incoming, outgoing, active, history] = await Promise.all([
        listPvpInvitations({ ...options, direction: 'incoming' }),
        listPvpInvitations({ ...options, direction: 'outgoing' }),
        listActivePvpMatches(options),
        listPvpHistory(options),
      ]);
      return {
        active: active.items,
        activeNextCursor: active.nextCursor,
        history: history.items,
        historyNextCursor: history.nextCursor,
        incoming: incoming.items,
        incomingNextCursor: incoming.nextCursor,
        outgoing: outgoing.items,
        outgoingNextCursor: outgoing.nextCursor,
      };
    },
    [apiBaseUrl, getAccessToken],
  );

  const loadHub = useCallback(
    async (signal: AbortSignal): Promise<HubData> => {
      const [collections, decks] = await Promise.all([
        loadCollections(signal),
        listSavedDecks({ apiBaseUrl, getAccessToken, signal }),
      ]);
      return { ...collections, decks };
    },
    [apiBaseUrl, getAccessToken, loadCollections],
  );

  useEffect(() => {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setState({ status: 'loading' });
    setPollWarning(false);
    void loadHub(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error: toPvpError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [loadHub, revision]);

  const pollHub = useCallback(
    async (force = false): Promise<HubCollections | null> => {
      if ((!force && polling.current) || document.visibilityState !== 'visible')
        return null;
      if (force) pollRequest.current?.abort();
      polling.current = true;
      setRefreshing(true);
      const controller = new AbortController();
      pollRequest.current = controller;
      try {
        const collections = await loadCollections(controller.signal);
        setState((current) =>
          current.status === 'ready'
            ? {
                data: {
                  ...current.data,
                  ...collections,
                  incoming: withoutCompletedMatches(
                    mergeById(
                      collections.incoming,
                      current.data.incoming,
                      (invitation) => invitation.invitationId,
                    ),
                    [...current.data.history, ...collections.history],
                  ),
                  outgoing: withoutCompletedMatches(
                    mergeById(
                      collections.outgoing,
                      current.data.outgoing,
                      (invitation) => invitation.invitationId,
                    ),
                    [...current.data.history, ...collections.history],
                  ),
                },
                status: 'ready',
              }
            : current,
        );
        setPollWarning(false);
        return collections;
      } catch {
        if (!controller.signal.aborted) setPollWarning(true);
        return null;
      } finally {
        if (pollRequest.current === controller) {
          pollRequest.current = null;
          polling.current = false;
          setRefreshing(false);
        }
      }
    },
    [loadCollections],
  );

  useEffect(() => {
    if (state.status !== 'ready') return;
    const interval = window.setInterval(() => void pollHub(), 20_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void pollHub();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollHub, state.status]);

  useEffect(() => {
    if (state.status !== 'loading') resultHeading.current?.focus();
  }, [state.status]);

  useEffect(() => {
    if (actionError) actionAlert.current?.focus();
  }, [actionError]);

  useEffect(
    () => () => {
      request.current?.abort();
      pollRequest.current?.abort();
      pageRequest.current?.abort();
    },
    [],
  );

  async function loadMore(page: HubPage) {
    if (loadingMore || pageRequest.current || state.status !== 'ready') return;
    const cursor = cursorForPage(state.data, page);
    if (!cursor) return;
    resetFeedback();
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(page);
    try {
      const options = {
        apiBaseUrl,
        cursor,
        getAccessToken,
        limit: pageLimit,
        signal: controller.signal,
      };
      const next =
        page === 'incoming' || page === 'outgoing'
          ? await listPvpInvitations({ ...options, direction: page })
          : page === 'active'
            ? await listActivePvpMatches(options)
            : await listPvpHistory(options);
      if (!controller.signal.aborted) {
        setState((current) =>
          current.status === 'ready' &&
          cursorForPage(current.data, page) === cursor
            ? {
                data: appendPage(current.data, page, next),
                status: 'ready',
              }
            : current,
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) setActionError(toPvpError(error));
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        setLoadingMore(null);
      }
    }
  }

  function resetFeedback() {
    setActionError(null);
    setActionErrorContext(null);
    setNotice(null);
    setReauthFailed(false);
  }

  async function searchPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching || pendingOperation || operationInFlight.current) return;
    operationInFlight.current = true;
    resetFeedback();
    setFoundPlayer(null);
    setSearching(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await findPvpPlayer({
        apiBaseUrl,
        getAccessToken,
        playerName: playerName.trim(),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setFoundPlayer(result);
        setNotice(`Player Name ${result} is available to challenge.`);
      }
    } catch (error) {
      if (!controller.signal.aborted) setActionError(toPvpError(error));
    } finally {
      operationInFlight.current = false;
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function sendChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !foundPlayer ||
      pendingOperation ||
      operationInFlight.current ||
      !isChoiceComplete(challengeChoice)
    ) {
      return;
    }
    operationInFlight.current = true;
    resetFeedback();
    const prior = challengeAttempt.current;
    const attempt =
      prior &&
      prior.deckId === challengeChoice.deckId &&
      prior.initialCreatureId === challengeChoice.initialCreatureId
        ? prior
        : { ...challengeChoice, submissionId: crypto.randomUUID() };
    challengeAttempt.current = attempt;
    const controller = new AbortController();
    request.current = controller;
    setPendingOperation('challenge');
    try {
      const invitation = await createPvpInvitation({
        ...attempt,
        apiBaseUrl,
        getAccessToken,
        opponentPlayerName: foundPlayer,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        challengeAttempt.current = null;
        setFoundPlayer(null);
        setPlayerName('');
        setChallengeChoice({ deckId: '', initialCreatureId: '' });
        setNotice(`Challenge sent to ${invitation.opponent.playerName}.`);
        await pollHub();
      }
    } catch (error) {
      if (!controller.signal.aborted) setActionError(toPvpError(error));
    } finally {
      operationInFlight.current = false;
      if (!controller.signal.aborted) setPendingOperation(null);
    }
  }

  async function acceptInvitation(invitation: PvpInvitation) {
    const choice = acceptChoices[invitation.invitationId];
    if (
      !choice ||
      !isChoiceComplete(choice) ||
      pendingOperation ||
      operationInFlight.current
    )
      return;
    operationInFlight.current = true;
    resetFeedback();
    const prior = acceptAttempts.current[invitation.invitationId];
    const attempt =
      prior &&
      prior.deckId === choice.deckId &&
      prior.initialCreatureId === choice.initialCreatureId
        ? prior
        : { ...choice, submissionId: crypto.randomUUID() };
    acceptAttempts.current[invitation.invitationId] = attempt;
    const controller = new AbortController();
    request.current = controller;
    setPendingOperation(`accept:${invitation.invitationId}`);
    try {
      const result = await acceptPvpInvitation({
        ...attempt,
        apiBaseUrl,
        expectedVersion: invitation.version,
        getAccessToken,
        invitationId: invitation.invitationId,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        delete acceptAttempts.current[invitation.invitationId];
        navigate(`/matches/pvp/${result.match.matchId}`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = toPvpError(error);
        setActionError(failure);
        if (isReconciliationFailure(failure.failure)) await pollHub();
      }
    } finally {
      operationInFlight.current = false;
      if (!controller.signal.aborted) setPendingOperation(null);
    }
  }

  async function declineInvitation(invitation: PvpInvitation) {
    if (pendingOperation || operationInFlight.current) return;
    operationInFlight.current = true;
    resetFeedback();
    const submissionId =
      declineAttempts.current[invitation.invitationId] ?? crypto.randomUUID();
    declineAttempts.current[invitation.invitationId] = submissionId;
    const controller = new AbortController();
    request.current = controller;
    setPendingOperation(`decline:${invitation.invitationId}`);
    try {
      const declined = await declinePvpInvitation({
        apiBaseUrl,
        expectedVersion: invitation.version,
        getAccessToken,
        invitationId: invitation.invitationId,
        signal: controller.signal,
        submissionId,
      });
      if (!controller.signal.aborted) {
        delete declineAttempts.current[invitation.invitationId];
        setNotice(`Challenge from ${declined.opponent.playerName} declined.`);
        await pollHub();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = toPvpError(error);
        setActionError(failure);
        if (isReconciliationFailure(failure.failure)) await pollHub();
      }
    } finally {
      operationInFlight.current = false;
      if (!controller.signal.aborted) setPendingOperation(null);
    }
  }

  async function cancelInvitation(invitation: PvpInvitation) {
    if (
      !invitation.canCancel ||
      invitation.direction !== 'outgoing' ||
      invitation.status !== 'pending' ||
      pendingOperation ||
      operationInFlight.current
    )
      return;
    operationInFlight.current = true;
    setCancellationTarget(null);
    resetFeedback();
    const submissionId =
      cancelAttempts.current[invitation.invitationId] ?? crypto.randomUUID();
    cancelAttempts.current[invitation.invitationId] = submissionId;
    const controller = new AbortController();
    request.current = controller;
    setPendingOperation(`cancel:${invitation.invitationId}`);
    setNotice(
      `Cancelling your challenge to ${invitation.opponent.playerName}…`,
    );
    try {
      const cancelled = await cancelPvpInvitation({
        apiBaseUrl,
        expectedVersion: invitation.version,
        getAccessToken,
        invitationId: invitation.invitationId,
        signal: controller.signal,
        submissionId,
      });
      if (!controller.signal.aborted) {
        delete cancelAttempts.current[invitation.invitationId];
        setState((current) =>
          current.status === 'ready'
            ? {
                data: {
                  ...current.data,
                  outgoing: replaceInvitation(current.data.outgoing, cancelled),
                },
                status: 'ready',
              }
            : current,
        );
        setNotice(`Challenge to ${cancelled.opponent.playerName} cancelled.`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = toPvpError(error);
        setNotice(null);
        setActionError(failure);
        setActionErrorContext('cancellation');
        if (
          failure.options.ambiguous ||
          isReconciliationFailure(failure.failure)
        ) {
          const collections = await pollHub(true);
          const latest = collections?.outgoing.find(
            (item) => item.invitationId === invitation.invitationId,
          );
          if (latest && (latest.status !== 'pending' || !latest.canCancel)) {
            delete cancelAttempts.current[invitation.invitationId];
            setActionError(null);
            setActionErrorContext(null);
            setNotice(cancellationReconciliationMessage(latest));
          }
        }
      }
    } finally {
      operationInFlight.current = false;
      if (!controller.signal.aborted) setPendingOperation(null);
    }
  }

  async function startSignIn() {
    setReauthFailed(false);
    try {
      await loginWithRedirect({ appState: { returnTo: '/matches/pvp' } });
    } catch {
      setReauthFailed(true);
    }
  }

  if (state.status === 'loading') {
    return <PlayerBattlesLoading />;
  }

  if (state.status === 'error') {
    return (
      <div className="matches-page">
        <section
          className="match-state-panel state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <p className="eyebrow">Player Battles</p>
          <h1 ref={resultHeading} tabIndex={-1}>
            Player Battles could not load
          </h1>
          <p>{errorMessage(state.error.failure)}</p>
          <div className="match-state-actions">
            {state.error.failure === 'authorization' ? (
              <button
                className="button"
                onClick={() => void startSignIn()}
                type="button"
              >
                Sign in again
              </button>
            ) : (
              <button
                className="button"
                onClick={() => setRevision((value) => value + 1)}
                type="button"
              >
                Try again
              </button>
            )}
            <Link className="button button--quiet" href="/matches">
              Battles
            </Link>
          </div>
          {reauthFailed ? (
            <p role="alert">Sign-in could not start. Please try again.</p>
          ) : null}
        </section>
      </div>
    );
  }

  const { data } = state;
  return (
    <div className="matches-page pvp-hub">
      {cancellationTarget ? (
        <ResignMatchDialog
          kind="cancellation"
          busy={pendingOperation !== null}
          opponentLabel={cancellationTarget.opponent.playerName}
          returnFocusRef={cancellationTrigger}
          onCancel={() => setCancellationTarget(null)}
          onConfirm={() => void cancelInvitation(cancellationTarget)}
        />
      ) : null}
      <header className="matches-page__header pvp-lobby-header">
        <Link
          aria-label="Back to Battles"
          className="text-link pvp-lobby-header__back"
          href="/matches"
        >
          <ArrowLeft size={20} aria-hidden="true" /> Battles
        </Link>
        <div className="pvp-lobby-header__main">
          <div>
            <h1 ref={resultHeading} tabIndex={-1}>
              Player Battles
            </h1>
            <p className="lead">
              Challenge another explorer and take turns within 24 hours.
            </p>
          </div>
          <button
            aria-controls="challenge-player-panel"
            aria-expanded={challengeOpen}
            className="button"
            onClick={() => setChallengeOpen((open) => !open)}
            type="button"
          >
            {challengeOpen ? 'Close challenge' : 'Challenge a player'}
          </button>
        </div>
      </header>

      <PlayerBattleTabs
        counts={{
          active: data.active.length,
          history: data.history.length,
          invitations: data.incoming.filter(isPending).length,
        }}
        onSelect={setSelectedSection}
        selected={selectedSection}
      />

      {pollWarning ? (
        <div className="pvp-poll-warning" role="status">
          <span>
            Automatic refresh paused after a connection problem. Your saved
            server state is unchanged.
          </span>
          <button
            className="button button--quiet"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={() => void pollHub()}
            type="button"
          >
            {refreshing ? 'Refreshing…' : 'Retry refresh'}
          </button>
        </div>
      ) : null}

      {notice ? (
        <p aria-live="polite" className="pvp-notice" role="status">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <div
          className="match-inline-alert state-message state-message--error"
          ref={actionAlert}
          role="alert"
          tabIndex={-1}
        >
          <StateIcon tone="error" />
          <strong>
            {actionErrorContext === 'cancellation'
              ? 'Cancellation not confirmed.'
              : 'That request was not completed.'}
          </strong>{' '}
          {errorMessage(actionError.failure, actionErrorContext)}
          {actionError.options.ambiguous
            ? actionErrorContext === 'cancellation'
              ? ' If the challenge is still pending, retrying uses the same request so it cannot be cancelled twice.'
              : ' Retrying uses the same request so the server cannot apply it twice.'
            : ''}
        </div>
      ) : null}

      <section
        aria-labelledby="challenge-player-title"
        className="pvp-challenge-panel"
        hidden={!challengeOpen}
        id="challenge-player-panel"
      >
        <div className="pvp-section-heading">
          <h2 id="challenge-player-title">Challenge a player</h2>
        </div>
        <form
          className="pvp-search-form"
          onSubmit={(event) => void searchPlayer(event)}
        >
          <label htmlFor="pvp-player-name">Exact Player Name</label>
          <div>
            <input
              autoComplete="off"
              id="pvp-player-name"
              maxLength={20}
              minLength={3}
              onChange={(event) => {
                setPlayerName(event.target.value);
                setFoundPlayer(null);
                challengeAttempt.current = null;
              }}
              required
              value={playerName}
            />
            <button
              className="button"
              disabled={searching || pendingOperation !== null}
              type="submit"
            >
              {searching ? 'Searching…' : 'Find player'}
            </button>
          </div>
          <small>
            Search by exact Player Name. Email, account details, location,
            decks, and activity stay private.
          </small>
        </form>

        {foundPlayer ? (
          <form
            className="pvp-challenge-form"
            onSubmit={(event) => void sendChallenge(event)}
          >
            <p>
              <strong>{foundPlayer}</strong> is available to challenge.
            </p>
            <DeckCreaturePicker
              choice={challengeChoice}
              decks={data.decks}
              disabled={pendingOperation !== null}
              idPrefix="challenge"
              onChange={(choice) => {
                setChallengeChoice(choice);
                challengeAttempt.current = null;
              }}
            />
            <button
              className="button"
              disabled={
                !isChoiceComplete(challengeChoice) || pendingOperation !== null
              }
              type="submit"
            >
              {pendingOperation === 'challenge'
                ? 'Sending challenge…'
                : actionError?.options.ambiguous
                  ? 'Retry challenge safely'
                  : 'Send challenge'}
            </button>
          </form>
        ) : null}
      </section>

      <section
        aria-labelledby="invitations-tab"
        className="pvp-tab-panel"
        hidden={selectedSection !== 'invitations'}
        id="invitations-panel"
        role="tabpanel"
        tabIndex={selectedSection === 'invitations' ? 0 : -1}
      >
        <h2>Invitations</h2>
        <div className="pvp-invitation-columns">
          <InvitationList
            acceptChoices={acceptChoices}
            decks={data.decks}
            direction="incoming"
            invitations={withoutCompletedMatches(data.incoming, data.history)}
            hasMore={data.incomingNextCursor !== null}
            loadingMore={loadingMore === 'incoming'}
            onAccept={(invitation) => void acceptInvitation(invitation)}
            onChoice={(invitationId, choice) => {
              setAcceptChoices((current) => ({
                ...current,
                [invitationId]: choice,
              }));
              delete acceptAttempts.current[invitationId];
            }}
            onDecline={(invitation) => void declineInvitation(invitation)}
            onCancel={() => undefined}
            hasCancelAttempt={() => false}
            onLoadMore={() => void loadMore('incoming')}
            pendingOperation={pendingOperation}
          />
          <InvitationList
            acceptChoices={acceptChoices}
            decks={data.decks}
            direction="outgoing"
            invitations={withoutCompletedMatches(data.outgoing, data.history)}
            hasMore={data.outgoingNextCursor !== null}
            loadingMore={loadingMore === 'outgoing'}
            onAccept={() => undefined}
            onChoice={() => undefined}
            onDecline={() => undefined}
            onCancel={(invitation) => {
              cancellationTrigger.current =
                document.activeElement instanceof HTMLButtonElement
                  ? document.activeElement
                  : null;
              setCancellationTarget(invitation);
            }}
            hasCancelAttempt={(invitationId) =>
              cancelAttempts.current[invitationId] !== undefined
            }
            onLoadMore={() => void loadMore('outgoing')}
            pendingOperation={pendingOperation}
          />
        </div>
      </section>

      <section
        aria-labelledby="active-tab"
        className="pvp-tab-panel"
        hidden={selectedSection !== 'active'}
        id="active-panel"
        role="tabpanel"
        tabIndex={selectedSection === 'active' ? 0 : -1}
      >
        <h2>Your matches</h2>
        {data.active.length === 0 ? (
          <EmptyState title="No active player battles">
            Accept an invitation to begin a match.
          </EmptyState>
        ) : (
          <ol aria-label="Active player battles" className="pvp-match-list">
            {data.active.map((match) => (
              <li key={match.matchId}>
                <ActivePvpSummary match={match} />
              </li>
            ))}
          </ol>
        )}
        {data.activeNextCursor ? (
          <LoadMoreButton
            label="active matches"
            loading={loadingMore === 'active'}
            onClick={() => void loadMore('active')}
          />
        ) : null}
      </section>

      <section
        aria-labelledby="history-tab"
        className="pvp-tab-panel"
        hidden={selectedSection !== 'history'}
        id="history-panel"
        role="tabpanel"
        tabIndex={selectedSection === 'history' ? 0 : -1}
      >
        <h2>Recent player battles</h2>
        {data.history.length === 0 ? (
          <EmptyState title="No completed player battles">
            Completed wins, losses, and forfeits will appear here.
          </EmptyState>
        ) : (
          <ol aria-label="Completed player battles" className="pvp-match-list">
            {data.history.map((match) => (
              <li key={match.matchId}>
                <HistoryPvpSummary match={match} />
              </li>
            ))}
          </ol>
        )}
        {data.historyNextCursor ? (
          <LoadMoreButton
            label="match history"
            loading={loadingMore === 'history'}
            onClick={() => void loadMore('history')}
          />
        ) : null}
      </section>
    </div>
  );
}

function PlayerBattlesLoading() {
  return (
    <PageLoadingState
      title="Loading player battles…"
      description="Retrieving invitations, active battles, and match history."
    />
  );
}

function PlayerBattleTabs({
  counts,
  onSelect,
  selected,
}: {
  counts: Record<PlayerBattleSection, number>;
  onSelect: (section: PlayerBattleSection) => void;
  selected: PlayerBattleSection;
}) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % playerBattleSections.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (index - 1 + playerBattleSections.length) % playerBattleSections.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = playerBattleSections.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = playerBattleSections[nextIndex]!;
    onSelect(nextSection);
    tabs.current[nextIndex]?.focus();
  }

  return (
    <div
      aria-label="Player battle sections"
      className="pvp-section-tabs"
      role="tablist"
    >
      {playerBattleSections.map((section, index) => {
        const label = titleCase(section);
        const isSelected = selected === section;
        return (
          <button
            aria-controls={`${section}-panel`}
            aria-selected={isSelected}
            className="pvp-section-tabs__tab"
            id={`${section}-tab`}
            key={section}
            onClick={() => onSelect(section)}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            role="tab"
            tabIndex={isSelected ? 0 : -1}
            type="button"
          >
            {label} <span>{counts[section]}</span>
          </button>
        );
      })}
    </div>
  );
}

function InvitationList({
  acceptChoices,
  decks,
  direction,
  hasMore,
  invitations,
  loadingMore,
  onAccept,
  onCancel,
  onChoice,
  onDecline,
  hasCancelAttempt,
  onLoadMore,
  pendingOperation,
}: {
  acceptChoices: Record<string, DeckChoice>;
  decks: SavedDeck[];
  direction: 'incoming' | 'outgoing';
  hasMore: boolean;
  invitations: PvpInvitation[];
  loadingMore: boolean;
  onAccept: (invitation: PvpInvitation) => void;
  onCancel: (invitation: PvpInvitation) => void;
  onChoice: (invitationId: string, choice: DeckChoice) => void;
  onDecline: (invitation: PvpInvitation) => void;
  hasCancelAttempt: (invitationId: string) => boolean;
  onLoadMore: () => void;
  pendingOperation: string | null;
}) {
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const title =
    direction === 'incoming' ? 'Received challenges' : 'Sent challenges';
  return (
    <section
      aria-labelledby={`${direction}-invitations-title`}
      className="pvp-invitation-group"
    >
      <h3 id={`${direction}-invitations-title`}>{title}</h3>
      {invitations.length === 0 ? (
        <p className="pvp-empty-state state-message state-message--empty">
          {direction === 'incoming'
            ? 'No received challenges.'
            : 'No sent challenges.'}
        </p>
      ) : (
        <ol
          aria-label={
            direction === 'incoming'
              ? 'Received player battle challenges'
              : 'Sent player battle challenges'
          }
          className="pvp-invitation-list"
        >
          {invitations.map((invitation) => {
            const accepting =
              pendingOperation === `accept:${invitation.invitationId}`;
            const declining =
              pendingOperation === `decline:${invitation.invitationId}`;
            const cancelling =
              pendingOperation === `cancel:${invitation.invitationId}`;
            return (
              <li
                className={`pvp-invitation pvp-invitation--${invitation.status}`}
                key={invitation.invitationId}
              >
                <div className="pvp-invitation__heading">
                  <div className="pvp-invitation__player">
                    <strong>{invitation.opponent.playerName}</strong>
                    <span>
                      {direction === 'incoming'
                        ? 'challenged you'
                        : 'was challenged'}
                    </span>
                  </div>
                  {direction === 'incoming' &&
                  invitation.status === 'pending' ? (
                    <div className="pvp-invitation__actions">
                      <span className="pvp-status-label">Pending</span>
                      <button
                        aria-controls={`response-${invitation.invitationId}`}
                        aria-expanded={respondingTo === invitation.invitationId}
                        className="button"
                        disabled={pendingOperation !== null}
                        onClick={() =>
                          setRespondingTo((current) =>
                            current === invitation.invitationId
                              ? null
                              : invitation.invitationId,
                          )
                        }
                        type="button"
                      >
                        Accept
                      </button>
                      <button
                        aria-label={`Decline challenge from ${invitation.opponent.playerName}`}
                        className="button button--quiet"
                        disabled={pendingOperation !== null}
                        onClick={() => onDecline(invitation)}
                        type="button"
                      >
                        {declining ? 'Declining…' : 'Decline'}
                      </button>
                    </div>
                  ) : direction === 'outgoing' &&
                    invitation.status === 'pending' &&
                    invitation.canCancel ? (
                    <div className="pvp-invitation__actions">
                      <span className="pvp-status-label">Pending response</span>
                      <button
                        aria-label={`Cancel challenge to ${invitation.opponent.playerName}`}
                        className="button button--danger button--quiet"
                        disabled={pendingOperation !== null}
                        onClick={() => onCancel(invitation)}
                        type="button"
                      >
                        {cancelling
                          ? 'Cancelling…'
                          : hasCancelAttempt(invitation.invitationId)
                            ? 'Retry cancellation safely'
                            : 'Cancel challenge'}
                      </button>
                    </div>
                  ) : (
                    <span className="pvp-status-label">
                      {direction === 'outgoing' &&
                      invitation.status === 'pending'
                        ? 'Pending response'
                        : invitationStatusLabel(invitation.status)}
                    </span>
                  )}
                </div>
                <dl className="pvp-summary-meta">
                  <div>
                    <dt>Sent</dt>
                    <dd>{formatDate(invitation.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>
                      {invitation.status === 'pending' ? 'Expires' : 'Updated'}
                    </dt>
                    <dd>
                      {formatDate(
                        invitation.respondedAt ?? invitation.expiresAt,
                      )}
                    </dd>
                  </div>
                </dl>
                {direction === 'incoming' &&
                invitation.status === 'pending' &&
                respondingTo === invitation.invitationId ? (
                  <div
                    className="pvp-invitation__response"
                    id={`response-${invitation.invitationId}`}
                  >
                    <DeckCreaturePicker
                      choice={
                        acceptChoices[invitation.invitationId] ?? {
                          deckId: '',
                          initialCreatureId: '',
                        }
                      }
                      decks={decks}
                      disabled={pendingOperation !== null}
                      idPrefix={`accept-${invitation.invitationId}`}
                      onChange={(choice) =>
                        onChoice(invitation.invitationId, choice)
                      }
                    />
                    <button
                      className="button"
                      disabled={
                        !isChoiceComplete(
                          acceptChoices[invitation.invitationId],
                        ) || pendingOperation !== null
                      }
                      onClick={() => onAccept(invitation)}
                      type="button"
                    >
                      {accepting ? 'Accepting…' : 'Accept challenge'}
                    </button>
                  </div>
                ) : null}
                {invitation.status !== 'pending' ? (
                  <p className="pvp-invitation__explanation">
                    {invitationStatusExplanation(invitation, direction)}
                  </p>
                ) : null}
                {invitation.matchId ? (
                  <Link
                    className="button button--quiet"
                    href={`/matches/pvp/${invitation.matchId}`}
                  >
                    Open match
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {hasMore ? (
        <LoadMoreButton
          label={
            direction === 'incoming' ? 'received challenges' : 'sent challenges'
          }
          loading={loadingMore}
          onClick={onLoadMore}
        />
      ) : null}
    </section>
  );
}

function DeckCreaturePicker({
  choice,
  decks,
  disabled,
  idPrefix,
  onChange,
}: {
  choice: DeckChoice;
  decks: SavedDeck[];
  disabled: boolean;
  idPrefix: string;
  onChange: (choice: DeckChoice) => void;
}) {
  const selectedDeck = decks.find((deck) => deck.deckId === choice.deckId);
  const creatures =
    selectedDeck?.cards.filter((card) => card.category === 'creature') ?? [];
  if (decks.length === 0) {
    return (
      <p className="pvp-deck-empty">
        A saved battle deck is required.{' '}
        <Link href="/decks">Create a deck</Link>.
      </p>
    );
  }
  return (
    <div className="pvp-deck-picker">
      <label htmlFor={`${idPrefix}-deck`}>Battle deck</label>
      <select
        disabled={disabled}
        id={`${idPrefix}-deck`}
        onChange={(event) =>
          onChange({ deckId: event.target.value, initialCreatureId: '' })
        }
        value={choice.deckId}
      >
        <option value="">Choose a saved deck</option>
        {decks.map((deck) => (
          <option key={deck.deckId} value={deck.deckId}>
            {deck.name} · {deck.totalPoints} points
          </option>
        ))}
      </select>
      {selectedDeck ? (
        <fieldset>
          <legend>Opening Creature</legend>
          <div className="pvp-creature-options">
            {creatures.map((card) => (
              <label key={card.ownedCardId}>
                <input
                  checked={choice.initialCreatureId === card.ownedCardId}
                  disabled={disabled}
                  name={`${idPrefix}-creature`}
                  onChange={() =>
                    onChange({ ...choice, initialCreatureId: card.ownedCardId })
                  }
                  type="radio"
                  value={card.ownedCardId}
                />
                <span>
                  <strong>{card.name}</strong>
                  <small>
                    {card.affinity
                      ? `${titleCase(card.affinity)} affinity`
                      : 'Typeless'}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <small>
            The API validates the saved deck and opening Creature again when you
            submit.
          </small>
        </fieldset>
      ) : null}
    </div>
  );
}

function ActivePvpSummary({ match }: { match: PvpMatchSummary }) {
  return (
    <article
      className={`pvp-match-summary pvp-match-summary--${match.currentActor}`}
    >
      <div className="pvp-match-summary__heading">
        <div>
          <h3>{match.opponent.playerName}</h3>
          <p>
            Deadline{' '}
            <time dateTime={match.turnDeadline}>
              {formatDate(match.turnDeadline)}
            </time>
          </p>
        </div>
        <span className="pvp-status-label">
          {match.currentActor === 'self' ? 'Your turn' : 'Waiting for opponent'}
        </span>
      </div>
      <Link className="button" href={`/matches/pvp/${match.matchId}`}>
        Continue
      </Link>
    </article>
  );
}

function HistoryPvpSummary({ match }: { match: PvpHistorySummary }) {
  return (
    <article
      className={`pvp-match-summary pvp-match-summary--${match.outcome}`}
    >
      <div className="pvp-match-summary__heading">
        <div>
          <h3>{match.opponent.playerName}</h3>
          <p>{completionReasonLabel(match.completionReason, match.outcome)}</p>
        </div>
        <span className="pvp-status-label">
          {match.outcome === 'win' ? 'Won' : 'Lost'}
        </span>
      </div>
      <time dateTime={match.completedAt}>{formatDate(match.completedAt)}</time>
      <Link
        className="button button--quiet"
        href={`/matches/pvp/${match.matchId}`}
      >
        View battle
      </Link>
    </article>
  );
}

function EmptyState({ children, title }: { children: string; title: string }) {
  return (
    <div className="pvp-empty-state state-message state-message--empty">
      <StateIcon tone="empty" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function LoadMoreButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="button button--quiet pvp-load-more"
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      {loading ? `Loading more ${label}…` : `Load more ${label}`}
    </button>
  );
}

function cursorForPage(data: HubData, page: HubPage) {
  return data[`${page}NextCursor`];
}

function appendPage(
  data: HubData,
  page: HubPage,
  next: PvpPage<PvpHistorySummary | PvpInvitation | PvpMatchSummary>,
): HubData {
  if (page === 'active') {
    return {
      ...data,
      active: mergeById(
        data.active,
        next.items as PvpMatchSummary[],
        (match) => match.matchId,
      ),
      activeNextCursor: next.nextCursor,
    };
  }
  if (page === 'history') {
    return {
      ...data,
      history: mergeById(
        data.history,
        next.items as PvpHistorySummary[],
        (match) => match.matchId,
      ),
      historyNextCursor: next.nextCursor,
    };
  }
  return {
    ...data,
    [page]: mergeById(
      data[page],
      next.items as PvpInvitation[],
      (invitation) => invitation.invitationId,
    ),
    [`${page}NextCursor`]: next.nextCursor,
  };
}

function mergeById<T>(current: T[], next: T[], id: (item: T) => string) {
  const known = new Set(current.map(id));
  return [...current, ...next.filter((item) => !known.has(id(item)))];
}

function replaceInvitation(
  invitations: PvpInvitation[],
  replacement: PvpInvitation,
) {
  return invitations.map((invitation) =>
    invitation.invitationId === replacement.invitationId
      ? replacement
      : invitation,
  );
}

function isChoiceComplete(
  choice: DeckChoice | undefined,
): choice is DeckChoice {
  return Boolean(choice?.deckId && choice.initialCreatureId);
}

// Invitations remain accepted after completion; use authoritative match history.
function withoutCompletedMatches(
  invitations: PvpInvitation[],
  history: PvpHistorySummary[],
) {
  const completedMatchIds = new Set(history.map((match) => match.matchId));
  return invitations.filter(
    (invitation) =>
      !invitation.matchId || !completedMatchIds.has(invitation.matchId),
  );
}

function isPending(invitation: PvpInvitation) {
  return invitation.status === 'pending';
}

function isReconciliationFailure(failure: PvpApiFailure) {
  return ['cancelled', 'completed', 'expired', 'invalidated', 'stale'].includes(
    failure,
  );
}

function invitationStatusLabel(status: PvpInvitation['status']) {
  return status === 'invalidated' ? 'Unavailable' : titleCase(status);
}

function invitationStatusExplanation(
  invitation: PvpInvitation,
  direction: 'incoming' | 'outgoing',
) {
  if (invitation.status === 'accepted')
    return direction === 'incoming'
      ? 'You accepted this challenge. The battle is ready.'
      : `${invitation.opponent.playerName} accepted your challenge. The battle is ready.`;
  if (invitation.status === 'declined')
    return direction === 'incoming'
      ? 'You declined this challenge.'
      : `${invitation.opponent.playerName} declined your challenge.`;
  if (invitation.status === 'expired')
    return 'This invitation expired before it was accepted.';
  if (invitation.status === 'cancelled')
    return direction === 'outgoing'
      ? 'You cancelled this invitation.'
      : `This invitation was cancelled by ${invitation.opponent.playerName}.`;
  return 'This invitation became unavailable after an account lifecycle change.';
}

function cancellationReconciliationMessage(invitation: PvpInvitation) {
  if (invitation.status === 'accepted')
    return `Your challenge to ${invitation.opponent.playerName} was accepted before cancellation completed. Open the battle to continue.`;
  if (invitation.status === 'declined')
    return `${invitation.opponent.playerName} declined the challenge before cancellation completed.`;
  if (invitation.status === 'expired')
    return 'The challenge expired before cancellation completed.';
  if (invitation.status === 'cancelled')
    return `Challenge to ${invitation.opponent.playerName} cancelled.`;
  if (invitation.status === 'invalidated')
    return 'The challenge became unavailable before cancellation completed.';
  return 'The latest challenge status has been restored.';
}

function completionReasonLabel(
  reason: PvpHistorySummary['completionReason'],
  outcome: 'loss' | 'win',
) {
  if (reason === 'defeat')
    return outcome === 'win' ? 'Won in battle' : 'Lost in battle';
  if (reason === 'account_deletion_forfeit')
    return outcome === 'win'
      ? 'Opponent became unavailable'
      : 'Account became unavailable';
  if (reason === 'voluntary_resignation')
    return outcome === 'win' ? 'Opponent forfeited' : 'You forfeited';
  return outcome === 'win'
    ? 'Opponent turn deadline expired'
    : 'Your turn deadline expired';
}

function errorMessage(
  failure: PvpApiFailure,
  context: 'cancellation' | null = null,
) {
  if (context === 'cancellation') {
    if (failure === 'authorization')
      return 'Your session expired. Sign in again before trying to cancel.';
    if (failure === 'stale')
      return 'The invitation changed before cancellation completed. Its latest status was refreshed.';
    if (failure === 'cancelled')
      return 'The invitation was already cancelled. Its latest status was refreshed.';
    if (failure === 'expired')
      return 'The invitation expired before cancellation completed. Its latest status was refreshed.';
    if (failure === 'invalidated')
      return 'The invitation became unavailable before cancellation completed. Its latest status was refreshed.';
    if (failure === 'not-found')
      return 'This invitation is no longer available. Refresh Player Battles to check its latest status.';
    return 'Check your connection. The latest server state was requested, and the challenge remains recoverable.';
  }
  const messages: Record<PvpApiFailure, string> = {
    'already-pending':
      'A pending invitation already exists between these players.',
    authorization: 'Your session expired. Sign in again before continuing.',
    completed:
      'The match is already complete. Refresh to view its saved result.',
    cancelled: 'The invitation was cancelled before this response was applied.',
    conflict:
      'That submission reference was already used for different intent. Refresh before trying again.',
    'deck-invalid':
      'The server rejected that saved deck or opening Creature. Review the deck and choose again.',
    expired: 'The invitation expired before the response reached the server.',
    'illegal-action':
      'That action is no longer legal in the authoritative match state.',
    invalidated: 'The invitation is no longer available.',
    'not-found': 'This player battle is not available to the signed-in player.',
    'player-unavailable':
      'That Player Name is unavailable. The server does not reveal why.',
    stale:
      'The battle changed before the request was accepted. The latest server state will be restored.',
    unavailable:
      'Check your connection and retry. No result is calculated in this browser.',
    validation: 'Check the submitted Player Name and choices, then try again.',
  };
  return messages[failure];
}

function toPvpError(error: unknown) {
  if (error instanceof PvpApiError) return error;
  if (error instanceof DeckApiError) {
    return new PvpApiError(
      error.failure === 'authorization' ? 'authorization' : 'unavailable',
      error.options,
    );
  }
  return new PvpApiError('unavailable');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
