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

const Context = createContext({
  online: true,
  revision: 0,
  message: '',
  refresh: () => {},
  sync: async () => {},
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
  const playerId =
    state.status === 'ready' && !state.player.playerNameSetupRequired
      ? state.player.id
      : null;
  const playerName = state.status === 'ready' ? state.player.playerName : null;
  const currentPlayer = useRef(playerId);
  currentPlayer.current = playerId;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener('wits-player-binding-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('wits-player-binding-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  const sync = useCallback(async () => {
    if (
      !playerId ||
      !navigator.onLine ||
      busy.current ||
      boundOfflinePlayer() !== playerId
    )
      return;
    busy.current = true;
    try {
      const token = await getToken();
      const local = await readOfflineState();
      for (const attempt of local.attempts.sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      )) {
        if (
          currentPlayer.current !== playerId ||
          boundOfflinePlayer() !== playerId
        )
          break;
        if (attempt.status !== 'pending' || !attempt.finishLocation) continue;
        const response = await fetch(
          `${apiBaseUrl}/offline-challenge-attempts`,
          {
            method: 'POST',
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
          },
        );
        const body = (await response.json()) as {
          code?: string;
          attempt?: { attemptId?: string; status?: string };
        };
        if (
          currentPlayer.current !== playerId ||
          boundOfflinePlayer() !== playerId
        )
          break;
        if (
          response.ok &&
          body.attempt?.status === 'completed' &&
          typeof body.attempt.attemptId === 'string'
        ) {
          await recordOfflineReceipt(
            attempt,
            'accepted',
            body.attempt.attemptId,
          );
        } else if (
          response.status === 422 ||
          (response.status === 409 && body.code === 'OFFLINE_ATTEMPT_CONFLICT')
        ) {
          await recordOfflineReceipt(attempt, body.code ?? 'OFFLINE_REJECTED');
        } else {
          setMessage(
            response.status === 401 || response.status === 403
              ? 'Sign in with the original account to sync.'
              : 'Sync is unavailable. Your attempts remain saved on this device.',
          );
          break;
        }
        refresh();
      }
    } catch {
      setMessage(
        'Sync is unavailable. Your attempts remain saved on this device.',
      );
    } finally {
      busy.current = false;
    }
  }, [apiBaseUrl, getToken, playerId, refresh]);

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
        refresh,
        sync: async () => {
          if (!playerId && boundOfflinePlayer() && navigator.onLine) reload();
          else await sync();
        },
      }}
    >
      {children}
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

export function OfflineStatus() {
  const { online, message } = useOffline();
  const { state } = useCurrentPlayer();
  const [pathname] = useLocation();
  if (pathname === '/' && online) return null;
  if (state.status !== 'ready' && !boundOfflinePlayer()) return null;
  return (
    <aside aria-label="Offline play" className="offline-status">
      <Link href="/offline">
        {online
          ? 'Offline events and saved attempts'
          : 'You are offline — open saved events'}
      </Link>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
