import { StateIcon } from '../components/StatusMessage';
import { confirmAction } from '../components/AppToaster';
import { Skeleton } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import {
  CaretDown,
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
} from '../api/decks';
import { MatchApiError } from '../api/matches';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CardArtwork } from '../components/cards/CollectibleCard';
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
      await loginWithRedirect({ appState: { returnTo: '/decks' } });
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
    if (pending !== null || !onStartMatch) {
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
        'That deck changed or was deleted elsewhere. Your saved decks are being refreshed.',
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
        <PageHeader />
        <section
          aria-live="polite"
          className="deck-state state-message state-loading"
          role="status"
        >
          <p className="eyebrow">Saved decks</p>
          <h2>Loading your decks and collection</h2>
          <p>Loading your saved decks and cards…</p>
          <Skeleton layout="cards" />
        </section>
      </div>
    );
  }

  if (state.status === 'error') {
    const isAuthorization = state.error.failure === 'authorization';

    return (
      <div className="decks-page">
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
              : 'Your saved decks could not load'}
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
      <PageHeader />

      <RulesPanel />

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
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved loadouts</p>
            <h2 id="saved-decks-title" ref={deckListHeading} tabIndex={-1}>
              Your saved decks
            </h2>
          </div>
          <button
            className="button"
            aria-label="Create a deck"
            disabled={isMutationPending}
            onClick={beginCreate}
            type="button"
          >
            <Plus size={20} aria-hidden="true" /> New deck
          </button>
        </div>

        {state.decks.length === 0 ? (
          <div className="deck-empty state-message state-message--empty">
            <StateIcon tone="empty" />
            <h3>No saved decks yet</h3>
            <p>
              Build your first deck from the card copies in your collection.
            </p>
          </div>
        ) : (
          <div className="deck-workspace">
            <div className="deck-master">
              <label className="deck-switcher">
                Viewing deck
                <select
                  value={selectedDeck?.deckId ?? ''}
                  disabled={isMutationPending}
                  onChange={(event) => {
                    const deck = state.decks.find(
                      (item) => item.deckId === event.target.value,
                    );
                    if (deck) showDeckDetails(deck);
                  }}
                >
                  {state.decks.map((deck) => (
                    <option key={deck.deckId} value={deck.deckId}>
                      {deck.name}
                      {deck.isSelected ? ' · Active for matches' : ''}
                    </option>
                  ))}
                </select>
              </label>
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
                      disabled={isMutationPending}
                      isCurrent={selectedDeck?.deckId === deck.deckId}
                      onSelect={() => showDeckDetails(deck)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            {selectedDeck ? (
              <SavedDeckDetail
                deck={selectedDeck}
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
        />
      ) : null}
    </div>
  );
}

function PageHeader() {
  return (
    <header className="decks-page__header">
      <p className="eyebrow">Deck management</p>
      <h1>Build your match deck</h1>
      <p className="lead">
        Choose your lineup, build a deck, and get ready for your next match.
      </p>
    </header>
  );
}

function RulesPanel() {
  return (
    <details className="deck-rules">
      <summary>
        <span>Basic deck rules</span>
        <small>
          {basicDeckRules.deckSize} cards · {basicDeckRules.creatureCount}{' '}
          Creature · {basicDeckRules.powerCount} Power ·{' '}
          {basicDeckRules.pointCap} points maximum
        </small>
        <CaretDown size={20} aria-hidden="true" />
      </summary>
      <div>
        <h2>A balanced deck from owned copies</h2>
        <ul>
          <li>
            Exactly {basicDeckRules.deckSize} cards:{' '}
            {basicDeckRules.creatureCount} Creature cards and{' '}
            {basicDeckRules.powerCount} Power cards.
          </li>
          <li>
            No more than {basicDeckRules.pointCap} rarity points in total.
          </li>
          <li>
            Common costs {basicDeckRules.rarityPoints.common}, Rare{' '}
            {basicDeckRules.rarityPoints.rare}, Epic{' '}
            {basicDeckRules.rarityPoints.epic}, and Legendary{' '}
            {basicDeckRules.rarityPoints.legendary} points.
          </li>
          <li>A duplicate needs another separately owned copy in this deck.</li>
        </ul>
        <p>
          These checks explain your draft. The server verifies ownership,
          composition, rarity points, and final validity when you save or
          select.
        </p>
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
        <p className="eyebrow">CPU match handoff</p>
        <h2 id="active-deck-title" ref={headingRef} tabIndex={-1}>
          {deck ? `${deck.name} is active` : 'Choose an active deck'}
        </h2>
        <p>
          {deck
            ? 'Ready for a CPU match. Match creation will use this selected server-validated deck and snapshot it.'
            : 'Select one saved deck before starting a CPU match.'}
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
  disabled,
  isCurrent,
  onSelect,
}: {
  deck: SavedDeck;
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
      <span className="deck-summary-button__heading">
        <span className="deck-summary-button__title">{deck.name}</span>
        {deck.isSelected ? (
          <span className="deck-active-badge">Active</span>
        ) : null}
      </span>
      <span className="deck-summary-button__meta">
        {deck.cards.length} cards
        <span aria-hidden="true"> · </span>
        {summary.creatureCount} Creature
        <span aria-hidden="true"> · </span>
        {summary.powerCount} Power
      </span>
      <span className="deck-summary-button__affinity">
        {summary.affinities}
      </span>
      <span aria-hidden="true" className="deck-summary-button__chevron">
        <CaretRight size={20} />
      </span>
    </button>
  );
}

function SavedDeckDetail({
  deck,
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
          <p className="eyebrow">
            {deck.isSelected ? 'Active deck' : 'Selected deck'}
          </p>
          <h3 id="selected-deck-title" ref={headingRef} tabIndex={-1}>
            {deck.name}
          </h3>
        </div>
        {deck.isSelected ? (
          <span className="deck-active-badge">Selected for matches</span>
        ) : null}
      </div>

      <dl
        aria-label={`${deck.name} composition`}
        className="deck-detail__stats"
      >
        <div>
          <dt>Cards</dt>
          <dd>
            {deck.cards.length} / {basicDeckRules.deckSize}
          </dd>
        </div>
        <div>
          <dt>Rarity points</dt>
          <dd>
            {deck.totalPoints} / {basicDeckRules.pointCap}
          </dd>
        </div>
        <div>
          <dt>Composition</dt>
          <dd>
            {summary.creatureCount} Creature · {summary.powerCount} Power
          </dd>
        </div>
      </dl>
      <p className="deck-saved-status">
        <CheckCircle size={20} aria-hidden="true" /> Saved deck · Validated when
        saved
      </p>

      <div className="deck-detail__roster-heading">
        <h4>Card roster</h4>
        <span>{summary.affinities}</span>
      </div>
      <ol aria-label={`${deck.name} cards`} className="deck-detail__cards">
        {deck.cards.map((card) => (
          <li key={card.ownedCardId}>
            <span className="deck-detail__position">{card.position}</span>
            <span>
              <strong>{card.name}</strong>
              <small>
                {card.affinity ? titleCase(card.affinity) : 'Typeless'} ·{' '}
                {titleCase(card.category)} · {titleCase(card.rarity)}
              </small>
            </span>
          </li>
        ))}
      </ol>

      {isConfirmingDelete ? (
        <div
          aria-label={`Delete ${deck.name}`}
          className="delete-confirmation"
          role="group"
        >
          <p>
            Delete this saved deck? Its card copies stay in your collection.
            {deck.isSelected ? ' It will no longer be your active deck.' : ''}
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
            <PencilSimple size={20} aria-hidden="true" /> Edit or rename
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
}) {
  const summary = summarizeDraft(draft, cards);
  const [view, setView] = useState<'deck' | 'collection'>('deck');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [rarity, setRarity] = useState('all');
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
          <p className="eyebrow">
            {draft.mode === 'create' ? 'New saved deck' : 'Edit saved deck'}
          </p>
          <h2 id="deck-editor-title" ref={headingRef} tabIndex={-1}>
            {draft.mode === 'create'
              ? 'Build a deck'
              : `Edit ${draft.originalDeck?.name ?? 'deck'}`}
          </h2>
        </div>
      </div>

      <form noValidate onSubmit={onSubmit}>
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
            <label className="deck-name-field">
              <span>Deck name</span>
              <input
                aria-describedby={
                  draft.name.trim() === '' ? 'deck-name-error' : undefined
                }
                aria-invalid={nameTouched && draft.name.trim() === ''}
                disabled={isMutationPending}
                maxLength={80}
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
                Enter a name for this saved deck.
              </p>
            ) : null}

            <DraftSummaryPanel summary={summary} />

            <section
              aria-labelledby="draft-cards-title"
              className="draft-cards"
            >
              <div className="draft-cards__heading">
                <h3 id="draft-cards-title">Selected copies</h3>
                <span>
                  {draft.ownedCardIds.length} / {basicDeckRules.deckSize}
                </span>
              </div>
              {draft.ownedCardIds.length === 0 ? (
                <p className="draft-cards__empty">
                  Your lineup starts here. Choose Add cards to browse your
                  collection.
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
                        <span className="draft-card-position">{index + 1}</span>
                        <span>
                          <strong>
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
              <p className="eyebrow">Owned collection</p>
              <h3 id="card-picker-title">Add to your lineup</h3>
              <p>
                Add or remove copies below. Cards can belong to more than one
                saved deck.
              </p>
            </div>

            <div className="deck-filters">
              <label>
                Search cards
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a card by name"
                />
              </label>
              <details>
                <summary>
                  Filter cards
                  {category !== 'all' || rarity !== 'all' ? ' · Applied' : ''}
                  <CaretDown size={16} aria-hidden="true" />
                </summary>
                <div>
                  <label>
                    Type
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      <option value="all">All types</option>
                      <option value="creature">Creature</option>
                      <option value="power">Power</option>
                    </select>
                  </label>
                  <label>
                    Rarity
                    <select
                      value={rarity}
                      onChange={(event) => setRarity(event.target.value)}
                    >
                      <option value="all">All rarities</option>
                      {(['common', 'rare', 'epic', 'legendary'] as const).map(
                        (value) => (
                          <option key={value} value={value}>
                            {titleCase(value)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
              </details>
            </div>

            {groupedCards.length === 0 ? (
              <div className="deck-empty state-message state-message--empty">
                <StateIcon tone="empty" />
                <h4>Your collection is empty</h4>
                <p>Claim or earn cards before building a saved deck.</p>
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
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul
                aria-label="Owned cards available for this deck"
                className="card-picker__list"
              >
                {filteredCards.map((group) => {
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
                        className={`deck-picker-card card-thumbnail collectible-card--${card.rarity}${used > 0 ? ' deck-picker-card--selected' : ''}${card.isActive ? '' : ' card-thumbnail--inactive'}`}
                      >
                        <CardArtwork
                          badge={used > 0 ? `×${used}` : undefined}
                          card={card}
                        />
                        <div className="deck-picker-card__body">
                          <p className="deck-picker-card__kind">
                            {titleCase(card.category)} ·{' '}
                            {card.affinity
                              ? titleCase(card.affinity)
                              : 'Typeless'}
                          </p>
                          <h4 className="card-thumbnail__title" id={titleId}>
                            {card.name}
                          </h4>
                          <p className="deck-picker-card__quantity">
                            Owned {group.length} · Selected {used}
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
                              All owned copies in deck
                            </p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <div
          className="deck-editor__actions"
          data-collapsed={collapsed}
          ref={saveBar}
        >
          <div
            className="deck-save-full"
            inert={collapsed}
            aria-hidden={collapsed}
          >
            <div className="deck-save-full__content">
              <div className="deck-save-summary" aria-live="polite">
                <strong>
                  {summary.totalCards} / {basicDeckRules.deckSize} cards ·{' '}
                  {readiness}
                </strong>
                <span>
                  {isSaving
                    ? 'Saving…'
                    : hasSaveError
                      ? 'Save failed · Unsaved changes'
                      : isDirty
                        ? 'Unsaved changes'
                        : draft.mode === 'create'
                          ? 'New deck · Not saved yet'
                          : 'No unsaved changes'}
                </span>
                <small>
                  {!summary.isValid
                    ? summary.issues[0]
                    : draft.name.trim() === ''
                      ? 'Give your deck a name in Your deck.'
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
                  ? 'Saving with the server…'
                  : draft.mode === 'create'
                    ? 'Create saved deck'
                    : 'Save deck changes'}
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
                  <p>
                    Discard your changes? Your saved deck will stay as it was.
                  </p>
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
            ? 'Ready to submit'
            : summary.totalCards < basicDeckRules.deckSize
              ? 'Incomplete deck'
              : 'Needs changes'}
        </span>
      </div>
      <dl>
        <div>
          <dt>Cards</dt>
          <dd>
            {summary.totalCards} / {basicDeckRules.deckSize}
          </dd>
        </div>
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
        ) : (
          <p>
            Ready to save. Ownership and deck rules are checked again when you
            save.
          </p>
        )}
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
  const message =
    error.failure === 'authorization'
      ? 'Your session expired before the match could be opened. Sign in again to reconcile your active match.'
      : error.failure === 'deck-invalid'
        ? 'The server no longer accepts this selected deck for a CPU match. Review and reselect it before trying again.'
        : 'The match could not be opened after a bounded active-match check. Check your connection and try again; Wits World will reconcile before creating anything.';

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
    issues.push(`Choose exactly ${basicDeckRules.deckSize} owned copies.`);
  }

  if (selectedCards.length !== draft.ownedCardIds.length) {
    issues.push('Remove any copy no longer returned by your collection.');
  }

  if (creatureCount !== basicDeckRules.creatureCount) {
    issues.push(
      `Choose exactly ${basicDeckRules.creatureCount} Creature cards.`,
    );
  }

  if (powerCount !== basicDeckRules.powerCount) {
    issues.push(`Choose exactly ${basicDeckRules.powerCount} Power cards.`);
  }

  if (totalPoints > basicDeckRules.pointCap) {
    issues.push(`Reduce rarity points to ${basicDeckRules.pointCap} or fewer.`);
  }

  if (new Set(draft.ownedCardIds).size !== draft.ownedCardIds.length) {
    issues.push('The same owned copy cannot be used twice.');
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
