import { useEffect, useState } from 'react';
import { useOffline } from './OfflineProvider';
import {
  boundOfflinePlayer,
  readOfflineCatalogue,
  readOfflineState,
} from './store';
import type { PlayerEvent } from '../api/events';

export function useOfflineExploration() {
  const { revision } = useOffline();
  const binding = boundOfflinePlayer();
  const [local, setLocal] = useState<Awaited<
    ReturnType<typeof readOfflineState>
  > | null>(null);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!binding) {
      setLocal(null);
      setEvents([]);
      setOwner(null);
      return;
    }
    void Promise.all([readOfflineState(), readOfflineCatalogue()])
      .then(([state, catalogue]) => {
        if (!active || boundOfflinePlayer() !== binding) return;
        setLocal(state);
        setOwner(binding);
        const catalogueEvents = catalogue?.events ?? [];
        const seen = new Set(catalogueEvents.map((event) => event.eventId));
        const additional = [
          ...state.packs,
          ...state.attempts.map((item) => item.cached),
        ]
          .filter((item) => {
            if (seen.has(item.pack.event.eventId)) return false;
            seen.add(item.pack.event.eventId);
            return true;
          })
          .map(({ pack }) => ({
            ...pack.event,
            startsAt: pack.validFrom,
            endsAt: pack.validUntil,
            availability: 'active' as const,
          }));
        setEvents([...catalogueEvents, ...additional]);
        setError('');
      })
      .catch(() => {
        if (active)
          setError('Device storage is unavailable. Connect to load events.');
      });
    return () => {
      active = false;
    };
  }, [binding, revision]);
  return {
    local: owner === binding ? local : null,
    events: owner === binding ? events : [],
    error,
  };
}
