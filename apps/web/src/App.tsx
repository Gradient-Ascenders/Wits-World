import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Router, Switch } from 'wouter';

import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';
import { NotFoundPage } from './pages/NotFoundPage';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

export function AppRoutes() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Switch>
          <Route path="/" component={HomePage} />
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
