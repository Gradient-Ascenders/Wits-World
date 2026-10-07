import { SelectField } from '../components/fields/SelectField';
import { SearchField } from '../components/fields/SearchField';
import { StateIcon } from '../components/StatusMessage';
import { confirmAction } from '../components/AppToaster';
import { PageLoadingState } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Plus,
  Minus,
  PencilSimple,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  forwardRef,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';

import { listOwnedCards, type CardRarity, type OwnedCard } from '../api/cards';
import {
  createSavedDeck,
  DeckApiError,
  deleteSavedDeck,
  listSavedDecks,
  selectSavedDeck,
  updateSavedDeck,
  type SavedDeck,
  type SavedDeckCard,
} from '../api/decks';
import { MatchApiError, MatchModuleLoadError } from '../api/match-errors';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import { CardThumbnail } from '../components/cards/CollectibleCard';
import {
  CardPresentationDialog,
  type CardDialogPresentation,
} from '../components/cards/CardPresentationDialog';
import { useCardTilt } from '../components/cards/useCardTilt';
import { collectionArtworkSrcSets } from '../components/cards/collection-artwork-assets';
import '../components/cards/cards.css';
import './decks.css';
import { useDeckSaveBar } from './useDeckSaveBar';

interface DecksPageProps {
  apiBaseUrl: string;
  onStartMatch?: (deckId: string, signal: AbortSignal) => Promise<void> | void;
}

type DecksState =
  | { status: 'loading' }
  | { error: DeckApiError; status: 'error' }
  | { cards: OwnedCard[]; decks: SavedDeck[]; status: 'ready' };

interface DeckDraft {
  deckId?: string;
  mode: 'create' | 'edit';
  name: string;
  originalDeck?: SavedDeck;
  ownedCardIds: string[];
}

interface DraftSummary {
  creatureCount: number;
  isValid: boolean;
  issues: string[];
  powerCount: number;
  totalCards: number;
  totalPoints: number;
}

type PendingOperation = {
  deckId?: string;
  kind: 'delete' | 'save' | 'select' | 'start';
} | null;

// BASIC-07 and BASIC-08 are mirrored for immediate explanation only. The API
// remains authoritative and re-derives every value from owned-card metadata.
const basicDeckRules = {
  creatureCount: 3,
  deckSize: 5,
  pointCap: 10,
  powerCount: 2,
  rarityPoints: {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  } satisfies Readonly<Record<CardRarity, number>>,
} as const;

export default function DecksPage({
  apiBaseUrl,
  onStartMatch,
}: DecksPageProps) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [state, setState] = useState<DecksState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeckDraft | null>(null);
  const [inspectedCard, setInspectedCard] =
    useState<CardDialogPresentation | null>(null);
  const [pending, setPending] = useState<PendingOperation>(null);
  const [actionError, setActionError] = useState<DeckApiError | null>(null);
  const [matchError, setMatchError] = useState<MatchApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(
    null,
  );
  const [reauthFailed, setReauthFailed] = useState(false);
  const mutationRequest = useRef<AbortController | null>(null);
  const editorHeading = useRef<HTMLHeadingElement | null>(null);
  const actionAlert = useRef<HTMLDivElement | null>(null);
  const selectedDeckHeading = useRef<HTMLHeadingElement | null>(null);
  const deckListHeading = useRef<HTMLHeadingElement | null>(null);
  const deleteButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setState({ status: 'loading' });

    void Promise.all([
      listSavedDecks({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      }),
      listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      }),
    ])
      .then(([decks, cards]) => {
        if (!controller.signal.aborted) {
          setState({ cards, decks, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error: toDeckApiError(error), status: 'error' });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, revision]);

  useEffect(() => () => mutationRequest.current?.abort(), []);

  useEffect(() => {
    if (draft !== null) {
      editorHeading.current?.focus();
    }
  }, [draft?.deckId, draft?.mode]);

  useEffect(() => {
    if (actionError !== null || matchError !== null) {
      actionAlert.current?.focus();
    }
  }, [actionError, matchError]);

  const reload = useCallback(() => {
    setActionError(null);
    setMatchError(null);
    setReauthFailed(false);
    setState({ status: 'loading' });
    setRevision((value) => value + 1);
  }, []);

  async function startSignIn() {
    setReauthFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/collection/decks' } });
    } catch {
      setReauthFailed(true);
    }
  }

  function beginCreate() {
    if (pending !== null) {
      return;
    }

    setActionError(null);
    setMatchError(null);
    setDeleteConfirmation(null);
    setNotice(null);
    setReauthFailed(false);
    setDraft({ mode: 'create', name: '', ownedCardIds: [] });
  }

  function beginEdit(deck: SavedDeck) {
    if (pending !== null) {
      return;
    }

    setActionError(null);
    setMatchError(null);
    setDeleteConfirmation(null);
    setNotice(null);
    setReauthFailed(false);
    setDraft({
      deckId: deck.deckId,
      mode: 'edit',
      name: deck.name,
      originalDeck: deck,
      ownedCardIds: deck.cards.map((card) => card.ownedCardId),
    });
  }

  function cancelEdit() {
    setActionError(null);
    setDraft(null);
    queueMicrotask(() => deckListHeading.current?.focus());
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draft === null || state.status !== 'ready' || pending !== null) {
      return;
    }

    const summary = summarizeDraft(draft, state.cards);

    if (draft.name.trim() === '' || !summary.isValid) {
      setActionError(
        new DeckApiError('validation', {
          detail: 'Fix the highlighted deck details before saving.',
        }),
      );
      return;
    }

    const controller = new AbortController();
    mutationRequest.current = controller;
    setActionError(null);
    setNotice(null);
    setReauthFailed(false);
    setPending({ deckId: draft.deckId, kind: 'save' });

    try {
      const input = {
        deck: {
          name: draft.name,
          ownedCardIds: draft.ownedCardIds,
        },
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      };
      const saved =
        draft.mode === 'create'
          ? await createSavedDeck(input)
          : await updateSavedDeck({ ...input, deckId: draft.deckId! });

      if (!controller.signal.aborted) {
        setSelectedDeckId(saved.deckId);
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                decks: replaceSavedDeck(current.decks, saved),
              }
            : current,
        );
        setDraft((current) => (current === draft ? null : current));
        confirmAction(
          draft.mode === 'create'
            ? `${saved.name} was created.`
            : `${saved.name} was saved.`,
        );
        queueMicrotask(() => deckListHeading.current?.focus());
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await handleMutationError(error, draft.deckId);
      }
    } finally {
      finishMutation(controller);
    }
  }

  async function activateDeck(deck: SavedDeck) {
    if (pending !== null || deck.isSelected) {
      return;
    }

    const controller = new AbortController();
    mutationRequest.current = controller;
    setActionError(null);
    setMatchError(null);
    setNotice(null);
    setReauthFailed(false);
    setPending({ deckId: deck.deckId, kind: 'select' });

    try {
      const selected = await selectSavedDeck({
        apiBaseUrl,
        deckId: deck.deckId,
        getAccessToken,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setSelectedDeckId(selected.deckId);
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                decks: current.decks.map((item) =>
                  item.deckId === selected.deckId
                    ? selected
                    : { ...item, isSelected: false },
                ),
              }
            : current,
        );
        confirmAction(`${selected.name} is now your active deck.`);
        queueMicrotask(() => selectedDeckHeading.current?.focus());
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await handleMutationError(error, deck.deckId);
      }
    } finally {
      finishMutation(controller);
    }
  }

  async function confirmDelete(deck: SavedDeck) {
    if (pending !== null) {
      return;
    }

    const controller = new AbortController();
    mutationRequest.current = controller;
    setActionError(null);
    setMatchError(null);
    setNotice(null);
    setReauthFailed(false);
    setPending({ deckId: deck.deckId, kind: 'delete' });

    try {
      await deleteSavedDeck({
        apiBaseUrl,
        deckId: deck.deckId,
        getAccessToken,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                decks: current.decks.filter(
                  (item) => item.deckId !== deck.deckId,
                ),
              }
            : current,
        );
        setDraft((current) =>
          current?.deckId === deck.deckId ? null : current,
        );
        setDeleteConfirmation(null);
        confirmAction(
          `${deck.name} was deleted. Your owned cards were not removed.`,
        );
        queueMicrotask(() => deckListHeading.current?.focus());
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await handleMutationError(error, deck.deckId);
      }
    } finally {
      finishMutation(controller);
    }
  }

  async function startMatch(deck: SavedDeck) {
    if (pending !== null || mutationRequest.current !== null || !onStartMatch) {
      return;
    }

    const controller = new AbortController();
    mutationRequest.current = controller;
    setActionError(null);
    setMatchError(null);
    setNotice(null);
    setReauthFailed(false);
    setPending({ deckId: deck.deckId, kind: 'start' });

    try {
      await onStartMatch(deck.deckId, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMatchError(toMatchApiError(error));
      }
    } finally {
      finishMutation(controller);
    }
  }

  async function handleMutationError(error: unknown, staleDeckId?: string) {
    const deckError = toDeckApiError(error);

    if (deckError.failure === 'not-found') {
      setDraft((current) => (current?.deckId === staleDeckId ? null : current));
      setDeleteConfirmation(null);
      setNotice(
        'That deck changed or was deleted elsewhere. Saved decks are being refreshed.',
      );
      setRevision((value) => value + 1);
    }

    setActionError(deckError);
  }

  function finishMutation(controller: AbortController) {
    if (mutationRequest.current === controller) {
      mutationRequest.current = null;
      if (!controller.signal.aborted) {
        setPending(null);
      }
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="decks-page">
        <CollectionSectionNavigation />
        <PageLoadingState
          title="Loading your decks and collection"
          description="Loading your saved decks and cards…"
          onRetry={reload}
          resetKey={revision}
        />
      </div>
    );
  }

  if (state.status === 'error') {
    const isAuthorization = state.error.failure === 'authorization';

    return (
      <div className="decks-page">
        <CollectionSectionNavigation />
        <PageHeader />
        <section
          className="deck-state state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <p className="eyebrow">Decks unavailable</p>
          <h2>
            {isAuthorization
              ? 'Your session has expired'
              : 'Saved decks could not load'}
          </h2>
          <p>
            {isAuthorization
              ? 'Sign in again to securely load your saved decks and owned cards.'
              : 'Check your connection, then try loading your saved decks and cards again.'}
          </p>
          <button
            className="button"
            onClick={isAuthorization ? startSignIn : reload}
            type="button"
          >
            {isAuthorization ? 'Sign in again' : 'Try loading again'}
          </button>
          {reauthFailed ? <p>Sign-in could not start. Try again.</p> : null}
        </section>
      </div>
    );
  }

  const activeDeck = state.decks.find((deck) => deck.isSelected) ?? null;
  const selectedDeck =
    state.decks.find((deck) => deck.deckId === selectedDeckId) ??
    activeDeck ??
    state.decks[0] ??
    null;
  const isMutationPending = pending !== null;

  function showDeckDetails(deck: SavedDeck) {
    if (pending !== null) {
      return;
    }

    setSelectedDeckId(deck.deckId);
    setDeleteConfirmation(null);
    setActionError(null);
    setMatchError(null);
    queueMicrotask(() => selectedDeckHeading.current?.focus());
  }

  return (
    <div className={`decks-page${draft ? ' decks-page--editing' : ''}`}>
      <CollectionSectionNavigation />
      {draft === null ? (
        <PageHeader onCreate={beginCreate} disabled={isMutationPending} />
      ) : null}

      {notice ? (
        <p aria-live="polite" className="deck-notice" role="status">
          {notice}
        </p>
      ) : null}

      {actionError ? (
        <DeckActionError
          error={actionError}
          onSignIn={startSignIn}
          reauthFailed={reauthFailed}
          ref={actionAlert}
        />
      ) : null}

      {matchError ? (
        <MatchStartError
          error={matchError}
          onRetry={activeDeck ? () => void startMatch(activeDeck) : undefined}
          onSignIn={startSignIn}
          reauthFailed={reauthFailed}
          ref={actionAlert}
        />
      ) : null}

      <section
        aria-labelledby="saved-decks-title"
        className="saved-decks"
        hidden={draft !== null}
      >
        {state.decks.length === 0 ? (
          <div className="deck-empty state-message state-message--empty">
            <StateIcon tone="empty" />
            <h2 id="saved-decks-title" ref={deckListHeading} tabIndex={-1}>
              No saved decks yet
            </h2>
            <p>Build a deck with cards from your collection.</p>
          </div>
        ) : (
          <div className="deck-workspace">
            {selectedDeck ? (
              <SavedDeckDetail
                deck={selectedDeck}
                collection={state.cards}
                onInspect={setInspectedCard}
                deleteButtonRef={
                  deleteConfirmation === selectedDeck.deckId
                    ? deleteButton
                    : undefined
                }
                headingRef={selectedDeckHeading}
                isConfirmingDelete={deleteConfirmation === selectedDeck.deckId}
                isMutationPending={isMutationPending}
                onCancelDelete={() => setDeleteConfirmation(null)}
                onConfirmDelete={() => void confirmDelete(selectedDeck)}
                onDelete={() => {
                  setDeleteConfirmation(selectedDeck.deckId);
                  setActionError(null);
                  queueMicrotask(() => deleteButton.current?.focus());
                }}
                onEdit={() => beginEdit(selectedDeck)}
                onSelect={() => void activateDeck(selectedDeck)}
                onStartMatch={
                  onStartMatch && selectedDeck.isSelected
                    ? () => void startMatch(selectedDeck)
                    : undefined
                }
                pendingKind={
                  pending?.deckId === selectedDeck.deckId
                    ? pending.kind
                    : undefined
                }
              />
            ) : null}
            <div className="deck-master">
              <div className="section-heading">
                <div>
                  <h2
                    id="saved-decks-title"
                    ref={deckListHeading}
                    tabIndex={-1}
                  >
                    Saved decks
                  </h2>
                </div>
              </div>

              <p className="deck-master__summary">
                {state.decks.length}{' '}
                {state.decks.length === 1 ? 'saved deck' : 'saved decks'}
                <span aria-hidden="true"> · </span>
                {activeDeck ? `${activeDeck.name} active` : 'No active deck'}
              </p>
              <ul aria-label="Saved decks" className="saved-deck-list">
                {state.decks.map((deck) => (
                  <li key={deck.deckId}>
                    <DeckSummaryButton
                      deck={deck}
                      collection={state.cards}
                      disabled={isMutationPending}
                      isCurrent={selectedDeck?.deckId === deck.deckId}
                      onSelect={() => showDeckDetails(deck)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {draft ? (
        <DeckEditor
          cards={state.cards}
          draft={draft}
          headingRef={editorHeading}
          isMutationPending={isMutationPending}
          isSaving={pending?.kind === 'save'}
          hasSaveError={actionError !== null}
          onCancel={cancelEdit}
          onChange={setDraft}
          onSubmit={submitDraft}
          onInspect={setInspectedCard}
        />
      ) : null}
      <RulesPanel />
      {inspectedCard ? (
        <CardPresentationDialog
          card={inspectedCard}
          onClose={() => setInspectedCard(null)}
        />
      ) : null}
    </div>
  );
}

function PageHeader({
  onCreate,
  disabled = false,
}: {
  onCreate?: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="decks-page__header">
      <div>
        <h1>Your decks</h1>
      </div>
      {onCreate ? (
        <button
          className="button"
          aria-label="Create a deck"
          disabled={disabled}
          onClick={onCreate}
          type="button"
        >
          <Plus size={20} aria-hidden="true" /> New deck
        </button>
      ) : null}
    </header>
  );
}

function RulesPanel() {
  return (
    <details className="deck-rules">
      <summary>
        <span>Deck rules</span>
        <CaretDown size={20} aria-hidden="true" />
      </summary>
      <div>
        <ul>
          <li>
            {basicDeckRules.deckSize} cards: {basicDeckRules.creatureCount}{' '}
            Creature cards and {basicDeckRules.powerCount} Power cards.
          </li>
          <li>{basicDeckRules.pointCap} rarity points or fewer.</li>
          <li>
            Common costs {basicDeckRules.rarityPoints.common}, Rare{' '}
            {basicDeckRules.rarityPoints.rare}, Epic{' '}
            {basicDeckRules.rarityPoints.epic}, and Legendary{' '}
            {basicDeckRules.rarityPoints.legendary} points.
          </li>
          <li>Each duplicate uses another copy you own.</li>
        </ul>
        <p>Cards can be used in more than one deck.</p>
      </div>
    </details>
  );
}

export function SelectedDeckHandoff({
  deck,
  headingRef,
  isStarting = false,
  onStartMatch,
}: {
  deck: SavedDeck | null;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  isStarting?: boolean;
  onStartMatch?: (deckId: string) => void;
}) {
  return (
    <section
      aria-labelledby="active-deck-title"
      className={`active-deck${deck ? ' active-deck--ready' : ''}`}
    >
      <div>
        <h2 id="active-deck-title" ref={headingRef} tabIndex={-1}>
          {deck ? `${deck.name} is active` : 'Choose an active deck'}
        </h2>
        <p>
          {deck
            ? 'Ready for a CPU match.'
            : 'Make a deck active to start a CPU match.'}
        </p>
      </div>
      {deck && onStartMatch ? (
        <button
          className="button"
          disabled={isStarting}
          onClick={() => onStartMatch(deck.deckId)}
          type="button"
        >
          {isStarting ? 'Starting CPU match…' : 'Start CPU match'}
        </button>
      ) : null}
    </section>
  );
}

function DeckSummaryButton({
  deck,
  collection,
  disabled,
  isCurrent,
  onSelect,
}: {
  deck: SavedDeck;
  collection: OwnedCard[];
  disabled: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const summary = summarizeSavedDeck(deck);

  return (
    <button
      aria-controls="selected-deck-detail"
      aria-current={isCurrent ? 'true' : undefined}
      aria-label={`View details for ${deck.name}${deck.isSelected ? ', active deck' : ''}`}
      className={`deck-summary-button${isCurrent ? ' deck-summary-button--current' : ''}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className="deck-summary-button__art" aria-hidden="true">
        {deck.cards.map((card) => (
          <DeckArtwork
            card={card}
            collection={collection}
            compact
            key={card.ownedCardId}
          />
        ))}
      </span>
      <span className="deck-summary-button__heading">
        <span className="deck-summary-button__title">{deck.name}</span>
        {deck.isSelected ? (
          <span className="deck-active-badge">Active</span>
        ) : null}
      </span>
      <span className="deck-summary-button__affinity">
        {summary.affinities} · {deck.totalPoints}/{basicDeckRules.pointCap}{' '}
        points
      </span>
      <span aria-hidden="true" className="deck-summary-button__chevron">
        <CaretRight size={20} />
      </span>
    </button>
  );
}

function DeckArtwork({
  card,
  collection,
  compact = false,
  onInspect,
}: {
  card: SavedDeckCard;
  collection: OwnedCard[];
  compact?: boolean;
  onInspect?: (card: CardDialogPresentation) => void;
}) {
  const owned = collection.find(
    (copy) => copy.ownedCardId === card.ownedCardId,
  );
  const presentation = {
    name: card.name,
    rarity: card.rarity,
    imageUrl: owned?.imageUrl ?? null,
    imageAlt: owned?.imageAlt ?? null,
  };
  return compact ? (
    <DeckCopyPreview card={presentation} />
  ) : (
    <CardThumbnail
      accessibleLabel={`View ${card.name} details`}
      card={{ ...presentation, ...(owned ? { isActive: owned.isActive } : {}) }}
      loading="lazy"
      nameplate={null}
      onClick={() => onInspect?.(owned ?? { ...card, ...presentation })}
    />
  );
}

/** Small lineup previews use existing artwork; full cards retain the shared frame. */
function DeckCopyPreview({
  card,
}: {
  card: Pick<OwnedCard, 'name' | 'imageUrl' | 'imageAlt'>;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedResponsiveUrl, setFailedResponsiveUrl] = useState<string | null>(
    null,
  );
  const srcSet =
    card.imageUrl !== failedResponsiveUrl
      ? collectionArtworkSrcSets[card.imageUrl ?? '']
      : undefined;
  return (
    <span className="deck-copy-preview">
      {card.imageUrl && card.imageUrl !== failedUrl ? (
        <img
          alt={card.imageAlt ?? `${card.name} card artwork`}
          src={card.imageUrl}
          srcSet={srcSet}
          sizes="4rem"
          loading="lazy"
          onError={() =>
            srcSet
              ? setFailedResponsiveUrl(card.imageUrl)
              : setFailedUrl(card.imageUrl)
          }
        />
      ) : (
        <span role="img" aria-label={`${card.name} artwork unavailable`}>
          {card.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function DeckDraftPreviewButton({
  card,
  onInspect,
}: {
  card: OwnedCard;
  onInspect: (card: CardDialogPresentation) => void;
}) {
  const tilt = useCardTilt<HTMLButtonElement>();
  return (
    <button
      {...tilt}
      aria-label={`View ${card.name} details`}
      className="card-thumbnail__button deck-draft-preview"
      onClick={() => onInspect(card)}
      type="button"
    >
      <DeckCopyPreview card={card} />
    </button>
  );
}

function DeckGalleryPages({
  currentPage,
  totalPages,
  onChange,
  label,
  compact = false,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      className={`deck-gallery-pages${compact ? ' deck-gallery-pages--compact' : ''}`}
    >
      <button
        aria-label="Previous card page"
        aria-controls="deck-picker-cards"
        className="button button--quiet"
        disabled={currentPage === 1}
        onClick={() => onChange(currentPage - 1)}
        type="button"
      >
        {compact ? <CaretLeft size={18} aria-hidden="true" /> : 'Previous'}
      </button>
      {!compact ? (
        <span>
          Page {currentPage} of {totalPages}
        </span>
      ) : null}
      <button
        aria-label="Next card page"
        aria-controls="deck-picker-cards"
        className="button button--quiet"
        disabled={currentPage === totalPages}
        onClick={() => onChange(currentPage + 1)}
        type="button"
      >
        {compact ? <CaretRight size={18} aria-hidden="true" /> : 'Next'}
      </button>
    </nav>
  );
}

function SavedDeckDetail({
  deck,
  collection,
  onInspect,
  deleteButtonRef,
  headingRef,
  isConfirmingDelete,
  isMutationPending,
  onCancelDelete,
  onConfirmDelete,
  onDelete,
  onEdit,
  onSelect,
  onStartMatch,
  pendingKind,
}: {
  deck: SavedDeck;
  collection: OwnedCard[];
  onInspect: (card: CardDialogPresentation) => void;
  deleteButtonRef?: RefObject<HTMLButtonElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  isConfirmingDelete: boolean;
  isMutationPending: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onStartMatch?: () => void;
  pendingKind?: 'delete' | 'save' | 'select' | 'start';
}) {
  const deleteControl = useRef<HTMLButtonElement | null>(null);
  const restoreDeleteFocusAfterCancel = useRef(false);
  const summary = summarizeSavedDeck(deck);

  useEffect(() => {
    if (!isConfirmingDelete && restoreDeleteFocusAfterCancel.current) {
      restoreDeleteFocusAfterCancel.current = false;
      deleteControl.current?.focus();
    }
  }, [isConfirmingDelete]);

  function cancelDelete() {
    restoreDeleteFocusAfterCancel.current = true;
    onCancelDelete();
  }

  return (
    <article
      aria-labelledby="selected-deck-title"
      className={`saved-deck-detail${deck.isSelected ? ' saved-deck-detail--active' : ''}`}
      id="selected-deck-detail"
    >
      <div className="saved-deck-detail__heading">
        <div>
          <h3 id="selected-deck-title" ref={headingRef} tabIndex={-1}>
            {deck.name}
          </h3>
        </div>
        {deck.isSelected ? (
          <span className="deck-active-badge">Active</span>
        ) : (
          <span className="deck-view-badge">Not active</span>
        )}
      </div>

      {isConfirmingDelete ? (
        <div
          aria-label={`Delete ${deck.name}`}
          className="delete-confirmation"
          role="group"
        >
          <p>
            Delete this deck? Your cards stay in your collection.
            {deck.isSelected ? ' You will have no active deck.' : ''}
          </p>
          <div>
            <button
              className="button button--danger"
              disabled={isMutationPending}
              onClick={onConfirmDelete}
              ref={deleteButtonRef}
              type="button"
            >
              {pendingKind === 'delete' ? 'Deleting…' : 'Delete deck'}
            </button>
            <button
              className="button button--quiet"
              disabled={isMutationPending}
              onClick={cancelDelete}
              type="button"
            >
              Keep deck
            </button>
          </div>
        </div>
      ) : (
        <div className="saved-deck-detail__actions">
          {deck.isSelected && onStartMatch ? (
            <button
              className="button"
              disabled={isMutationPending}
              onClick={onStartMatch}
              type="button"
            >
              {pendingKind === 'start'
                ? 'Starting CPU match…'
                : 'Start CPU match'}
            </button>
          ) : (
            <button
              className="button"
              disabled={deck.isSelected || isMutationPending}
              onClick={onSelect}
              type="button"
            >
              {deck.isSelected
                ? 'Active deck'
                : pendingKind === 'select'
                  ? 'Selecting…'
                  : 'Make active'}
            </button>
          )}
          <button
            className="button button--quiet"
            disabled={isMutationPending}
            onClick={onEdit}
            type="button"
          >
            <PencilSimple size={20} aria-hidden="true" /> Edit deck
          </button>
          <button
            className="button button--quiet"
            disabled={isMutationPending}
            onClick={onDelete}
            ref={deleteControl}
            type="button"
          >
            <Trash size={20} aria-hidden="true" /> Delete
          </button>
        </div>
      )}

      <dl
        aria-label={`${deck.name} composition`}
        className="deck-detail__stats"
      >
        <div>
          <dt>Rarity points</dt>
          <dd>
            {deck.totalPoints} / {basicDeckRules.pointCap}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Cards</dt>
          <dd>
            {summary.creatureCount} Creature · {summary.powerCount} Power
          </dd>
        </div>
      </dl>
      <div className="deck-detail__roster-heading">
        <h4>Cards</h4>
        <span>{summary.affinities}</span>
      </div>
      <ol aria-label={`${deck.name} cards`} className="deck-detail__cards">
        {deck.cards.map((card) => (
          <li key={card.ownedCardId}>
            <span className="deck-lineup__art">
              <DeckArtwork
                card={card}
                collection={collection}
                onInspect={onInspect}
              />
            </span>
            <span>
              <span className="deck-detail__card-heading">
                <span className="deck-detail__position" aria-hidden="true">
                  {card.position}.
                </span>
                <strong>{card.name}</strong>
              </span>
              <small>
                {card.affinity ? titleCase(card.affinity) : 'Typeless'} ·{' '}
                {titleCase(card.category)}
              </small>
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function DeckEditor({
  cards,
  draft,
  headingRef,
  isMutationPending,
  isSaving,
  hasSaveError,
  onCancel,
  onChange,
  onSubmit,
  onInspect,
}: {
  cards: OwnedCard[];
  draft: DeckDraft;
  headingRef: RefObject<HTMLHeadingElement | null>;
  isMutationPending: boolean;
  isSaving: boolean;
  hasSaveError: boolean;
  onCancel: () => void;
  onChange: (draft: DeckDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInspect: (card: CardDialogPresentation) => void;
}) {
  const summary = summarizeDraft(draft, cards);
  const [view, setView] = useState<'deck' | 'collection'>('collection');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [page, setPage] = useState(1);
  const resultsHeading = useRef<HTMLParagraphElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const cancelControl = useRef<HTMLButtonElement | null>(null);
  const keepEditingControl = useRef<HTMLButtonElement | null>(null);
  const saveBar = useRef<HTMLDivElement | null>(null);
  const fullSaveControl = useRef<HTMLButtonElement | null>(null);
  const { collapsed, expand } = useDeckSaveBar(
    saveBar,
    isSaving || hasSaveError || confirmDiscard,
  );
  const readiness = summary.isValid
    ? draft.name.trim() === ''
      ? 'Name needed'
      : 'Ready to save'
    : summary.totalCards < basicDeckRules.deckSize
      ? 'Incomplete'
      : 'Needs changes';
  useEffect(() => {
    if (confirmDiscard) keepEditingControl.current?.focus();
  }, [confirmDiscard]);
  const isDirty =
    draft.mode === 'create'
      ? draft.name !== '' || draft.ownedCardIds.length > 0
      : draft.name !== draft.originalDeck?.name ||
        draft.ownedCardIds.join(',') !==
          draft.originalDeck?.cards.map((card) => card.ownedCardId).join(',');
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);
  const groupedCards = useMemo(() => groupOwnedCards(cards), [cards]);
  const filteredCards = groupedCards.filter(
    ([card]) =>
      card &&
      card.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (category === 'all' || card.category === category) &&
      (rarity === 'all' || card.rarity === rarity),
  );
  const cardsByOwnedId = useMemo(
    () => new Map(cards.map((card) => [card.ownedCardId, card])),
    [cards],
  );
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageCards = filteredCards.slice(pageStart, pageStart + pageSize);

  function changePage(nextPage: number) {
    setPage(nextPage);
    queueMicrotask(() => resultsHeading.current?.focus());
  }

  function addCopy(group: OwnedCard[]) {
    const nextCopy = group.find(
      (card) => !draft.ownedCardIds.includes(card.ownedCardId),
    );

    if (nextCopy && draft.ownedCardIds.length < basicDeckRules.deckSize) {
      onChange({
        ...draft,
        ownedCardIds: [...draft.ownedCardIds, nextCopy.ownedCardId],
      });
    }
  }

  function removeDefinition(group: OwnedCard[]) {
    const groupIds = new Set(group.map((card) => card.ownedCardId));
    let matchingIndex = -1;

    for (let index = draft.ownedCardIds.length - 1; index >= 0; index -= 1) {
      if (groupIds.has(draft.ownedCardIds[index]!)) {
        matchingIndex = index;
        break;
      }
    }

    if (matchingIndex >= 0) {
      removeAt(matchingIndex);
    }
  }

  function removeAt(index: number) {
    onChange({
      ...draft,
      ownedCardIds: draft.ownedCardIds.filter(
        (_ownedCardId, currentIndex) => currentIndex !== index,
      ),
    });
  }

  return (
    <section aria-labelledby="deck-editor-title" className="deck-editor">
      <div className="section-heading">
        <div>
          <h1 id="deck-editor-title" ref={headingRef} tabIndex={-1}>
            {draft.mode === 'create'
              ? 'Build a deck'
              : `Edit ${draft.originalDeck?.name ?? 'deck'}`}
          </h1>
        </div>
      </div>

      <form noValidate onSubmit={onSubmit}>
        <label className="deck-name-field">
          <span>Deck name</span>
          <input
            aria-describedby={
              draft.name.trim() === '' ? 'deck-name-error' : undefined
            }
            aria-invalid={nameTouched && draft.name.trim() === ''}
            disabled={isMutationPending}
            maxLength={80}
            required
            onBlur={() => setNameTouched(true)}
            onChange={(event) =>
              onChange({ ...draft, name: event.currentTarget.value })
            }
            value={draft.name}
          />
        </label>
        {draft.name.trim() === '' ? (
          <p
            className={nameTouched ? 'field-error' : 'deck-name-help'}
            id="deck-name-error"
          >
            Enter a deck name.
          </p>
        ) : null}

        <div
          className="deck-editor__views"
          role="group"
          aria-label="Editor view"
        >
          <button
            type="button"
            aria-pressed={view === 'deck'}
            onClick={() => setView('deck')}
          >
            Your deck ({summary.totalCards}/{basicDeckRules.deckSize})
          </button>
          <button
            type="button"
            aria-pressed={view === 'collection'}
            onClick={() => setView('collection')}
          >
            <Plus size={20} aria-hidden="true" /> Add cards
          </button>
        </div>
        <div className={`deck-editor__layout deck-editor__layout--${view}`}>
          <div className="deck-editor__draft" id="deck-draft-panel">
            <DraftSummaryPanel summary={summary} />

            <section
              aria-labelledby="draft-cards-title"
              className="draft-cards"
            >
              <div className="draft-cards__heading">
                <h3 id="draft-cards-title" tabIndex={-1}>
                  Your lineup
                </h3>
                <span>
                  {draft.ownedCardIds.length} / {basicDeckRules.deckSize}
                </span>
              </div>
              {draft.ownedCardIds.length === 0 ? (
                <p className="draft-cards__empty">
                  Choose Add cards to build your deck.
                </p>
              ) : (
                <ol>
                  {draft.ownedCardIds.map((ownedCardId, index) => {
                    const card = cardsByOwnedId.get(ownedCardId);
                    const fallback = draft.originalDeck?.cards.find(
                      (item) => item.ownedCardId === ownedCardId,
                    );

                    return (
                      <li key={ownedCardId}>
                        {card ? (
                          <DeckDraftPreviewButton
                            card={card}
                            onInspect={onInspect}
                          />
                        ) : (
                          <span className="draft-card-art" aria-hidden="true">
                            <span className="draft-card-position">
                              {index + 1}
                            </span>
                          </span>
                        )}
                        <span>
                          <strong
                            className={
                              card || fallback ? 'draft-card__name' : undefined
                            }
                          >
                            {card?.name ??
                              fallback?.name ??
                              'Unavailable owned copy'}
                          </strong>
                          <small>
                            {card || fallback
                              ? `${titleCase((card ?? fallback)!.category)} · ${titleCase((card ?? fallback)!.rarity)}`
                              : 'This card is no longer available in your collection'}
                          </small>
                        </span>
                        <button
                          aria-label={`Remove ${card?.name ?? fallback?.name ?? `card ${index + 1}`} from draft`}
                          className="draft-cards__remove"
                          disabled={isMutationPending}
                          onClick={() => removeAt(index)}
                          type="button"
                        >
                          <Minus size={16} aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <section aria-labelledby="card-picker-title" className="card-picker">
            <div className="card-picker__heading">
              <h3 id="card-picker-title">Add cards</h3>
            </div>

            <div className="deck-filters">
              <SearchField
                label="Search cards"
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder="Card name"
              />
              <div className="deck-filters__choices">
                <SelectField
                  label="Type"
                  value={category}
                  onChange={(value) => {
                    setCategory(value);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All types' },
                    { value: 'creature', label: 'Creature' },
                    { value: 'power', label: 'Power' },
                  ]}
                />
                <SelectField
                  label="Rarity"
                  value={rarity}
                  onChange={(value) => {
                    setRarity(value);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All rarities' },
                    ...(['common', 'rare', 'epic', 'legendary'] as const).map(
                      (value) => ({ value, label: titleCase(value) }),
                    ),
                  ]}
                />
              </div>
            </div>

            {filteredCards.length > 0 ? (
              <div className="deck-gallery-navigation">
                <p
                  aria-live="polite"
                  className="deck-gallery-navigation__range"
                  ref={resultsHeading}
                  tabIndex={-1}
                >
                  {pageStart + 1}–
                  {Math.min(pageStart + pageSize, filteredCards.length)} of{' '}
                  {filteredCards.length} card designs
                </p>
                {totalPages > 1 ? (
                  <DeckGalleryPages
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onChange={changePage}
                    label="Card gallery pages"
                    compact
                  />
                ) : null}
              </div>
            ) : null}

            {groupedCards.length === 0 ? (
              <div className="deck-empty state-message state-message--empty">
                <StateIcon tone="empty" />
                <h4>Your collection is empty</h4>
                <p>Earn cards to build a deck.</p>
              </div>
            ) : filteredCards.length === 0 ? (
              <div className="deck-empty state-message state-message--empty">
                <StateIcon tone="empty" />
                <h4>No matching cards</h4>
                <p>Try another name or clear your filters.</p>
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCategory('all');
                    setRarity('all');
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul
                aria-label="Owned cards available for this deck"
                className="card-picker__list"
                id="deck-picker-cards"
              >
                {pageCards.map((group) => {
                  const card = group[0]!;
                  const used = group.filter((copy) =>
                    draft.ownedCardIds.includes(copy.ownedCardId),
                  ).length;
                  const remaining = group.length - used;
                  const isDeckFull =
                    draft.ownedCardIds.length >= basicDeckRules.deckSize;
                  const titleId = `deck-picker-${card.cardDefinitionId}-title`;

                  return (
                    <li key={card.cardDefinitionId}>
                      <article
                        aria-labelledby={titleId}
                        className={`deck-picker-card collectible-card--${card.rarity}`}
                      >
                        <CardThumbnail
                          accessibleLabel={`View ${card.name} details`}
                          card={card}
                          loading="lazy"
                          onClick={() => onInspect(card)}
                          nameplate={
                            <span id={titleId} role="heading" aria-level={4}>
                              {card.name}
                            </span>
                          }
                        />
                        <div className="deck-picker-card__body">
                          <p className="deck-picker-card__kind">
                            {titleCase(card.category)} ·{' '}
                            {card.affinity
                              ? titleCase(card.affinity)
                              : 'Typeless'}
                          </p>
                          <p className="deck-picker-card__quantity">
                            Owned {group.length} ·{' '}
                            {basicDeckRules.rarityPoints[card.rarity]}{' '}
                            {basicDeckRules.rarityPoints[card.rarity] === 1
                              ? 'point'
                              : 'points'}
                          </p>
                          <div
                            aria-label={`Choose copies of ${card.name}`}
                            className="deck-copy-stepper"
                            role="group"
                          >
                            <button
                              aria-label={`Remove a copy of ${card.name}`}
                              disabled={isMutationPending || used === 0}
                              onClick={() => removeDefinition(group)}
                              type="button"
                            >
                              <Minus size={16} aria-hidden="true" />
                              <span>Remove</span>
                            </button>
                            <output
                              aria-label={`${used} ${used === 1 ? 'copy' : 'copies'} of ${card.name} selected`}
                            >
                              {used}
                            </output>
                            <button
                              aria-label={`Add a copy of ${card.name}`}
                              disabled={
                                isMutationPending ||
                                remaining === 0 ||
                                isDeckFull
                              }
                              onClick={() => addCopy(group)}
                              type="button"
                            >
                              <Plus size={16} aria-hidden="true" />
                              <span>Add</span>
                            </button>
                          </div>
                          {remaining > 0 ? (
                            <p className="deck-picker-card__availability">
                              {isDeckFull
                                ? 'Deck is full'
                                : `${remaining} ${remaining === 1 ? 'copy' : 'copies'} available`}
                            </p>
                          ) : (
                            <p className="deck-picker-card__availability">
                              All copies added
                            </p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
            {totalPages > 1 ? (
              <DeckGalleryPages
                currentPage={currentPage}
                totalPages={totalPages}
                onChange={changePage}
                label="Card gallery pages below cards"
              />
            ) : null}
          </section>
        </div>
        <div
          className="deck-editor__actions"
          data-collapsed={collapsed}
          ref={saveBar}
        >
          <button
            aria-label="Review your deck"
            aria-describedby="draft-tray-composition"
            aria-controls="deck-draft-panel"
            className="deck-draft-tray"
            disabled={isMutationPending}
            onClick={() => {
              setView('deck');
              queueMicrotask(() => {
                const title = document.getElementById('draft-cards-title');
                title?.focus();
              });
            }}
            type="button"
          >
            <span className="deck-draft-tray__cards" aria-hidden="true">
              {Array.from({ length: basicDeckRules.deckSize }, (_, index) => {
                const card = cardsByOwnedId.get(
                  draft.ownedCardIds[index] ?? '',
                );
                return (
                  <span className="deck-draft-tray__slot" key={index}>
                    {card ? (
                      <DeckCopyPreview card={card} />
                    ) : (
                      <Plus size={16} />
                    )}
                  </span>
                );
              })}
            </span>
            <span
              className="deck-draft-tray__composition"
              id="draft-tray-composition"
              aria-live="polite"
            >
              <strong>
                Review deck <CaretRight size={16} aria-hidden="true" />
              </strong>
              <span>
                {summary.creatureCount}/{basicDeckRules.creatureCount} Creature
                · {summary.powerCount}/{basicDeckRules.powerCount} Power ·{' '}
                {summary.totalPoints}/{basicDeckRules.pointCap} points
              </span>
            </span>
          </button>
          <div
            className="deck-save-full"
            inert={collapsed}
            aria-hidden={collapsed}
          >
            <div className="deck-save-full__content">
              <div className="deck-save-summary" aria-live="polite">
                <strong>{readiness}</strong>
                <span>
                  {isSaving
                    ? 'Saving deck…'
                    : hasSaveError
                      ? 'Save failed'
                      : isDirty
                        ? 'Unsaved changes'
                        : draft.mode === 'create'
                          ? 'Not saved yet'
                          : 'No changes'}
                </span>
                <small>
                  {!summary.isValid
                    ? summary.issues[0]
                    : draft.name.trim() === ''
                      ? 'Enter a deck name.'
                      : ''}
                </small>
              </div>
              <button
                className="button"
                ref={fullSaveControl}
                disabled={
                  isMutationPending ||
                  !summary.isValid ||
                  draft.name.trim() === ''
                }
                type="submit"
              >
                {isSaving
                  ? 'Saving deck…'
                  : draft.mode === 'create'
                    ? 'Create deck'
                    : 'Save deck'}
              </button>
              <button
                className="button button--quiet"
                disabled={isMutationPending}
                onClick={() => (isDirty ? setConfirmDiscard(true) : onCancel())}
                ref={cancelControl}
                type="button"
              >
                Cancel
              </button>

              {confirmDiscard ? (
                <div
                  className="deck-discard"
                  role="group"
                  aria-label="Discard unsaved changes"
                >
                  <p>Discard your changes?</p>
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={isMutationPending}
                    onClick={onCancel}
                  >
                    Discard changes
                  </button>
                  <button
                    className="button button--quiet"
                    type="button"
                    disabled={isMutationPending}
                    ref={keepEditingControl}
                    onClick={() => {
                      setConfirmDiscard(false);
                      cancelControl.current?.focus();
                    }}
                  >
                    Keep editing
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div
            className="deck-save-compact"
            inert={!collapsed}
            aria-hidden={!collapsed}
          >
            <div className="deck-save-compact__content">
              <button
                className="deck-save-compact__status"
                type="button"
                aria-label="Expand deck save panel"
                aria-expanded={!collapsed}
                onClick={(event) => {
                  const keyboardActivation = event.detail === 0;
                  if (!keyboardActivation) event.currentTarget.blur();
                  expand();
                  if (keyboardActivation) {
                    requestAnimationFrame(() =>
                      (fullSaveControl.current?.disabled
                        ? cancelControl.current
                        : fullSaveControl.current
                      )?.focus({ preventScroll: true }),
                    );
                  }
                }}
              >
                <span>
                  {summary.totalCards} / {basicDeckRules.deckSize} · {readiness}
                </span>
                <span className="deck-save-compact__hint">
                  Details <CaretDown size={16} aria-hidden="true" />
                </span>
              </button>
              <button
                className="button"
                type="submit"
                disabled={
                  isMutationPending ||
                  !summary.isValid ||
                  draft.name.trim() === ''
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function DraftSummaryPanel({ summary }: { summary: DraftSummary }) {
  return (
    <section
      aria-labelledby="draft-summary-title"
      className={`draft-summary${summary.isValid ? ' draft-summary--valid' : ''}`}
    >
      <div className="draft-summary__heading">
        <h3 id="draft-summary-title">Deck status</h3>
        <span>
          {summary.isValid ? (
            <CheckCircle size={20} aria-hidden="true" />
          ) : (
            <WarningCircle size={20} aria-hidden="true" />
          )}
          {summary.isValid
            ? 'Complete lineup'
            : summary.totalCards < basicDeckRules.deckSize
              ? 'Incomplete'
              : 'Needs changes'}
        </span>
      </div>
      <dl>
        <div>
          <dt>Creature</dt>
          <dd>
            {summary.creatureCount} / {basicDeckRules.creatureCount}
          </dd>
        </div>
        <div>
          <dt>Power</dt>
          <dd>
            {summary.powerCount} / {basicDeckRules.powerCount}
          </dd>
        </div>
        <div>
          <dt>Rarity points</dt>
          <dd>
            {summary.totalPoints} / {basicDeckRules.pointCap}
          </dd>
        </div>
      </dl>
      <div aria-live="polite">
        {summary.issues.length > 0 ? (
          <ul>
            {summary.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

const DeckActionError = forwardRef<
  HTMLDivElement,
  {
    error: DeckApiError;
    onSignIn: () => Promise<void>;
    reauthFailed: boolean;
  }
>(function DeckActionError({ error, onSignIn, reauthFailed }, ref) {
  const messages: Readonly<Record<DeckApiError['failure'], string>> = {
    authorization:
      'Your session expired before the change was saved. Sign in again and reload your decks.',
    'cards-unavailable':
      'One or more chosen copies are no longer available. Reload your collection and choose only copies the server still reports as owned.',
    composition:
      'The server requires exactly three Creature cards and two Power cards.',
    'copy-duplicated':
      'The same owned copy was submitted twice. Remove it and choose another separately owned copy.',
    name: 'The server rejected the deck name. Enter a nonblank name and try again.',
    'not-found':
      'This saved deck is no longer available. It may have changed or been deleted in another session.',
    'point-cap': 'The server reports that this deck exceeds ten rarity points.',
    size: 'The server requires exactly five owned card copies.',
    unavailable:
      'The deck change could not be completed. Check your connection and try again.',
    validation:
      'Fix the deck name, composition, owned-copy availability, and rarity points before saving.',
  };

  return (
    <div
      className="deck-action-error state-message state-message--error"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <StateIcon tone="error" />
      <strong>Deck change not saved.</strong> {messages[error.failure]}
      {error.options.requestId ? (
        <small> Support reference: {error.options.requestId}</small>
      ) : null}
      {error.failure === 'authorization' ? (
        <>
          <button
            className="button"
            onClick={() => void onSignIn()}
            type="button"
          >
            Sign in again
          </button>
          {reauthFailed ? (
            <small>Sign-in could not start. Try again.</small>
          ) : null}
        </>
      ) : null}
    </div>
  );
});

const MatchStartError = forwardRef<
  HTMLDivElement,
  {
    error: MatchApiError;
    onRetry?: () => void;
    onSignIn: () => Promise<void>;
    reauthFailed: boolean;
  }
>(function MatchStartError({ error, onRetry, onSignIn, reauthFailed }, ref) {
  const moduleLoadFailed = error instanceof MatchModuleLoadError;
  const message = moduleLoadFailed
    ? 'The match code could not load. Check your connection, then reload this page to try again.'
    : error.failure === 'authorization'
      ? 'Your session expired before the match could be opened. Sign in again to reconcile your active match.'
      : error.failure === 'deck-invalid'
        ? 'The server no longer accepts this selected deck for a CPU match. Review and reselect it before trying again.'
        : 'The match could not be opened. Check your connection and try again; Wits World will reconcile an active match before creating anything.';

  return (
    <div
      className="deck-action-error state-message state-message--error"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <StateIcon tone="error" />
      <strong>CPU match not opened.</strong> {message}
      {error.options.requestId ? (
        <small> Support reference: {error.options.requestId}</small>
      ) : null}
      {moduleLoadFailed ? (
        <button
          className="button"
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload page
        </button>
      ) : error.failure === 'authorization' ? (
        <>
          <button
            className="button"
            onClick={() => void onSignIn()}
            type="button"
          >
            Sign in again
          </button>
          {reauthFailed ? (
            <small>Sign-in could not start. Try again.</small>
          ) : null}
        </>
      ) : onRetry ? (
        <button className="button" onClick={onRetry} type="button">
          Reconcile and try again
        </button>
      ) : null}
    </div>
  );
});

function summarizeDraft(draft: DeckDraft, cards: OwnedCard[]): DraftSummary {
  const cardsById = new Map(cards.map((card) => [card.ownedCardId, card]));
  const selectedCards = draft.ownedCardIds
    .map((ownedCardId) => cardsById.get(ownedCardId))
    .filter((card): card is OwnedCard => card !== undefined);
  const creatureCount = selectedCards.filter(
    (card) => card.category === 'creature',
  ).length;
  const powerCount = selectedCards.filter(
    (card) => card.category === 'power',
  ).length;
  const totalPoints = selectedCards.reduce(
    (total, card) => total + basicDeckRules.rarityPoints[card.rarity],
    0,
  );
  const issues: string[] = [];

  if (draft.ownedCardIds.length !== basicDeckRules.deckSize) {
    issues.push(`Choose ${basicDeckRules.deckSize} cards.`);
  }

  if (selectedCards.length !== draft.ownedCardIds.length) {
    issues.push('Remove cards no longer in your collection.');
  }

  if (creatureCount !== basicDeckRules.creatureCount) {
    issues.push(`Choose ${basicDeckRules.creatureCount} Creature cards.`);
  }

  if (powerCount !== basicDeckRules.powerCount) {
    issues.push(`Choose ${basicDeckRules.powerCount} Power cards.`);
  }

  if (totalPoints > basicDeckRules.pointCap) {
    issues.push(`Reduce rarity points to ${basicDeckRules.pointCap} or fewer.`);
  }

  if (new Set(draft.ownedCardIds).size !== draft.ownedCardIds.length) {
    issues.push('Each card needs its own copy.');
  }

  return {
    creatureCount,
    isValid: issues.length === 0,
    issues,
    powerCount,
    totalCards: draft.ownedCardIds.length,
    totalPoints,
  };
}

function groupOwnedCards(cards: OwnedCard[]) {
  const groups = new Map<string, OwnedCard[]>();

  cards.forEach((card) => {
    groups.set(card.cardDefinitionId, [
      ...(groups.get(card.cardDefinitionId) ?? []),
      card,
    ]);
  });

  return [...groups.values()];
}

function replaceSavedDeck(decks: SavedDeck[], saved: SavedDeck) {
  const exists = decks.some((deck) => deck.deckId === saved.deckId);
  const updated = exists
    ? decks.map((deck) => (deck.deckId === saved.deckId ? saved : deck))
    : [...decks, saved];

  return saved.isSelected
    ? updated.map((deck) =>
        deck.deckId === saved.deckId ? deck : { ...deck, isSelected: false },
      )
    : updated;
}

function toDeckApiError(error: unknown) {
  if (error instanceof DeckApiError) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'failure' in error &&
    error.failure === 'authorization'
  ) {
    return new DeckApiError('authorization');
  }

  return new DeckApiError('unavailable');
}

function toMatchApiError(error: unknown) {
  return error instanceof MatchApiError
    ? error
    : new MatchApiError('unavailable');
}

function summarizeSavedDeck(deck: SavedDeck) {
  const affinityCounts = new Map<string, number>();

  for (const card of deck.cards) {
    affinityCounts.set(
      card.affinity ?? 'typeless',
      (affinityCounts.get(card.affinity ?? 'typeless') ?? 0) + 1,
    );
  }

  return {
    affinities: Array.from(
      affinityCounts,
      ([affinity, count]) => `${titleCase(affinity)} ×${count}`,
    ).join(' · '),
    creatureCount: deck.cards.filter((card) => card.category === 'creature')
      .length,
    powerCount: deck.cards.filter((card) => card.category === 'power').length,
  };
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
