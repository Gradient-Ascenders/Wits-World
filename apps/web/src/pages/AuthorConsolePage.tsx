import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AuthorApiError,
  listAuthorCards,
  type AuthorCard,
} from '../api/author';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CardWorkspace } from '../components/author/CardWorkspace';
import { EventWorkspace } from '../components/author/EventWorkspace';
import '../components/author/author.css';

interface AuthorConsolePageProps {
  apiBaseUrl: string;
  mapboxAccessToken: string;
}

export default function AuthorConsolePage({
  apiBaseUrl,
  mapboxAccessToken,
}: AuthorConsolePageProps) {
  const getAccessToken = useApiAccessToken();
  const [section, setSection] = useState<'cards' | 'events'>('events');
  const [cards, setCards] = useState<AuthorCard[]>([]);
  const [cardsState, setCardsState] = useState<'error' | 'loading' | 'ready'>(
    'loading',
  );
  const [cardsError, setCardsError] = useState('');
  const cardRequestRef = useRef<AbortController | null>(null);

  const loadCards = useCallback(async () => {
    cardRequestRef.current?.abort();
    const controller = new AbortController();
    cardRequestRef.current = controller;
    setCardsState('loading');

    try {
      const nextCards = await listAuthorCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setCards(nextCards);
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
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    void loadCards();
    return () => cardRequestRef.current?.abort();
  }, [loadCards]);

  return (
    <section aria-labelledby="author-console-title" className="author-console">
      <header className="author-console__header">
        <div>
          <p className="eyebrow">Protected Basic authoring</p>
          <h1 id="author-console-title">Author console</h1>
        </div>
        <p>
          Build draft content, verify its relationships, and ask the API to
          publish only when the complete Basic journey is ready.
        </p>
      </header>

      <div className="author-console__layout">
        <nav aria-label="Author console" className="author-sidebar">
          <p className="author-sidebar__label">Content</p>
          <button
            aria-current={section === 'events' ? 'page' : undefined}
            className="author-sidebar__link"
            onClick={() => setSection('events')}
            type="button"
          >
            Events & challenges
          </button>
          <button
            aria-current={section === 'cards' ? 'page' : undefined}
            className="author-sidebar__link"
            onClick={() => setSection('cards')}
            type="button"
          >
            Card catalogue
          </button>
        </nav>

        <div className="author-console__workspace">
          {section === 'events' ? (
            <EventWorkspace
              apiBaseUrl={apiBaseUrl}
              cards={cards}
              cardsState={cardsState}
              getAccessToken={getAccessToken}
              mapboxAccessToken={mapboxAccessToken}
              onOpenCards={() => setSection('cards')}
              onReloadCards={() => void loadCards()}
            />
          ) : (
            <CardWorkspace
              apiBaseUrl={apiBaseUrl}
              cards={cards}
              errorMessage={cardsError}
              getAccessToken={getAccessToken}
              onCardsChange={setCards}
              onReload={() => void loadCards()}
              state={cardsState}
            />
          )}
        </div>
      </div>
    </section>
  );
}
