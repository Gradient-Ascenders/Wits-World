import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';

import {
  AuthorApiError,
  listAuthorCards,
  type AuthorCard,
} from '../api/author';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CardWorkspace } from '../components/author/CardWorkspace';
import { CampaignWorkspace } from '../components/author/CampaignWorkspace';
import { EventWorkspace } from '../components/author/EventWorkspace';
import { ReviewWorkspace } from '../components/author/ReviewWorkspace';
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
import '../components/author/author.css';

interface AuthorConsolePageProps {
  apiBaseUrl: string;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
}

export default function AuthorConsolePage({
  apiBaseUrl,
  mapFactory,
  mapboxAccessToken,
}: AuthorConsolePageProps) {
  const getAccessToken = useApiAccessToken();
  const [pathname, navigate] = useLocation();
  const route = parseAuthorWorkspaceRoute(pathname);
  const [cards, setCards] = useState<AuthorCard[]>([]);
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

      if (!controller.signal.aborted) {
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
        setCardsState('ready');
        setCardsError('');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setCardsError(
          error instanceof AuthorApiError
            ? error.detail
            : 'The card catalogue could not be loaded.',
        );
        setCardsState('error');
      }
    }
  }, [apiBaseUrl, getAccessToken, mutationCoordinator]);

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
  }, [mutationCoordinator, mutationRevision]);

  return (
    <section aria-labelledby="author-console-title" className="author-console">
      <header className="author-console__header">
        <div>
          <p className="eyebrow">Protected content workspace</p>
          <h1 id="author-console-title">Author console</h1>
        </div>
        <nav aria-label="Author sections" className="author-sections">
          <Link
            aria-current={route.section === 'events' ? 'page' : undefined}
            className="author-sections__link"
            href={authorPaths.events}
          >
            Events
          </Link>
          <Link
            aria-current={route.section === 'cards' ? 'page' : undefined}
            className="author-sections__link"
            href={authorPaths.cards}
          >
            Cards
          </Link>
          <Link
            aria-current={route.section === 'campaigns' ? 'page' : undefined}
            className="author-sections__link"
            href={authorPaths.campaigns}
          >
            Campaigns
          </Link>
          <Link
            aria-current={route.section === 'review' ? 'page' : undefined}
            className="author-sections__link"
            href={authorPaths.review}
          >
            Review
          </Link>
        </nav>
      </header>

      <div className="author-console__workspace">
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
          />
        ) : route.section === 'campaigns' ? (
          <CampaignWorkspace
            apiBaseUrl={apiBaseUrl}
            getAccessToken={getAccessToken}
            navigate={navigate}
            route={route}
          />
        ) : (
          <ReviewWorkspace
            apiBaseUrl={apiBaseUrl}
            getAccessToken={getAccessToken}
          />
        )}
      </div>
    </section>
  );
}
