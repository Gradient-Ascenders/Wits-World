import {
  ArrowLeft,
  Binoculars,
  Broadcast,
  Check,
  ClockCountdown,
  X,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';

import { listSavedDecks, type SavedDeck } from '../api/decks';
import {
  cancelRankedQueue,
  getCurrentRankedSeason,
  getRankedQueue,
  heartbeatRankedQueue,
  joinRankedQueue,
  LiveApiError,
  resolveRankedProposal,
  type RankedQueueState,
  type RankedSeason,
} from '../api/live';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { PageLoadingState } from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import './matches.css';

type LobbyState =
  | { status: 'loading' }
  | {
      deck: SavedDeck | null;
      queue: RankedQueueState;
      season: RankedSeason | null;
      status: 'ready';
    }
  | { error: LiveApiError; status: 'error' };

const queuePollMs = 2_500;
const queueHeartbeatMs = 8_000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default function LiveLobbyPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const [, navigate] = useLocation();
  const [state, setState] = useState<LobbyState>({ status: 'loading' });
  const stateRef = useRef(state);
  const [pending, setPending] = useState<
    'join' | 'cancel' | 'accept' | 'decline' | null
  >(null);
  const pendingRef = useRef(false);
  const [spectatorEntry, setSpectatorEntry] = useState('');
  const [spectatorError, setSpectatorError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    'Loading live battle lobby.',
  );
  const [revision, setRevision] = useState(0);
  stateRef.current = state;

  const applyQueue = useCallback(
    (queue: RankedQueueState) => {
      if (queue.status === 'matched' && queue.matchId) {
        navigate(`/matches/live/${queue.matchId}`);
        return;
      }
      setState((current) =>
        current.status === 'ready' ? { ...current, queue } : current,
      );
      setAnnouncement(queueAnnouncement(queue));
    },
    [navigate],
  );

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      listSavedDecks({ apiBaseUrl, getAccessToken, signal: controller.signal }),
      getRankedQueue({ apiBaseUrl, getAccessToken, signal: controller.signal }),
      getCurrentRankedSeason({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      }),
    ])
      .then(([decks, queue, season]) => {
        if (controller.signal.aborted) return;
        if (queue.status === 'matched' && queue.matchId) {
          navigate(`/matches/live/${queue.matchId}`);
          return;
        }
        setState({
          deck: decks.find((deck) => deck.isSelected) ?? null,
          queue,
          season,
          status: 'ready',
        });
        setQueueError(null);
        setAnnouncement(queueAnnouncement(queue));
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({ error: toLiveError(caught), status: 'error' });
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, navigate, revision]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    if (!['searching', 'proposed'].includes(state.queue.status)) return;
    const controller = new AbortController();
    const poll = window.setInterval(() => {
      if (pendingRef.current) return;
      void getRankedQueue({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      })
        .then(applyQueue)
        .catch(() => {
          if (!controller.signal.aborted) {
            setAnnouncement(
              'Live queue refresh was interrupted. Retrying automatically.',
            );
          }
        });
    }, queuePollMs);
    const heartbeat = window.setInterval(() => {
      if (pendingRef.current || stateRef.current.status !== 'ready') return;
      if (stateRef.current.queue.status !== 'searching') return;
      void heartbeatRankedQueue({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      })
        .then(applyQueue)
        .catch(() => {
          if (!controller.signal.aborted) {
            setAnnouncement(
              'The queue heartbeat failed. Checking the authoritative queue state…',
            );
          }
        });
    }, queueHeartbeatMs);
    return () => {
      controller.abort();
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
    };
  }, [
    apiBaseUrl,
    applyQueue,
    getAccessToken,
    state.status,
    state.status === 'ready' ? state.queue.status : null,
  ]);

  const runQueueAction = useCallback(
    async (
      kind: 'join' | 'cancel' | 'accept' | 'decline',
      action: (signal: AbortSignal) => Promise<RankedQueueState>,
    ) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setQueueError(null);
      setPending(kind);
      setAnnouncement(queuePendingLabel(kind));
      const controller = new AbortController();
      try {
        applyQueue(await action(controller.signal));
      } catch (caught) {
        const error = toLiveError(caught);
        const message = queueErrorMessage(error);
        setAnnouncement(message);
        setQueueError(message);
        setState((current) =>
          current.status === 'ready' ? current : { error, status: 'error' },
        );
      } finally {
        pendingRef.current = false;
        setPending(null);
      }
    },
    [applyQueue],
  );

  function openSpectatorMatch() {
    const matchId = parseSpectatorMatchId(spectatorEntry);
    if (!matchId) {
      setSpectatorError('Enter a valid private live-match link or match ID.');
      return;
    }
    setSpectatorError(null);
    navigate(`/matches/live/${matchId}`);
  }

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        title="Opening live battles"
        description="Checking your selected deck and ranked queue…"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <main className="matches-page live-lobby">
        <Link className="battle-back-link" href="/matches">
          <ArrowLeft size={20} aria-hidden="true" /> Battles
        </Link>
        <section className="state-message state-message--error" role="alert">
          <StateIcon tone="error" />
          <div>
            <h1>Live battles are unavailable</h1>
            <p>{queueErrorMessage(state.error)}</p>
            <button
              className="button"
              onClick={() => setRevision((value) => value + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  }

  const { deck, queue, season } = state;
  const proposal = queue.status === 'proposed' && queue.proposalId;
  const searching = queue.status === 'searching';
  const rankedEntryAvailable = season?.status === 'active';

  return (
    <main className="matches-page live-lobby">
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
      <header className="live-lobby__header">
        <Link className="battle-back-link" href="/matches">
          <ArrowLeft size={20} aria-hidden="true" /> Battles
        </Link>
        <div>
          <h1>Live battles</h1>
          <p>
            Enter ranked competition or watch a privately shared match. Every
            turn and result comes from the server.
          </p>
        </div>
      </header>

      <div className="live-lobby__grid">
        <section aria-labelledby="live-rank-title" className="live-lobby__lane">
          <div className="live-lobby__lane-heading">
            <Broadcast size={28} aria-hidden="true" />
            <div>
              <h2 id="live-rank-title">Play ranked live</h2>
              <p>Find an eligible opponent using your selected battle deck.</p>
            </div>
          </div>

          <dl className="live-lobby__facts">
            <div>
              <dt>Selected deck</dt>
              <dd>{deck?.name ?? 'No deck selected'}</dd>
            </div>
            <div>
              <dt>Queue state</dt>
              <dd>
                {rankedEntryAvailable
                  ? queueStatusLabel(queue)
                  : 'Season unavailable'}
              </dd>
            </div>
            <div>
              <dt>Ranked season</dt>
              <dd>{season?.name ?? 'No active season'}</dd>
            </div>
            {queue.searchRange !== null ? (
              <div>
                <dt>Current rating range</dt>
                <dd>±{queue.searchRange}</dd>
              </div>
            ) : null}
          </dl>

          {proposal ? (
            <div className="live-proposal" role="status">
              <ClockCountdown size={26} aria-hidden="true" />
              <div>
                <h3>Opponent found</h3>
                <p>
                  Accept before{' '}
                  {queue.acceptanceDeadline
                    ? formatTime(queue.acceptanceDeadline)
                    : 'the server deadline'}
                  . Your opponent remains private until the match begins.
                </p>
                {queue.accepted ? (
                  <p>
                    <Check size={18} aria-hidden="true" /> Accepted. Waiting for
                    the other player.
                  </p>
                ) : (
                  <div className="live-lobby__actions">
                    <button
                      className="button"
                      disabled={pending !== null}
                      onClick={() =>
                        void runQueueAction('accept', (signal) =>
                          resolveRankedProposal({
                            action: 'accept',
                            apiBaseUrl,
                            getAccessToken,
                            proposalId: proposal,
                            signal,
                          }),
                        )
                      }
                      type="button"
                    >
                      <Check size={18} aria-hidden="true" />
                      {pending === 'accept' ? 'Accepting…' : 'Accept match'}
                    </button>
                    <button
                      className="button button--quiet"
                      disabled={pending !== null}
                      onClick={() =>
                        void runQueueAction('decline', (signal) =>
                          resolveRankedProposal({
                            action: 'decline',
                            apiBaseUrl,
                            getAccessToken,
                            proposalId: proposal,
                            signal,
                          }),
                        )
                      }
                      type="button"
                    >
                      <X size={18} aria-hidden="true" />
                      {pending === 'decline' ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : searching ? (
            <div className="live-searching" role="status">
              <span className="live-searching__signal" aria-hidden="true" />
              <div>
                <h3>Searching for an opponent</h3>
                <p>
                  Keep this page open. The server widens the rating range while
                  the queue remains active.
                </p>
              </div>
              <button
                className="button button--quiet"
                disabled={pending !== null}
                onClick={() =>
                  void runQueueAction('cancel', (signal) =>
                    cancelRankedQueue({
                      apiBaseUrl,
                      getAccessToken,
                      signal,
                    }),
                  )
                }
                type="button"
              >
                {pending === 'cancel' ? 'Leaving…' : 'Leave queue'}
              </button>
            </div>
          ) : (
            <div className="live-lobby__start">
              {deck ? (
                <button
                  className="button"
                  disabled={pending !== null || !rankedEntryAvailable}
                  onClick={() =>
                    void runQueueAction('join', (signal) =>
                      joinRankedQueue({
                        apiBaseUrl,
                        deckId: deck.deckId,
                        getAccessToken,
                        signal,
                      }),
                    )
                  }
                  type="button"
                >
                  <Broadcast size={19} aria-hidden="true" />
                  {pending === 'join' ? 'Joining queue…' : 'Find live match'}
                </button>
              ) : (
                <Link className="button" href="/decks">
                  Select a battle deck
                </Link>
              )}
              {queue.status === 'restricted' ? (
                <p className="live-lobby__warning">
                  Ranked entry is currently restricted for this account. Other
                  battle modes remain available.
                </p>
              ) : queue.status === 'invalid_deck' ? (
                <p className="live-lobby__warning">
                  The selected deck no longer meets the server’s ranked rules.
                </p>
              ) : null}
              {!rankedEntryAvailable ? (
                <div className="live-lobby__availability" role="status">
                  <p className="live-lobby__warning">
                    {season?.status === 'closing'
                      ? 'This ranked season is closing. New live matches are paused.'
                      : 'No ranked season is active. Live matchmaking will open after an operator starts one.'}
                  </p>
                  <button
                    className="button button--quiet"
                    onClick={() => setRevision((value) => value + 1)}
                    type="button"
                  >
                    Check season again
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {queueError ? (
            <p className="live-lobby__warning" role="alert">
              {queueError}
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="live-watch-title"
          className="live-lobby__lane live-lobby__lane--watch"
        >
          <div className="live-lobby__lane-heading">
            <Binoculars size={28} aria-hidden="true" />
            <div>
              <h2 id="live-watch-title">Watch a private match</h2>
              <p>
                Spectators need a link or opaque ID shared by someone who knows
                the match.
              </p>
            </div>
          </div>
          <form
            className="live-spectator-form"
            onSubmit={(event) => {
              event.preventDefault();
              openSpectatorMatch();
            }}
          >
            <label htmlFor="live-match-entry">Private match link or ID</label>
            <input
              aria-describedby={
                spectatorError ? 'live-match-entry-error' : 'live-match-hint'
              }
              aria-invalid={spectatorError ? 'true' : undefined}
              autoComplete="off"
              id="live-match-entry"
              onChange={(event) => {
                setSpectatorEntry(event.currentTarget.value);
                setSpectatorError(null);
              }}
              placeholder="https://…/matches/live/…"
              spellCheck={false}
              value={spectatorEntry}
            />
            <p id="live-match-hint">
              There is no public match list. The server returns only the
              spectator-safe projection.
            </p>
            {spectatorError ? (
              <p id="live-match-entry-error" role="alert">
                {spectatorError}
              </p>
            ) : null}
            <button className="button" type="submit">
              <Binoculars size={19} aria-hidden="true" /> Watch match
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export function parseSpectatorMatchId(value: string): string | null {
  const trimmed = value.trim();
  if (uuidPattern.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    const match = url.pathname.match(/\/matches\/live\/([0-9a-f-]{36})\/?$/iu);
    return match?.[1] && uuidPattern.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

function queueStatusLabel(queue: RankedQueueState): string {
  return {
    idle: 'Ready to search',
    searching: 'Searching',
    proposed: queue.accepted ? 'Accepted proposal' : 'Opponent found',
    matched: 'Match ready',
    cancelled: 'Queue left',
    expired: 'Queue expired',
    restricted: 'Entry restricted',
    invalid_deck: 'Deck needs attention',
  }[queue.status];
}

function queueAnnouncement(queue: RankedQueueState): string {
  if (queue.status === 'searching') return 'Searching for a ranked opponent.';
  if (queue.status === 'proposed') {
    return queue.accepted
      ? 'Match accepted. Waiting for the other player.'
      : 'Opponent found. Accept or decline the match.';
  }
  if (queue.status === 'matched') return 'Live match ready.';
  return queueStatusLabel(queue);
}

function queuePendingLabel(kind: 'join' | 'cancel' | 'accept' | 'decline') {
  return {
    join: 'Joining the ranked queue…',
    cancel: 'Leaving the ranked queue…',
    accept: 'Accepting the match proposal…',
    decline: 'Declining the match proposal…',
  }[kind];
}

function queueErrorMessage(error: LiveApiError): string {
  if (error.failure === 'authentication')
    return 'Sign in again to use ranked live battles.';
  if (error.failure === 'restricted')
    return 'Ranked entry is currently restricted for this account.';
  if (error.failure === 'invalid-deck')
    return 'The selected deck is not eligible for ranked play.';
  if (error.failure === 'conflict')
    return (
      error.options.detail ??
      'The queue changed before that request completed. Refresh and try again.'
    );
  return error.options.detail ?? 'The ranked queue is temporarily unavailable.';
}

function toLiveError(value: unknown): LiveApiError {
  return value instanceof LiveApiError
    ? value
    : new LiveApiError('unavailable');
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
