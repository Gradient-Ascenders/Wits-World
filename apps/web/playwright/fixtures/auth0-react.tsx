import { useSyncExternalStore, type ReactNode } from 'react';

const ACCESS_TOKEN = 'wits-world-sprint1-e2e-obvious-local-test-token';
const listeners = new Set<() => void>();

interface FixtureAuthState {
  error: undefined;
  getAccessTokenSilently: () => Promise<string>;
  getIdTokenClaims: () => Promise<{ __raw: string }>;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithRedirect: () => Promise<void>;
  logout: () => Promise<void>;
  user: { name: string } | undefined;
}

let authState: FixtureAuthState = {
  error: undefined,
  getAccessTokenSilently: async () => ACCESS_TOKEN,
  getIdTokenClaims: async () => ({
    __raw: 'wits-world-browser-fixture-recent-id-token',
  }),
  isAuthenticated: true,
  isLoading: false,
  loginWithRedirect: async () => undefined,
  logout: async () => {
    authState = { ...authState, isAuthenticated: false, user: undefined };
    listeners.forEach((listener) => listener());
  },
  user: { name: 'player@example.test' },
};

export function Auth0Provider({ children }: { children: ReactNode }) {
  return children;
}

export function useAuth0() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => authState,
  );
}
