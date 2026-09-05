import { useAuth0 } from '@auth0/auth0-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useLocation } from 'wouter';

import { DeckApiError, listSavedDecks, type SavedDeck } from '../api/decks';
import {
  acceptPvpInvitation,
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
  const [notice, setNotice] = useState<string | null>(null);
  const [reauthFailed, setReauthFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const pollRequest = useRef<AbortController | null>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const operationInFlight = useRef(false);
  const polling = useRef(false);
  const challengeAttempt = useRef<SubmissionAttempt | null>(null);
  const acceptAttempts = useRef<Record<string, SubmissionAttempt>>({});
  const declineAttempts = useRef<Record<string, string>>({});
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

  const pollHub = useCallback(async () => {
    if (polling.current || document.visibilityState !== 'visible') return;
    polling.current = true;
    const controller = new AbortController();
    pollRequest.current = controller;
    try {
      const collections = await loadCollections(controller.signal);
      setState((current) =>
        current.status === 'ready'
          ? {
              data: { ...current.data, ...collections },
              status: 'ready',
            }
          : current,
      );
      setPollWarning(false);
    } catch {
      if (!controller.signal.aborted) setPollWarning(true);
    } finally {
      if (pollRequest.current === controller) {
        pollRequest.current = null;
        polling.current = false;
      }
    }
  }, [loadCollections]);

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
        <section className="match-state-panel" role="alert">
          <p className="eyebrow">Asynchronous PvP</p>
          <h1 ref={resultHeading} tabIndex={-1}>
            PvP could not load
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
              CPU battles
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
      <header className="matches-page__header pvp-hub__header">
        <div>
          <p className="eyebrow">Return when it suits you</p>
          <h1 ref={resultHeading} tabIndex={-1}>
            Asynchronous PvP
          </h1>
          <p className="lead">
            Challenge another Player Name, respond to invitations, and take each
            server-timed turn within 24 hours.
          </p>
        </div>
        <Link className="button button--quiet" href="/matches">
          CPU battles
        </Link>
      </header>

      <nav aria-label="PvP sections" className="pvp-section-nav">
        <a href="#invitations">
          Invitations <span>{data.incoming.filter(isPending).length}</span>
        </a>
        <a href="#active-matches">
          Active <span>{data.active.length}</span>
        </a>
        <a href="#pvp-history">
          History <span>{data.history.length}</span>
        </a>
      </nav>

      {pollWarning ? (
        <div className="pvp-poll-warning" role="status">
          <span>
            Automatic refresh paused after a connection problem. Your saved
            server state is unchanged.
          </span>
          <button
            className="button button--quiet"
            onClick={() => void pollHub()}
            type="button"
          >
            Retry refresh
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
          className="match-inline-alert"
          ref={actionAlert}
          role="alert"
          tabIndex={-1}
        >
          <strong>That PvP request was not completed.</strong>{' '}
          {errorMessage(actionError.failure)}
          {actionError.options.ambiguous
            ? ' Retry uses the same submission reference so the server cannot apply it twice.'
            : ''}
        </div>
      ) : null}

      <section
        aria-labelledby="challenge-player-title"
        className="pvp-challenge-panel"
      >
        <div className="pvp-section-heading">
          <div>
            <p className="eyebrow">Private exact lookup</p>
            <h2 id="challenge-player-title">Challenge a player</h2>
          </div>
          <span>Player Name only</span>
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
            Search is exact and never returns email, account IDs, location,
            decks, or activity.
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
        aria-labelledby="invitations-title"
        className="pvp-hub-section"
        id="invitations"
      >
        <div className="pvp-section-heading">
          <div>
            <p className="eyebrow">Respond or review</p>
            <h2 id="invitations-title">Invitations</h2>
          </div>
        </div>
        <div className="pvp-invitation-columns">
          <InvitationList
            acceptChoices={acceptChoices}
            decks={data.decks}
            direction="incoming"
            invitations={data.incoming}
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
            onLoadMore={() => void loadMore('incoming')}
            pendingOperation={pendingOperation}
          />
          <InvitationList
            acceptChoices={acceptChoices}
            decks={data.decks}
            direction="outgoing"
            invitations={data.outgoing}
            hasMore={data.outgoingNextCursor !== null}
            loadingMore={loadingMore === 'outgoing'}
            onAccept={() => undefined}
            onChoice={() => undefined}
            onDecline={() => undefined}
            onLoadMore={() => void loadMore('outgoing')}
            pendingOperation={pendingOperation}
          />
        </div>
      </section>

      <section
        aria-labelledby="active-pvp-title"
        className="pvp-hub-section"
        id="active-matches"
      >
        <div className="pvp-section-heading">
          <div>
            <p className="eyebrow">Server-timed turns</p>
            <h2 id="active-pvp-title">Active matches</h2>
          </div>
        </div>
        {data.active.length === 0 ? (
          <EmptyState title="No active PvP matches">
            Accept an invitation to begin a persisted match.
          </EmptyState>
        ) : (
          <ol
            aria-label="Active asynchronous PvP matches"
            className="pvp-match-list"
          >
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
        aria-labelledby="pvp-history-title"
        className="pvp-hub-section"
        id="pvp-history"
      >
        <div className="pvp-section-heading">
          <div>
            <p className="eyebrow">Persisted outcomes</p>
            <h2 id="pvp-history-title">History</h2>
          </div>
        </div>
        {data.history.length === 0 ? (
          <EmptyState title="No completed PvP matches">
            Completed wins, losses, and forfeits will appear here.
          </EmptyState>
        ) : (
          <ol
            aria-label="Completed asynchronous PvP matches"
            className="pvp-match-list"
          >
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
    <div className="matches-page pvp-hub">
      <header className="matches-page__header pvp-hub__header">
        <div>
          <Link
            aria-label="Back to Battles"
            className="text-link pvp-loading__back"
            href="/matches"
          >
            ← Battles
          </Link>
          <h1>Player Battles</h1>
          <p className="lead">
            Challenge another explorer and take turns within 24 hours.
          </p>
        </div>
      </header>

      <nav
        aria-busy="true"
        aria-label="Player battle sections"
        className="pvp-section-nav pvp-section-nav--loading"
      >
        <span className="pvp-loading__tab">Invitations</span>
        <span className="pvp-loading__tab">Active</span>
        <span className="pvp-loading__tab">History</span>
      </nav>

      <section
        aria-busy="true"
        aria-live="polite"
        className="pvp-loading"
        role="status"
      >
        <p>Loading player battles…</p>
        <div aria-hidden="true" className="pvp-loading__skeleton">
          <span />
          <span />
          <span />
        </div>
      </section>
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
  onChoice,
  onDecline,
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
  onChoice: (invitationId: string, choice: DeckChoice) => void;
  onDecline: (invitation: PvpInvitation) => void;
  onLoadMore: () => void;
  pendingOperation: string | null;
}) {
  const title = direction === 'incoming' ? 'Incoming' : 'Sent';
  return (
    <section
      aria-labelledby={`${direction}-invitations-title`}
      className="pvp-invitation-group"
    >
      <h3 id={`${direction}-invitations-title`}>{title}</h3>
      {invitations.length === 0 ? (
        <p className="pvp-list-empty">No {direction} invitations.</p>
      ) : (
        <ol
          aria-label={`${title} PvP invitations`}
          className="pvp-invitation-list"
        >
          {invitations.map((invitation) => {
            const accepting =
              pendingOperation === `accept:${invitation.invitationId}`;
            const declining =
              pendingOperation === `decline:${invitation.invitationId}`;
            return (
              <li
                className={`pvp-invitation pvp-invitation--${invitation.status}`}
                key={invitation.invitationId}
              >
                <div className="pvp-invitation__heading">
                  <div>
                    <strong>{invitation.opponent.playerName}</strong>
                    <span>
                      {direction === 'incoming'
                        ? 'challenged you'
                        : 'was challenged'}
                    </span>
                  </div>
                  <span className="pvp-status-label">
                    {invitationStatusLabel(invitation.status)}
                  </span>
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
                {direction === 'incoming' && invitation.status === 'pending' ? (
                  <div className="pvp-invitation__response">
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
                    <div className="match-state-actions">
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
                      <button
                        className="button button--quiet"
                        disabled={pendingOperation !== null}
                        onClick={() => onDecline(invitation)}
                        type="button"
                      >
                        {declining ? 'Declining…' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ) : invitation.matchId ? (
                  <Link
                    className="button button--quiet"
                    href={`/matches/pvp/${invitation.matchId}`}
                  >
                    Open match
                  </Link>
                ) : invitation.status === 'invalidated' ? (
                  <p className="pvp-invitation__explanation">
                    This invitation became unavailable after an account
                    lifecycle change.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {hasMore ? (
        <LoadMoreButton
          label={`${direction} invitations`}
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
                  <small>{titleCase(card.affinity)} affinity</small>
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
          <p className="eyebrow">Opponent</p>
          <h3>{match.opponent.playerName}</h3>
        </div>
        <span className="pvp-status-label">
          {match.currentActor === 'self' ? 'Your turn' : 'Opponent’s turn'}
        </span>
      </div>
      <dl className="pvp-summary-meta">
        <div>
          <dt>Deadline</dt>
          <dd>{formatDate(match.turnDeadline)}</dd>
        </div>
        <div>
          <dt>Server version</dt>
          <dd>v{match.version}</dd>
        </div>
      </dl>
      <Link className="button" href={`/matches/pvp/${match.matchId}`}>
        {match.currentActor === 'self' ? 'Take your turn' : 'View match'}
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
          <p className="eyebrow">Against {match.opponent.playerName}</p>
          <h3>{match.outcome === 'win' ? 'Victory' : 'Defeat'}</h3>
        </div>
        <span className="pvp-status-label">
          {completionReasonLabel(match.completionReason, match.outcome)}
        </span>
      </div>
      <dl className="pvp-summary-meta">
        <div>
          <dt>Completed</dt>
          <dd>{formatDate(match.completedAt)}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{match.outcome === 'win' ? 'You won' : 'You lost'}</dd>
        </div>
      </dl>
      <Link
        className="button button--quiet"
        href={`/matches/pvp/${match.matchId}`}
      >
        View saved match
      </Link>
    </article>
  );
}

function EmptyState({ children, title }: { children: string; title: string }) {
  return (
    <div className="pvp-list-empty">
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

function isChoiceComplete(
  choice: DeckChoice | undefined,
): choice is DeckChoice {
  return Boolean(choice?.deckId && choice.initialCreatureId);
}

function isPending(invitation: PvpInvitation) {
  return invitation.status === 'pending';
}

function isReconciliationFailure(failure: PvpApiFailure) {
  return ['completed', 'expired', 'invalidated', 'stale'].includes(failure);
}

function invitationStatusLabel(status: PvpInvitation['status']) {
  return status === 'invalidated' ? 'Unavailable' : titleCase(status);
}

function completionReasonLabel(
  reason: PvpHistorySummary['completionReason'],
  outcome: 'loss' | 'win',
) {
  if (reason === 'defeat') return 'Battle completed';
  if (reason === 'account_deletion_forfeit')
    return outcome === 'win' ? 'Opponent unavailable' : 'Account forfeit';
  return outcome === 'win' ? 'Opponent missed deadline' : 'Deadline expired';
}

function errorMessage(failure: PvpApiFailure) {
  const messages: Record<PvpApiFailure, string> = {
    'already-pending':
      'A pending invitation already exists between these players.',
    authorization: 'Your session expired. Sign in again before continuing.',
    completed:
      'The match is already complete. Refresh to view its saved result.',
    conflict:
      'That submission reference was already used for different intent. Refresh before trying again.',
    'deck-invalid':
      'The server rejected that saved deck or opening Creature. Review the deck and choose again.',
    expired: 'The invitation expired before the response reached the server.',
    'illegal-action':
      'That action is no longer legal in the authoritative match state.',
    invalidated: 'The invitation is no longer available.',
    'not-found': 'This PvP resource is not available to the signed-in player.',
    'player-unavailable':
      'That Player Name is unavailable. The server does not reveal why.',
    stale:
      'The PvP state changed before the request was accepted. The latest server state will be restored.',
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
