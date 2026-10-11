import { AppToaster } from './components/AppToaster';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';

import { MatchModuleLoadError } from './api/match-errors';
import { useApiAccessToken } from './auth/useApiAccessToken';
import { AppShell } from './components/AppShell';
import { OfflineProvider, useOffline } from './offline/OfflineProvider';
import { ServiceWorkerUpdate } from './offline/ServiceWorkerUpdate';
import { boundOfflinePlayer } from './offline/store';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { StartupGate, StartupSettler } from './components/auth/startup-state';
import { AuthorRoute } from './components/auth/AuthorRoute';
import { AuthorLoadingState } from './components/author/AuthorLoadingState';
import { GuardedRouter } from './components/author/AuthorNavigationGuard';
import { prepareAuthorWorkspace } from './components/author/author-workspace-modules';
import {
  CurrentPlayerProvider,
  useCurrentPlayer,
} from './auth/CurrentPlayerProvider';
import { CollectionReadProvider } from './components/cards/CollectionReadProvider';
import { NotFoundPage } from './pages/NotFoundPage';
import type {
  LocationClaimProvider,
  LocationObservationProvider,
  LocationPermissionProvider,
} from './browser-location';
import type { MapFactory } from './components/exploration/map-provider';
import type { AuthConfig } from './config/environment';

const HomePage = lazy(() => import('./pages/HomePage'));
const OfflinePages = () => import('./offline/OfflinePages');
const OfflineExplorePage = lazy(() =>
  OfflinePages().then(({ OfflineExplorePage }) => ({
    default: OfflineExplorePage,
  })),
);
const OfflineAttemptPage = lazy(() =>
  OfflinePages().then(({ OfflineAttemptPage }) => ({
    default: OfflineAttemptPage,
  })),
);
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ChallengePage = lazy(() => import('./pages/ChallengePage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const TradeInboxPage = lazy(() => import('./pages/TradeInboxPage'));
const TradeEditorPage = lazy(() => import('./pages/TradeEditorPage'));
const TradeDetailPage = lazy(() => import('./pages/TradeDetailPage'));
const AuthorConsolePage = lazy(() => import('./pages/AuthorConsolePage'));
const DecksPage = lazy(() => import('./pages/DecksPage'));
const MatchEntryPage = lazy(() => import('./pages/MatchEntryPage'));
const CpuMatchPage = lazy(() => import('./pages/CpuMatchPage'));
const MatchHistoryPage = lazy(() => import('./pages/MatchHistoryPage'));
const LiveLobbyPage = lazy(() => import('./pages/LiveLobbyPage'));
const LiveMatchPage = lazy(() => import('./pages/LiveMatchPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const PvpHubPage = lazy(() => import('./pages/PvpHubPage'));
const PvpMatchPage = lazy(() => import('./pages/PvpMatchPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const PasswordResetPage = lazy(() => import('./pages/PasswordResetPage'));

// Start the destination module while identity checks run. Importing code does
// not mount protected components or start their data requests.
function prepareRoute(path: string) {
  if (path.startsWith('/author'))
    return Promise.all([
      import('./pages/AuthorConsolePage'),
      prepareAuthorWorkspace(path),
    ]);
  if (path.startsWith('/offline')) return OfflinePages();
  if (path.startsWith('/challenge-attempts/'))
    return import('./pages/ChallengePage');
  if (path === '/explore') return import('./pages/ExplorePage');
  if (path === '/collection/trades/new' || /\/trades\/[^/]+\/edit$/.test(path))
    return import('./pages/TradeEditorPage');
  if (path === '/collection/trades') return import('./pages/TradeInboxPage');
  if (path.startsWith('/collection/trades/'))
    return import('./pages/TradeDetailPage');
  if (path === '/decks' || path === '/collection/decks')
    return import('./pages/DecksPage');
  if (path.startsWith('/collection')) return import('./pages/CollectionPage');
  if (path === '/matches/history') return import('./pages/MatchHistoryPage');
  if (path === '/matches/live') return import('./pages/LiveLobbyPage');
  if (path.startsWith('/matches/live/')) return import('./pages/LiveMatchPage');
  if (path === '/matches/pvp') return import('./pages/PvpHubPage');
  if (path.startsWith('/matches/pvp/')) return import('./pages/PvpMatchPage');
  if (path === '/matches') return import('./pages/MatchEntryPage');
  if (path.startsWith('/matches/')) return import('./pages/CpuMatchPage');
  if (path === '/profile' || path.startsWith('/players/'))
    return import('./pages/ProfilePage');
  if (path === '/leaderboard') return import('./pages/LeaderboardPage');
  if (path === '/account') return import('./pages/AccountPage');
  if (path === '/account/reset-password')
    return import('./pages/PasswordResetPage');
  if (path === '/' || path === '/about') return import('./pages/HomePage');
}

export function RoutePreparation({ pathname }: { pathname: string }) {
  const destination = pathname.startsWith('/author')
    ? 'author console'
    : pathname.startsWith('/matches')
      ? 'battle'
      : pathname.startsWith('/collection/trades')
        ? 'trade'
        : pathname.startsWith('/collection') || pathname === '/decks'
          ? 'collection'
          : pathname === '/explore'
            ? 'Explore'
            : pathname.startsWith('/offline')
              ? 'saved events'
              : pathname.startsWith('/challenge')
                ? 'challenge'
                : pathname === '/account/reset-password'
                  ? 'password reset'
                  : pathname === '/account'
                    ? 'account settings'
                    : pathname === '/leaderboard'
                      ? 'leaderboard'
                      : pathname.startsWith('/profile') ||
                          pathname.startsWith('/players')
                        ? 'profile'
                        : 'home';
  return (
    <LoadingState
      delayed
      prominent
      label={`Opening ${destination}…`}
      resetKey={pathname}
    />
  );
}

interface AppRoutesProps {
  apiBaseUrl: string;
  authConfig?: AuthConfig;
  locationClaimProvider?: LocationClaimProvider;
  locationObservationProvider?: LocationObservationProvider;
  locationPermissionProvider?: LocationPermissionProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
}

export function AppRoutes({
  apiBaseUrl,
  authConfig,
  locationClaimProvider,
  locationObservationProvider,
  locationPermissionProvider,
  mapFactory,
  mapboxAccessToken,
}: AppRoutesProps) {
  const [pathname] = useLocation();

  useEffect(() => {
    // Lazy rendering sends rejected module reads to the route error boundary.
    void prepareRoute(pathname)?.catch(() => undefined);
  }, [pathname]);

  return (
    <CurrentPlayerProvider apiBaseUrl={apiBaseUrl}>
      <OfflineProvider apiBaseUrl={apiBaseUrl}>
        <SessionCollectionShell apiBaseUrl={apiBaseUrl}>
          <AppToaster />
          <ServiceWorkerUpdate />
          <StartupSettler />
          <ErrorBoundary resetKey={pathname} withinShell>
            <Suspense fallback={<RoutePreparation pathname={pathname} />}>
              <Switch>
                <Route path="/" component={HomePage} />
                <Route path="/explore">
                  <OfflineExploreGate>
                    <ExplorePage
                      apiBaseUrl={apiBaseUrl}
                      locationClaimProvider={locationClaimProvider}
                      locationObservationProvider={locationObservationProvider}
                      locationPermissionProvider={locationPermissionProvider}
                      mapFactory={mapFactory}
                      mapboxAccessToken={mapboxAccessToken}
                    />
                  </OfflineExploreGate>
                </Route>
                <Route path="/offline" component={OfflineExplorePage} />
                <Route
                  path="/offline-attempts/:clientAttemptId"
                  component={OfflineAttemptPage}
                />
                <Route path="/challenge-attempts/:attemptId">
                  <ProtectedRoute>
                    <ChallengePage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/collection/trades/new">
                  <ProtectedRoute destination="start a card trade">
                    <TradeEditorPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/collection/trades/:tradeId/edit">
                  <ProtectedRoute destination="edit a card trade">
                    <TradeEditorPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/collection/trades/:tradeId">
                  <ProtectedRoute destination="review a card trade">
                    <TradeDetailPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/collection/trades">
                  <ProtectedRoute destination="manage your card trades">
                    <TradeInboxPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path={/^\/collection(?:\/evolutions)?\/?$/}>
                  <ProtectedRoute destination="view your collection">
                    <CollectionPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/decks">
                  <Redirect replace to="/collection/decks" />
                </Route>
                <Route path="/collection/decks">
                  <ProtectedRoute destination="manage your saved decks">
                    <DecksRoute apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/leaderboard">
                  <ProtectedRoute destination="view the leaderboard">
                    <LeaderboardPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches/history">
                  <ProtectedRoute destination="view your match history">
                    <MatchHistoryPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches/live/:matchId">
                  <ProtectedRoute destination="open a live battle">
                    <LiveMatchPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches/live">
                  <ProtectedRoute destination="play or watch a live battle">
                    <LiveLobbyPage
                      apiBaseUrl={apiBaseUrl}
                      locationClaimProvider={locationClaimProvider}
                    />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches/pvp/:matchId">
                  <ProtectedRoute destination="continue your asynchronous PvP match">
                    <PvpMatchPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches/pvp">
                  <ProtectedRoute destination="play asynchronous PvP">
                    <PvpHubPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches/:matchId">
                  <ProtectedRoute destination="continue your CPU battle">
                    <CpuMatchPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/matches">
                  <ProtectedRoute destination="play a CPU battle">
                    <MatchEntryPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/profile">
                  <ProtectedRoute destination="view your progression profile">
                    <ProfilePage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/players/:playerName">
                  {(params) => (
                    <ProtectedRoute destination="view a player profile">
                      <ProfilePage
                        apiBaseUrl={apiBaseUrl}
                        playerName={params.playerName}
                      />
                    </ProtectedRoute>
                  )}
                </Route>
                <Route path="/account/reset-password">
                  <ProtectedRoute
                    allowPlayerNameSetupRequired
                    destination="reset your password"
                  >
                    <PasswordResetPage authConfig={authConfig} />
                  </ProtectedRoute>
                </Route>
                <Route path="/account">
                  <ProtectedRoute
                    allowPlayerNameSetupRequired
                    destination="manage your player account"
                  >
                    <AccountPage apiBaseUrl={apiBaseUrl} />
                  </ProtectedRoute>
                </Route>
                <Route path="/author/*?">
                  <ProtectedRoute
                    destination="open the author console"
                    loadingFallback={
                      <AuthorLoadingState
                        page
                        recovery={false}
                        label="Checking author access"
                      />
                    }
                  >
                    <AuthorRoute>
                      <AuthorConsolePage
                        apiBaseUrl={apiBaseUrl}
                        mapFactory={mapFactory}
                        mapboxAccessToken={mapboxAccessToken}
                      />
                    </AuthorRoute>
                  </ProtectedRoute>
                </Route>
                <Route path="/about">
                  <Redirect replace to="/" />
                </Route>
                <Route component={NotFoundPage} />
              </Switch>
            </Suspense>
          </ErrorBoundary>
        </SessionCollectionShell>
      </OfflineProvider>
    </CurrentPlayerProvider>
  );
}

function SessionCollectionShell({
  apiBaseUrl,
  children,
}: {
  apiBaseUrl: string;
  children: ReactNode;
}) {
  const { state } = useCurrentPlayer();
  const scope =
    state.status === 'ready'
      ? `${apiBaseUrl}:${state.player.id}:${state.player.role}`
      : `${apiBaseUrl}:${state.status}`;
  return (
    <CollectionReadProvider scope={scope}>
      <AppShell>{children}</AppShell>
    </CollectionReadProvider>
  );
}

function OfflineExploreGate({ children }: { children: ReactNode }) {
  const { revision, offlineSession } = useOffline();
  const { state } = useCurrentPlayer();
  void revision;
  const binding = boundOfflinePlayer();
  // A local binding only opens cached exploration. It never authorizes API reads.
  return binding &&
    (state.status === 'ready'
      ? state.player.id === binding && !state.player.playerNameSetupRequired
      : offlineSession?.playerId === binding) ? (
    children
  ) : (
    <ProtectedRoute>{children}</ProtectedRoute>
  );
}

function DecksRoute({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const [, navigate] = useLocation();

  return (
    <DecksPage
      apiBaseUrl={apiBaseUrl}
      onStartMatch={async (deckId, signal) => {
        let matchApi: typeof import('./api/matches');
        try {
          matchApi = await import('./api/matches');
        } catch {
          throw new MatchModuleLoadError();
        }
        if (signal.aborted) return;
        const match = await matchApi.recoverOrCreateCpuMatch({
          apiBaseUrl,
          deckId,
          getAccessToken,
          signal,
        });
        if (!signal.aborted) {
          navigate(`/matches/${match.matchId}`);
        }
      }}
    />
  );
}

type AppProps =
  | {
      apiBaseUrl: string;
      authConfig?: AuthConfig;
      children?: never;
      locationClaimProvider?: LocationClaimProvider;
      locationObservationProvider?: LocationObservationProvider;
      locationPermissionProvider?: LocationPermissionProvider;
      mapFactory?: MapFactory;
      mapboxAccessToken: string;
    }
  | { apiBaseUrl?: never; children: ReactNode };

export function App(props: AppProps) {
  if ('children' in props) {
    return <ErrorBoundary>{props.children}</ErrorBoundary>;
  }

  return (
    <ErrorBoundary>
      <GuardedRouter>
        <StartupGate>
          <AppRoutes
            apiBaseUrl={props.apiBaseUrl}
            authConfig={props.authConfig}
            locationClaimProvider={props.locationClaimProvider}
            locationObservationProvider={props.locationObservationProvider}
            locationPermissionProvider={props.locationPermissionProvider}
            mapFactory={props.mapFactory}
            mapboxAccessToken={props.mapboxAccessToken}
          />
        </StartupGate>
      </GuardedRouter>
    </ErrorBoundary>
  );
}
