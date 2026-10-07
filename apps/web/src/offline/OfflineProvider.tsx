import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'wouter';
import { StatusMessage } from '../components/StatusMessage';
import { READ_TIMEOUT_MS } from '../components/loading-policy';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { listPlayerEvents } from '../api/events';
import { requestBrowserLocation } from '../browser-location';
import {
  boundOfflinePlayer,
  readOfflineState,
  recordOfflineReceipt,
  replacePacks,
  saveOfflineSession,
  type CachedPack,
} from './store';

export type AttemptSyncState = {
  status: 'pending' | 'syncing' | 'confirmed' | 'failed';
  message: string;
};

type OfflineContext = {
  online: boolean;
  revision: number;
  message: string;
  syncing: boolean;
  syncMessage: string;
  syncFailed: boolean;
  attemptSync: Record<string, AttemptSyncState>;
  refresh: () => void;
  sync: () => Promise<void>;
  cancelSync: () => void;
};
const Context = createContext<OfflineContext>({
  online: true,
  revision: 0,
  message: '',
  syncing: false,
  syncMessage: '',
  syncFailed: false,
  attemptSync: {},
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
  const [online, setOnline] = useState(navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
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
  const currentPlayer = useRef(playerId);
  currentPlayer.current = playerId;
  const refresh = useCallback(() => {
    if (mounted.current) setRevision((value) => value + 1);
  }, []);
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
      setSyncing(true);
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
              attempt.finishLocation &&
              (retryFailed ||
                !['failed', 'confirmed'].includes(
                  attemptSyncRef.current[attempt.clientAttemptId]?.status ?? '',
                )),
          )
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        if (!attempts.length) return;
        setSyncMessage(
          'Syncing saved attempts. Answers remain provisional until confirmed.',
        );
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
            message: 'Syncing — awaiting server confirmation.',
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
              : failure instanceof Error && failure.message === 'account'
                ? 'Sign in with the original account to sync. Your answers remain saved.'
                : 'Sync failed. Server confirmation is unknown. Your answers remain saved; retry to check this same attempt.';
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
    return () => {
      syncController.current?.abort('cancelled');
      syncController.current = null;
      busy.current = false;
    };
  }, [playerId]);

  useEffect(() => {
    const update = (event: Event) => {
      setOnline(navigator.onLine);
      if (event.type === 'online' && boundOfflinePlayer() && !playerId)
        reload();
      if (document.visibilityState !== 'hidden') void sync();
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
    if (!playerId || !playerName || !online || !('indexedDB' in window)) return;
    const controller = new AbortController();
    void (async () => {
      await saveOfflineSession(playerId, playerName);
      refresh();
      const local = await readOfflineState();
      // Keep existing packs stable during a session instead of repeatedly rerolling questions.
      if (
        local.packs.length &&
        local.packs.every(
          (item) => Date.now() - Date.parse(item.pack.issuedAt) < 3600_000,
        )
      )
        return;
      const location = await requestBrowserLocation();
      const events = await listPlayerEvents({
        apiBaseUrl,
        getAccessToken: getToken,
        signal: controller.signal,
      });
      const eventIds = events
        .filter(
          (event) =>
            event.availability !== 'ended' &&
            Date.parse(event.startsAt) < Date.now() + 86400_000,
        )
        .sort(
          (a, b) =>
            (a.latitude - location.latitude) ** 2 +
            (a.longitude - location.longitude) ** 2 -
            ((b.latitude - location.latitude) ** 2 +
              (b.longitude - location.longitude) ** 2),
        )
        .slice(0, 10)
        .map((event) => event.eventId);
      if (!eventIds.length) return;
      const token = await getToken();
      const response = await fetch(`${apiBaseUrl}/offline-challenge-packs`, {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Wits-Offline-Contract-Version': '1',
        },
        body: JSON.stringify({ eventIds }),
      });
      if (!response.ok) {
        if (!controller.signal.aborted)
          setMessage(
            'Offline packs are unavailable. Online play is unchanged.',
          );
        return;
      }
      const body: unknown = await response.json();
      const packs = parsePacks(body, playerId);
      if (!controller.signal.aborted && boundOfflinePlayer() === playerId) {
        await replacePacks(playerId, packs);
        setMessage(
          `${packs.length} events saved on this device. Offline answers remain provisional until synced.`,
        );
        refresh();
      }
    })().catch(() => {
      if (!controller.signal.aborted)
        setMessage(
          'Offline preparation needs a connection and location access.',
        );
    });
    return () => controller.abort();
  }, [apiBaseUrl, getToken, online, playerId, playerName, refresh]);
  return (
    <Context.Provider
      value={{
        online,
        revision,
        message,
        syncing,
        syncMessage,
        syncFailed,
        attemptSync,
        cancelSync,
        refresh,
        sync: async () => {
          if (!playerId && boundOfflinePlayer() && navigator.onLine) reload();
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

export function OfflineStatus() {
  const {
    online,
    message,
    syncing,
    syncMessage,
    syncFailed,
    sync,
    cancelSync,
  } = useOffline();
  const { state } = useCurrentPlayer();
  if (state.status !== 'ready' && !boundOfflinePlayer()) return null;
  if (online && !syncFailed && !syncing) return null;
  return (
    <aside aria-label="Offline play" className="offline-status">
      {!online && (
        <Link href="/offline">You are offline — open saved events</Link>
      )}
      {syncFailed || syncing ? (
        <StatusMessage tone={syncFailed ? 'error' : 'info'} role={undefined}>
          <p>{syncMessage}</p>
          <button
            className="button button--secondary"
            disabled={syncing || !online}
            onClick={() => void sync()}
            type="button"
          >
            {syncing ? 'Syncing saved attempts…' : 'Retry sync'}
          </button>
          {syncing && (
            <button
              className="button button--secondary"
              onClick={cancelSync}
              type="button"
            >
              Cancel sync
            </button>
          )}
          <Link href="/offline">Review saved attempts</Link>
        </StatusMessage>
      ) : (
        message && <p role="status">{message}</p>
      )}
    </aside>
  );
}
