import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { Router, type RouterProps } from 'wouter';
import type { BrowserLocationHook } from 'wouter/use-browser-location';

import { AuthorConfirmationDialog } from './AuthorConfirmationDialog';

interface DirtyEntry {
  dirty: boolean;
  label: string;
}

type PendingNavigation =
  | { kind: 'history'; target: string }
  | { action: () => void; kind: 'route'; target: string };

const dirtyEntries = new Map<string, DirtyEntry>();
const guardListeners = new Set<() => void>();
const locationListeners = new Set<() => void>();
let currentPathname = readPathname();
let pendingNavigation: PendingNavigation | null = null;
let guardRevision = 0;
let locationEventsInstalled = false;
let restoringBlockedHistory = false;
let acceptingHistory = false;

type BrowserNavigate = ReturnType<BrowserLocationHook>[1];
type NavigateOptions = Parameters<BrowserNavigate>[1];
type Path = Parameters<BrowserNavigate>[0];

function readPathname() {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

function emitGuardChange() {
  guardRevision += 1;
  guardListeners.forEach((listener) => listener());
}

function emitLocationChange() {
  locationListeners.forEach((listener) => listener());
}

function hasDirtyDraft() {
  return [...dirtyEntries.values()].some((entry) => entry.dirty);
}

function updateLocation() {
  currentPathname = readPathname();
  emitLocationChange();
}

function handleLocationEvent(event: Event) {
  if (event.type !== 'popstate') {
    if (restoringBlockedHistory) {
      restoringBlockedHistory = false;
      currentPathname = readPathname();
      return;
    }
    updateLocation();
    return;
  }

  if (acceptingHistory) {
    acceptingHistory = false;
    pendingNavigation = null;
    updateLocation();
    emitGuardChange();
    return;
  }

  const target = readPathname();
  if (!hasDirtyDraft() || target === currentPathname) {
    updateLocation();
    return;
  }

  pendingNavigation = { kind: 'history', target };
  restoringBlockedHistory = true;
  window.history.pushState(window.history.state, '', currentPathname);
  emitGuardChange();
}

function installLocationEvents() {
  if (locationEventsInstalled || typeof window === 'undefined') return;
  locationEventsInstalled = true;
  currentPathname = readPathname();
  for (const eventName of [
    'popstate',
    'pushState',
    'replaceState',
    'hashchange',
  ]) {
    window.addEventListener(eventName, handleLocationEvent);
  }
}

function subscribeToLocation(listener: () => void) {
  installLocationEvents();
  locationListeners.add(listener);
  return () => locationListeners.delete(listener);
}

const useGuardedBrowserLocation: BrowserLocationHook = (options = {}) => {
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    () => currentPathname,
    () => options.ssrPath ?? '/',
  );
  const navigate = useCallback(
    (to: Path, navigationOptions: NavigateOptions = {}) => {
      window.history[navigationOptions.replace ? 'replaceState' : 'pushState'](
        navigationOptions.state ?? null,
        '',
        String(to),
      );
    },
    [],
  );
  return [pathname, navigate];
};

interface NavigationGuardContextValue {
  clear: (id: string) => void;
  register: (id: string, label: string, dirty: boolean) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  clear: () => undefined,
  register: () => undefined,
});

function useGuardRevision() {
  return useSyncExternalStore(
    (listener) => {
      guardListeners.add(listener);
      return () => guardListeners.delete(listener);
    },
    () => guardRevision,
    () => 0,
  );
}

export function GuardedRouter({ children, ...props }: RouterProps) {
  useGuardRevision();

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyDraft()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      dirtyEntries.clear();
      pendingNavigation = null;
      acceptingHistory = false;
      restoringBlockedHistory = false;
      currentPathname = readPathname();
      emitGuardChange();
    };
  }, []);

  const contextValue = useMemo<NavigationGuardContextValue>(
    () => ({
      clear(id) {
        if (dirtyEntries.delete(id)) emitGuardChange();
      },
      register(id, label, dirty) {
        const current = dirtyEntries.get(id);
        if (current?.dirty === dirty && current.label === label) return;
        dirtyEntries.set(id, { dirty, label });
        emitGuardChange();
      },
    }),
    [],
  );

  const aroundNav = useCallback(
    (
      navigate: (to: string, options?: NavigateOptions) => void,
      to: string,
      options?: NavigateOptions,
    ) => {
      if (!hasDirtyDraft()) {
        navigate(to, options);
        return;
      }
      pendingNavigation = {
        action: () => navigate(to, options),
        kind: 'route',
        target: String(to),
      };
      emitGuardChange();
    },
    [],
  );

  const cancel = () => {
    pendingNavigation = null;
    emitGuardChange();
  };

  const discard = () => {
    const pending = pendingNavigation;
    pendingNavigation = null;
    dirtyEntries.clear();
    emitGuardChange();
    if (!pending) return;
    if (pending.kind === 'route') {
      pending.action();
    } else {
      acceptingHistory = true;
      window.history.back();
    }
  };

  const dirtyLabel = [...dirtyEntries.values()].find(
    (entry) => entry.dirty,
  )?.label;

  return (
    <NavigationGuardContext.Provider value={contextValue}>
      <Router {...props} aroundNav={aroundNav} hook={useGuardedBrowserLocation}>
        {children}
      </Router>
      {pendingNavigation && dirtyLabel ? (
        <AuthorConfirmationDialog
          cancelLabel="Keep editing"
          confirmLabel="Discard changes"
          description={
            <p>
              Your unsaved {dirtyLabel} changes will be lost. This action cannot
              be undone.
            </p>
          }
          onCancel={cancel}
          onConfirm={discard}
          title="Discard unsaved changes?"
        />
      ) : null}
    </NavigationGuardContext.Provider>
  );
}

export function useUnsavedAuthorChanges(dirty: boolean, label: string) {
  const id = useId();
  const guard = useContext(NavigationGuardContext);

  useEffect(() => {
    guard.register(id, label, dirty);
    return () => guard.clear(id);
  }, [dirty, guard, id, label]);

  return useCallback(() => guard.clear(id), [guard, id]);
}
