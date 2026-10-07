import { SelectField } from '../components/fields/SelectField';
import { SearchField } from '../components/fields/SearchField';
import { StateIcon } from '../components/StatusMessage';
import {
  LoadingState,
  PageLoadingState,
  UpdatingIndicator,
} from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import { SlidersHorizontal, X } from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { useLocation } from 'wouter';

import {
  CardApiError,
  listOwnedCards,
  listStarterOptions,
  selectStarter,
  type CardEvolutionResult,
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
import { CardDetailModal } from '../components/cards/CardDetailModal';
import { useCollectionReads } from '../components/cards/CollectionReadProvider';
import { CollectionEvolutions } from '../components/cards/CollectionEvolutions';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import '../components/cards/evolutions.css';
import '../components/cards/cards.css';

interface CollectionPageProps {
  apiBaseUrl: string;
}

type CollectionState =
  | { status: 'loading' }
  | { error: CardApiError; status: 'error' }
  | {
      cards: OwnedCard[];
      status: 'ready';
      refreshing?: boolean;
      refreshError?: string;
    };

type StarterOptionsState =
  | { status: 'idle' | 'loading' }
  | { error: CardApiError; status: 'error' }
  | {
      options: StarterOption[];
      status: 'ready';
      refreshing?: boolean;
      refreshError?: string;
    };

export default function CollectionPage({ apiBaseUrl }: CollectionPageProps) {
  const getAccessToken = useApiAccessToken();
  const retainedReads = useCollectionReads();
  const { loginWithRedirect } = useAuth0();
  const [pathname] = useLocation();
  const [collection, setCollection] = useState<CollectionState>(() => {
    const cards = retainedReads?.readCards(apiBaseUrl);
    return cards
      ? { cards, status: 'ready', refreshing: true }
      : { status: 'loading' };
  });
  const [collectionRevision, setCollectionRevision] = useState(0);
  const section =
    pathname === '/collection/evolutions' ? 'evolutions' : 'cards';
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
  const collectionRefreshRequest = useRef<AbortController | null>(null);
  const starterSubmissionLocked = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement | null>(null);
  const collectionHeading = useRef<HTMLHeadingElement | null>(null);
  const shouldFocusCollection = useRef(false);

  useEffect(() => {
    collectionRefreshRequest.current?.abort();
    const controller = new AbortController();
    collectionRefreshRequest.current = controller;

    setCollection((current) =>
      current.status === 'ready'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );

    void listOwnedCards({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((cards) => {
        if (!controller.signal.aborted) {
          retainedReads?.rememberCards(apiBaseUrl, cards);
          setCollection({ cards, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          const failure = toCardApiError(error);
          if (failure.failure === 'authorization') retainedReads?.clearCards();
          setCollection((current) =>
            current.status === 'ready' && failure.failure !== 'authorization'
              ? {
                  ...current,
                  refreshing: false,
                  refreshError:
                    'Your cards could not be updated. Showing your previous collection.',
                }
              : { error: failure, status: 'error' },
          );
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, collectionRevision, getAccessToken, retainedReads]);

  const hasStarter =
    collection.status === 'ready' &&
    collection.cards.some((card) => card.acquisitionKind === 'starter');

  useEffect(() => {
    if (collection.status !== 'ready' || hasStarter) {
      setStarterOptions({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setStarterOptions((current) =>
      current.status === 'ready'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );

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
          const failure = toCardApiError(error);
          setStarterOptions((current) =>
            current.status === 'ready' && failure.failure !== 'authorization'
              ? {
                  ...current,
                  refreshing: false,
                  refreshError: 'Starter choices could not be updated.',
                }
              : { error: failure, status: 'error' },
          );
        }
      });

    return () => controller.abort();
  }, [
    apiBaseUrl,
    collection.status,
    getAccessToken,
    hasStarter,
    starterOptionsRevision,
  ]);

  useEffect(() => {
    return () => {
      starterRequest.current?.abort();
      collectionRefreshRequest.current?.abort();
    };
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
    if (
      shouldFocusCollection.current &&
      collection.status === 'ready' &&
      !collection.refreshing
    ) {
      shouldFocusCollection.current = false;
      collectionHeading.current?.focus();
    }
  }, [collection]);

  const retryCollection = useCallback(() => {
    setStarterError(null);
    setReauthFailed(false);
    setCollection((current) =>
      current.status === 'ready'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );
    setCollectionRevision((revision) => revision + 1);
  }, []);

  const loadCollectionAndFocus = useCallback(() => {
    shouldFocusCollection.current = true;
    retryCollection();
  }, [retryCollection]);

  const retryStarterOptions = useCallback(() => {
    setStarterError(null);
    setReauthFailed(false);
    setStarterOptions((current) =>
      current.status === 'ready'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );
    setStarterOptionsRevision((revision) => revision + 1);
  }, []);

  const applyEvolutionResult = useCallback(
    (result: CardEvolutionResult) => {
      retainedReads?.clearCards();
      const consumedIds = new Set(result.consumedOwnedCardIds);
      setCollection((current) =>
        current.status === 'ready'
          ? {
              cards: [
                result.newCard,
                ...current.cards.filter(
                  (card) =>
                    !consumedIds.has(card.ownedCardId) &&
                    card.ownedCardId !== result.newCard.ownedCardId,
                ),
              ],
              status: 'ready',
            }
          : current,
      );
    },
    [retainedReads],
  );

  const refreshCollection = useCallback(async () => {
    collectionRefreshRequest.current?.abort();
    const controller = new AbortController();
    collectionRefreshRequest.current = controller;

    try {
      const cards = await listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        retainedReads?.rememberCards(apiBaseUrl, cards);
        setCollection({ cards, status: 'ready' });
      }
    } finally {
      if (collectionRefreshRequest.current === controller) {
        collectionRefreshRequest.current = null;
      }
    }
  }, [apiBaseUrl, getAccessToken, retainedReads]);

  async function startSignIn() {
    setReauthFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/collection' } });
    } catch {
      setReauthFailed(true);
    }
  }

  async function confirmStarter() {
    if (
      starterSubmissionLocked.current ||
      selectedAffinity === null ||
      collection.status !== 'ready' ||
      collection.refreshing ||
      collection.refreshError ||
      starterOptions.status !== 'ready' ||
      starterOptions.refreshing ||
      starterOptions.refreshError
    ) {
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
        retainedReads?.clearCards();
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

  if (collection.status === 'loading') {
    return (
      <div className="collection-page">
        <CollectionSectionNavigation />
        <PageLoadingState
          onRetry={retryCollection}
          resetKey={collectionRevision}
          title={
            section === 'evolutions' ? 'Loading evolutions' : 'Loading cards'
          }
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
      choicesUnavailable={
        (collection.status === 'ready' &&
          Boolean(collection.refreshing || collection.refreshError)) ||
        (starterOptions.status === 'ready' &&
          Boolean(starterOptions.refreshing || starterOptions.refreshError))
      }
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
        <CollectionSectionNavigation />
        <UpdatingIndicator
          active={Boolean(collection.refreshing)}
          label="Updating cards"
          error={collection.refreshError}
          onRetry={retryCollection}
        />
        {renderStarterSelector(1)}
      </div>
    );
  }

  return (
    <div className="collection-page">
      <CollectionSectionNavigation />
      {collection.status === 'ready' ? (
        <UpdatingIndicator
          active={Boolean(collection.refreshing)}
          label="Updating cards"
          error={collection.refreshError}
          onRetry={retryCollection}
        />
      ) : null}
      {section !== 'evolutions' ||
      collection.status !== 'ready' ||
      cards.length === 0 ? (
        <header className="collection-page__header">
          <h1>{section === 'cards' ? 'Your cards' : 'Evolutions'}</h1>
          {section === 'evolutions' ? (
            <p className="lead">
              Combine three available copies into one evolved card.
            </p>
          ) : null}
          {collection.status === 'ready' && section === 'cards' ? (
            <p aria-live="polite" className="collection-summary">
              {cards.length} {cards.length === 1 ? 'copy' : 'copies'} ·{' '}
              {cardDefinitionCount}{' '}
              {cardDefinitionCount === 1 ? 'design' : 'designs'}
            </p>
          ) : null}
        </header>
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

      {collection.status === 'ready' &&
      cards.length > 0 &&
      section === 'evolutions' ? (
        <CollectionEvolutions
          apiBaseUrl={apiBaseUrl}
          cards={cards}
          getAccessToken={getAccessToken}
          collectionUpdating={Boolean(
            collection.refreshing || collection.refreshError,
          )}
          onApplyResult={applyEvolutionResult}
          onRefreshCollection={refreshCollection}
        />
      ) : null}

      {collection.status === 'ready' &&
      cards.length > 0 &&
      section === 'cards' ? (
        <CollectionGrid
          apiBaseUrl={apiBaseUrl}
          cards={cards}
          getAccessToken={getAccessToken}
          headingRef={collectionHeading}
          onApplyEvolutionResult={applyEvolutionResult}
          onRefreshCollection={refreshCollection}
        />
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
  choicesUnavailable: boolean;
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
  choicesUnavailable,
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
      <Heading id="starter-selector-title">
        Choose your starter affinity
      </Heading>
      <p className="starter-selector__intro">
        Choose five starter cards. Your affinity is a one-time choice.
      </p>
      <p className="starter-selector__progression">
        Earn Spirit, Mystic, and other cards through challenges later.
      </p>

      {optionsState.status === 'ready' ? (
        <UpdatingIndicator
          active={Boolean(optionsState.refreshing)}
          label="Updating starters"
          error={optionsState.refreshError}
          onRetry={onRetryOptions}
        />
      ) : null}
      {optionsState.status === 'idle' || optionsState.status === 'loading' ? (
        <LoadingState
          className="starter-options-state"
          label="Loading starters…"
        />
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
                disabled={selectedOption === null || choicesUnavailable}
                type="submit"
              >
                Review{' '}
                {selectedOption ? titleCase(selectedOption.affinity) : ''}{' '}
                choice
              </button>
            </div>
          ) : null}
        </form>
      ) : null}

      {isConfirming && selectedOption ? (
        <section
          aria-labelledby="starter-confirmation-title"
          className="starter-confirmation"
        >
          <h2
            id="starter-confirmation-title"
            ref={confirmationHeadingRef}
            tabIndex={-1}
          >
            Confirm {titleCase(selectedOption.affinity)} —{' '}
            {selectedOption.title}
          </h2>
          <p>
            You’ll receive 3 Creature cards and 2 Power cards. You cannot change
            your starter affinity later.
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
              disabled={isSubmitting || choicesUnavailable}
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
        <summary>View cards</summary>
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
    <div
      className="starter-options-state state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
      <h2>
        {isAuthorization
          ? 'Your session has expired'
          : 'Your choices could not load'}
      </h2>
      <p>
        {isAuthorization
          ? 'Sign in again to view starter choices.'
          : 'Check your connection and try again.'}
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
      <div
        className="starter-selector__error state-message state-message--error"
        role="alert"
      >
        <StateIcon tone="error" />
        <p>
          <strong>Your starter was already chosen.</strong> No new cards were
          added.
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
      <div
        className="starter-selector__error state-message state-message--error"
        role="alert"
      >
        <StateIcon tone="error" />
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
    <div
      className="starter-selector__error state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
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
      <h1 id="starter-result-title" ref={headingRef} tabIndex={-1}>
        Your {titleCase(grant.affinity)} starter set
      </h1>
      <p className="starter-result__composition">
        {grant.cards.length} cards · {creatureCount}{' '}
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
  apiBaseUrl,
  cards,
  getAccessToken,
  headingRef,
  onApplyEvolutionResult,
  onRefreshCollection,
}: {
  apiBaseUrl: string;
  cards: OwnedCard[];
  getAccessToken: ReturnType<typeof useApiAccessToken>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onApplyEvolutionResult: (result: CardEvolutionResult) => void;
  onRefreshCollection: () => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] =
    useState<CollectionCategoryFilter>('all');
  const [rarityFilter, setRarityFilter] =
    useState<CollectionRarityFilter>('all');
  const [sortOrder, setSortOrder] = useState<CollectionSortOrder>('name');
  const [selectedGroup, setSelectedGroup] = useState<OwnedCardGroup | null>(
    null,
  );
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
  const hasActiveFilters =
    searchQuery !== '' || categoryFilter !== 'all' || rarityFilter !== 'all';
  const hasActiveControls = hasActiveFilters || sortOrder !== 'name';
  const activeFilterCount =
    Number(categoryFilter !== 'all') +
    Number(rarityFilter !== 'all') +
    Number(sortOrder !== 'name');

  const closeDetails = useCallback(() => {
    setSelectedGroup(null);
    window.setTimeout(() => {
      const trigger = detailTriggerRef.current;
      (trigger?.isConnected ? trigger : headingRef.current)?.focus();
    }, 0);
  }, [headingRef]);

  useEffect(() => {
    setSelectedGroup((selected) => {
      if (!selected) return null;
      return (
        groups.find(
          (group) =>
            group.card.cardDefinitionId === selected.card.cardDefinitionId,
        ) ?? selected
      );
    });
  }, [groups]);

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
      <h2
        className="collection-gallery__accessible-heading"
        id="collection-grid-title"
        ref={headingRef}
        tabIndex={-1}
      >
        Card gallery
      </h2>

      <div className="collection-controls">
        <SearchField
          label="Search"
          hideLabel
          className="collection-control collection-control--search"
          onChange={(value) => setSearchQuery(value)}
          placeholder="Search cards"
          title="Search by name or affinity"
          value={searchQuery}
        />
        <button
          className="button button--quiet collection-controls__toggle"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="collection-filters"
          aria-label={`Filters & sort${activeFilterCount > 0 ? ' · Active' : ''}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={20} aria-hidden="true" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        <div
          id="collection-filters"
          className={`collection-controls__filters${filtersOpen ? ' collection-controls__filters--open' : ''}`}
        >
          <SelectField
            label="Category"
            className="collection-control"
            onChange={(value) =>
              setCategoryFilter(value as CollectionCategoryFilter)
            }
            value={categoryFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'creature', label: 'Creatures' },
              { value: 'power', label: 'Power cards' },
            ]}
          />
          <SelectField
            label="Rarity"
            className="collection-control"
            onChange={(value) =>
              setRarityFilter(value as CollectionRarityFilter)
            }
            value={rarityFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'common', label: 'Common' },
              { value: 'rare', label: 'Rare' },
              { value: 'epic', label: 'Epic' },
              { value: 'legendary', label: 'Legendary' },
            ]}
          />
          <SelectField
            label="Sort"
            className="collection-control"
            onChange={(value) => setSortOrder(value as CollectionSortOrder)}
            value={sortOrder}
            options={[
              { value: 'name', label: 'A–Z' },
              { value: 'newest', label: 'Newest acquired' },
              { value: 'rarity', label: 'Rarity' },
            ]}
          />
        </div>
      </div>

      <div
        className={`collection-gallery__status${hasActiveControls ? '' : ' sr-only'}`}
      >
        <p aria-live="polite" className="collection-gallery__results">
          {hasActiveFilters ? (
            <>
              {visibleGroups.length} of {groups.length}{' '}
              {groups.length === 1 ? 'design' : 'designs'}
              {categoryFilter !== 'all'
                ? ` · ${categoryFilter === 'power' ? 'Power cards' : 'Creatures'}`
                : ''}
              {rarityFilter !== 'all' ? ` · ${titleCase(rarityFilter)}` : ''}
            </>
          ) : null}
        </p>
        {hasActiveControls && visibleGroups.length > 0 ? (
          <button
            className="button button--quiet collection-controls__clear"
            onClick={clearControls}
            type="button"
          >
            <X size={16} aria-hidden="true" /> Clear
          </button>
        ) : null}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="collection-gallery__empty state-message state-message--empty">
          <StateIcon tone="empty" />
          <h3>No cards match these filters</h3>
          <p>Try another search or clear your filters.</p>
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
          {visibleGroups.map((group, index) => (
            <li key={group.card.cardDefinitionId}>
              <CardThumbnail
                accessibleLabel={`View ${group.card.name} details${group.copies.length > 1 ? `, ${group.copies.length} owned copies` : ''}`}
                badge={
                  group.copies.length > 1
                    ? `×${group.copies.length}`
                    : undefined
                }
                card={group.card}
                fetchPriority={index === 0 ? 'high' : undefined}
                loading={index < 2 ? 'eager' : 'lazy'}
                onClick={(event) => {
                  detailTriggerRef.current = event.currentTarget;
                  setSelectedGroup(group);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {selectedGroup ? (
        <CardDetailModal
          apiBaseUrl={apiBaseUrl}
          getAccessToken={getAccessToken}
          group={selectedGroup}
          onApplyEvolutionResult={onApplyEvolutionResult}
          onClose={closeDetails}
          onRefreshCollection={onRefreshCollection}
        />
      ) : null}
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
    <section
      className="collection-state state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
      <h2>
        {isAuthorization
          ? 'Your session has expired'
          : 'Your cards could not load'}
      </h2>
      <p>
        {isAuthorization
          ? 'Sign in again to view your cards.'
          : 'Check your connection and try again.'}
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
