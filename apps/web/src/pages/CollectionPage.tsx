import { useAuth0 } from '@auth0/auth0-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';

import {
  CardApiError,
  cardAffinities,
  listOwnedCards,
  selectStarter,
  type CardAffinity,
  type OwnedCard,
  type StarterGrant,
} from '../api/cards';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CollectibleCard } from '../components/cards/CollectibleCard';
import '../components/cards/cards.css';

interface CollectionPageProps {
  apiBaseUrl: string;
}

type CollectionState =
  | { status: 'loading' }
  | { error: CardApiError; status: 'error' }
  | { cards: OwnedCard[]; status: 'ready' };

export default function CollectionPage({ apiBaseUrl }: CollectionPageProps) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [collection, setCollection] = useState<CollectionState>({
    status: 'loading',
  });
  const [collectionRevision, setCollectionRevision] = useState(0);
  const [selectedAffinity, setSelectedAffinity] = useState<CardAffinity>('wit');
  const [starterGrant, setStarterGrant] = useState<StarterGrant | null>(null);
  const [starterError, setStarterError] = useState<CardApiError | null>(null);
  const [isSubmittingStarter, setIsSubmittingStarter] = useState(false);
  const [reauthFailed, setReauthFailed] = useState(false);
  const starterRequest = useRef<AbortController | null>(null);
  const starterSubmissionLocked = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const collectionHeading = useRef<HTMLHeadingElement | null>(null);
  const shouldFocusCollection = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    setCollection({ status: 'loading' });

    void listOwnedCards({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((cards) => {
        if (!controller.signal.aborted) {
          setCollection({ cards, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCollection({ error: toCardApiError(error), status: 'error' });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, collectionRevision, getAccessToken]);

  useEffect(() => {
    return () => starterRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (starterGrant !== null) {
      resultHeading.current?.focus();
    }
  }, [starterGrant]);

  useEffect(() => {
    if (shouldFocusCollection.current && collection.status === 'ready') {
      shouldFocusCollection.current = false;
      collectionHeading.current?.focus();
    }
  }, [collection]);

  const retryCollection = useCallback(() => {
    setStarterError(null);
    setReauthFailed(false);
    setCollection({ status: 'loading' });
    setCollectionRevision((revision) => revision + 1);
  }, []);

  const loadCollectionAndFocus = useCallback(() => {
    shouldFocusCollection.current = true;
    retryCollection();
  }, [retryCollection]);

  async function startSignIn() {
    setReauthFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/collection' } });
    } catch {
      setReauthFailed(true);
    }
  }

  async function submitStarter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (starterSubmissionLocked.current) {
      return;
    }

    starterSubmissionLocked.current = true;
    setStarterError(null);
    setIsSubmittingStarter(true);
    const controller = new AbortController();
    starterRequest.current = controller;

    try {
      const grant = await selectStarter({
        affinity: selectedAffinity,
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setStarterGrant(grant);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setStarterError(toCardApiError(error));
      }
    } finally {
      if (starterRequest.current === controller) {
        starterRequest.current = null;
        starterSubmissionLocked.current = false;
        if (!controller.signal.aborted) {
          setIsSubmittingStarter(false);
        }
      }
    }
  }

  function viewCollection() {
    setStarterGrant(null);
    loadCollectionAndFocus();
  }

  if (starterGrant !== null) {
    return (
      <div className="collection-page">
        <StarterResult
          grant={starterGrant}
          headingRef={resultHeading}
          onViewCollection={viewCollection}
        />
      </div>
    );
  }

  const cards = collection.status === 'ready' ? collection.cards : [];
  const hasStarter = cards.some((card) => card.acquisitionKind === 'starter');

  return (
    <div className="collection-page">
      <header className="collection-page__header">
        <p className="eyebrow">Player collection</p>
        <h1>Cards you own</h1>
        <p className="lead">
          Browse every card copy recorded for your account, including duplicate
          rewards.
        </p>
        {collection.status === 'ready' ? (
          <p aria-live="polite" className="collection-summary">
            <strong>{cards.length}</strong>{' '}
            {cards.length === 1 ? 'owned copy' : 'owned copies'}
          </p>
        ) : null}
      </header>

      {collection.status === 'loading' ? (
        <section aria-live="polite" className="collection-state" role="status">
          <p className="eyebrow">Collection</p>
          <h2>Loading your cards</h2>
          <p>Checking the card copies saved to your player account…</p>
        </section>
      ) : null}

      {collection.status === 'error' ? (
        <CollectionErrorState
          error={collection.error}
          onRetry={retryCollection}
          onSignIn={startSignIn}
          reauthFailed={reauthFailed}
        />
      ) : null}

      {collection.status === 'ready' && !hasStarter ? (
        <StarterSelector
          error={starterError}
          isSubmitting={isSubmittingStarter}
          onAffinityChange={setSelectedAffinity}
          onLoadCollection={loadCollectionAndFocus}
          onSignIn={startSignIn}
          onSubmit={submitStarter}
          reauthFailed={reauthFailed}
          selectedAffinity={selectedAffinity}
        />
      ) : null}

      {collection.status === 'ready' && cards.length === 0 ? (
        <section className="collection-state">
          <p className="eyebrow">No owned cards</p>
          <h2>Your collection is empty</h2>
          <p>
            Choose a starter affinity above. The server will select and record
            your first five cards.
          </p>
        </section>
      ) : null}

      {collection.status === 'ready' && cards.length > 0 ? (
        <CollectionGrid cards={cards} headingRef={collectionHeading} />
      ) : null}
    </div>
  );
}

interface StarterSelectorProps {
  error: CardApiError | null;
  isSubmitting: boolean;
  onAffinityChange: (affinity: CardAffinity) => void;
  onLoadCollection: () => void;
  onSignIn: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  reauthFailed: boolean;
  selectedAffinity: CardAffinity;
}

function StarterSelector({
  error,
  isSubmitting,
  onAffinityChange,
  onLoadCollection,
  onSignIn,
  onSubmit,
  reauthFailed,
  selectedAffinity,
}: StarterSelectorProps) {
  return (
    <section
      aria-labelledby="starter-selector-title"
      className="starter-selector"
    >
      <p className="eyebrow">Begin your collection</p>
      <h2 id="starter-selector-title">Choose your starter affinity</h2>
      <p className="starter-selector__intro">
        This is a one-time choice. Your affinity guides the starter set, while
        Wits World securely decides and records the five cards you receive.
      </p>

      <form onSubmit={onSubmit}>
        <fieldset disabled={isSubmitting}>
          <legend>Select one affinity</legend>
          <div className="starter-affinities">
            {cardAffinities.map((affinity) => (
              <label className="starter-affinity" key={affinity}>
                <input
                  checked={selectedAffinity === affinity}
                  name="starter-affinity"
                  onChange={() => onAffinityChange(affinity)}
                  type="radio"
                  value={affinity}
                />
                <strong>{titleCase(affinity)}</strong>
                <span>Starter affinity</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <StarterError
            error={error}
            onLoadCollection={onLoadCollection}
            onSignIn={onSignIn}
            reauthFailed={reauthFailed}
          />
        ) : null}

        <div className="starter-selector__actions">
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Claiming your starter…' : 'Choose this affinity'}
          </button>
          <p>
            Three Creature cards and two Power cards are granted by the server.
          </p>
        </div>
      </form>
    </section>
  );
}

function StarterError({
  error,
  onLoadCollection,
  onSignIn,
  reauthFailed,
}: Pick<
  StarterSelectorProps,
  'error' | 'onLoadCollection' | 'onSignIn' | 'reauthFailed'
> & { error: CardApiError }) {
  if (error.failure === 'starter-already-claimed') {
    return (
      <div className="starter-selector__error" role="alert">
        <p>
          <strong>Your starter was already chosen.</strong> Your original choice
          remains authoritative, so no second set was created.
        </p>
        <button
          className="button button--quiet"
          onClick={onLoadCollection}
          type="button"
        >
          Load my collection
        </button>
      </div>
    );
  }

  if (error.failure === 'authorization') {
    return (
      <div className="starter-selector__error" role="alert">
        <p>
          <strong>Your session expired before the choice was saved.</strong>{' '}
          Sign in again, then return here to choose your starter.
        </p>
        <button
          className="button button--quiet"
          onClick={onSignIn}
          type="button"
        >
          Sign in again
        </button>
        {reauthFailed ? <p>Sign-in could not start. Try again.</p> : null}
      </div>
    );
  }

  return (
    <div className="starter-selector__error" role="alert">
      <p>
        <strong>
          {error.failure === 'starter-unavailable'
            ? 'That starter affinity is unavailable right now.'
            : 'Your starter choice could not be saved.'}
        </strong>{' '}
        {error.failure === 'starter-unavailable'
          ? 'Choose another affinity or try again later.'
          : 'Check your connection and try the choice again.'}
      </p>
    </div>
  );
}

function StarterResult({
  grant,
  headingRef,
  onViewCollection,
}: {
  grant: StarterGrant;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onViewCollection: () => void;
}) {
  const creatureCount = grant.cards.filter(
    (card) => card.category === 'creature',
  ).length;
  const powerCount = grant.cards.filter(
    (card) => card.category === 'power',
  ).length;

  return (
    <section aria-labelledby="starter-result-title" className="starter-result">
      <p className="eyebrow">Starter secured</p>
      <h1 id="starter-result-title" ref={headingRef} tabIndex={-1}>
        Your {titleCase(grant.affinity)} starter set
      </h1>
      <p className="starter-result__intro">
        These are the five cards Wits World granted and recorded for your
        collection.
      </p>
      <p className="starter-result__composition">
        {grant.cards.length} cards recorded · {creatureCount}{' '}
        {creatureCount === 1 ? 'Creature' : 'Creatures'} · {powerCount} Power{' '}
        {powerCount === 1 ? 'card' : 'cards'}
      </p>
      <CardList cards={grant.cards} label="Granted starter cards" />
      <div className="starter-result__actions">
        <button className="button" onClick={onViewCollection} type="button">
          View my collection
        </button>
      </div>
    </section>
  );
}

function CollectionGrid({
  cards,
  headingRef,
}: {
  cards: OwnedCard[];
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section aria-labelledby="collection-grid-title">
      <h2
        className="collection-grid-heading"
        id="collection-grid-title"
        ref={headingRef}
        tabIndex={-1}
      >
        Owned card copies
      </h2>
      <CardList cards={cards} label="Owned card copies" />
    </section>
  );
}

function CardList({ cards, label }: { cards: OwnedCard[]; label: string }) {
  const copies = useMemo(() => annotateCopies(cards), [cards]);

  return (
    <ul aria-label={label} className="owned-card-list">
      {copies.map(({ card, copyNumber, copyTotal }) => (
        <li key={card.ownedCardId}>
          <CollectibleCard
            card={card}
            copyNumber={copyNumber}
            copyTotal={copyTotal}
          />
        </li>
      ))}
    </ul>
  );
}

function CollectionErrorState({
  error,
  onRetry,
  onSignIn,
  reauthFailed,
}: {
  error: CardApiError;
  onRetry: () => void;
  onSignIn: () => Promise<void>;
  reauthFailed: boolean;
}) {
  const isAuthorization = error.failure === 'authorization';

  return (
    <section className="collection-state" role="alert">
      <p className="eyebrow">Collection unavailable</p>
      <h2>
        {isAuthorization
          ? 'Your session has expired'
          : 'Your cards could not load'}
      </h2>
      <p>
        {isAuthorization
          ? 'Sign in again to securely load the card copies saved to your account.'
          : 'Check your connection and try loading your collection again.'}
      </p>
      <button
        className="button"
        onClick={isAuthorization ? onSignIn : onRetry}
        type="button"
      >
        {isAuthorization ? 'Sign in again' : 'Try loading again'}
      </button>
      {reauthFailed ? <p>Sign-in could not start. Try again.</p> : null}
    </section>
  );
}

function annotateCopies(cards: OwnedCard[]) {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();

  cards.forEach((card) => {
    totals.set(
      card.cardDefinitionId,
      (totals.get(card.cardDefinitionId) ?? 0) + 1,
    );
  });

  return cards.map((card) => {
    const copyNumber = (seen.get(card.cardDefinitionId) ?? 0) + 1;
    seen.set(card.cardDefinitionId, copyNumber);

    return {
      card,
      copyNumber,
      copyTotal: totals.get(card.cardDefinitionId) ?? 1,
    };
  });
}

function toCardApiError(error: unknown) {
  return error instanceof CardApiError
    ? error
    : new CardApiError('unavailable');
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
