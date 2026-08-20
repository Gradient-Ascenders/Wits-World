const PLAYER_BINDING_KEY = 'wits-world.authenticated-player-id';
const UUID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export type PlayerBindingResult = 'matched' | 'mismatched' | 'unavailable';

export function hasAuthenticatedPlayerBinding(): boolean {
  try {
    const storedPlayerId = window.localStorage.getItem(PLAYER_BINDING_KEY);

    return storedPlayerId !== null && UUID_PATTERN.test(storedPlayerId);
  } catch {
    return false;
  }
}

export function bindAuthenticatedPlayer(playerId: string): PlayerBindingResult {
  try {
    const storedPlayerId = window.localStorage.getItem(PLAYER_BINDING_KEY);

    if (storedPlayerId !== null && !UUID_PATTERN.test(storedPlayerId)) {
      window.localStorage.removeItem(PLAYER_BINDING_KEY);
      return 'unavailable';
    }

    if (storedPlayerId !== null && storedPlayerId !== playerId) {
      return 'mismatched';
    }

    window.localStorage.setItem(PLAYER_BINDING_KEY, playerId);
    return 'matched';
  } catch {
    return 'unavailable';
  }
}

export function clearAuthenticatedPlayerBinding(): void {
  try {
    window.localStorage.removeItem(PLAYER_BINDING_KEY);
  } catch {
    // Storage can be unavailable under restrictive browser policies. The Auth0
    // SDK logout still clears its own session cache.
  }
}
