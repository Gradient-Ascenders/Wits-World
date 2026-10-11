import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'wouter';
import { WifiSlash, DownloadSimple } from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import { READ_TIMEOUT_MS } from '../components/loading-policy';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { listPlayerEvents } from '../api/events';
import { offlineShellReady } from './shell-readiness';
import './offline.css';
import {
  boundOfflinePlayer,
  readOfflineState,
  recordOfflineReceipt,
  replacePacks,
  saveOfflineSession,
  saveOfflineCatalogue,
  OFFLINE_CONTENT_BUDGET_BYTES,
  type CachedPack,
} from './store';

export type AttemptSyncState = {
  status: 'pending' | 'syncing' | 'confirmed' | 'failed';
  message: string;
};

type OfflineContext = {
  offlineSession: { playerId: string; playerName: string } | null;
  online: boolean;
  revision: number;
  message: string;
  syncing: boolean;
  syncMessage: string;
  syncFailed: boolean;
  attemptSync: Record<string, AttemptSyncState>;
  preparing: boolean;
  shellReady: boolean;
  savedCount: number;
  connectionFailed: boolean;
  preparationFailed: boolean;
  preparationTotal: number;
  canSync: boolean;
  restoreSession: () => Promise<void>;
  prepare: () => void;
  reportConnectionFailure: () => void;
  retryConnection: () => void;
  refresh: () => void;
  sync: () => Promise<void>;
  cancelSync: () => void;
};
const Context = createContext<OfflineContext>({
  offlineSession: null,
  online: true,
  revision: 0,
  message: '',
  syncing: false,
  syncMessage: '',
  syncFailed: false,
  attemptSync: {},
  preparing: false,
  shellReady: false,
  savedCount: 0,
  connectionFailed: false,
  preparationFailed: false,
  preparationTotal: 0,
  canSync: false,
  restoreSession: async () => {},
  prepare: () => {},
  reportConnectionFailure: () => {},
  retryConnection: () => {},
  refresh: () => {},
  sync: async () => {},
  cancelSync: () => {},
});
export const useOffline = () => useContext(Context);

export function OfflineProvider({
  children,
  apiBaseUrl,
}: {
  children: ReactNode;
  apiBaseUrl: string;
}) {
  const { state, reload } = useCurrentPlayer();
  const getToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [online, setOnline] = useState(navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [preparationFailed, setPreparationFailed] = useState(false);
  const [preparationTotal, setPreparationTotal] = useState(0);
  const restoreSession = useCallback(async () => {
    try {
      await loginWithRedirect({
        appState: {
          returnTo: `${window.location.pathname}${window.location.search}`,
        },
      });
    } catch {
      setSyncMessage(
        'Sign-in could not open. Your answers remain saved; try signing in again.',
      );
      setSyncFailed(true);
    }
  }, [loginWithRedirect]);
  const [offlineSession, setOfflineSession] =
    useState<OfflineContext['offlineSession']>(null);
  const [preparationRevision, setPreparationRevision] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const reportConnectionFailure = useCallback(
    () => setConnectionFailed(true),
    [],
  );
  const retryConnection = useCallback(() => {
    setOnline(navigator.onLine);
    setConnectionFailed(false);
    setPreparationRevision((value) => value + 1);
    reload();
  }, [reload]);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncFailed, setSyncFailed] = useState(false);
  const [attemptSync, setAttemptSync] = useState<
    Record<string, AttemptSyncState>
  >({});
  const attemptSyncRef = useRef(attemptSync);
  const syncController = useRef<AbortController | null>(null);
  const cancelSync = useCallback(
    () => syncController.current?.abort('cancelled'),
    [],
  );
  const playerId =
    state.status === 'ready' && !state.player.playerNameSetupRequired
      ? state.player.id
      : null;
  const playerName = state.status === 'ready' ? state.player.playerName : null;
  const prepare = useCallback(() => {
    if (!playerId && boundOfflinePlayer()) reload();
    setPreparationRevision((value) => value + 1);
  }, [reload, playerId]);
  const currentPlayer = useRef(playerId);
  currentPlayer.current = playerId;
  const sessionRecoveryFailures = useRef(0);
  const sessionUnavailable =
    state.status === 'error' &&
    (state.failure === 'unavailable' || state.failure === 'timeout');
  const refresh = useCallback(() => {
    if (mounted.current) setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    let checkGeneration = 0;
    const check = () => {
      const generation = ++checkGeneration;
      const controller = navigator.serviceWorker?.controller;
      setShellReady(false);
      void offlineShellReady().then((ready) => {
        if (
          active &&
          generation === checkGeneration &&
          controller === navigator.serviceWorker?.controller
        )
          setShellReady(ready);
      });
    };
    check();
    navigator.serviceWorker?.addEventListener('controllerchange', check);
    window.addEventListener('focus', check);
    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener('controllerchange', check);
      window.removeEventListener('focus', check);
    };
  }, [preparationRevision]);
  useEffect(() => {
    let active = true;
    let expiryTimer: number | undefined;
    setSavedCount(0);
    const update = async () => {
      try {
        const local = await readOfflineState();
        if (!active) return;
        setOfflineSession(
          local.session
            ? {
                playerId: local.session.playerId,
                playerName: local.session.playerName,
              }
            : null,
        );
        const packs = local.packs.filter(
          (item) =>
            Date.parse(item.pack.validUntil) > Date.now() &&
            !local.attempts.some(
              (attempt) =>
                attempt.cached.pack.event.eventId === item.pack.event.eventId,
            ),
        );
        setSavedCount(packs.length);
        if (packs.length)
          expiryTimer = window.setTimeout(
            () => void update(),
            Math.max(
              1,
              Math.min(
                ...packs.map((item) => Date.parse(item.pack.validUntil)),
              ) -
                Date.now() +
                1,
            ),
          );
      } catch {
        if (active) setOfflineSession(null);
        /* Storage failures never imply offline readiness. */
      }
    };
    void update();
    return () => {
      active = false;
      clearTimeout(expiryTimer);
    };
  }, [revision, playerId]);
  useEffect(() => {
    window.addEventListener('wits-player-binding-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('wits-player-binding-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  const sync = useCallback(
    async (retryFailed = false) => {
      if (
        !mounted.current ||
        !playerId ||
        !navigator.onLine ||
        busy.current ||
        boundOfflinePlayer() !== playerId
      )
        return;
      busy.current = true;
      const controller = new AbortController();
      syncController.current = controller;
      const timer = window.setTimeout(
        () => controller.abort('timeout'),
        READ_TIMEOUT_MS,
      );
      const remaining = new Set<string>();
      const serverOutcomes = new Map<string, AttemptSyncState>();
      const updateAttempt = (id: string, value: AttemptSyncState) => {
        if (
          !mounted.current ||
          currentPlayer.current !== playerId ||
          boundOfflinePlayer() !== playerId
        )
          return;
        attemptSyncRef.current = { ...attemptSyncRef.current, [id]: value };
        setAttemptSync(attemptSyncRef.current);
      };
      try {
        const local = await syncWork(readOfflineState(), controller.signal);
        const attempts = local.attempts
          .filter(
            (attempt) =>
              attempt.status === 'pending' &&
              (attempt.finishLocation ||
                attempt.cached.pack.locationPolicy === 'arrival-v1') &&
              (retryFailed ||
                !['failed', 'confirmed'].includes(
                  attemptSyncRef.current[attempt.clientAttemptId]?.status ?? '',
                )),
          )
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        if (!attempts.length) return;
        setSyncing(true);
        setSyncMessage('Syncing saved attempts…');
        setSyncFailed(false);
        for (const attempt of attempts) {
          remaining.add(attempt.clientAttemptId);
          updateAttempt(attempt.clientAttemptId, {
            status: 'pending',
            message: 'Pending — queued for server validation.',
          });
        }
        const token = await syncWork(getToken(), controller.signal);
        for (const attempt of attempts) {
          if (
            !mounted.current ||
            currentPlayer.current !== playerId ||
            boundOfflinePlayer() !== playerId
          )
            break;
          controller.signal.throwIfAborted();
          updateAttempt(attempt.clientAttemptId, {
            status: 'syncing',
            message: 'Awaiting confirmation…',
          });
          const response = await syncWork(
            fetch(`${apiBaseUrl}/offline-challenge-attempts`, {
              method: 'POST',
              signal: controller.signal,
              cache: 'no-store',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Wits-Offline-Contract-Version': '1',
              },
              body: JSON.stringify({
                clientAttemptId: attempt.clientAttemptId,
                packToken: attempt.cached.packToken,
                startedAt: attempt.startedAt,
                finishedAt: attempt.finishedAt,
                answers: attempt.answers,
                startLocation: attempt.startLocation,
                finishLocation: attempt.finishLocation,
              }),
            }),
            controller.signal,
          );
          const body = (await syncWork(response.json(), controller.signal)) as {
            code?: string;
            attempt?: { attemptId?: string; status?: string };
          };
          if (
            !mounted.current ||
            currentPlayer.current !== playerId ||
            boundOfflinePlayer() !== playerId
          )
            break;
          if (
            response.ok &&
            body.attempt?.status === 'completed' &&
            typeof body.attempt.attemptId === 'string'
          ) {
            const outcome: AttemptSyncState = {
              status: 'confirmed',
              message: 'The server confirmed this result.',
            };
            serverOutcomes.set(attempt.clientAttemptId, outcome);
            updateAttempt(attempt.clientAttemptId, outcome);
            await syncWork(
              recordOfflineReceipt(
                attempt,
                'accepted',
                body.attempt.attemptId,
              ).then(refresh),
              controller.signal,
            );
          } else if (
            response.status === 422 ||
            (response.status === 409 &&
              body.code === 'OFFLINE_ATTEMPT_CONFLICT')
          ) {
            const outcome: AttemptSyncState = {
              status: 'failed',
              message:
                'The server rejected this attempt. No reward was issued.',
            };
            serverOutcomes.set(attempt.clientAttemptId, outcome);
            updateAttempt(attempt.clientAttemptId, outcome);
            await syncWork(
              recordOfflineReceipt(
                attempt,
                body.code ?? 'OFFLINE_REJECTED',
              ).then(refresh),
              controller.signal,
            );
          } else {
            throw new Error(
              response.status === 401 || response.status === 403
                ? 'account'
                : 'unavailable',
            );
          }
          remaining.delete(attempt.clientAttemptId);
        }
        if (
          mounted.current &&
          currentPlayer.current === playerId &&
          boundOfflinePlayer() === playerId
        ) {
          setSyncMessage(
            'Server checks finished. See the confirmed or rejected result beside each attempt.',
          );
        }
      } catch (failure) {
        if (
          !mounted.current ||
          currentPlayer.current !== playerId ||
          boundOfflinePlayer() !== playerId
        )
          return;
        const detail =
          controller.signal.reason === 'timeout'
            ? 'Sync timed out. Server confirmation is unknown. Your answers remain saved; retry to check this same attempt.'
            : controller.signal.reason === 'cancelled'
              ? 'Stopped waiting for sync. Server confirmation is unknown. Your answers remain saved; retry to check this same attempt.'
              : isAuthenticationFailure(failure)
                ? 'Sign in with the original account to check your answers. Your answers remain saved.'
                : 'Sync failed. Server confirmation is unknown. Your answers remain saved; we’ll retry automatically.';
        const knownResults = [...remaining].some((id) =>
          serverOutcomes.has(id),
        );
        setSyncMessage(
          knownResults
            ? 'A server result could not be saved on this device. Review the result beside each attempt; retry to recover the same result.'
            : detail,
        );
        setSyncFailed(true);
        for (const id of remaining) {
          const outcome = serverOutcomes.get(id);
          updateAttempt(
            id,
            outcome
              ? {
                  ...outcome,
                  message: `${outcome.message} The receipt could not be saved on this device; retry to recover it.`,
                }
              : { status: 'failed', message: detail },
          );
        }
      } finally {
        clearTimeout(timer);
        if (syncController.current === controller) {
          syncController.current = null;
          busy.current = false;
          setSyncing(false);
        }
      }
    },
    [apiBaseUrl, getToken, playerId, refresh],
  );

  useEffect(() => {
    attemptSyncRef.current = {};
    setAttemptSync({});
    setSyncMessage('');
    setSyncFailed(false);
    setSyncing(false);
    setMessage('');
    setConnectionFailed(false);
    setPreparing(false);
    return () => {
      syncController.current?.abort('cancelled');
      syncController.current = null;
      busy.current = false;
    };
  }, [playerId]);

  useEffect(() => {
    const update = (event: Event) => {
      setOnline(navigator.onLine);
      if (navigator.onLine && boundOfflinePlayer() && !playerId) reload();
      if (document.visibilityState !== 'hidden') void sync(true);
      if (event.type === 'online') {
        sessionRecoveryFailures.current = 0;
        setConnectionFailed(false);
        setPreparationRevision((value) => value + 1);
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    void sync();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [sync, reload, playerId]);

  useEffect(() => {
    if (playerId) sessionRecoveryFailures.current = 0;
    if (!online || !sessionUnavailable || !boundOfflinePlayer()) return;
    // An interface may stay "online" while its API connection is unavailable.
    // Retry only transient session failures, with backoff and foreground checks;
    // never retry identity or authorization failures as connection failures.
    const timer = window.setTimeout(
      () => {
        if (navigator.onLine && document.visibilityState !== 'hidden') {
          sessionRecoveryFailures.current += 1;
          reload();
        }
      },
      Math.min(
        1_000 * 2 ** Math.min(sessionRecoveryFailures.current, 5),
        30_000,
      ),
    );
    return () => clearTimeout(timer);
  }, [online, sessionUnavailable, playerId, reload]);

  useEffect(() => {
    if (!playerId || !playerName || !online || !('indexedDB' in window)) {
      setPreparing(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort('timeout'),
      READ_TIMEOUT_MS,
    );
    const current = () =>
      mounted.current &&
      currentPlayer.current === playerId &&
      boundOfflinePlayer() === playerId &&
      !controller.signal.aborted;
    setPreparing(true);
    setPreparationFailed(false);
    void (async () => {
      await syncWork(
        saveOfflineSession(playerId, playerName),
        controller.signal,
      );
      if (!current()) return;
      refresh();
      const local = await syncWork(readOfflineState(), controller.signal);
      const events = await syncWork(
        listPlayerEvents({
          apiBaseUrl,
          getAccessToken: getToken,
          signal: controller.signal,
        }),
        controller.signal,
      );
      if (!current()) return;
      setConnectionFailed(false);
      await syncWork(saveOfflineCatalogue(playerId, events), controller.signal);
      refresh();
      const eligibleEvents = events.filter(
        (event) =>
          event.availability !== 'ended' &&
          Date.parse(event.startsAt) < Date.now() + 86400_000,
      );
      const attemptedEvents = new Set([
        ...local.attempts.map((item) => item.cached.pack.event.eventId),
        ...local.receipts
          .filter((item) => item.outcome === 'accepted')
          .map((item) => item.eventId),
      ]);
      const targets = eligibleEvents.filter(
        (event) => !attemptedEvents.has(event.eventId),
      );
      setPreparationTotal(targets.length);
      const eventIds = targets
        .filter(
          (event) =>
            !local.packs.some(
              (item) =>
                item.pack.event.eventId === event.eventId &&
                item.pack.locationPolicy === 'arrival-v1' &&
                Date.now() - Date.parse(item.pack.issuedAt) < 3600_000 &&
                Date.parse(item.pack.validUntil) > Date.now() + 60_000,
            ),
        )
        .map((event) => event.eventId);
      if (!eventIds.length) {
        setMessage(
          local.packs.length
            ? `${local.packs.length} ${local.packs.length === 1 ? 'event' : 'events'} saved on this device.`
            : 'No upcoming campus challenges are available to save. Existing saved attempts are kept.',
        );
        return;
      }
      const token = await syncWork(getToken(), controller.signal);
      let merged = local.packs.filter(
        (item) => Date.parse(item.pack.validUntil) > Date.now(),
      );
      let budgetReached = false;
      for (let offset = 0; offset < eventIds.length; offset += 10) {
        const response = await syncWork(
          fetch(`${apiBaseUrl}/offline-challenge-packs`, {
            method: 'POST',
            signal: controller.signal,
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Wits-Offline-Contract-Version': '1',
            },
            body: JSON.stringify({
              eventIds: eventIds.slice(offset, offset + 10),
            }),
          }),
          controller.signal,
        );
        if (!response.ok) {
          throw new Error('Offline packs are unavailable.');
        }
        const body: unknown = await syncWork(
          response.json(),
          controller.signal,
        );
        const packs = parsePacks(body, playerId);
        if (current()) {
          // A partial response must not wipe still-valid downloaded events.
          const sizeOf = (item: CachedPack) =>
            new TextEncoder().encode(JSON.stringify(item)).length;
          let bytes = merged.reduce((total, item) => total + sizeOf(item), 0);
          for (const item of packs) {
            const previous = merged.find(
              (value) => value.pack.event.eventId === item.pack.event.eventId,
            );
            const size = new TextEncoder().encode(JSON.stringify(item)).length;
            const replacementBytes =
              bytes + size - (previous ? sizeOf(previous) : 0);
            if (replacementBytes > OFFLINE_CONTENT_BUDGET_BYTES) {
              budgetReached = true;
              continue;
            }
            bytes = replacementBytes;
            merged = [
              ...merged.filter(
                (value) => value.pack.event.eventId !== item.pack.event.eventId,
              ),
              item,
            ];
          }
          await syncWork(replacePacks(playerId, merged), controller.signal);
          if (!current()) return;
          setMessage(
            `${merged.length} ${merged.length === 1 ? 'event' : 'events'} saved on this device.${budgetReached ? ' The offline content budget is full; other events need a connection.' : ''}`,
          );
          refresh();
        }
        if (budgetReached || !current()) break;
      }
    })()
      .catch(() => {
        if (
          mounted.current &&
          currentPlayer.current === playerId &&
          boundOfflinePlayer() === playerId &&
          controller.signal.reason !== 'cancelled'
        ) {
          setPreparationFailed(true);
          setMessage(
            controller.signal.reason === 'timeout'
              ? 'Saving events timed out. Your existing saved events and answers are kept. Retry when connected.'
              : 'Events could not be saved. Your existing saved events and answers are kept. Check your connection and retry.',
          );
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (
          mounted.current &&
          currentPlayer.current === playerId &&
          controller.signal.reason !== 'cancelled'
        )
          setPreparing(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort('cancelled');
    };
  }, [
    apiBaseUrl,
    getToken,
    online,
    playerId,
    playerName,
    refresh,
    preparationRevision,
  ]);
  useEffect(() => {
    if (!online || !playerId) return;
    const timer = window.setTimeout(
      () => {
        if (navigator.onLine && document.visibilityState !== 'hidden')
          setPreparationRevision((value) => value + 1);
      },
      preparationFailed || connectionFailed ? 30_000 : 5 * 60_000,
    );
    return () => clearTimeout(timer);
  }, [
    online,
    playerId,
    preparationFailed,
    connectionFailed,
    preparationRevision,
  ]);
  useEffect(() => {
    if (!online || !playerId || !syncFailed || syncMessage.includes('Sign in'))
      return;
    const timer = window.setTimeout(() => {
      if (navigator.onLine && document.visibilityState !== 'hidden')
        void sync(true);
    }, 15_000);
    return () => clearTimeout(timer);
  }, [online, playerId, syncFailed, syncMessage, sync]);
  return (
    <Context.Provider
      value={{
        offlineSession:
          offlineSession?.playerId === boundOfflinePlayer() &&
          (!playerId || playerId === offlineSession.playerId)
            ? offlineSession
            : null,
        online,
        revision,
        message,
        syncing,
        syncMessage,
        syncFailed,
        attemptSync,
        preparing,
        shellReady,
        savedCount,
        preparationFailed,
        preparationTotal,
        canSync: !!playerId && !syncMessage.includes('Sign in'),
        restoreSession,
        connectionFailed:
          connectionFailed ||
          (state.status === 'error' &&
            (state.failure === 'unavailable' || state.failure === 'timeout')),
        prepare,
        reportConnectionFailure,
        retryConnection,
        cancelSync,
        refresh,
        sync: async () => {
          if (!playerId && boundOfflinePlayer() && navigator.onLine)
            await restoreSession();
          else await sync(true);
        },
      }}
    >
      {children}
      {/* Keep one sync announcer outside the busy controls and visible copies. */}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {syncMessage}
      </p>
    </Context.Provider>
  );
}

function parsePacks(body: unknown, playerId: string): CachedPack[] {
  if (
    !body ||
    typeof body !== 'object' ||
    !('packs' in body) ||
    !Array.isArray(body.packs) ||
    body.packs.length > 10
  )
    throw new Error('Invalid offline response.');
  return body.packs.filter(
    (item: CachedPack) =>
      item?.pack?.version === 1 &&
      item.pack.playerId === playerId &&
      typeof item.pack.packId === 'string' &&
      typeof item.pack.challengeId === 'string' &&
      typeof item.pack.event?.eventId === 'string' &&
      typeof item.pack.event.title === 'string' &&
      (item.pack.event.description === null ||
        typeof item.pack.event.description === 'string') &&
      Number.isFinite(item.pack.event.latitude) &&
      Math.abs(item.pack.event.latitude) <= 90 &&
      Number.isFinite(item.pack.event.longitude) &&
      Math.abs(item.pack.event.longitude) <= 180 &&
      Number.isFinite(item.pack.event.radiusMetres) &&
      item.pack.event.radiusMetres > 0 &&
      typeof item.packToken === 'string' &&
      item.packToken.length <= 128000 &&
      Array.isArray(item.pack.questions) &&
      item.pack.questions.length === 5 &&
      ['multiple_choice', 'ordering'].includes(item.pack.format) &&
      [90, 120, 150].includes(item.pack.timeLimitSeconds) &&
      Number.isFinite(Date.parse(item.pack.validUntil)) &&
      Number.isFinite(Date.parse(item.pack.validFrom)) &&
      Number.isFinite(Date.parse(item.pack.issuedAt)) &&
      item.pack.questions.every(
        (question) =>
          typeof question?.id === 'string' &&
          typeof question.prompt === 'string' &&
          Array.isArray(question.options) &&
          question.options.length === 4 &&
          question.options.every(
            (option) =>
              typeof option?.id === 'string' && typeof option.text === 'string',
          ),
      ),
  );
}

function syncWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      // The caller may already have started work; observe its late rejection.
      void work.catch(() => undefined);
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

function isAuthenticationFailure(failure: unknown) {
  if (!failure || typeof failure !== 'object') return false;
  const value = failure as { error?: string; message?: string };
  return (
    value.message === 'account' ||
    ['login_required', 'consent_required', 'interaction_required'].includes(
      value.error ?? '',
    )
  );
}

export function ExploreConnectionStatus() {
  const { online, connectionFailed, savedCount } = useOffline();
  if (online && !connectionFailed) return null;
  return (
    <div className="explore-connection-status">
      <WifiSlash aria-hidden="true" size={18} />
      <span role="status">
        {online ? 'Connection unavailable' : 'Offline'}
        <span className="sr-only">
          {online ? '. We can’t reach Wits World.' : '.'}
          {savedCount > 0
            ? ' Saved events available.'
            : ' No downloaded challenges are ready.'}
        </span>
      </span>
      <Link href="/offline" aria-label="Downloads & saved attempts">
        {savedCount > 0 ? 'Saved events' : 'View downloads'}
      </Link>
    </div>
  );
}

export function OfflinePreparation({
  detailed = false,
}: {
  detailed?: boolean;
}) {
  const {
    online,
    message,
    preparing,
    shellReady,
    savedCount,
    prepare,
    connectionFailed,
    preparationFailed,
    preparationTotal,
  } = useOffline();
  const [path] = useLocation();
  if (path !== '/offline' && path !== '/explore') return null;
  if (!detailed && (path === '/offline' || !online || connectionFailed))
    return null;
  if (!detailed) return null;
  return (
    <section
      aria-label="Offline preparation"
      className="offline-preparation"
      aria-busy={preparing}
    >
      <DownloadSimple aria-hidden="true" size={22} />
      <div className="offline-preparation__copy">
        <p role="status">
          <strong>
            {preparing
              ? 'Saving campus events…'
              : shellReady && savedCount > 0
                ? 'Ready for offline play'
                : 'Offline play is not ready yet'}
          </strong>
          <span>
            {savedCount} {savedCount === 1 ? 'event' : 'events'} saved on this
            device
            {preparationTotal > savedCount
              ? ` · ${preparationTotal} eligible`
              : ''}
            .
          </span>
        </p>
        {preparationFailed && message && <p>{message}</p>}
        <details>
          <summary>Download details</summary>
          {!preparationFailed && message && <p>{message}</p>}
          <p>
            {shellReady && savedCount > 0
              ? 'Open downloaded challenges from Explore. Events without downloaded questions need a connection.'
              : savedCount > 0
                ? 'Questions are saved, but offline reopening is not ready. Stay connected while the app finishes downloading, then check again.'
                : 'Challenges download automatically while connected. Location access is not needed for downloads.'}
          </p>
        </details>
      </div>
      {preparationFailed && (
        <button
          className="button button--secondary"
          disabled={!online || preparing}
          onClick={prepare}
          type="button"
        >
          {preparing ? 'Saving events…' : 'Retry downloads'}
        </button>
      )}
    </section>
  );
}
