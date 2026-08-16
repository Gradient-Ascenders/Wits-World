import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Router, Switch } from 'wouter';

import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { NotFoundPage } from './pages/NotFoundPage';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ChallengePage = lazy(() => import('./pages/ChallengePage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));

interface AppRoutesProps {
  apiBaseUrl: string;
  mapboxAccessToken: string;
}

export function AppRoutes({ apiBaseUrl, mapboxAccessToken }: AppRoutesProps) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/explore">
            <ProtectedRoute>
              <ExplorePage
                apiBaseUrl={apiBaseUrl}
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
          <Route path="/about" component={AboutPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </AppShell>
  );
}

type AppProps =
  | {
      apiBaseUrl: string;
      children?: never;
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
          mapboxAccessToken={props.mapboxAccessToken}
        />
      </Router>
    </ErrorBoundary>
  );
}
