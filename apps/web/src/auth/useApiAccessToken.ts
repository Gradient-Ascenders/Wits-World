import { useAuth0 } from '@auth0/auth0-react';
import { useCallback } from 'react';

export type ApiAccessTokenProvider = () => Promise<string>;

export function useApiAccessToken(): ApiAccessTokenProvider {
  const { getAccessTokenSilently } = useAuth0();

  return useCallback(() => getAccessTokenSilently(), [getAccessTokenSilently]);
}
