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

interface AppRoutesProps {
  apiBaseUrl: string;
}

export function AppRoutes({ apiBaseUrl }: AppRoutesProps) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/explore">
            <ProtectedRoute>
              <ExplorePage apiBaseUrl={apiBaseUrl} />
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
  | { apiBaseUrl: string; children?: never }
  | { apiBaseUrl?: never; children: ReactNode };

export function App(props: AppProps) {
  if ('children' in props) {
    return <ErrorBoundary>{props.children}</ErrorBoundary>;
  }

  return (
    <ErrorBoundary>
      <Router>
        <AppRoutes apiBaseUrl={props.apiBaseUrl} />
      </Router>
    </ErrorBoundary>
  );
}
