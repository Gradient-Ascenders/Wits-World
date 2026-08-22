import { useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  CurrentPlayerError,
  getCurrentPlayer,
  type CurrentPlayer,
  updateCurrentPlayerDisplayName,
} from '../api/authentication';
import { useApiAccessToken } from './useApiAccessToken';
import { bindAuthenticatedPlayer } from './player-session-binding';

type CurrentPlayerState =
  | { status: 'anonymous' }
  | {
      status: 'error';
      failure: 'authorization' | 'identity_changed' | 'unavailable';
    }
  | { status: 'loading' }
  | { player: CurrentPlayer; status: 'ready' };

interface CurrentPlayerContextValue {
  reload: () => void;
  state: CurrentPlayerState;
  updateDisplayName: (
    displayName: string,
    signal: AbortSignal,
  ) => Promise<CurrentPlayer>;
}

const CurrentPlayerContext = createContext<CurrentPlayerContextValue>({
  reload: () => undefined,
  state: { status: 'anonymous' },
  updateDisplayName: () =>
    Promise.reject(new Error('The current player is unavailable.')),
});

interface CurrentPlayerProviderProps {
  apiBaseUrl: string;
  children: ReactNode;
}

export function CurrentPlayerProvider({
  apiBaseUrl,
  children,
}: CurrentPlayerProviderProps) {
  const { isAuthenticated, isLoading, logout } = useAuth0();
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
        if (controller.signal.aborted) {
          return;
        }

        const bindingResult = bindAuthenticatedPlayer(player.id);

        if (bindingResult === 'mismatched') {
          setState({ failure: 'identity_changed', status: 'error' });
          void logout({
            logoutParams: { returnTo: window.location.origin },
          }).catch(() => undefined);
          return;
        }

        if (bindingResult === 'unavailable') {
          setState({ failure: 'unavailable', status: 'error' });
          return;
        }

        setState({ player, status: 'ready' });
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
  }, [apiBaseUrl, attempt, getAccessToken, isAuthenticated, isLoading, logout]);

  const updateDisplayName = useCallback(
    async (displayName: string, signal: AbortSignal) => {
      if (state.status !== 'ready') {
        throw new Error('The current player is unavailable.');
      }

      const expectedPlayerId = state.player.id;

      try {
        const updatedPlayer = await updateCurrentPlayerDisplayName({
          apiBaseUrl,
          displayName,
          getAccessToken,
          signal,
        });

        if (updatedPlayer.id !== expectedPlayerId) {
          throw new Error(
            'The updated account did not match the current player.',
          );
        }

        setState((current) =>
          current.status === 'ready' && current.player.id === expectedPlayerId
            ? { player: updatedPlayer, status: 'ready' }
            : current,
        );

        return updatedPlayer;
      } catch (error) {
        if (
          error instanceof CurrentPlayerError &&
          error.failure === 'authorization'
        ) {
          setState((current) =>
            current.status === 'ready' && current.player.id === expectedPlayerId
              ? { failure: 'authorization', status: 'error' }
              : current,
          );
        }

        throw error;
      }
    },
    [apiBaseUrl, getAccessToken, state],
  );

  const value = useMemo<CurrentPlayerContextValue>(
    () => ({
      reload: () => setAttempt((current) => current + 1),
      state,
      updateDisplayName,
    }),
    [state, updateDisplayName],
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
