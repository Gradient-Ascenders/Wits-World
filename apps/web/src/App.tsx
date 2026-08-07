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

export function AppRoutes() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/explore">
            <ProtectedRoute>
              <ExplorePage />
            </ProtectedRoute>
          </Route>
          <Route path="/about" component={AboutPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </AppShell>
  );
}

interface AppProps {
  children?: ReactNode;
}

export function App({ children }: AppProps) {
  return (
    <ErrorBoundary>
      {children ?? (
        <Router>
          <AppRoutes />
        </Router>
      )}
    </ErrorBoundary>
  );
}
