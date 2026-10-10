import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { OwnedCard } from '../../api/cards';
import { PLAYER_BINDING_KEY } from '../../auth/player-session-binding';

const RETENTION_MS = 2 * 60 * 1000;
const MAX_RETAINED_CARDS = 5000;

interface CollectionReads {
  readCards: (apiBaseUrl: string) => OwnedCard[] | undefined;
  rememberCards: (apiBaseUrl: string, cards: OwnedCard[]) => void;
  clearCards: () => void;
}

const CollectionReadContext = createContext<CollectionReads | null>(null);

// A session/role change destroys only the in-memory snapshot, not the page.
// Recreating the whole shell would restart offline location waits on every
// session-recovery retry. Account data never enters persistent storage.
export function CollectionReadProvider({
  children,
  scope,
}: {
  children: ReactNode;
  scope?: string;
}) {
  const cache = useMemo(
    () => ({
      snapshot: null as {
        apiBaseUrl: string;
        cards: OwnedCard[];
        savedAt: number;
      } | null,
      invalidatedIdentity: false,
    }),
    [scope],
  );
  const readCards = useCallback(
    (apiBaseUrl: string) => {
      const saved = cache.snapshot;
      if (
        cache.invalidatedIdentity ||
        !saved ||
        saved.apiBaseUrl !== apiBaseUrl ||
        Date.now() - saved.savedAt > RETENTION_MS
      ) {
        cache.snapshot = null;
        return undefined;
      }
      return saved.cards;
    },
    [cache],
  );
  const rememberCards = useCallback(
    (apiBaseUrl: string, cards: OwnedCard[]) => {
      cache.snapshot =
        !cache.invalidatedIdentity && cards.length <= MAX_RETAINED_CARDS
          ? { apiBaseUrl, cards, savedAt: Date.now() }
          : null;
    },
    [cache],
  );
  const clearCards = useCallback(() => {
    cache.snapshot = null;
  }, [cache]);
  useEffect(() => {
    cache.invalidatedIdentity = false;
    const invalidateIdentity = () => {
      cache.invalidatedIdentity = true;
      clearCards();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === PLAYER_BINDING_KEY)
        invalidateIdentity();
    };
    window.addEventListener('wits-player-binding-change', invalidateIdentity);
    window.addEventListener('storage', storageChanged);
    return () => {
      invalidateIdentity();
      window.removeEventListener(
        'wits-player-binding-change',
        invalidateIdentity,
      );
      window.removeEventListener('storage', storageChanged);
    };
  }, [cache, clearCards]);
  const value = useMemo(
    () => ({ readCards, rememberCards, clearCards }),
    [readCards, rememberCards, clearCards],
  );
  return (
    <CollectionReadContext.Provider value={value}>
      {children}
    </CollectionReadContext.Provider>
  );
}

export function useCollectionReads() {
  return useContext(CollectionReadContext);
}
