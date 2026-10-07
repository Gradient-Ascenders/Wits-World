import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { AuthorApiError } from '../../api/author';
import { PLAYER_BINDING_KEY } from '../../auth/player-session-binding';

// The console owns these reads: leaving it or changing API/account scope drops them.
// Entries only accelerate presentation; every revisit still confirms server data.
class AuthorReadStore {
  private entries = new Map<string, { value: unknown; savedAt: number }>();
  private listeners = new Set<() => void>();
  private generation = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.generation;
  read(key: string) {
    const entry = this.entries.get(key);
    if (entry && Date.now() - entry.savedAt < 60_000) return entry;
    this.entries.delete(key);
    return undefined;
  }
  write(key: string, value: unknown) {
    this.entries.delete(key);
    this.entries.set(key, { value, savedAt: Date.now() });
    if (this.entries.size > 40)
      this.entries.delete(this.entries.keys().next().value!);
  }
  clear = () => {
    this.entries.clear();
    this.generation += 1;
    this.listeners.forEach((listener) => listener());
  };
  revoke = (error: unknown) => {
    if (
      !(error instanceof AuthorApiError) ||
      !['authorization', 'forbidden', 'not-found'].includes(error.failure)
    )
      return false;
    this.clear();
    return true;
  };
}
export const AuthorReadFreshness = createContext(true);
const AuthorReadsContext = createContext<AuthorReadStore | null>(null);
export function AuthorRetainedReads({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AuthorReadStore());
  useEffect(() => {
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === PLAYER_BINDING_KEY) store.clear();
    };
    window.addEventListener('wits-player-binding-change', store.clear);
    window.addEventListener('storage', storageChanged);
    return () => {
      window.removeEventListener('wits-player-binding-change', store.clear);
      window.removeEventListener('storage', storageChanged);
    };
  }, [store]);
  return (
    <AuthorReadsContext.Provider value={store}>
      {children}
    </AuthorReadsContext.Provider>
  );
}
const subscribeNothing = () => () => {};
const zero = () => 0;
export function useAuthorRetainedResource<T>(
  key: string,
  initial: T,
  previousGroup?: string,
) {
  const store = useContext(AuthorReadsContext);
  const initialRef = useRef(initial);
  const generation = useSyncExternalStore(
    store?.subscribe ?? subscribeNothing,
    store?.snapshot ?? zero,
  );
  const [local, setLocal] = useState(() => {
    const entry = store?.read(key);
    return {
      key,
      generation,
      previousGroup,
      value: entry ? (entry.value as T) : initial,
      confirmed: !!entry,
    };
  });
  const entry = store?.read(key);
  const previous =
    local.key !== key &&
    local.generation === generation &&
    !!previousGroup &&
    previousGroup === local.previousGroup &&
    local.confirmed &&
    !entry;
  const current =
    local.key === key && local.generation === generation
      ? local
      : {
          key,
          generation,
          previousGroup,
          value: entry ? (entry.value as T) : previous ? local.value : initial,
          confirmed: !!entry || previous,
        };
  const currentRef = useRef(current);
  currentRef.current = current;
  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      const previous = currentRef.current;
      const value =
        typeof next === 'function'
          ? (next as (value: T) => T)(previous.value)
          : next;
      const updated = { ...previous, key, previousGroup, value };
      currentRef.current = updated;
      if (updated.confirmed) store?.write(key, value);
      setLocal(updated);
    },
    [key, previousGroup, store],
  );
  const confirm = useCallback(() => {
    const updated = { ...currentRef.current, confirmed: true };
    currentRef.current = updated;
    store?.write(key, updated.value);
    setLocal(updated);
  }, [key, previousGroup, store]);
  const beginRead = useCallback(() => {
    const epoch = store?.snapshot() ?? 0;
    return () => (store?.snapshot() ?? 0) === epoch;
  }, [store]);
  const revoke = useCallback(
    (error: unknown) => {
      const denied =
        error instanceof AuthorApiError &&
        ['authorization', 'forbidden', 'not-found'].includes(error.failure);
      if (denied) {
        store?.revoke(error);
        const updated = {
          key,
          previousGroup,
          generation: store?.snapshot() ?? 0,
          value: initialRef.current,
          confirmed: false,
        };
        currentRef.current = updated;
        setLocal(updated);
      }
      return denied;
    },
    [key, previousGroup, store],
  );
  return {
    value: current.value,
    setValue,
    confirmed: current.confirmed,
    previous,
    confirm,
    revoke,
    beginRead,
  };
}
