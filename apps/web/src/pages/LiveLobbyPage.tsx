import {
  ArrowLeft,
  Binoculars,
  Broadcast,
  Check,
  ClipboardText,
  ClockCountdown,
  WarningCircle,
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
  const [queueConnectionInterrupted, setQueueConnectionInterrupted] =
    useState(false);
  const [queueRefreshPending, setQueueRefreshPending] = useState(false);
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
      setQueueConnectionInterrupted(false);
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
        setQueueConnectionInterrupted(false);
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
            setQueueConnectionInterrupted(true);
            setAnnouncement(
              'Matchmaking could not refresh. Trying again automatically.',
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
            setQueueConnectionInterrupted(true);
            setAnnouncement(
              'Your search could not be kept active. Checking its latest status…',
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

  async function refreshQueueStatus() {
    if (queueRefreshPending || pendingRef.current) return;
    setQueueRefreshPending(true);
    const controller = new AbortController();
    try {
      applyQueue(
        await getRankedQueue({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        }),
      );
    } catch {
      setQueueConnectionInterrupted(true);
      setAnnouncement(
        'Matchmaking is still reconnecting. Keep this page open.',
      );
    } finally {
      setQueueRefreshPending(false);
    }
  }

  function openSpectatorMatch() {
    const matchId = parseSpectatorMatchId(spectatorEntry);
    if (!matchId) {
      setSpectatorError(
        'Paste a valid private battle link or enter its match ID.',
      );
      return;
    }
    setSpectatorError(null);
    navigate(`/matches/live/${matchId}`);
  }

  async function pasteAndOpenSpectatorMatch() {
    if (!navigator.clipboard?.readText) {
      setSpectatorError(
        'Clipboard access is unavailable. Touch and hold the field to paste the private link.',
      );
      return;
    }
    try {
      const value = await navigator.clipboard.readText();
      setSpectatorEntry(value);
      const matchId = parseSpectatorMatchId(value);
      if (!matchId) {
        setSpectatorError(
          'Your clipboard does not contain a valid private battle link or match ID.',
        );
        return;
      }
      setSpectatorError(null);
      navigate(`/matches/live/${matchId}`);
    } catch {
      setSpectatorError(
        'Clipboard access was blocked. Touch and hold the field to paste the private link.',
      );
    }
  }

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        title="Opening live ranked battles"
        description="Checking your selected deck and matchmaking status…"
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
            <h1>Live Ranked is unavailable</h1>
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
          <h1>Live Ranked</h1>
          <p>
            Queue for a ranked battle with one minute for each decision, or
            watch a private match shared with you. If your connection drops,
            return to recover the latest battle state.
          </p>
        </div>
      </header>

      <div className="live-lobby__grid">
        <section aria-labelledby="live-rank-title" className="live-lobby__lane">
          <div className="live-lobby__lane-heading">
            <Broadcast size={28} aria-hidden="true" />
            <div>
              <h2 id="live-rank-title">Play ranked</h2>
              <p>
                Completed ranked battles change your seasonal rating. Your first
                five results each season are placement matches.
              </p>
            </div>
          </div>

          <dl className="live-lobby__facts">
            <div>
              <dt>Matchmaking status</dt>
              <dd>
                {rankedEntryAvailable
                  ? queueStatusLabel(queue)
                  : 'Season unavailable'}
              </dd>
            </div>
            <div>
              <dt>Selected deck</dt>
              <dd>{deck?.name ?? 'No deck selected'}</dd>
            </div>
            <div>
              <dt>Ranked season</dt>
              <dd>{season?.name ?? 'No active season'}</dd>
            </div>
            {queue.searchRange !== null ? (
              <div>
                <dt>Rating search range</dt>
                <dd>±{queue.searchRange}</dd>
              </div>
            ) : null}
          </dl>

          {queueConnectionInterrupted ? (
            <div
              className="live-status-banner live-queue-recovery"
              role="status"
            >
              <WarningCircle size={24} aria-hidden="true" />
              <div>
                <strong>Checking your place in matchmaking</strong>
                <p>
                  Keep this page open. You do not need to join again—we’ll
                  restore your latest search status automatically.
                </p>
              </div>
              <button
                className="button button--quiet"
                disabled={queueRefreshPending}
                onClick={() => void refreshQueueStatus()}
                type="button"
              >
                {queueRefreshPending ? 'Checking…' : 'Check now'}
              </button>
            </div>
          ) : null}

          {queue.status === 'expired' || queue.status === 'cancelled' ? (
            <div className="live-status-banner" role="status">
              <WarningCircle size={24} aria-hidden="true" />
              <div>
                <strong>
                  {queue.status === 'expired'
                    ? 'Your search expired'
                    : 'Your previous search ended'}
                </strong>
                <p>
                  No battle was created, so your rating did not change. Start a
                  new search when you are ready.
                </p>
              </div>
            </div>
          ) : null}

          {proposal ? (
            <div className="live-proposal" role="status">
              <ClockCountdown size={26} aria-hidden="true" />
              <div>
                <h3>{queue.accepted ? 'Match accepted' : 'Opponent found'}</h3>
                {queue.accepted ? (
                  <p>
                    Waiting for the other player until{' '}
                    {queue.acceptanceDeadline
                      ? formatTime(queue.acceptanceDeadline)
                      : 'the acceptance window closes'}
                    . If they do not accept, you keep your original search time
                    when you remain eligible.
                  </p>
                ) : (
                  <p>
                    Accept before{' '}
                    {queue.acceptanceDeadline
                      ? formatTime(queue.acceptanceDeadline)
                      : 'the acceptance window closes'}
                    . Declining or missing the deadline pauses matchmaking for
                    30 seconds. Your opponent stays private until the battle
                    begins.
                  </p>
                )}
                {queue.accepted ? (
                  <p>
                    <Check size={18} aria-hidden="true" /> Ready. Only a
                    completed ranked battle can change your rating.
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
                  Keep this page open while matchmaking widens your rating
                  range. Leaving now ends the search with no cooldown or rating
                  change.
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
                {pending === 'cancel' ? 'Leaving search…' : 'Leave search'}
              </button>
            </div>
          ) : (
            <div className="live-lobby__start">
              {deck && rankedEntryAvailable ? (
                <p>
                  Leaving while searching has no cooldown. Once an opponent is
                  found, you have 20 seconds to accept; declining or running out
                  of time pauses matchmaking for 30 seconds. After both players
                  accept, conceding or reaching the live timeout limit counts as
                  a ranked loss.
                </p>
              ) : null}
              {queue.status === 'restricted' ? (
                <p className="live-lobby__warning">
                  Ranked matchmaking is unavailable for this account right now.
                  You can still play other battle modes or watch a private
                  battle.
                </p>
              ) : queue.status === 'invalid_deck' ? (
                <p className="live-lobby__warning">
                  Your selected deck no longer meets ranked rules. Review it
                  before searching again.
                </p>
              ) : null}
              {!rankedEntryAvailable ? (
                <div className="live-lobby__availability" role="status">
                  <p className="live-lobby__warning">
                    {season?.status === 'closing'
                      ? 'This ranked season is closing. New ranked battles will open with the next active season.'
                      : 'No ranked season is active. Matchmaking will open when the next season begins.'}
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
                  {pending === 'join'
                    ? 'Joining matchmaking…'
                    : 'Find ranked battle'}
                </button>
              ) : (
                <Link className="button" href="/decks">
                  Select a battle deck
                </Link>
              )}
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
              <p>Use a private battle link or match ID shared with you.</p>
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
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="go"
              id="live-match-entry"
              inputMode="url"
              onChange={(event) => {
                setSpectatorEntry(event.currentTarget.value);
                setSpectatorError(null);
              }}
              placeholder="https://…/matches/live/…"
              spellCheck={false}
              value={spectatorEntry}
            />
            <p id="live-match-hint">
              Private battles are not listed publicly. Spectators can see the
              battlefield, turn timer, and battle activity—but never either
              player’s hand or controls.
            </p>
            {spectatorError ? (
              <p id="live-match-entry-error" role="alert">
                {spectatorError}
              </p>
            ) : null}
            <div className="live-spectator-form__actions">
              <button
                className="button button--quiet"
                onClick={() => void pasteAndOpenSpectatorMatch()}
                type="button"
              >
                <ClipboardText size={19} aria-hidden="true" /> Paste and watch
              </button>
              <button
                className="button button--quiet"
                disabled={spectatorEntry.trim() === ''}
                type="submit"
              >
                <Binoculars size={19} aria-hidden="true" /> Watch entered match
              </button>
            </div>
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
    idle: 'Ready to find a match',
    searching: 'Finding an opponent',
    proposed: queue.accepted ? 'Accepted — waiting' : 'Opponent found',
    matched: 'Battle ready',
    cancelled: 'Search ended',
    expired: 'Search expired',
    restricted: 'Ranked play unavailable',
    invalid_deck: 'Deck needs attention',
  }[queue.status];
}

function queueAnnouncement(queue: RankedQueueState): string {
  if (queue.status === 'searching') return 'Finding a ranked opponent.';
  if (queue.status === 'proposed') {
    return queue.accepted
      ? 'Match accepted. Waiting for the other player.'
      : 'Opponent found. Accept within 20 seconds or decline the match.';
  }
  if (queue.status === 'matched') return 'Ranked battle ready.';
  return queueStatusLabel(queue);
}

function queuePendingLabel(kind: 'join' | 'cancel' | 'accept' | 'decline') {
  return {
    join: 'Joining ranked matchmaking…',
    cancel: 'Leaving the search…',
    accept: 'Accepting the match…',
    decline: 'Declining the match…',
  }[kind];
}

function queueErrorMessage(error: LiveApiError): string {
  if (error.failure === 'authentication')
    return 'Sign in again to join or watch live ranked battles.';
  if (error.failure === 'restricted')
    return 'This account cannot enter ranked matchmaking right now. Other battle modes and private spectating remain available.';
  if (error.failure === 'invalid-deck')
    return 'Your selected deck does not meet ranked rules. Review it before searching again.';
  if (error.failure === 'conflict')
    return (
      error.options.detail ??
      'Your matchmaking status changed before that action finished. Review the latest status and try again.'
    );
  return (
    error.options.detail ??
    'Ranked matchmaking is temporarily unavailable. Try again shortly or choose another battle mode.'
  );
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
