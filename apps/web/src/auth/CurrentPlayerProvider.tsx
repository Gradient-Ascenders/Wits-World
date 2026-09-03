import { useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  assignCurrentPlayerName,
  CurrentPlayerError,
  getCurrentPlayer,
  PlayerNameSetupError,
  type CurrentPlayer,
  type CurrentPlayerFailure,
} from '../api/authentication';
import { useApiAccessToken } from './useApiAccessToken';
import { bindAuthenticatedPlayer } from './player-session-binding';

type CurrentPlayerState =
  | { status: 'anonymous' }
  | {
      status: 'error';
      failure: CurrentPlayerFailure | 'identity_changed';
    }
  | { status: 'loading' }
  | { player: CurrentPlayer; status: 'ready' };

interface CurrentPlayerContextValue {
  reload: () => void;
  setupPlayerName: (playerName: string, signal: AbortSignal) => Promise<void>;
  state: CurrentPlayerState;
}

const CurrentPlayerContext = createContext<CurrentPlayerContextValue>({
  reload: () => undefined,
  setupPlayerName: async () => undefined,
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
  const { isAuthenticated, isLoading, logout } = useAuth0();
  const getAccessToken = useApiAccessToken();
  const getAccessTokenRef = useRef(getAccessToken);
  const logoutRef = useRef(logout);
  getAccessTokenRef.current = getAccessToken;
  logoutRef.current = logout;
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
      getAccessToken: getAccessTokenRef.current,
      signal: controller.signal,
    })
      .then((player) => {
        if (controller.signal.aborted) {
          return;
        }

        const bindingResult = bindAuthenticatedPlayer(player.id);

        if (bindingResult === 'mismatched') {
          setState({ failure: 'identity_changed', status: 'error' });
          void logoutRef
            .current({
              logoutParams: { returnTo: window.location.origin },
            })
            .catch(() => undefined);
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
  }, [apiBaseUrl, attempt, isAuthenticated, isLoading]);

  const value = useMemo<CurrentPlayerContextValue>(
    () => ({
      reload: () => setAttempt((current) => current + 1),
      setupPlayerName: async (playerName, signal) => {
        if (state.status !== 'ready') {
          throw new PlayerNameSetupError('unavailable');
        }

        const expectedPlayerId = state.player.id;
        let updatedPlayer: CurrentPlayer;

        try {
          updatedPlayer = await assignCurrentPlayerName({
            apiBaseUrl,
            getAccessToken,
            playerName,
            signal,
          });
        } catch (error) {
          if (
            error instanceof PlayerNameSetupError &&
            error.failure === 'already_assigned'
          ) {
            try {
              updatedPlayer = await getCurrentPlayer({
                apiBaseUrl,
                getAccessToken,
                signal,
              });
            } catch (reloadError) {
              if (signal.aborted) {
                throw reloadError;
              }

              if (
                reloadError instanceof CurrentPlayerError &&
                reloadError.failure === 'authorization'
              ) {
                setState((current) =>
                  current.status === 'ready' &&
                  current.player.id === expectedPlayerId
                    ? { failure: 'authorization', status: 'error' }
                    : current,
                );
                throw new PlayerNameSetupError('authorization');
              }

              throw new PlayerNameSetupError('unavailable');
            }

            if (
              updatedPlayer.playerName === null ||
              updatedPlayer.playerNameSetupRequired
            ) {
              throw error;
            }
          } else {
            if (
              error instanceof PlayerNameSetupError &&
              error.failure === 'authorization'
            ) {
              setState((current) =>
                current.status === 'ready' &&
                current.player.id === expectedPlayerId
                  ? { failure: 'authorization', status: 'error' }
                  : current,
              );
            }

            throw error;
          }
        }

        if (updatedPlayer.id !== expectedPlayerId) {
          setState((current) =>
            current.status === 'ready' && current.player.id === expectedPlayerId
              ? { failure: 'identity_changed', status: 'error' }
              : current,
          );
          throw new PlayerNameSetupError('authorization');
        }

        setState((current) =>
          current.status === 'ready' && current.player.id === expectedPlayerId
            ? { player: updatedPlayer, status: 'ready' }
            : current,
        );
      },
      state,
    }),
    [apiBaseUrl, getAccessToken, state],
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
