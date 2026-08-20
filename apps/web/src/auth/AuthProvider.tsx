import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import type { ReactNode } from 'react';

import type { AuthConfig } from '../config/environment';
import { getAuthSessionPolicy } from './session-policy';

interface PlayerAuthProviderProps {
  children: ReactNode;
  config: AuthConfig;
}

export function getSafeReturnTo(appState?: AppState): string {
  const returnTo = appState?.returnTo;

  if (typeof returnTo !== 'string' || !returnTo.startsWith('/')) {
    return '/';
  }

  try {
    const target = new URL(returnTo, window.location.origin);

    if (target.origin !== window.location.origin) {
      return '/';
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export function returnToWitsQuest(appState?: AppState): void {
  window.history.replaceState({}, '', getSafeReturnTo(appState));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function PlayerAuthProvider({
  children,
  config,
}: PlayerAuthProviderProps) {
  const sessionPolicy = getAuthSessionPolicy(import.meta.env.MODE);

  return (
    <Auth0Provider
      {...sessionPolicy}
      authorizationParams={{
        audience: config.audience,
        redirect_uri: window.location.origin,
      }}
      clientId={config.clientId}
      domain={config.domain}
      onRedirectCallback={returnToWitsQuest}
    >
      {children}
    </Auth0Provider>
  );
}
