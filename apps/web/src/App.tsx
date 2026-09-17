import { AppToaster } from './components/AppToaster';
import { lazy, Suspense, type ReactNode } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';

import { recoverOrCreateCpuMatch } from './api/matches';
import { useApiAccessToken } from './auth/useApiAccessToken';
import { AppShell } from './components/AppShell';
import { OfflineProvider, OfflineStatus } from './offline/OfflineProvider';
import { ServiceWorkerUpdate } from './offline/ServiceWorkerUpdate';
import {
  OfflineAttemptPage,
  OfflineExploreGate,
  OfflineExplorePage,
} from './offline/OfflinePages';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthorRoute } from './components/auth/AuthorRoute';
import { GuardedRouter } from './components/author/AuthorNavigationGuard';
import { CurrentPlayerProvider } from './auth/CurrentPlayerProvider';
import HomePage from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import type {
  LocationClaimProvider,
  LocationObservationProvider,
  LocationPermissionProvider,
} from './browser-location';
import type { MapFactory } from './components/exploration/map-provider';

const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ChallengePage = lazy(() => import('./pages/ChallengePage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const AuthorConsolePage = lazy(() => import('./pages/AuthorConsolePage'));
const DecksPage = lazy(() => import('./pages/DecksPage'));
const MatchEntryPage = lazy(() => import('./pages/MatchEntryPage'));
const CpuMatchPage = lazy(() => import('./pages/CpuMatchPage'));
const MatchHistoryPage = lazy(() => import('./pages/MatchHistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PvpHubPage = lazy(() => import('./pages/PvpHubPage'));
const PvpMatchPage = lazy(() => import('./pages/PvpMatchPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));

interface AppRoutesProps {
  apiBaseUrl: string;
  locationClaimProvider?: LocationClaimProvider;
  locationObservationProvider?: LocationObservationProvider;
  locationPermissionProvider?: LocationPermissionProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
}

export function AppRoutes({
  apiBaseUrl,
  locationClaimProvider,
  locationObservationProvider,
  locationPermissionProvider,
  mapFactory,
  mapboxAccessToken,
}: AppRoutesProps) {
  return (
    <CurrentPlayerProvider apiBaseUrl={apiBaseUrl}>
      <OfflineProvider apiBaseUrl={apiBaseUrl}>
        <AppShell>
          <AppToaster />
          <OfflineStatus />
          <ServiceWorkerUpdate />
          <Suspense fallback={<LoadingState />}>
            <Switch>
              <Route path="/" component={HomePage} />
              <Route path="/explore">
                <OfflineExploreGate>
                  <ProtectedRoute>
                    <ExplorePage
                      apiBaseUrl={apiBaseUrl}
                      locationClaimProvider={locationClaimProvider}
                      locationObservationProvider={locationObservationProvider}
                      locationPermissionProvider={locationPermissionProvider}
                      mapFactory={mapFactory}
                      mapboxAccessToken={mapboxAccessToken}
                    />
                  </ProtectedRoute>
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
              <Route path="/collection">
                <ProtectedRoute destination="view your collection">
                  <CollectionPage apiBaseUrl={apiBaseUrl} />
                </ProtectedRoute>
              </Route>
              <Route path="/decks">
                <ProtectedRoute destination="manage your saved decks">
                  <DecksRoute apiBaseUrl={apiBaseUrl} />
                </ProtectedRoute>
              </Route>
              <Route path="/matches/history">
                <ProtectedRoute destination="view your match history">
                  <MatchHistoryPage apiBaseUrl={apiBaseUrl} />
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
              <Route path="/account">
                <ProtectedRoute
                  allowPlayerNameSetupRequired
                  destination="manage your player account"
                >
                  <AccountPage apiBaseUrl={apiBaseUrl} />
                </ProtectedRoute>
              </Route>
              <Route path="/author/*?">
                <ProtectedRoute destination="open the author console">
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
                <Redirect replace to="/#project-context" />
              </Route>
              <Route component={NotFoundPage} />
            </Switch>
          </Suspense>
        </AppShell>
      </OfflineProvider>
    </CurrentPlayerProvider>
  );
}

function DecksRoute({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const [, navigate] = useLocation();

  return (
    <DecksPage
      apiBaseUrl={apiBaseUrl}
      onStartMatch={async (deckId, signal) => {
        const match = await recoverOrCreateCpuMatch({
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
        <AppRoutes
          apiBaseUrl={props.apiBaseUrl}
          locationClaimProvider={props.locationClaimProvider}
          locationObservationProvider={props.locationObservationProvider}
          locationPermissionProvider={props.locationPermissionProvider}
          mapFactory={props.mapFactory}
          mapboxAccessToken={props.mapboxAccessToken}
        />
      </GuardedRouter>
    </ErrorBoundary>
  );
}
