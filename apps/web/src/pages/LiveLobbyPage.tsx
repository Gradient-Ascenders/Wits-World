import { createAppDateTimeFormatter } from '../date-time';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClockCountdown,
  Lightning,
  MapPin,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link, useLocation } from 'wouter';

import { listSavedDecks, type SavedDeck } from '../api/decks';
import { listOwnedCards, type OwnedCard } from '../api/cards';
import {
  cancelRankedQueue,
  getCurrentRankedSeason,
  getRankedProfile,
  getRankedQueue,
  heartbeatRankedQueue,
  joinRankedQueue,
  listRankedStandings,
  LiveApiError,
  resolveRankedProposal,
  type RankedProfile,
  type RankedQueueState,
  type RankedSeason,
  type RankedStandingsPage,
} from '../api/live';
import {
  listTerritoryZones,
  type TerritoryZoneSummary,
} from '../api/territory';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import {
  BrowserLocationError,
  requestBrowserLocation,
  type LocationClaimProvider,
} from '../browser-location';
import { LoadingState, PageLoadingState } from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import {
  CardArtwork,
  CardThumbnail,
} from '../components/cards/CollectibleCard';
import {
  CardPresentationDialog,
  type CardDialogPresentation,
} from '../components/cards/CardPresentationDialog';
import '../components/cards/cards.css';

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

type ResourceState<T> =
  | { status: 'loading' }
  | { error: LiveApiError; status: 'error' }
  | { data: T; status: 'ready' };

type TerritoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { data: TerritoryZoneSummary[]; status: 'ready' };

type TerritoryDetectionState =
  | { status: 'idle' }
  | { status: 'checking' }
  | {
      name: string;
      status: 'detected' | 'confirmed' | 'rejected';
      zoneId: string;
    }
  | { status: 'none' }
  | { status: 'unavailable' };

type LobbyTab = 'play' | 'standings' | 'watch';

const lobbyTabs: ReadonlyArray<{ id: LobbyTab; label: string }> = [
  { id: 'play', label: 'Play' },
  { id: 'standings', label: 'Standings' },
  { id: 'watch', label: 'Watch' },
];

const queuePollMs = 2_500;
const queueHeartbeatMs = 8_000;
const standingsPageSize = 25;
const numberFormatter = new Intl.NumberFormat('en-ZA');
const seasonDateFormatter = createAppDateTimeFormatter('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default function LiveLobbyPage({
  apiBaseUrl,
  locationClaimProvider = requestBrowserLocation,
}: {
  apiBaseUrl: string;
  locationClaimProvider?: LocationClaimProvider;
}) {
  const getAccessToken = useApiAccessToken();
  const [, navigate] = useLocation();
  const [state, setState] = useState<LobbyState>({ status: 'loading' });
  const [deckCards, setDeckCards] = useState<ResourceState<OwnedCard[]>>({
    status: 'loading',
  });
  const [cardRevision, setCardRevision] = useState(0);
  const [inspectedCard, setInspectedCard] =
    useState<CardDialogPresentation | null>(null);
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
  const [profile, setProfile] = useState<ResourceState<RankedProfile>>({
    status: 'loading',
  });
  const [standings, setStandings] = useState<
    ResourceState<RankedStandingsPage>
  >({ status: 'loading' });
  const [standingsLoadingMore, setStandingsLoadingMore] = useState(false);
  const [standingsPageError, setStandingsPageError] = useState(false);
  const [territories, setTerritories] = useState<TerritoryState>({
    status: 'loading',
  });
  const [territoryRevision, setTerritoryRevision] = useState(0);
  const [contestTerritory, setContestTerritory] = useState(false);
  const [territoryDetection, setTerritoryDetection] =
    useState<TerritoryDetectionState>({ status: 'idle' });
  const [clock, setClock] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<LobbyTab>(() =>
    lobbyTabFromSearch(window.location.search),
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const proposalHeading = useRef<HTMLHeadingElement>(null);
  const previousQueueStatus = useRef<RankedQueueState['status'] | null>(null);
  const [announcement, setAnnouncement] = useState('Loading ranked battles.');
  const [seasonRevision, setSeasonRevision] = useState(0);
  const refreshedSeasonBoundary = useRef<string | null>(null);
  stateRef.current = state;

  const refreshSeasonResources = useCallback(() => {
    setSeasonRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const currentSeason = state.status === 'ready' ? state.season : null;
  const currentDeck = state.status === 'ready' ? state.deck : null;

  useEffect(() => {
    if (!currentDeck) return;
    const controller = new AbortController();
    setDeckCards({ status: 'loading' });
    setInspectedCard(null);
    void listOwnedCards({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setDeckCards({ data, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDeckCards({ error: toLiveError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, currentDeck, cardRevision]);

  useEffect(() => {
    if (
      currentSeason?.status !== 'active' ||
      currentSeason.activeEndsAt === null
    ) {
      return;
    }

    const boundary = Date.parse(currentSeason.activeEndsAt);
    const boundaryKey = `${currentSeason.seasonId}:${currentSeason.activeEndsAt}`;
    let timeout: number | undefined;

    const refreshAtBoundary = () => {
      const remaining = boundary - Date.now();
      if (remaining > 0) {
        timeout = window.setTimeout(
          refreshAtBoundary,
          Math.min(remaining, 2_147_000_000),
        );
        return;
      }

      setClock(Date.now());
      if (refreshedSeasonBoundary.current === boundaryKey) return;
      refreshedSeasonBoundary.current = boundaryKey;
      refreshSeasonResources();
    };

    refreshAtBoundary();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [currentSeason, refreshSeasonResources]);

  useEffect(() => {
    const syncTabFromHistory = () =>
      setActiveTab(lobbyTabFromSearch(window.location.search));
    window.addEventListener('popstate', syncTabFromHistory);
    return () => window.removeEventListener('popstate', syncTabFromHistory);
  }, []);

  function selectTab(tab: LobbyTab, focus = false) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'play') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', url);
    if (focus) {
      const index = lobbyTabs.findIndex((candidate) => candidate.id === tab);
      tabRefs.current[index]?.focus();
    }
  }

  function selectTabFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % lobbyTabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + lobbyTabs.length) % lobbyTabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lobbyTabs.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(lobbyTabs[nextIndex]!.id, true);
  }

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
  }, [apiBaseUrl, getAccessToken, navigate, seasonRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setProfile({ status: 'loading' });
    void getRankedProfile({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setProfile({ data, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProfile({ error: toLiveError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, seasonRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setStandings({ status: 'loading' });
    setStandingsPageError(false);
    void listRankedStandings({
      apiBaseUrl,
      getAccessToken,
      limit: standingsPageSize,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setStandings({ data, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStandings({ error: toLiveError(error), status: 'error' });
        }
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, seasonRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setTerritories({ status: 'loading' });
    void listTerritoryZones({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((zones) => {
        if (!controller.signal.aborted) {
          setTerritories({ data: zones, status: 'ready' });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setTerritories({ status: 'error' });
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, territoryRevision]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    if (
      state.queue.status === 'proposed' &&
      previousQueueStatus.current !== 'proposed'
    ) {
      proposalHeading.current?.focus();
    }
    previousQueueStatus.current = state.queue.status;
  }, [state]);

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
            setAnnouncement('Connection lost. Reconnecting…');
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
            setAnnouncement('Connection lost. Checking your search…');
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
        if (error.failure === 'conflict' || error.failure === 'unavailable') {
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
          }
        }
        setState((current) =>
          current.status === 'ready' ? current : { error, status: 'error' },
        );
      } finally {
        pendingRef.current = false;
        setPending(null);
      }
    },
    [apiBaseUrl, applyQueue, getAccessToken],
  );

  async function joinQueue(deck: SavedDeck, signal: AbortSignal) {
    if (!contestTerritory) {
      return joinRankedQueue({
        apiBaseUrl,
        deckId: deck.deckId,
        getAccessToken,
        signal,
      });
    }
    if (territories.status !== 'ready') {
      setTerritoryDetection({ status: 'unavailable' });
      throw new LiveApiError('validation', {
        detail: 'Territories unavailable. Retry or turn off Contest territory.',
      });
    }
    setTerritoryDetection({ status: 'checking' });
    let claim: Awaited<ReturnType<LocationClaimProvider>>;
    try {
      claim = await locationClaimProvider();
    } catch (error) {
      setTerritoryDetection({ status: 'unavailable' });
      throw error;
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const detectedTerritory = detectTerritoryAtLocation(
      territories.data,
      claim.latitude,
      claim.longitude,
    );
    if (!detectedTerritory) {
      setTerritoryDetection({ status: 'none' });
      throw new LiveApiError('validation', {
        detail:
          'No active territory found. Move inside one or turn off Contest territory.',
      });
    }
    setTerritoryDetection({
      name: detectedTerritory.name,
      status: 'detected',
      zoneId: detectedTerritory.zoneId,
    });
    let nextQueue: RankedQueueState;
    try {
      nextQueue = await joinRankedQueue({
        apiBaseUrl,
        deckId: deck.deckId,
        getAccessToken,
        signal,
        territoryClaim: { ...claim, zoneId: detectedTerritory.zoneId },
      });
    } catch (error) {
      setTerritoryDetection({
        name: detectedTerritory.name,
        status: 'rejected',
        zoneId: detectedTerritory.zoneId,
      });
      throw error;
    }
    setTerritoryDetection({
      name: detectedTerritory.name,
      status: 'confirmed',
      zoneId: detectedTerritory.zoneId,
    });
    return nextQueue;
  }

  async function loadMoreStandings() {
    if (
      standings.status !== 'ready' ||
      !standings.data.nextCursor ||
      standingsLoadingMore
    ) {
      return;
    }
    setStandingsLoadingMore(true);
    setStandingsPageError(false);
    const cursor = standings.data.nextCursor;
    const seasonId = standings.data.season.seasonId;
    const controller = new AbortController();
    try {
      const next = await listRankedStandings({
        apiBaseUrl,
        cursor,
        getAccessToken,
        limit: standingsPageSize,
        signal: controller.signal,
      });
      if (next.season.seasonId !== seasonId) {
        refreshSeasonResources();
        return;
      }
      setStandings((current) =>
        current.status === 'ready' && current.data.nextCursor === cursor
          ? {
              data: {
                ...current.data,
                entries: [...current.data.entries, ...next.entries],
                nextCursor: next.nextCursor,
              },
              status: 'ready',
            }
          : current,
      );
    } catch {
      setStandingsPageError(true);
    } finally {
      setStandingsLoadingMore(false);
    }
  }

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
      setAnnouncement('Still reconnecting. Keep this page open.');
    } finally {
      setQueueRefreshPending(false);
    }
  }

  function openSpectatorMatch() {
    const matchId = parseSpectatorMatchId(spectatorEntry);
    if (!matchId) {
      setSpectatorError('Enter a valid battle link or ID.');
      return;
    }
    setSpectatorError(null);
    navigate(`/matches/live/${matchId}`);
  }

  async function pasteAndOpenSpectatorMatch() {
    if (!navigator.clipboard?.readText) {
      setSpectatorError('Paste your battle link into the field.');
      return;
    }
    try {
      const value = await navigator.clipboard.readText();
      setSpectatorEntry(value);
      const matchId = parseSpectatorMatchId(value);
      if (!matchId) {
        setSpectatorError('Copy a battle link or ID, then try again.');
        return;
      }
      setSpectatorError(null);
      navigate(`/matches/live/${matchId}`);
    } catch {
      setSpectatorError('Clipboard blocked. Paste your link into the field.');
    }
  }

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        title="Loading ranked battles"
        description="Checking your deck…"
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
              onClick={refreshSeasonResources}
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
  const seasonBoundaryReached =
    season?.activeEndsAt !== null &&
    season?.activeEndsAt !== undefined &&
    Date.parse(season.activeEndsAt) <= clock;
  const rankedEntryAvailable =
    season?.status === 'active' && !seasonBoundaryReached;
  const profileSeasonMismatch =
    profile.status === 'ready' &&
    (profile.data.season?.seasonId ?? null) !== (season?.seasonId ?? null);
  const standingsSeasonMismatch =
    standings.status === 'ready' &&
    standings.data.season.seasonId !== season?.seasonId;
  const rankedQueueCanStart = ['idle', 'cancelled', 'expired'].includes(
    queue.status,
  );
  const territoryDetectionAvailable =
    territories.status === 'ready' &&
    territories.data.some((zone) => zone.status === 'active');

  return (
    <main className="matches-page live-lobby">
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
      <header className="live-lobby__header">
        <h1>
          <Lightning aria-hidden="true" size={18} /> Live Ranked
        </h1>
        <div
          aria-label="Live Ranked views"
          className="live-lobby__tabs"
          role="tablist"
        >
          {lobbyTabs.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                aria-controls={`live-panel-${tab.id}`}
                aria-selected={selected}
                className="live-lobby__tab"
                id={`live-tab-${tab.id}`}
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => selectTabFromKeyboard(event, index)}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="live-lobby__stage">
        <RankedSeasonStrip
          clock={clock}
          mismatch={profileSeasonMismatch}
          onRetry={refreshSeasonResources}
          profile={profile}
          season={season}
        />

        {queueConnectionInterrupted || proposal || searching ? (
          <div className="live-lobby__active-status">
            {queueConnectionInterrupted ? (
              <div
                className="live-status-banner live-queue-recovery"
                role="status"
              >
                <WarningCircle size={24} aria-hidden="true" />
                <div>
                  <strong>Reconnecting…</strong>
                  <p>Keep this page open.</p>
                </div>
                <button
                  className="button button--quiet"
                  disabled={queueRefreshPending}
                  onClick={() => void refreshQueueStatus()}
                  type="button"
                >
                  {queueRefreshPending ? 'Checking…' : 'Retry'}
                </button>
              </div>
            ) : null}

            {proposal ? (
              <div className="live-proposal" role="status">
                <ClockCountdown size={26} aria-hidden="true" />
                <div>
                  <h2 ref={proposalHeading} tabIndex={-1}>
                    {queue.accepted ? 'Match accepted' : 'Opponent found'}
                  </h2>
                  {queue.accepted ? (
                    <p>
                      Waiting for opponent until{' '}
                      {queue.acceptanceDeadline
                        ? formatTime(queue.acceptanceDeadline)
                        : 'the deadline'}
                      .
                    </p>
                  ) : (
                    <p>
                      Accept before{' '}
                      {queue.acceptanceDeadline
                        ? formatTime(queue.acceptanceDeadline)
                        : 'the deadline'}
                      . Declining or missing this match adds a 30-second wait.
                    </p>
                  )}
                  {!queue.accepted ? (
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
                        {pending === 'accept' ? 'Accepting…' : 'Accept'}
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
                  ) : null}
                </div>
              </div>
            ) : searching ? (
              <div className="live-searching" role="status">
                <span className="live-searching__signal" aria-hidden="true" />
                <div>
                  <h2>Finding opponent…</h2>
                  {territoryDetection.status === 'confirmed' ? (
                    <p>Contesting {territoryDetection.name}.</p>
                  ) : null}
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
                  {pending === 'cancel' ? 'Cancelling…' : 'Cancel search'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {queueError ? (
          <p className="live-lobby__warning" role="alert">
            {queueError}
          </p>
        ) : null}

        <div className="live-lobby__workspace">
          <section
            aria-labelledby="live-tab-play"
            className="live-lobby__tabpanel"
            hidden={activeTab !== 'play'}
            id="live-panel-play"
            role="tabpanel"
          >
            <div
              className={`live-lobby__deck${proposal || searching ? ' live-lobby__deck--queued' : ''}`}
            >
              {deck ? (
                <div
                  className="live-deck-fan"
                  aria-label="Active deck cards"
                  role="group"
                >
                  {[...deck.cards]
                    .sort((first, second) => first.position - second.position)
                    .map((card, index) => {
                      const ownedCard =
                        deckCards.status === 'ready'
                          ? deckCards.data.find(
                              (owned) => owned.ownedCardId === card.ownedCardId,
                            )
                          : undefined;
                      return (
                        <span
                          className={`live-deck-fan__card live-deck-fan__card--${index + 1}`}
                          key={card.ownedCardId}
                        >
                          {ownedCard ? (
                            <CardThumbnail
                              accessibleLabel={`View ${ownedCard.name} details, card ${card.position}`}
                              card={ownedCard}
                              loading="eager"
                              motion="smooth"
                              nameplate={null}
                              onClick={() => setInspectedCard(ownedCard)}
                            />
                          ) : (
                            <CardArtwork
                              card={{ ...card, imageUrl: null }}
                              thumbnail
                            />
                          )}
                        </span>
                      );
                    })}
                </div>
              ) : null}
              {deckCards.status === 'error' && deck ? (
                <div className="live-lobby__card-recovery" role="status">
                  <span>Card details couldn’t load.</span>
                  <button
                    className="button button--quiet"
                    onClick={() => setCardRevision((value) => value + 1)}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              <div className="live-lobby__deck-info">
                <span className="sr-only">Selected deck</span>
                <h2>{deck?.name ?? 'No deck selected'}</h2>
                {deck && !proposal && !searching ? (
                  <Link
                    className="button button--quiet live-lobby__change-deck"
                    href="/collection/decks"
                  >
                    Change deck <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </div>

            {queue.status === 'expired' || queue.status === 'cancelled' ? (
              <div className="live-status-banner" role="status">
                <WarningCircle size={24} aria-hidden="true" />
                <div>
                  <strong>
                    {queue.status === 'expired'
                      ? 'Search expired'
                      : 'Search ended'}
                  </strong>
                  <p>Your rating is unchanged.</p>
                </div>
              </div>
            ) : null}

            {!proposal && !searching ? (
              <div className="live-lobby__start">
                {queue.status === 'restricted' ? (
                  <p className="live-lobby__warning">
                    Ranked play is unavailable for your account. Try another
                    mode or watch a match.
                  </p>
                ) : queue.status === 'invalid_deck' ? (
                  <p className="live-lobby__warning">
                    Update your deck to play ranked.
                  </p>
                ) : null}
                {!rankedEntryAvailable ? (
                  <div className="live-lobby__availability" role="status">
                    <p className="live-lobby__warning">
                      {season?.status === 'closing'
                        ? 'Season closing. Play resumes next season.'
                        : seasonBoundaryReached
                          ? 'Season ended. Checking for a new season…'
                          : 'No active season. Check back later.'}
                    </p>
                    <button
                      className="button button--quiet"
                      onClick={refreshSeasonResources}
                      type="button"
                    >
                      Refresh season
                    </button>
                  </div>
                ) : null}
                {deck && rankedEntryAvailable && rankedQueueCanStart ? (
                  <>
                    <button
                      className="button live-lobby__find"
                      disabled={
                        pending !== null ||
                        queueConnectionInterrupted ||
                        (contestTerritory && !territoryDetectionAvailable)
                      }
                      onClick={() =>
                        void runQueueAction('join', (signal) =>
                          joinQueue(deck, signal),
                        )
                      }
                      type="button"
                    >
                      {pending === 'join'
                        ? 'Finding opponent…'
                        : contestTerritory
                          ? 'Find territory battle'
                          : 'Find battle'}
                      <ArrowRight size={22} aria-hidden="true" />
                    </button>
                    <TerritoryQueueOption
                      contest={contestTerritory}
                      disabled={pending !== null || queueConnectionInterrupted}
                      onContestChange={(next) => {
                        setContestTerritory(next);
                        setTerritoryDetection({ status: 'idle' });
                        setQueueError(null);
                      }}
                      onRetry={() => setTerritoryRevision((value) => value + 1)}
                      detection={territoryDetection}
                      state={territories}
                    />
                    <details className="live-ranked-rules">
                      <summary>Ranked rules</summary>
                      <p>
                        Accept within 20 seconds. Declining or missing a match
                        adds a 30-second wait.
                      </p>
                      <p>Forfeit or miss three turns in a row and you lose.</p>
                    </details>
                  </>
                ) : rankedEntryAvailable && queue.status !== 'restricted' ? (
                  <Link className="button" href="/collection/decks">
                    {queue.status === 'invalid_deck'
                      ? 'Edit deck'
                      : 'Select deck'}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>

          <div
            aria-labelledby="live-tab-standings"
            className="live-lobby__tabpanel"
            hidden={activeTab !== 'standings'}
            id="live-panel-standings"
            role="tabpanel"
          >
            <RankedStandingsSection
              loadingMore={standingsLoadingMore}
              mismatch={standingsSeasonMismatch}
              onLoadMore={() => void loadMoreStandings()}
              onRetry={refreshSeasonResources}
              pageError={standingsPageError}
              season={season}
              state={standings}
            />
          </div>

          <section
            aria-labelledby="live-tab-watch"
            className="live-lobby__tabpanel"
            hidden={activeTab !== 'watch'}
            id="live-panel-watch"
            role="tabpanel"
          >
            <form
              className="live-spectator-form"
              onSubmit={(event) => {
                event.preventDefault();
                openSpectatorMatch();
              }}
            >
              <label htmlFor="live-match-entry">
                Private battle link or ID
              </label>
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
              <p id="live-match-hint">Players’ hands stay hidden.</p>
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
                  Paste and watch
                </button>
                <button
                  className="button"
                  disabled={spectatorEntry.trim() === ''}
                  type="submit"
                >
                  Watch
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
      {inspectedCard ? (
        <CardPresentationDialog
          card={inspectedCard}
          onClose={() => setInspectedCard(null)}
        />
      ) : null}
    </main>
  );
}

function RankedSeasonStrip({
  clock,
  mismatch,
  onRetry,
  profile,
  season,
}: {
  clock: number;
  mismatch: boolean;
  onRetry: () => void;
  profile: ResourceState<RankedProfile>;
  season: RankedSeason | null;
}) {
  return (
    <section
      aria-labelledby="ranked-season-title"
      className="ranked-season-strip"
    >
      <div className="ranked-season-strip__season">
        <div className="ranked-season-strip__title">
          <h2 id="ranked-season-title">{season?.name ?? 'Ranked season'}</h2>
          {season?.status !== 'active' ? (
            <span
              className={`ranked-season-status ranked-season-status--${season?.status ?? 'unavailable'}`}
            >
              {season?.status === 'closing' ? 'Closing' : 'Unavailable'}
            </span>
          ) : null}
        </div>
        {profile.status === 'ready' &&
        !mismatch &&
        profile.data.season !== null &&
        profile.data.rating !== null ? (
          <p className="ranked-season-strip__record">
            {numberFormatter.format(profile.data.wins)} wins ·{' '}
            {numberFormatter.format(profile.data.losses)} losses
          </p>
        ) : null}
        {season?.activeEndsAt ? (
          <p className="ranked-season-strip__deadline">
            <time
              dateTime={season.activeEndsAt}
              title={`Ends ${seasonDateFormatter.format(new Date(season.activeEndsAt))}`}
            >
              {season.status === 'closing'
                ? 'Final matches settling'
                : seasonCountdownLabel(season.activeEndsAt, clock)}
            </time>
          </p>
        ) : null}
      </div>

      {profile.status === 'loading' ? (
        <LoadingState
          className="ranked-season-strip__state"
          label="Loading your record"
        />
      ) : profile.status === 'error' ? (
        <div className="ranked-season-strip__state" role="alert">
          <p>Couldn’t load your record.</p>
          <button
            className="button button--quiet"
            onClick={onRetry}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : mismatch ? (
        <div className="ranked-season-strip__state" role="status">
          <p>Your record hasn’t updated for this season.</p>
          <button
            className="button button--quiet"
            onClick={onRetry}
            type="button"
          >
            Refresh record
          </button>
        </div>
      ) : profile.data.season === null ||
        profile.data.rating === null ? null : (
        <div className="ranked-season-strip__profile">
          <div className="ranked-season-strip__rating">
            <span>Season rating</span>
            <strong>{numberFormatter.format(profile.data.rating)}</strong>
            {profile.data.provisional ? (
              <small>
                Provisional ·{' '}
                {placementCopy(profile.data.placementMatchesRemaining)}
              </small>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function TerritoryQueueOption({
  contest,
  detection,
  disabled,
  onContestChange,
  onRetry,
  state,
}: {
  contest: boolean;
  detection: TerritoryDetectionState;
  disabled: boolean;
  onContestChange: (contest: boolean) => void;
  onRetry: () => void;
  state: TerritoryState;
}) {
  const activeZones =
    state.status === 'ready'
      ? state.data.filter((zone) => zone.status === 'active')
      : [];
  return (
    <fieldset className="ranked-territory-option" disabled={disabled}>
      <legend className="sr-only">Territory contest</legend>
      <label className="ranked-territory-option__toggle">
        <input
          checked={contest}
          onChange={(event) => onContestChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>
          <strong>Contest territory</strong>
        </span>
      </label>

      {contest ? (
        state.status === 'loading' ? (
          <LoadingState label="Loading active territories" />
        ) : state.status === 'error' ? (
          <div className="ranked-territory-option__state" role="status">
            <p>Couldn’t load territories. Retry or turn this option off.</p>
            <button
              className="button button--quiet"
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : activeZones.length === 0 ? (
          <p className="ranked-territory-option__state">
            No active territories. Turn this option off to play.
          </p>
        ) : (
          <div className="ranked-territory-option__detection">
            {detection.status === 'idle' ? (
              <p id="ranked-territory-help">
                <MapPin aria-hidden="true" size={18} /> Uses your location when
                you search. It isn’t stored.
              </p>
            ) : (
              <TerritoryDetectionResult state={detection} />
            )}
            <Link href="/explore">View territories</Link>
          </div>
        )
      ) : null}
    </fieldset>
  );
}

function TerritoryDetectionResult({
  state,
}: {
  state: TerritoryDetectionState;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'checking') {
    return (
      <div className="ranked-territory-detection-result" role="status">
        <MapPin aria-hidden="true" size={18} />
        <strong>Finding territory…</strong>
      </div>
    );
  }
  if (state.status === 'detected' || state.status === 'confirmed') {
    return (
      <div
        className="ranked-territory-detection-result ranked-territory-detection-result--success"
        role="status"
      >
        <Check aria-hidden="true" size={18} />
        <div>
          <strong>
            {state.status === 'confirmed'
              ? `Contesting ${state.name}`
              : state.name}
          </strong>
          {state.status !== 'confirmed' ? <p>Checking location…</p> : null}
        </div>
      </div>
    );
  }
  // Queue errors already explain territory failures and how to recover.
  return null;
}

function RankedStandingsSection({
  loadingMore,
  mismatch,
  onLoadMore,
  onRetry,
  pageError,
  season,
  state,
}: {
  loadingMore: boolean;
  mismatch: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  pageError: boolean;
  season: RankedSeason | null;
  state: ResourceState<RankedStandingsPage>;
}) {
  return (
    <section
      aria-busy={state.status === 'loading' ? 'true' : undefined}
      aria-labelledby="ranked-standings-title"
      className="ranked-standings"
    >
      <div className="ranked-standings__heading">
        <h2 id="ranked-standings-title">Season standings</h2>
        <p>Listed after five placement matches.</p>
      </div>

      {season === null ? (
        <div className="ranked-standings__state state-message state-message--empty">
          <StateIcon tone="empty" />
          <div>
            <strong>Standings return next season</strong>
          </div>
        </div>
      ) : state.status === 'loading' ? (
        <LoadingState label="Loading standings" />
      ) : state.status === 'error' ? (
        <div
          className="ranked-standings__state state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <div>
            <strong>Couldn’t load standings.</strong>
            <button
              className="button button--quiet"
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      ) : mismatch ? (
        <div
          className="ranked-standings__state state-message state-message--empty"
          role="status"
        >
          <StateIcon tone="empty" />
          <div>
            <strong>Standings haven’t updated for this season</strong>
            <button
              className="button button--quiet"
              onClick={onRetry}
              type="button"
            >
              Refresh standings
            </button>
          </div>
        </div>
      ) : state.data.entries.length === 0 ? (
        <div className="ranked-standings__state state-message state-message--empty">
          <StateIcon tone="empty" />
          <div>
            <strong>No players listed yet</strong>
          </div>
        </div>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="ranked-standing-row ranked-standing-row--header"
          >
            <span>Rank</span>
            <span>Player</span>
            <span>Rating</span>
            <span>Record</span>
          </div>
          <ol
            aria-label="Established ranked players"
            className="ranked-standing-list"
          >
            {state.data.entries.map((entry, index) => (
              <li
                aria-label={`Rank ${entry.rank}, ${entry.playerName}, rating ${entry.rating}, ${entry.wins} wins and ${entry.losses} losses across ${entry.settledMatchCount} matches`}
                className="ranked-standing-row"
                key={`${entry.rank}-${entry.playerName}-${index}`}
              >
                <strong className="ranked-standing-row__rank">
                  #{numberFormatter.format(entry.rank)}
                </strong>
                <span className="ranked-standing-row__player">
                  {entry.playerName}
                </span>
                <strong className="ranked-standing-row__rating">
                  {numberFormatter.format(entry.rating)}
                </strong>
                <span className="ranked-standing-row__record">
                  {entry.wins}W · {entry.losses}L
                </span>
              </li>
            ))}
          </ol>
          {pageError ? (
            <p className="ranked-standings__page-error" role="alert">
              Couldn’t load more players. Retry or refresh.
            </p>
          ) : null}
          <div className="ranked-standings__actions">
            {state.data.nextCursor ? (
              <button
                className="button button--quiet"
                disabled={loadingMore}
                onClick={onLoadMore}
                type="button"
              >
                {loadingMore ? 'Loading…' : pageError ? 'Retry' : 'Load more'}
              </button>
            ) : null}
            {pageError ? (
              <button
                className="button button--quiet"
                onClick={onRetry}
                type="button"
              >
                Refresh standings
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function lobbyTabFromSearch(search: string): LobbyTab {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'standings' || tab === 'watch' ? tab : 'play';
}

function detectTerritoryAtLocation(
  zones: TerritoryZoneSummary[],
  latitude: number,
  longitude: number,
): TerritoryZoneSummary | null {
  const candidates = zones.filter(
    (zone) =>
      zone.status === 'active' &&
      geometryContainsPoint(zone.geometry, longitude, latitude),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

function geometryContainsPoint(
  geometry: TerritoryZoneSummary['geometry'],
  longitude: number,
  latitude: number,
): boolean {
  if (geometry.type === 'Polygon') {
    return polygonContainsPoint(geometry.coordinates, longitude, latitude);
  }
  return geometry.coordinates.some((polygon) =>
    polygonContainsPoint(polygon, longitude, latitude),
  );
}

function polygonContainsPoint(
  rings: number[][][],
  longitude: number,
  latitude: number,
): boolean {
  const outer = rings[0];
  if (!outer || !ringContainsPoint(outer, longitude, latitude)) return false;
  return rings
    .slice(1)
    .every((hole) => !ringContainsPoint(hole, longitude, latitude));
}

function ringContainsPoint(
  ring: number[][],
  longitude: number,
  latitude: number,
): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    index++
  ) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    previous = index;
    if (!currentPoint || !previousPoint) continue;
    const [currentLongitude, currentLatitude] = currentPoint;
    const [previousLongitude, previousLatitude] = previousPoint;
    if (
      currentLongitude === undefined ||
      currentLatitude === undefined ||
      previousLongitude === undefined ||
      previousLatitude === undefined
    ) {
      continue;
    }
    if (
      pointIsOnSegment(
        longitude,
        latitude,
        previousLongitude,
        previousLatitude,
        currentLongitude,
        currentLatitude,
      )
    ) {
      return false;
    }
    const crossesLatitude =
      currentLatitude > latitude !== previousLatitude > latitude;
    if (
      crossesLatitude &&
      longitude <
        ((previousLongitude - currentLongitude) *
          (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointIsOnSegment(
  longitude: number,
  latitude: number,
  startLongitude: number,
  startLatitude: number,
  endLongitude: number,
  endLatitude: number,
): boolean {
  const cross =
    (latitude - startLatitude) * (endLongitude - startLongitude) -
    (longitude - startLongitude) * (endLatitude - startLatitude);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    longitude >= Math.min(startLongitude, endLongitude) &&
    longitude <= Math.max(startLongitude, endLongitude) &&
    latitude >= Math.min(startLatitude, endLatitude) &&
    latitude <= Math.max(startLatitude, endLatitude)
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

function seasonCountdownLabel(activeEndsAt: string, clock: number): string {
  const remaining = Date.parse(activeEndsAt) - clock;
  if (remaining <= 0) {
    return 'Season ended';
  }
  const totalMinutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
  }
  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
  }
  return `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'} left`;
}

function placementCopy(remaining: number): string {
  if (remaining === 0) return 'placements complete';
  return `${remaining} placement ${remaining === 1 ? 'match' : 'matches'} left`;
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
    join: 'Finding opponent…',
    cancel: 'Cancelling search…',
    accept: 'Accepting…',
    decline: 'Declining…',
  }[kind];
}

function queueErrorMessage(error: LiveApiError): string {
  if (error.failure === 'authentication')
    return 'Sign in again to play or watch.';
  if (error.failure === 'restricted')
    return 'Ranked play is unavailable for your account. Try another mode or watch a match.';
  if (error.failure === 'invalid-deck')
    return 'Update your deck to play ranked.';
  if (error.failure === 'location') {
    return error.options.code === 'denied'
      ? 'Allow location access or turn off Contest territory.'
      : 'Couldn’t check location. Retry or turn off Contest territory.';
  }
  if (error.failure === 'territory-ineligible')
    return 'Location not confirmed. Move inside the territory or turn off Contest territory.';
  if (error.failure === 'territory-unavailable')
    return 'Territories unavailable. Turn off Contest territory to play.';
  if (error.failure === 'validation')
    return (
      error.options.detail ??
      'Check your deck and territory choice, then retry.'
    );
  if (error.failure === 'conflict')
    return (
      error.options.detail ?? 'Search changed. Check its status and retry.'
    );
  return (
    error.options.detail ?? 'Couldn’t connect. Retry or play another mode.'
  );
}

function toLiveError(value: unknown): LiveApiError {
  if (value instanceof BrowserLocationError) {
    return new LiveApiError('location', { code: value.failure });
  }
  return value instanceof LiveApiError
    ? value
    : new LiveApiError('unavailable');
}

function formatTime(value: string): string {
  return createAppDateTimeFormatter(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
