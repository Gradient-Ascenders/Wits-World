import { useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'wouter';
import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import { StartupSeal } from '../branding/StartupSeal';

const SEAL_DURATION_MS = 760;
const EXIT_DURATION_MS = 150;
const MAP_REVEAL_GRACE_MS = 3_000;
let startupCompletedThisDocument = false;
const signInReturn = (() => {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  return query.has('code') && query.has('state');
})();

function hasCampusMap(): boolean {
  return document.querySelector('[data-sign-in-map]') !== null;
}

const StartupContext = createContext<{
  reportMapSettled: () => void;
  reportReady: (path: string) => void;
  reportStatus: (status: string) => void;
} | null>(null);

export function StartupGate({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [phase, setPhase] = useState<'show' | 'exiting' | 'finished'>(
    signInReturn && !startupCompletedThisDocument ? 'show' : 'finished',
  );
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const [mapSettled, setMapSettled] = useState(false);
  const [mapGraceDone, setMapGraceDone] = useState(false);
  const [sealAnimating, setSealAnimating] = useState(false);
  const [status, setStatus] = useState('Finishing sign-in…');
  const destinationReady =
    readyPath === path &&
    (path !== '/explore' || !hasCampusMap() || mapSettled || mapGraceDone);
  const destinationReadyRef = useRef(destinationReady);
  destinationReadyRef.current = destinationReady;
  const reportReady = useCallback(
    (readyRoute: string) => setReadyPath(readyRoute),
    [],
  );
  const reportMapSettled = useCallback(() => setMapSettled(true), []);
  const reportStatus = useCallback(
    (nextStatus: string) => setStatus(nextStatus),
    [],
  );
  const context = useMemo(
    () => ({ reportMapSettled, reportReady, reportStatus }),
    [reportMapSettled, reportReady, reportStatus],
  );

  useEffect(() => {
    if (phase !== 'show' || sealAnimating) return;
    // Paint the reset frame before starting the first or next pass.
    let nextFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => setSealAnimating(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(nextFrame);
    };
  }, [phase, sealAnimating]);

  useEffect(() => {
    if (phase !== 'show' || !sealAnimating) return;
    const timer = window.setTimeout(() => {
      if (destinationReadyRef.current) {
        setPhase('exiting');
      } else {
        setSealAnimating(false);
      }
    }, SEAL_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase, sealAnimating]);

  useEffect(() => {
    if (
      phase !== 'show' ||
      readyPath !== '/explore' ||
      path !== '/explore' ||
      mapSettled ||
      !hasCampusMap()
    ) {
      return;
    }
    setStatus('Preparing the campus map…');
    const timer = window.setTimeout(
      () => setMapGraceDone(true),
      MAP_REVEAL_GRACE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [mapSettled, path, phase, readyPath]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const timer = window.setTimeout(() => {
      startupCompletedThisDocument = true;
      setPhase('finished');
    }, EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

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
      {phase !== 'finished' && (
        <div
          aria-hidden={phase === 'exiting'}
          className="startup-screen"
          data-phase={phase}
          role={phase === 'show' ? 'status' : undefined}
        >
          <div className="startup-screen__content">
            <StartupSeal animate={sealAnimating} />
            <p className="startup-screen__status">{status}</p>
          </div>
        </div>
      )}
    </StartupContext.Provider>
  );
}

export function useSignInMapStatus(status: 'loading' | 'ready' | 'error') {
  const startup = useContext(StartupContext);

  useEffect(() => {
    if (status !== 'loading') startup?.reportMapSettled();
  }, [startup, status]);
}

/** Mounted only after the route's lazy module has resolved. */
export function StartupSettler() {
  const startup = useContext(StartupContext);
  const { isAuthenticated, isLoading } = useAuth0();
  const { state: player } = useCurrentPlayer();
  const [path] = useLocation();

  useEffect(() => {
    if (!startup) return;
    if (isLoading) {
      startup.reportStatus('Checking your sign-in status…');
      return;
    }
    if (
      isAuthenticated &&
      player.status !== 'ready' &&
      player.status !== 'error'
    ) {
      startup.reportStatus('Confirming your Wits World player…');
      return;
    }
    startup.reportReady(path);
  }, [isAuthenticated, isLoading, path, player.status, startup]);

  return null;
}
