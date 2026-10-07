import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

// Mounted inside the confirmed-player boundary. A session/role change destroys
// the snapshot; this provider never stores account data in persistent storage.
export function CollectionReadProvider({ children }: { children: ReactNode }) {
  const snapshot = useRef<{
    apiBaseUrl: string;
    cards: OwnedCard[];
    savedAt: number;
  } | null>(null);
  const invalidatedIdentity = useRef(false);
  const readCards = useCallback((apiBaseUrl: string) => {
    const saved = snapshot.current;
    if (
      invalidatedIdentity.current ||
      !saved ||
      saved.apiBaseUrl !== apiBaseUrl ||
      Date.now() - saved.savedAt > RETENTION_MS
    ) {
      snapshot.current = null;
      return undefined;
    }
    return saved.cards;
  }, []);
  const rememberCards = useCallback(
    (apiBaseUrl: string, cards: OwnedCard[]) => {
      snapshot.current =
        !invalidatedIdentity.current && cards.length <= MAX_RETAINED_CARDS
          ? { apiBaseUrl, cards, savedAt: Date.now() }
          : null;
    },
    [],
  );
  const clearCards = useCallback(() => {
    snapshot.current = null;
  }, []);
  useEffect(() => {
    const invalidateIdentity = () => {
      invalidatedIdentity.current = true;
      clearCards();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === PLAYER_BINDING_KEY)
        invalidateIdentity();
    };
    window.addEventListener('wits-player-binding-change', invalidateIdentity);
    window.addEventListener('storage', storageChanged);
    return () => {
      window.removeEventListener(
        'wits-player-binding-change',
        invalidateIdentity,
      );
      window.removeEventListener('storage', storageChanged);
    };
  }, [clearCards]);
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
