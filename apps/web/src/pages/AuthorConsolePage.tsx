import {
  AuthorRetainedReads,
  useAuthorRetainedResource,
} from '../components/author/AuthorRetainedReads';
import { AuthorReviewNavigationProvider } from '../components/author/AuthorReviewNavigation';
import { authorErrorDetail } from '../components/author/author-error-copy';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'wouter';

import {
  AuthorApiError,
  listAuthorCards,
  type AuthorCard,
} from '../api/author';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { AuthorLoadingState } from '../components/author/AuthorLoadingState';
import {
  loadAnalyticsWorkspace,
  loadCampaignWorkspace,
  loadCardWorkspace,
  loadEventPlacementWorkspace,
  loadEventWorkspace,
  loadReviewWorkspace,
  loadTrustReviewWorkspace,
} from '../components/author/author-workspace-modules';
import {
  authorPaths,
  parseAuthorWorkspaceRoute,
} from '../components/author/author-routing';
import type { MapFactory } from '../components/exploration/map-provider';
import {
  AuthorMutationCoordinator,
  reconcileAuthorMutationResults,
  useAuthorMutationRevision,
} from '../components/author/author-mutation-coordinator';
import { AuthorSidebar } from '../components/author/AuthorSidebar';
import '../components/author/author.css';
import '../components/author/author-events.css';
import '../components/author/author-cards.css';
import '../components/author/author-review.css';

const EventWorkspace = lazy(() =>
  loadEventWorkspace().then((module) => ({
    default: module.EventWorkspace,
  })),
);
const CardWorkspace = lazy(() =>
  loadCardWorkspace().then((module) => ({
    default: module.CardWorkspace,
  })),
);
const CampaignWorkspace = lazy(() =>
  loadCampaignWorkspace().then((module) => ({
    default: module.CampaignWorkspace,
  })),
);
const AnalyticsWorkspace = lazy(() =>
  loadAnalyticsWorkspace().then((module) => ({
    default: module.AnalyticsWorkspace,
  })),
);
const TrustReviewWorkspace = lazy(() =>
  loadTrustReviewWorkspace().then((module) => ({
    default: module.TrustReviewWorkspace,
  })),
);
const EventPlacementWorkspace = lazy(() =>
  loadEventPlacementWorkspace().then((module) => ({
    default: module.EventPlacementWorkspace,
  })),
);
const ReviewWorkspace = lazy(() =>
  loadReviewWorkspace().then((module) => ({
    default: module.ReviewWorkspace,
  })),
);

interface AuthorConsolePageProps {
  apiBaseUrl: string;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
}

function AuthorConsoleWorkspace({
  apiBaseUrl,
  mapFactory,
  mapboxAccessToken,
}: AuthorConsolePageProps) {
  const getAccessToken = useApiAccessToken();
  const [pathname, navigate] = useLocation();
  const route = parseAuthorWorkspaceRoute(pathname);
  const {
    value: cards,
    setValue: setCards,
    confirmed: cardsConfirmed,
    confirm: confirmCards,
    revoke: revokeCards,
    beginRead,
  } = useAuthorRetainedResource<AuthorCard[]>('cards', []);
  const [cardsState, setCardsState] = useState<'error' | 'loading' | 'ready'>(
    'loading',
  );
  const [cardsError, setCardsError] = useState('');
  const cardRequestRef = useRef<AbortController | null>(null);
  const appliedCardResultsRef = useRef(new Map());
  const [mutationCoordinator] = useState(() => new AuthorMutationCoordinator());
  const mutationRevision = useAuthorMutationRevision(mutationCoordinator);

  const loadCards = useCallback(async () => {
    cardRequestRef.current?.abort();
    const canApplyRead = beginRead();
    const controller = new AbortController();
    cardRequestRef.current = controller;
    const loadStartedAt = mutationCoordinator.beginCollectionLoad();
    setCardsState('loading');

    try {
      const nextCards = await listAuthorCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });

      if (!controller.signal.aborted && canApplyRead()) {
        mutationCoordinator.completeCollectionLoad('cards', loadStartedAt);
        setCards(
          reconcileAuthorMutationResults(
            nextCards,
            mutationCoordinator.getResults<AuthorCard>('cards'),
            (card) => card.id,
            appliedCardResultsRef.current,
            true,
          ),
        );
        confirmCards();
        setCardsState('ready');
        setCardsError('');
      }
    } catch (error) {
      if (!controller.signal.aborted && canApplyRead()) {
        revokeCards(error);
        setCardsError(
          error instanceof AuthorApiError
            ? authorErrorDetail(error)
            : 'The card catalogue could not be loaded.',
        );
        setCardsState('error');
      }
    }
  }, [
    apiBaseUrl,
    getAccessToken,
    mutationCoordinator,
    confirmCards,
    revokeCards,
    setCards,
    beginRead,
  ]);

  useEffect(() => {
    void loadCards();
    return () => cardRequestRef.current?.abort();
  }, [loadCards]);

  useEffect(() => {
    if (pathname === '/author' || pathname === '/author/') {
      navigate(authorPaths.events, { replace: true });
    }
  }, [navigate, pathname]);

  useEffect(() => {
    setCards((current) =>
      reconcileAuthorMutationResults(
        current,
        mutationCoordinator.getResults<AuthorCard>('cards'),
        (card) => card.id,
        appliedCardResultsRef.current,
      ),
    );
  }, [mutationCoordinator, mutationRevision, setCards]);

  return (
    <AuthorReviewNavigationProvider>
      <section
        aria-labelledby="author-console-title"
        className="author-console"
      >
        {[
          'events',
          'cards',
          'campaigns',
          'review',
          'playerReview',
          'analytics',
          'placement',
        ].includes(route.section) ? (
          <h1 id="author-console-title" className="sr-only">
            Author console
          </h1>
        ) : (
          <header className="author-console__header">
            <div>
              <p className="eyebrow">University content management</p>
              <h1 id="author-console-title">Author console</h1>
            </div>
          </header>
        )}

        <AuthorSidebar pathname={pathname} route={route} />
        <div className="author-console__workspace">
          <Suspense
            fallback={
              <AuthorLoadingState page label="Opening author workspace…" />
            }
          >
            {route.section === 'events' ? (
              <EventWorkspace
                apiBaseUrl={apiBaseUrl}
                cards={cards}
                cardsState={cardsState}
                getAccessToken={getAccessToken}
                mapFactory={mapFactory}
                mapboxAccessToken={mapboxAccessToken}
                mutationCoordinator={mutationCoordinator}
                navigate={navigate}
                onOpenCards={() => navigate(authorPaths.cards)}
                onReloadCards={loadCards}
                route={route}
              />
            ) : route.section === 'cards' ? (
              <CardWorkspace
                apiBaseUrl={apiBaseUrl}
                cards={cards}
                errorMessage={cardsError}
                getAccessToken={getAccessToken}
                mutationCoordinator={mutationCoordinator}
                navigate={navigate}
                onCardsChange={setCards}
                onReload={loadCards}
                route={route}
                state={cardsState}
                confirmed={cardsConfirmed}
              />
            ) : route.section === 'campaigns' ? (
              <CampaignWorkspace
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
                navigate={navigate}
                route={route}
              />
            ) : route.section === 'analytics' ? (
              <AnalyticsWorkspace
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
              />
            ) : route.section === 'playerReview' ? (
              <TrustReviewWorkspace
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
                route={route}
              />
            ) : route.section === 'placement' ? (
              <EventPlacementWorkspace
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
                mapFactory={mapFactory}
                mapboxAccessToken={mapboxAccessToken}
              />
            ) : (
              <ReviewWorkspace
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
              />
            )}
          </Suspense>
        </div>
      </section>
    </AuthorReviewNavigationProvider>
  );
}

export default function AuthorConsolePage(props: AuthorConsolePageProps) {
  return (
    <AuthorRetainedReads key={props.apiBaseUrl}>
      <AuthorConsoleWorkspace {...props} />
    </AuthorRetainedReads>
  );
}
