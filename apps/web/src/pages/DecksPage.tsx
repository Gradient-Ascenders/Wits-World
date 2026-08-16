import { useAuth0 } from '@auth0/auth0-react';
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
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CollectibleCard } from '../components/cards/CollectibleCard';
import '../components/cards/cards.css';
import './decks.css';

interface DecksPageProps {
  apiBaseUrl: string;
  onStartMatch?: (deckId: string) => void;
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
  kind: 'delete' | 'save' | 'select';
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
  const [draft, setDraft] = useState<DeckDraft | null>(null);
  const [pending, setPending] = useState<PendingOperation>(null);
  const [actionError, setActionError] = useState<DeckApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(
    null,
  );
  const [reauthFailed, setReauthFailed] = useState(false);
  const mutationRequest = useRef<AbortController | null>(null);
  const editorHeading = useRef<HTMLHeadingElement | null>(null);
  const actionAlert = useRef<HTMLDivElement | null>(null);
  const activeDeckHeading = useRef<HTMLHeadingElement | null>(null);
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
    if (actionError !== null) {
      actionAlert.current?.focus();
    }
  }, [actionError]);

  const reload = useCallback(() => {
    setActionError(null);
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
    setActionError(null);
    setDeleteConfirmation(null);
    setNotice(null);
    setDraft({ mode: 'create', name: '', ownedCardIds: [] });
  }

  function beginEdit(deck: SavedDeck) {
    setActionError(null);
    setDeleteConfirmation(null);
    setNotice(null);
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
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                decks: replaceSavedDeck(current.decks, saved),
              }
            : current,
        );
        setDraft(null);
        setNotice(
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
    setNotice(null);
    setPending({ deckId: deck.deckId, kind: 'select' });

    try {
      const selected = await selectSavedDeck({
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
                decks: current.decks.map((item) =>
                  item.deckId === selected.deckId
                    ? selected
                    : { ...item, isSelected: false },
                ),
              }
            : current,
        );
        setNotice(`${selected.name} is now your active deck.`);
        queueMicrotask(() => activeDeckHeading.current?.focus());
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
    setNotice(null);
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
        if (draft?.deckId === deck.deckId) {
          setDraft(null);
        }
        setDeleteConfirmation(null);
        setNotice(
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
        <section aria-live="polite" className="deck-state" role="status">
          <p className="eyebrow">Saved decks</p>
          <h2>Loading your decks and collection</h2>
          <p>Checking your server-saved decks and owned card copies…</p>
        </section>
      </div>
    );
  }

  if (state.status === 'error') {
    const isAuthorization = state.error.failure === 'authorization';

    return (
      <div className="decks-page">
        <PageHeader />
        <section className="deck-state" role="alert">
          <p className="eyebrow">Decks unavailable</p>
          <h2>
            {isAuthorization
              ? 'Your session has expired'
              : 'Your saved decks could not load'}
          </h2>
          <p>
            {isAuthorization
              ? 'Sign in again to securely load your saved decks and owned cards.'
              : 'Check your connection, then reload the authoritative deck and collection state.'}
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

  return (
    <div className="decks-page">
      <PageHeader />

      <RulesPanel />

      {notice ? (
        <p aria-live="polite" className="deck-notice" role="status">
          {notice}
        </p>
      ) : null}

      {actionError ? (
        <DeckActionError error={actionError} ref={actionAlert} />
      ) : null}

      <SelectedDeckHandoff
        deck={activeDeck}
        headingRef={activeDeckHeading}
        onStartMatch={onStartMatch}
      />

      <section aria-labelledby="saved-decks-title" className="saved-decks">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved loadouts</p>
            <h2 id="saved-decks-title" ref={deckListHeading} tabIndex={-1}>
              Your saved decks
            </h2>
          </div>
          <button className="button" onClick={beginCreate} type="button">
            Create a deck
          </button>
        </div>

        {state.decks.length === 0 ? (
          <div className="deck-empty">
            <h3>No saved decks yet</h3>
            <p>
              Build your first deck from the card copies in your collection.
            </p>
          </div>
        ) : (
          <ul aria-label="Saved decks" className="saved-deck-list">
            {state.decks.map((deck) => (
              <li key={deck.deckId}>
                <SavedDeckCard
                  deck={deck}
                  deleteButtonRef={
                    deleteConfirmation === deck.deckId
                      ? deleteButton
                      : undefined
                  }
                  isConfirmingDelete={deleteConfirmation === deck.deckId}
                  isPending={pending?.deckId === deck.deckId}
                  onCancelDelete={() => setDeleteConfirmation(null)}
                  onConfirmDelete={() => void confirmDelete(deck)}
                  onDelete={() => {
                    setDeleteConfirmation(deck.deckId);
                    setActionError(null);
                    queueMicrotask(() => deleteButton.current?.focus());
                  }}
                  onEdit={() => beginEdit(deck)}
                  onSelect={() => void activateDeck(deck)}
                  pendingKind={
                    pending?.deckId === deck.deckId ? pending.kind : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft ? (
        <DeckEditor
          cards={state.cards}
          draft={draft}
          headingRef={editorHeading}
          isSaving={pending?.kind === 'save'}
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
        Create saved loadouts from exact card copies you own, then choose one
        active deck for the next CPU match.
      </p>
    </header>
  );
}

function RulesPanel() {
  return (
    <aside aria-labelledby="basic-deck-rules-title" className="deck-rules">
      <div>
        <p className="eyebrow">Basic deck rules</p>
        <h2 id="basic-deck-rules-title">Five owned copies, built to balance</h2>
      </div>
      <ul>
        <li>Exactly 5 cards: 3 Creature cards and 2 Power cards.</li>
        <li>No more than 10 rarity points in total.</li>
        <li>Common costs 1, Rare 2, Epic 3, and Legendary 4 points.</li>
        <li>A duplicate needs another separately owned copy in this deck.</li>
      </ul>
      <p>
        These checks explain your draft. The server verifies ownership,
        composition, rarity points, and final validity when you save or select.
      </p>
    </aside>
  );
}

export function SelectedDeckHandoff({
  deck,
  headingRef,
  onStartMatch,
}: {
  deck: SavedDeck | null;
  headingRef?: RefObject<HTMLHeadingElement | null>;
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
          onClick={() => onStartMatch(deck.deckId)}
          type="button"
        >
          Start CPU match
        </button>
      ) : null}
    </section>
  );
}

function SavedDeckCard({
  deck,
  deleteButtonRef,
  isConfirmingDelete,
  isPending,
  onCancelDelete,
  onConfirmDelete,
  onDelete,
  onEdit,
  onSelect,
  pendingKind,
}: {
  deck: SavedDeck;
  deleteButtonRef?: RefObject<HTMLButtonElement | null>;
  isConfirmingDelete: boolean;
  isPending: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSelect: () => void;
  pendingKind?: 'delete' | 'save' | 'select';
}) {
  const creatureCount = deck.cards.filter(
    (card) => card.category === 'creature',
  ).length;
  const powerCount = deck.cards.filter(
    (card) => card.category === 'power',
  ).length;

  return (
    <article
      aria-labelledby={`deck-${deck.deckId}-title`}
      className={`saved-deck-card${deck.isSelected ? ' saved-deck-card--active' : ''}`}
    >
      <div className="saved-deck-card__heading">
        <div>
          <p className="eyebrow">
            {deck.isSelected ? 'Active deck' : 'Saved deck'}
          </p>
          <h3 id={`deck-${deck.deckId}-title`}>{deck.name}</h3>
        </div>
        {deck.isSelected ? (
          <span className="deck-active-badge">Selected for matches</span>
        ) : null}
      </div>

      <dl aria-label={`${deck.name} composition`} className="deck-summary">
        <div>
          <dt>Cards</dt>
          <dd>{deck.cards.length} / 5</dd>
        </div>
        <div>
          <dt>Creature</dt>
          <dd>{creatureCount} / 3</dd>
        </div>
        <div>
          <dt>Power</dt>
          <dd>{powerCount} / 2</dd>
        </div>
        <div>
          <dt>Rarity points</dt>
          <dd>{deck.totalPoints} / 10</dd>
        </div>
      </dl>

      <ol aria-label={`${deck.name} cards`} className="deck-card-names">
        {deck.cards.map((card) => (
          <li key={card.ownedCardId}>
            <span>{card.position}</span>
            <strong>{card.name}</strong>
            <small>
              {titleCase(card.category)} · {titleCase(card.rarity)}
            </small>
          </li>
        ))}
      </ol>

      {isConfirmingDelete ? (
        <div
          className="delete-confirmation"
          role="group"
          aria-label={`Delete ${deck.name}`}
        >
          <p>
            Delete this saved deck? Its card copies stay in your collection.
            {deck.isSelected ? ' It will no longer be your active deck.' : ''}
          </p>
          <div>
            <button
              className="button button--danger"
              disabled={isPending}
              onClick={onConfirmDelete}
              ref={deleteButtonRef}
              type="button"
            >
              {pendingKind === 'delete' ? 'Deleting…' : 'Delete deck'}
            </button>
            <button
              className="button button--quiet"
              disabled={isPending}
              onClick={onCancelDelete}
              type="button"
            >
              Keep deck
            </button>
          </div>
        </div>
      ) : (
        <div className="saved-deck-card__actions">
          <button
            className="button"
            disabled={deck.isSelected || isPending}
            onClick={onSelect}
            type="button"
          >
            {deck.isSelected
              ? 'Active deck'
              : pendingKind === 'select'
                ? 'Selecting…'
                : 'Make active'}
          </button>
          <button
            className="button button--quiet"
            disabled={isPending}
            onClick={onEdit}
            type="button"
          >
            Edit or rename
          </button>
          <button
            className="button button--quiet"
            disabled={isPending}
            onClick={onDelete}
            type="button"
          >
            Delete
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
  isSaving,
  onCancel,
  onChange,
  onSubmit,
}: {
  cards: OwnedCard[];
  draft: DeckDraft;
  headingRef: RefObject<HTMLHeadingElement | null>;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (draft: DeckDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const summary = summarizeDraft(draft, cards);
  const summaryHeading = useRef<HTMLHeadingElement | null>(null);
  const wasValid = useRef(summary.isValid);
  const groupedCards = useMemo(() => groupOwnedCards(cards), [cards]);
  const cardsByOwnedId = useMemo(
    () => new Map(cards.map((card) => [card.ownedCardId, card])),
    [cards],
  );

  useEffect(() => {
    if (summary.isValid && !wasValid.current) {
      summaryHeading.current?.focus();
    }

    wasValid.current = summary.isValid;
  }, [summary.isValid]);

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
        <div className="deck-editor__layout">
          <div className="deck-editor__draft">
            <label className="deck-name-field">
              <span>Deck name</span>
              <input
                aria-describedby={
                  draft.name.trim() === '' ? 'deck-name-error' : undefined
                }
                aria-invalid={draft.name.trim() === ''}
                disabled={isSaving}
                maxLength={80}
                onChange={(event) =>
                  onChange({ ...draft, name: event.currentTarget.value })
                }
                value={draft.name}
              />
            </label>
            {draft.name.trim() === '' ? (
              <p className="field-error" id="deck-name-error">
                Enter a name for this saved deck.
              </p>
            ) : null}

            <DraftSummaryPanel headingRef={summaryHeading} summary={summary} />

            <section
              aria-labelledby="draft-cards-title"
              className="draft-cards"
            >
              <h3 id="draft-cards-title">Cards in this draft</h3>
              {draft.ownedCardIds.length === 0 ? (
                <p className="draft-cards__empty">
                  No copies chosen yet. Use Add a copy in your collection.
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
                              : 'No longer returned by the collection API'}
                          </small>
                        </span>
                        <button
                          className="button button--quiet"
                          disabled={isSaving}
                          onClick={() => removeAt(index)}
                          type="button"
                        >
                          Remove
                          <span className="sr-only">
                            {' '}
                            {card?.name ??
                              fallback?.name ??
                              `card ${index + 1}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <section aria-labelledby="card-picker-title" className="card-picker">
            <div>
              <p className="eyebrow">Owned collection</p>
              <h3 id="card-picker-title">Choose exact owned copies</h3>
              <p>
                Used and remaining counts apply only to this draft. The same
                owned copy may still appear in another saved deck.
              </p>
            </div>

            {groupedCards.length === 0 ? (
              <div className="deck-empty">
                <h4>Your collection is empty</h4>
                <p>Claim or earn cards before building a saved deck.</p>
              </div>
            ) : (
              <ul
                aria-label="Owned cards available for this deck"
                className="card-picker__list"
              >
                {groupedCards.map((group) => {
                  const card = group[0]!;
                  const used = group.filter((copy) =>
                    draft.ownedCardIds.includes(copy.ownedCardId),
                  ).length;
                  const remaining = group.length - used;

                  return (
                    <li key={card.cardDefinitionId}>
                      <CollectibleCard
                        actions={
                          <>
                            <p aria-live="polite">
                              Owned {group.length} · Used {used} · Remaining{' '}
                              {remaining}
                            </p>
                            <div className="copy-controls">
                              <button
                                aria-label={`Add a copy of ${card.name}`}
                                className="button"
                                disabled={
                                  isSaving ||
                                  remaining === 0 ||
                                  draft.ownedCardIds.length >=
                                    basicDeckRules.deckSize
                                }
                                onClick={() => addCopy(group)}
                                type="button"
                              >
                                Add a copy
                              </button>
                              <button
                                aria-label={`Remove a copy of ${card.name}`}
                                className="button button--quiet"
                                disabled={isSaving || used === 0}
                                onClick={() => removeDefinition(group)}
                                type="button"
                              >
                                Remove a copy
                              </button>
                            </div>
                          </>
                        }
                        card={card}
                        compact
                        copyTotal={group.length}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="deck-editor__actions">
          <button
            className="button"
            disabled={isSaving || !summary.isValid || draft.name.trim() === ''}
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
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <p>The server makes the final validity decision.</p>
        </div>
      </form>
    </section>
  );
}

function DraftSummaryPanel({
  headingRef,
  summary,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  summary: DraftSummary;
}) {
  return (
    <section
      aria-labelledby="draft-summary-title"
      className={`draft-summary${summary.isValid ? ' draft-summary--valid' : ''}`}
    >
      <div className="draft-summary__heading">
        <h3 id="draft-summary-title" ref={headingRef} tabIndex={-1}>
          Draft preflight
        </h3>
        <span>{summary.isValid ? 'Ready to submit' : 'Needs changes'}</span>
      </div>
      <dl>
        <div>
          <dt>Cards</dt>
          <dd>{summary.totalCards} / 5</dd>
        </div>
        <div>
          <dt>Creature</dt>
          <dd>{summary.creatureCount} / 3</dd>
        </div>
        <div>
          <dt>Power</dt>
          <dd>{summary.powerCount} / 2</dd>
        </div>
        <div>
          <dt>Rarity points</dt>
          <dd>{summary.totalPoints} / 10</dd>
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
            This draft explains all Basic constraints. The server will verify
            the owned copies and final deck.
          </p>
        )}
      </div>
    </section>
  );
}

const DeckActionError = forwardRef<HTMLDivElement, { error: DeckApiError }>(
  function DeckActionError({ error }, ref) {
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
      'point-cap':
        'The server reports that this deck exceeds ten rarity points.',
      size: 'The server requires exactly five owned card copies.',
      unavailable:
        'The deck change could not be completed. Check your connection and try again.',
      validation:
        'Fix the deck name, composition, owned-copy availability, and rarity points before saving.',
    };

    return (
      <div className="deck-action-error" ref={ref} role="alert" tabIndex={-1}>
        <strong>Deck change not saved.</strong> {messages[error.failure]}
        {error.options.requestId ? (
          <small> Support reference: {error.options.requestId}</small>
        ) : null}
      </div>
    );
  },
);

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

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
