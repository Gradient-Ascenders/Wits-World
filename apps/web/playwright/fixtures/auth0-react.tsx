import type { ReactNode } from 'react';

const ACCESS_TOKEN = 'wits-world-sprint1-e2e-obvious-local-test-token';
const authState = {
  error: undefined,
  getAccessTokenSilently: async () => ACCESS_TOKEN,
  isAuthenticated: true,
  isLoading: false,
  loginWithRedirect: async () => undefined,
  logout: async () => undefined,
  user: { name: 'Sprint 1 E2E Player' },
};

export function Auth0Provider({ children }: { children: ReactNode }) {
  return children;
}

export function useAuth0() {
  return authState;
}
