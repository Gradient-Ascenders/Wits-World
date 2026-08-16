import { useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  CurrentPlayerError,
  getCurrentPlayer,
  type CurrentPlayer,
} from '../api/authentication';
import { useApiAccessToken } from './useApiAccessToken';

type CurrentPlayerState =
  | { status: 'anonymous' }
  | { status: 'error'; failure: 'authorization' | 'unavailable' }
  | { status: 'loading' }
  | { player: CurrentPlayer; status: 'ready' };

interface CurrentPlayerContextValue {
  reload: () => void;
  state: CurrentPlayerState;
}

const CurrentPlayerContext = createContext<CurrentPlayerContextValue>({
  reload: () => undefined,
  state: { status: 'anonymous' },
});

interface CurrentPlayerProviderProps {
  apiBaseUrl: string;
  children: ReactNode;
}

export function CurrentPlayerProvider({
  apiBaseUrl,
  children,
}: CurrentPlayerProviderProps) {
  const { isAuthenticated, isLoading } = useAuth0();
  const getAccessToken = useApiAccessToken();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CurrentPlayerState>(
    isLoading || isAuthenticated
      ? { status: 'loading' }
      : { status: 'anonymous' },
  );

  useEffect(() => {
    if (isLoading) {
      setState({ status: 'loading' });
      return;
    }

    if (!isAuthenticated) {
      setState({ status: 'anonymous' });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });

    void getCurrentPlayer({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((player) => {
        if (!controller.signal.aborted) {
          setState({ player, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            failure:
              error instanceof CurrentPlayerError
                ? error.failure
                : 'unavailable',
            status: 'error',
          });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, attempt, getAccessToken, isAuthenticated, isLoading]);

  const value = useMemo<CurrentPlayerContextValue>(
    () => ({ reload: () => setAttempt((current) => current + 1), state }),
    [state],
  );

  return (
    <CurrentPlayerContext.Provider value={value}>
      {children}
    </CurrentPlayerContext.Provider>
  );
}

export function useCurrentPlayer(): CurrentPlayerContextValue {
  return useContext(CurrentPlayerContext);
}
