import { useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'wouter';
import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import { StartupSeal } from '../branding/StartupSeal';
import { LoadingRecovery } from '../LoadingState';
import { useLoadingPhase } from '../loading-policy';

let startupCompletedThisDocument = false;
const signInReturn = (() => {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  return query.has('code') && query.has('state');
})();

const StartupContext = createContext<{
  reportReady: (path: string) => void;
  reportStatus: (status: string) => void;
} | null>(null);

export function StartupGate({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [phase, setPhase] = useState<'show' | 'finished'>(
    signInReturn && !startupCompletedThisDocument ? 'show' : 'finished',
  );
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const [status, setStatus] = useState('Finishing sign-in…');
  const loadingPhase = useLoadingPhase(phase === 'show');
  const reportReady = useCallback(
    (readyRoute: string) => setReadyPath(readyRoute),
    [],
  );
  const reportStatus = useCallback(
    (nextStatus: string) => setStatus(nextStatus),
    [],
  );
  const context = useMemo(
    () => ({ reportReady, reportStatus }),
    [reportReady, reportStatus],
  );

  useEffect(() => {
    if (phase !== 'show' || readyPath !== path) return;
    startupCompletedThisDocument = true;
    setPhase('finished');
  }, [path, phase, readyPath]);

  return (
    <StartupContext.Provider value={context}>
      <div
        aria-hidden={phase === 'show'}
        className="startup-gate__app"
        data-phase={phase}
        inert={phase === 'show'}
      >
        {children}
      </div>
      {phase === 'show' && loadingPhase !== 'hidden' && (
        <div className="startup-screen" data-phase={phase}>
          <div className="startup-screen__content">
            <StartupSeal animate />
            <p className="startup-screen__status" role="status">
              {status}
            </p>
            {loadingPhase === 'slow' && (
              <LoadingRecovery
                message="Sign-in is taking longer than usual."
                onRetry={() => window.location.reload()}
              />
            )}
          </div>
        </div>
      )}
    </StartupContext.Provider>
  );
}

/** Session readiness is independent of a failed or still-loading route module. */
export function StartupSettler() {
  const startup = useContext(StartupContext);
  const { isAuthenticated, isLoading } = useAuth0();
  const { state: player } = useCurrentPlayer();
  const [path] = useLocation();

  useEffect(() => {
    if (!startup) return;
    // Public destinations remain usable even while session restoration stalls.
    if (
      path === '/' ||
      path === '/offline' ||
      path.startsWith('/offline-attempts/')
    ) {
      startup.reportReady(path);
      return;
    }
    if (isLoading) {
      startup.reportStatus('Checking sign-in…');
      return;
    }
    if (
      isAuthenticated &&
      player.status !== 'ready' &&
      player.status !== 'error'
    ) {
      startup.reportStatus('Confirming player…');
      return;
    }
    startup.reportReady(path);
  }, [isAuthenticated, isLoading, path, player.status, startup]);

  return null;
}
