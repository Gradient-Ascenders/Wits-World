import { useAuth0 } from '@auth0/auth0-react';
import { createPortal } from 'react-dom';
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
  listOwnedCards,
  listStarterOptions,
  selectStarter,
  type OwnedCard,
  type StarterAffinity,
  type StarterGrant,
  type StarterOption,
} from '../api/cards';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { describeStarterEffect } from '../battle/effect-presentation';
import {
  CardThumbnail,
  CollectibleCard,
} from '../components/cards/CollectibleCard';
import '../components/cards/cards.css';

interface CollectionPageProps {
  apiBaseUrl: string;
}

type CollectionState =
  | { status: 'loading' }
  | { error: CardApiError; status: 'error' }
  | { cards: OwnedCard[]; status: 'ready' };

type StarterOptionsState =
  | { status: 'idle' | 'loading' }
  | { error: CardApiError; status: 'error' }
  | { options: StarterOption[]; status: 'ready' };

export default function CollectionPage({ apiBaseUrl }: CollectionPageProps) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [collection, setCollection] = useState<CollectionState>({
    status: 'loading',
  });
  const [collectionRevision, setCollectionRevision] = useState(0);
  const [starterOptions, setStarterOptions] = useState<StarterOptionsState>({
    status: 'idle',
  });
  const [starterOptionsRevision, setStarterOptionsRevision] = useState(0);
  const [selectedAffinity, setSelectedAffinity] =
    useState<StarterAffinity | null>(null);
  const [isConfirmingStarter, setIsConfirmingStarter] = useState(false);
  const [starterGrant, setStarterGrant] = useState<StarterGrant | null>(null);
  const [starterError, setStarterError] = useState<CardApiError | null>(null);
  const [isSubmittingStarter, setIsSubmittingStarter] = useState(false);
  const [reauthFailed, setReauthFailed] = useState(false);
  const starterRequest = useRef<AbortController | null>(null);
  const starterSubmissionLocked = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement | null>(null);
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

  const hasStarter =
    collection.status === 'ready' &&
    collection.cards.some((card) => card.acquisitionKind === 'starter');

  useEffect(() => {
    if (collection.status !== 'ready' || hasStarter) {
      setStarterOptions({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setStarterOptions({ status: 'loading' });

    void listStarterOptions({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((options) => {
        if (!controller.signal.aborted) {
          setStarterOptions({ options, status: 'ready' });
          setSelectedAffinity((affinity) =>
            options.some((option) => option.affinity === affinity)
              ? affinity
              : (options[0]?.affinity ?? null),
          );
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStarterOptions({
            error: toCardApiError(error),
            status: 'error',
          });
        }
      });

    return () => controller.abort();
  }, [
    apiBaseUrl,
    collection,
    getAccessToken,
    hasStarter,
    starterOptionsRevision,
  ]);

  useEffect(() => {
    return () => starterRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (starterGrant !== null) {
      resultHeading.current?.focus();
    }
  }, [starterGrant]);

  useEffect(() => {
    if (isConfirmingStarter) {
      confirmationHeading.current?.focus();
    }
  }, [isConfirmingStarter]);

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

  const retryStarterOptions = useCallback(() => {
    setStarterError(null);
    setReauthFailed(false);
    setStarterOptions({ status: 'loading' });
    setStarterOptionsRevision((revision) => revision + 1);
  }, []);

  async function startSignIn() {
    setReauthFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/collection' } });
    } catch {
      setReauthFailed(true);
    }
  }

  async function confirmStarter() {
    if (starterSubmissionLocked.current || selectedAffinity === null) {
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

  function reviewStarter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedAffinity !== null) {
      setStarterError(null);
      setIsConfirmingStarter(true);
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
  const cardDefinitionCount = new Set(
    cards.map((card) => card.cardDefinitionId),
  ).size;
  const renderStarterSelector = (headingLevel: 1 | 2) => (
    <StarterSelector
      confirmationHeadingRef={confirmationHeading}
      error={starterError}
      headingLevel={headingLevel}
      isConfirming={isConfirmingStarter}
      isSubmitting={isSubmittingStarter}
      onAffinityChange={(affinity) => {
        setSelectedAffinity(affinity);
        setIsConfirmingStarter(false);
        setStarterError(null);
      }}
      onCancelConfirmation={() => {
        setIsConfirmingStarter(false);
        setStarterError(null);
      }}
      onConfirm={confirmStarter}
      onLoadCollection={loadCollectionAndFocus}
      onRetryOptions={retryStarterOptions}
      onSignIn={startSignIn}
      onSubmit={reviewStarter}
      optionsState={starterOptions}
      reauthFailed={reauthFailed}
      selectedAffinity={selectedAffinity}
    />
  );

  if (collection.status === 'ready' && !hasStarter && cards.length === 0) {
    return (
      <div className="collection-page collection-page--starter">
        {renderStarterSelector(1)}
      </div>
    );
  }

  return (
    <div className="collection-page">
      <header className="collection-page__header">
        <p className="eyebrow">Player collection</p>
        <h1>Cards you own</h1>
        <p className="lead">
          Browse card designs. Open one for gameplay and ownership details.
        </p>
        {collection.status === 'ready' ? (
          <p aria-live="polite" className="collection-summary">
            <strong>{cards.length}</strong>{' '}
            <span>
              {cards.length === 1 ? 'owned copy' : 'owned copies'} across{' '}
              {cardDefinitionCount}{' '}
              {cardDefinitionCount === 1 ? 'design' : 'designs'}
            </span>
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

      {collection.status === 'ready' && !hasStarter
        ? renderStarterSelector(2)
        : null}

      {collection.status === 'ready' && cards.length > 0 ? (
        <CollectionGrid cards={cards} headingRef={collectionHeading} />
      ) : null}
    </div>
  );
}

interface StarterSelectorProps {
  confirmationHeadingRef: RefObject<HTMLHeadingElement | null>;
  error: CardApiError | null;
  headingLevel: 1 | 2;
  isConfirming: boolean;
  isSubmitting: boolean;
  onAffinityChange: (affinity: StarterAffinity) => void;
  onCancelConfirmation: () => void;
  onConfirm: () => Promise<void>;
  onLoadCollection: () => void;
  onRetryOptions: () => void;
  onSignIn: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  optionsState: StarterOptionsState;
  reauthFailed: boolean;
  selectedAffinity: StarterAffinity | null;
}

function StarterSelector({
  confirmationHeadingRef,
  error,
  headingLevel,
  isConfirming,
  isSubmitting,
  onAffinityChange,
  onCancelConfirmation,
  onConfirm,
  onLoadCollection,
  onRetryOptions,
  onSignIn,
  onSubmit,
  optionsState,
  reauthFailed,
  selectedAffinity,
}: StarterSelectorProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const selectedOption =
    optionsState.status === 'ready'
      ? (optionsState.options.find(
          (option) => option.affinity === selectedAffinity,
        ) ?? null)
      : null;

  return (
    <section
      aria-labelledby="starter-selector-title"
      className="starter-selector"
    >
      <p className="eyebrow">Begin your collection</p>
      <Heading id="starter-selector-title">
        Choose your starter affinity
      </Heading>
      <p className="starter-selector__intro">
        Compare three server-selected packages. This is a one-time choice, and
        Wits World will securely record the five cards you confirm.
      </p>
      <p className="starter-selector__progression">
        Spirit, Mystic, and other cards can still be earned later through
        challenge progression.
      </p>

      {optionsState.status === 'idle' || optionsState.status === 'loading' ? (
        <div aria-live="polite" className="starter-options-state" role="status">
          <p className="eyebrow">Starter packages</p>
          <h2>Loading your choices</h2>
          <p>Reading the current starter packages from Wits World…</p>
        </div>
      ) : null}

      {optionsState.status === 'error' ? (
        <StarterOptionsError
          error={optionsState.error}
          onRetry={onRetryOptions}
          onSignIn={onSignIn}
          reauthFailed={reauthFailed}
        />
      ) : null}

      {optionsState.status === 'ready' ? (
        <form onSubmit={onSubmit}>
          <fieldset disabled={isSubmitting || isConfirming}>
            <legend>Select one starter package</legend>
            <div className="starter-options">
              {optionsState.options.map((option) => (
                <StarterOptionChoice
                  isSelected={selectedAffinity === option.affinity}
                  key={option.affinity}
                  onSelect={onAffinityChange}
                  option={option}
                />
              ))}
            </div>
          </fieldset>

          {!isConfirming ? (
            <div className="starter-selector__actions">
              <button
                className="button"
                disabled={selectedOption === null}
                type="submit"
              >
                Review{' '}
                {selectedOption ? titleCase(selectedOption.affinity) : ''}{' '}
                choice
              </button>
              <p>Nothing is granted until you confirm the final choice.</p>
            </div>
          ) : null}
        </form>
      ) : null}

      {isConfirming && selectedOption ? (
        <section
          aria-labelledby="starter-confirmation-title"
          className="starter-confirmation"
        >
          <p className="eyebrow">Final confirmation</p>
          <h2
            id="starter-confirmation-title"
            ref={confirmationHeadingRef}
            tabIndex={-1}
          >
            Confirm {titleCase(selectedOption.affinity)} —{' '}
            {selectedOption.title}
          </h2>
          <p>
            This one-time choice grants the server package of 3 Creature cards
            and 2 Power cards. You cannot switch starter affinities later.
          </p>

          {error ? (
            <StarterError
              error={error}
              onLoadCollection={onLoadCollection}
              onSignIn={onSignIn}
              reauthFailed={reauthFailed}
            />
          ) : null}

          <div className="starter-confirmation__actions">
            <button
              className="button button--quiet"
              disabled={isSubmitting}
              onClick={onCancelConfirmation}
              type="button"
            >
              Go back
            </button>
            <button
              className="button"
              disabled={isSubmitting}
              onClick={onConfirm}
              type="button"
            >
              {isSubmitting
                ? 'Claiming your starter…'
                : `Confirm ${titleCase(selectedOption.affinity)} starter`}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function StarterOptionChoice({
  isSelected,
  onSelect,
  option,
}: {
  isSelected: boolean;
  onSelect: (affinity: StarterAffinity) => void;
  option: StarterOption;
}) {
  const inputId = `starter-${option.affinity}`;

  return (
    <article className="starter-option">
      <input
        checked={isSelected}
        id={inputId}
        name="starter-affinity"
        onChange={() => onSelect(option.affinity)}
        type="radio"
        value={option.affinity}
      />
      <label htmlFor={inputId}>
        <span className="starter-option__title">
          <strong>{titleCase(option.affinity)}</strong>
          <span>{option.title}</span>
        </span>
        <span className="starter-option__description">
          {option.description}
        </span>
        <span className="starter-option__composition">
          {option.composition.creatureCount} Creature +{' '}
          {option.composition.powerCardCount} Power
        </span>
        <ul className="starter-option__highlights">
          {option.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </label>
      <details className="starter-package-details">
        <summary>View exact package</summary>
        <div className="starter-package-details__content">
          <section aria-labelledby={`${inputId}-creatures`}>
            <h3 id={`${inputId}-creatures`}>3 Creature cards</h3>
            <ul className="starter-package-details__cards">
              {option.creatures.map((creature) => (
                <li key={creature.name}>
                  <p className="starter-package-details__card-heading">
                    <strong>{creature.name}</strong>
                    <span>
                      {creature.hp} HP · {creature.power} Power
                    </span>
                  </p>
                  <ol aria-label={`${creature.name} moves`}>
                    {creature.moves.map((move) => (
                      <li key={`${move.position}-${move.name}`}>
                        <strong>{move.name}</strong>{' '}
                        <span>
                          {titleCase(move.moveType)} ·{' '}
                          {describeStarterEffect(move)} · {move.powerCost} Power
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${inputId}-power-cards`}>
            <h3 id={`${inputId}-power-cards`}>2 Power cards</h3>
            <ul className="starter-package-details__cards">
              {option.powerCards.map((powerCard) => (
                <li key={powerCard.name}>
                  <p className="starter-package-details__card-heading">
                    <strong>{powerCard.name}</strong>
                  </p>
                  <ol aria-label={`${powerCard.name} effects`}>
                    {powerCard.effects.map((effect) => (
                      <li key={effect.position}>
                        {describeStarterEffect(effect)}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </article>
  );
}

function StarterOptionsError({
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
    <div className="starter-options-state" role="alert">
      <p className="eyebrow">Starter packages unavailable</p>
      <h2>
        {isAuthorization
          ? 'Your session has expired'
          : 'Your choices could not load'}
      </h2>
      <p>
        {isAuthorization
          ? 'Sign in again to securely load the current starter packages.'
          : 'Check your connection and try loading the starter choices again.'}
      </p>
      <button
        className="button"
        onClick={isAuthorization ? onSignIn : onRetry}
        type="button"
      >
        {isAuthorization ? 'Sign in again' : 'Try loading choices again'}
      </button>
      {reauthFailed ? <p>Sign-in could not start. Try again.</p> : null}
    </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] =
    useState<CollectionCategoryFilter>('all');
  const [rarityFilter, setRarityFilter] =
    useState<CollectionRarityFilter>('all');
  const [sortOrder, setSortOrder] = useState<CollectionSortOrder>('name');
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    string | null
  >(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const groups = useMemo(() => groupOwnedCards(cards), [cards]);
  const visibleGroups = useMemo(
    () =>
      filterAndSortCardGroups(groups, {
        category: categoryFilter,
        rarity: rarityFilter,
        searchQuery,
        sortOrder,
      }),
    [categoryFilter, groups, rarityFilter, searchQuery, sortOrder],
  );
  const selectedGroup =
    groups.find(
      (group) => group.card.cardDefinitionId === selectedDefinitionId,
    ) ?? null;
  const hasActiveControls =
    searchQuery !== '' ||
    categoryFilter !== 'all' ||
    rarityFilter !== 'all' ||
    sortOrder !== 'name';

  const closeDetails = useCallback(() => {
    setSelectedDefinitionId(null);
    window.setTimeout(() => detailTriggerRef.current?.focus(), 0);
  }, []);

  const clearControls = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setRarityFilter('all');
    setSortOrder('name');
  };

  return (
    <section
      aria-labelledby="collection-grid-title"
      className="collection-gallery"
    >
      <div className="collection-gallery__heading">
        <div>
          <p className="eyebrow">Visual index</p>
          <h2 id="collection-grid-title" ref={headingRef} tabIndex={-1}>
            Card gallery
          </h2>
        </div>
        <p className="collection-gallery__count">
          {groups.length} {groups.length === 1 ? 'design' : 'designs'} ·{' '}
          {cards.length} {cards.length === 1 ? 'copy' : 'copies'}
        </p>
      </div>

      <div
        aria-label="Filter and sort collection"
        className="collection-controls"
      >
        <label className="collection-control collection-control--search">
          <span>Search</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Name or affinity"
            type="search"
            value={searchQuery}
          />
        </label>
        <label className="collection-control">
          <span>Category</span>
          <select
            onChange={(event) =>
              setCategoryFilter(event.target.value as CollectionCategoryFilter)
            }
            value={categoryFilter}
          >
            <option value="all">All</option>
            <option value="creature">Creatures</option>
            <option value="power">Power cards</option>
          </select>
        </label>
        <label className="collection-control">
          <span>Rarity</span>
          <select
            onChange={(event) =>
              setRarityFilter(event.target.value as CollectionRarityFilter)
            }
            value={rarityFilter}
          >
            <option value="all">All</option>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
          </select>
        </label>
        <label className="collection-control">
          <span>Sort</span>
          <select
            onChange={(event) =>
              setSortOrder(event.target.value as CollectionSortOrder)
            }
            value={sortOrder}
          >
            <option value="name">A–Z</option>
            <option value="newest">Newest acquired</option>
            <option value="rarity">Rarity</option>
          </select>
        </label>
        {hasActiveControls ? (
          <button
            className="button button--quiet collection-controls__clear"
            onClick={clearControls}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="collection-gallery__results">
        Showing {visibleGroups.length} of {groups.length}{' '}
        {groups.length === 1 ? 'card design' : 'card designs'}
      </p>

      {visibleGroups.length === 0 ? (
        <div className="collection-gallery__empty">
          <h3>No cards match these filters</h3>
          <p>Adjust the search, category, or rarity to see more cards.</p>
          <button
            className="button button--quiet"
            onClick={clearControls}
            type="button"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul aria-label="Owned card designs" className="owned-card-gallery">
          {visibleGroups.map((group) => (
            <li key={group.card.cardDefinitionId}>
              <CardThumbnail
                accessibleLabel={`View ${group.card.name} details${group.copies.length > 1 ? `, ${group.copies.length} owned copies` : ''}`}
                badge={
                  group.copies.length > 1
                    ? `×${group.copies.length}`
                    : undefined
                }
                card={group.card}
                onClick={(event) => {
                  detailTriggerRef.current = event.currentTarget;
                  setSelectedDefinitionId(group.card.cardDefinitionId);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {selectedGroup ? (
        <CardDetailModal group={selectedGroup} onClose={closeDetails} />
      ) : null}
    </section>
  );
}

function CardDetailModal({
  group,
  onClose,
}: {
  group: OwnedCardGroup;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const applicationRoot = document.getElementById('root');
    const previousInert = applicationRoot?.inert ?? false;
    const previousOverflow = document.documentElement.style.overflow;
    const dialog = dialogRef.current;

    if (applicationRoot) applicationRoot.inert = true;
    document.documentElement.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>('[data-card-detail-focus]')?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (applicationRoot) applicationRoot.inert = previousInert;
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [group.card.cardDefinitionId, onClose]);

  return createPortal(
    <div
      className="card-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={`${group.card.name} card details`}
        aria-modal="true"
        className="card-detail-modal"
        ref={dialogRef}
        role="dialog"
      >
        <header className="card-detail-modal__header">
          <p className="eyebrow">Card details</p>
          <button
            aria-label="Close card details"
            className="card-detail-modal__close"
            data-card-detail-focus
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="card-detail-modal__scroll">
          <CollectibleCard
            card={group.card}
            headingLevel={2}
            ownedCopies={group.copies}
          />
        </div>
      </section>
    </div>,
    document.body,
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

type CollectionCategoryFilter = 'all' | OwnedCard['category'];
type CollectionRarityFilter = 'all' | OwnedCard['rarity'];
type CollectionSortOrder = 'name' | 'newest' | 'rarity';

interface OwnedCardGroup {
  card: OwnedCard;
  copies: OwnedCard[];
}

function groupOwnedCards(cards: readonly OwnedCard[]): OwnedCardGroup[] {
  const groups = new Map<string, OwnedCardGroup>();

  cards.forEach((card) => {
    const existing = groups.get(card.cardDefinitionId);
    if (existing) {
      existing.copies.push(card);
    } else {
      groups.set(card.cardDefinitionId, { card, copies: [card] });
    }
  });

  return Array.from(groups.values());
}

function filterAndSortCardGroups(
  groups: readonly OwnedCardGroup[],
  controls: {
    category: CollectionCategoryFilter;
    rarity: CollectionRarityFilter;
    searchQuery: string;
    sortOrder: CollectionSortOrder;
  },
): OwnedCardGroup[] {
  const query = controls.searchQuery.trim().toLocaleLowerCase();
  const rarityOrder: Record<OwnedCard['rarity'], number> = {
    common: 0,
    epic: 2,
    legendary: 3,
    rare: 1,
  };

  return groups
    .filter(({ card }) => {
      const matchesSearch =
        query === '' ||
        card.name.toLocaleLowerCase().includes(query) ||
        (card.affinity ?? 'typeless').toLocaleLowerCase().includes(query);
      const matchesCategory =
        controls.category === 'all' || card.category === controls.category;
      const matchesRarity =
        controls.rarity === 'all' || card.rarity === controls.rarity;
      return matchesSearch && matchesCategory && matchesRarity;
    })
    .sort((left, right) => {
      if (controls.sortOrder === 'newest') {
        return (
          newestAcquisition(right.copies) - newestAcquisition(left.copies) ||
          left.card.name.localeCompare(right.card.name)
        );
      }
      if (controls.sortOrder === 'rarity') {
        return (
          rarityOrder[right.card.rarity] - rarityOrder[left.card.rarity] ||
          left.card.name.localeCompare(right.card.name)
        );
      }
      return left.card.name.localeCompare(right.card.name);
    });
}

function newestAcquisition(copies: readonly OwnedCard[]) {
  return Math.max(...copies.map((copy) => Date.parse(copy.acquiredAt)));
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
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).replace('_', ' ')}`;
}
