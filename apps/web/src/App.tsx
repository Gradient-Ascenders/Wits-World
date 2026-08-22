import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';

import { recoverOrCreateCpuMatch } from './api/matches';
import { useApiAccessToken } from './auth/useApiAccessToken';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthorRoute } from './components/auth/AuthorRoute';
import { CurrentPlayerProvider } from './auth/CurrentPlayerProvider';
import { NotFoundPage } from './pages/NotFoundPage';
import type { LocationClaimProvider } from './browser-location';
import type { MapFactory } from './components/exploration/map-provider';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ChallengePage = lazy(() => import('./pages/ChallengePage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const AuthorConsolePage = lazy(() => import('./pages/AuthorConsolePage'));
const DecksPage = lazy(() => import('./pages/DecksPage'));
const MatchEntryPage = lazy(() => import('./pages/MatchEntryPage'));
const CpuMatchPage = lazy(() => import('./pages/CpuMatchPage'));
const MatchHistoryPage = lazy(() => import('./pages/MatchHistoryPage'));

interface AppRoutesProps {
  apiBaseUrl: string;
  locationClaimProvider?: LocationClaimProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
}

export function AppRoutes({
  apiBaseUrl,
  locationClaimProvider,
  mapFactory,
  mapboxAccessToken,
}: AppRoutesProps) {
  return (
    <CurrentPlayerProvider apiBaseUrl={apiBaseUrl}>
      <AppShell>
        <Suspense fallback={<LoadingState />}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/explore">
              <ProtectedRoute>
                <ExplorePage
                  apiBaseUrl={apiBaseUrl}
                  locationClaimProvider={locationClaimProvider}
                  mapFactory={mapFactory}
                  mapboxAccessToken={mapboxAccessToken}
                />
              </ProtectedRoute>
            </Route>
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
            <Route path="/author">
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
            <Route path="/about" component={AboutPage} />
            <Route component={NotFoundPage} />
          </Switch>
        </Suspense>
      </AppShell>
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
      <Router>
        <AppRoutes
          apiBaseUrl={props.apiBaseUrl}
          locationClaimProvider={props.locationClaimProvider}
          mapFactory={props.mapFactory}
          mapboxAccessToken={props.mapboxAccessToken}
        />
      </Router>
    </ErrorBoundary>
  );
}
