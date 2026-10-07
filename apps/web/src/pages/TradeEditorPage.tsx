import { SearchField } from '../components/fields/SearchField';
import {
  ArrowLeft,
  ArrowRight,
  ArrowsLeftRight,
  LockSimple,
  Minus,
  PaperPlaneTilt,
  Plus,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { Link, useLocation, useParams } from 'wouter';

import {
  createTrade,
  findTradeRecipient,
  getTrade,
  listTradingCatalogue,
  previewTradeSelection,
  reviseTrade,
  TradeApiError,
  type CardTrade,
  type RequestedDefinitionInput,
  type TradingCatalogueCard,
  type TradeSelectionAvailability,
  type TradeSelectionCopy,
  type TradeSelectionPreview,
} from '../api/trades';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { useUnsavedAuthorChanges } from '../components/author/AuthorNavigationGuard';
import { CardArtwork } from '../components/cards/CollectibleCard';
import { useCollectionReads } from '../components/cards/CollectionReadProvider';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import { useCardTilt } from '../components/cards/useCardTilt';
import {
  PageLoadingState,
  UpdatingIndicator,
} from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import {
  RequestedCardList,
  TradeComparison,
} from '../components/trades/TradeComparison';
import { TradeConfirmationDialog } from '../components/trades/TradeConfirmationDialog';
import { type TradeCardDetail } from '../components/trades/TradeCardDetailsDialog';
import { TradeCardThumbnail } from '../components/trades/TradeCardThumbnail';
import './trades.css';

type EditorState =
  | { status: 'loading' }
  | {
      catalogue: TradingCatalogueCard[];
      originalTrade: CardTrade | null;
      preview: TradeSelectionPreview;
      status: 'ready';
      refreshing?: boolean;
      refreshError?: string;
    }
  | { error: TradeApiError; status: 'error' };

export default function TradeEditorPage({
  apiBaseUrl,
}: {
  apiBaseUrl: string;
}) {
  const { tradeId } = useParams<{ tradeId?: string }>();
  const editing = Boolean(tradeId);
  const getAccessToken = useApiAccessToken();
  const retainedReads = useCollectionReads();
  const [, navigate] = useLocation();
  const [state, setState] = useState<EditorState>({ status: 'loading' });
  const [readRetry, setReadRetry] = useState(0);
  const [choosingPlayer, setChoosingPlayer] = useState(!editing);
  const [recipientBusy, setRecipientBusy] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const recipientRequest = useRef<AbortController | null>(null);
  const [recipientPlayerName, setRecipientPlayerName] = useState('');
  const [offeredOwnedCardIds, setOfferedOwnedCardIds] = useState<string[]>([]);
  const [requestedDefinitions, setRequestedDefinitions] = useState<
    RequestedDefinitionInput[]
  >([]);
  const [copySearch, setCopySearch] = useState('');
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewOutdated, setPreviewOutdated] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<TradeApiError | null>(null);
  const [confirmRevision, setConfirmRevision] = useState(false);
  const [confirmNewTrade, setConfirmNewTrade] = useState(false);
  const [mobileCatalogue, setMobileCatalogue] = useState<'offer' | 'request'>(
    'offer',
  );
  const [dirty, setDirty] = useState(false);
  const request = useRef<AbortController | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const builderHeading = useRef<HTMLHeadingElement>(null);
  const clearNavigationGuard = useUnsavedAuthorChanges(dirty, 'card trade');

  const draftSnapshot = useRef({
    state,
    offeredOwnedCardIds,
    requestedDefinitions,
  });
  draftSnapshot.current = { state, offeredOwnedCardIds, requestedDefinitions };

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const previous = draftSnapshot.current;
    const retained =
      previous.state.status === 'ready' &&
      (previous.state.originalTrade?.tradeId ?? undefined) === tradeId;
    setState((current) =>
      retained && current.status === 'ready'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );
    void Promise.all([
      listTradingCatalogue({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      }),
      tradeId
        ? getTrade({
            apiBaseUrl,
            getAccessToken,
            signal: controller.signal,
            tradeId,
          })
        : Promise.resolve(null),
    ])
      .then(async ([catalogue, originalTrade]) => {
        if (controller.signal.aborted) return;
        const initialOffered = retained
          ? previous.offeredOwnedCardIds
          : (originalTrade?.self.offeredCopies.map(
              (copy) => copy.ownedCardId,
            ) ?? []);
        const initialRequested = retained
          ? previous.requestedDefinitions
          : (originalTrade?.self.requestedDefinitions.map((definition) => ({
              cardDefinitionId: definition.cardDefinitionId,
              quantity: definition.quantity,
            })) ?? []);
        const draftTrade =
          retained && previous.state.status === 'ready'
            ? previous.state.originalTrade
            : originalTrade;
        const preview = await previewTradeSelection({
          apiBaseUrl,
          expectedVersion: draftTrade?.version,
          getAccessToken,
          offeredOwnedCardIds: initialOffered,
          requestedDefinitions: initialRequested,
          signal: controller.signal,
          tradeId,
        });
        if (controller.signal.aborted) return;
        if (!retained) {
          setRecipientPlayerName(originalTrade?.counterpartyPlayerName ?? '');
          setOfferedOwnedCardIds(initialOffered);
          setRequestedDefinitions(initialRequested);
        }
        setState({
          catalogue,
          originalTrade: draftTrade,
          preview,
          status: 'ready',
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          const failure =
            error instanceof TradeApiError
              ? error
              : new TradeApiError('unavailable');
          setState((current) =>
            retained &&
            current.status === 'ready' &&
            failure.failure !== 'authorization'
              ? {
                  ...current,
                  refreshing: false,
                  refreshError:
                    'The trade could not be refreshed. Your draft is preserved; refresh before submitting.',
                }
              : { error: failure, status: 'error' },
          );
        }
      });
    return () => {
      controller.abort();
      previewRequest.current?.abort();
      recipientRequest.current?.abort();
    };
  }, [apiBaseUrl, getAccessToken, tradeId, readRetry]);

  useEffect(() => {
    if (state.status !== 'ready' || !previewOutdated) return;
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      previewRequest.current?.abort();
      previewRequest.current = controller;
      setPreviewBusy(true);
      void previewTradeSelection({
        apiBaseUrl,
        expectedVersion: state.originalTrade?.version,
        getAccessToken,
        offeredOwnedCardIds,
        requestedDefinitions,
        signal: controller.signal,
        tradeId,
      })
        .then((preview) => {
          if (!controller.signal.aborted) {
            setState((current) =>
              current.status === 'ready' ? { ...current, preview } : current,
            );
            setPreviewOutdated(false);
            setSubmitError(null);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setSubmitError(
              error instanceof TradeApiError
                ? error
                : new TradeApiError('unavailable'),
            );
          }
        })
        .finally(() => {
          if (previewRequest.current === controller)
            previewRequest.current = null;
          if (!controller.signal.aborted) setPreviewBusy(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      previewRequest.current?.abort();
    };
  }, [
    apiBaseUrl,
    getAccessToken,
    offeredOwnedCardIds,
    previewOutdated,
    previewRetry,
    requestedDefinitions,
    state.status === 'ready' ? state.originalTrade?.version : null,
    tradeId,
  ]);

  useEffect(() => {
    if (!choosingPlayer) builderHeading.current?.focus();
  }, [choosingPlayer, state.status]);

  if (
    state.status === 'loading' ||
    (state.status === 'ready' &&
      (state.originalTrade?.tradeId ?? undefined) !== tradeId)
  ) {
    return (
      <PageLoadingState
        onRetry={() => setReadRetry((value) => value + 1)}
        resetKey={`${tradeId ?? 'new'}:${readRetry}`}
        title={editing ? 'Loading trade' : 'Preparing trade'}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <div className="trades-page">
        <CollectionSectionNavigation />
        <section className="state-message state-message--error trade-state">
          <StateIcon tone="error" />
          <h1>
            {state.error.failure === 'stale'
              ? 'The offer changed'
              : 'Trade editor unavailable'}
          </h1>
          <p>
            {state.error.failure === 'stale'
              ? 'Return to the offer and review its newest version before editing.'
              : 'Your collection or the active card catalogue could not be loaded.'}
          </p>
          <Link
            className="button"
            href={
              tradeId ? `/collection/trades/${tradeId}` : '/collection/trades'
            }
          >
            {tradeId ? 'Review current offer' : 'Back to trades'}
          </Link>
        </section>
      </div>
    );
  }

  const selectedCopies = offeredOwnedCardIds.flatMap((ownedCardId) => {
    const copy = state.preview.ownedCopies.find(
      (candidate) => candidate.ownedCardId === ownedCardId,
    );
    return copy ? [copy] : [];
  });
  const normalizedRequests = requestedDefinitions.flatMap((request) => {
    const definition = state.catalogue.find(
      (candidate) => candidate.cardDefinitionId === request.cardDefinitionId,
    );
    return definition ? [{ ...definition, quantity: request.quantity }] : [];
  });
  const maximum = state.preview.limits.maximumCopiesPerSide;
  const readyState = state;
  const requestedCount = requestedDefinitions.reduce(
    (total, definition) => total + definition.quantity,
    0,
  );

  function updateOffered(ownedCardId: string) {
    setDirty(true);
    setPreviewOutdated(true);
    setSubmitError(null);
    setOfferedOwnedCardIds((current) =>
      current.includes(ownedCardId)
        ? current.filter((id) => id !== ownedCardId)
        : current.length < maximum
          ? [...current, ownedCardId]
          : current,
    );
  }

  function updateRequest(cardDefinitionId: string, delta: 1 | -1) {
    setDirty(true);
    setPreviewOutdated(true);
    setSubmitError(null);
    setRequestedDefinitions((current) => {
      const existing = current.find(
        (definition) => definition.cardDefinitionId === cardDefinitionId,
      );
      if (!existing && delta === 1 && requestedCount < maximum) {
        return [...current, { cardDefinitionId, quantity: 1 }];
      }
      if (!existing) return current;
      const nextQuantity = existing.quantity + delta;
      if (nextQuantity <= 0) {
        return current.filter(
          (definition) => definition.cardDefinitionId !== cardDefinitionId,
        );
      }
      if (delta === 1 && requestedCount >= maximum) return current;
      return current.map((definition) =>
        definition.cardDefinitionId === cardDefinitionId
          ? { ...definition, quantity: nextQuantity }
          : definition,
      );
    });
  }

  async function checkRecipient(event: FormEvent) {
    event.preventDefault();
    if (recipientBusy) return;
    const name = recipientPlayerName.trim();
    const controller = new AbortController();
    recipientRequest.current = controller;
    setRecipientBusy(true);
    setRecipientError(null);
    try {
      const confirmedName = await findTradeRecipient({
        apiBaseUrl,
        getAccessToken,
        playerName: name,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRecipientPlayerName(confirmedName);
      setSubmitError(null);
      setChoosingPlayer(false);
    } catch (error) {
      if (!controller.signal.aborted) {
        setRecipientError(
          error instanceof TradeApiError &&
            error.failure === 'player-unavailable'
            ? 'That player is unavailable. Check the name and try again.'
            : error instanceof TradeApiError && error.failure === 'validation'
              ? 'Check the Player Name and try again.'
              : 'Couldn’t check the player. Try again.',
        );
      }
    } finally {
      if (recipientRequest.current === controller)
        recipientRequest.current = null;
      if (!controller.signal.aborted) setRecipientBusy(false);
    }
  }

  async function publish() {
    if (
      !readyState.preview.valid ||
      Boolean(readyState.refreshing || readyState.refreshError) ||
      previewBusy ||
      previewOutdated ||
      submitting
    ) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    retainedReads?.clearCards();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const base = {
        apiBaseUrl,
        getAccessToken,
        offeredOwnedCardIds,
        requestedDefinitions,
        signal: controller.signal,
        submissionId: crypto.randomUUID(),
      };
      const trade = readyState.originalTrade
        ? await reviseTrade({
            ...base,
            expectedVersion: readyState.originalTrade.version,
            tradeId: readyState.originalTrade.tradeId,
          })
        : await createTrade({
            ...base,
            recipientPlayerName: recipientPlayerName.trim(),
          });
      if (!controller.signal.aborted) {
        clearNavigationGuard();
        setDirty(false);
        navigate(`/collection/trades/${trade.tradeId}`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSubmitError(
          error instanceof TradeApiError
            ? error
            : new TradeApiError('unavailable'),
        );
        setConfirmRevision(false);
        setConfirmNewTrade(false);
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  return (
    <div className="trades-page trade-editor-page">
      <CollectionSectionNavigation />
      <UpdatingIndicator
        active={Boolean(state.refreshing)}
        label="Updating cards"
        error={state.refreshError}
        onRetry={() => setReadRetry((value) => value + 1)}
      />
      <Link
        className="trade-back-link"
        href={tradeId ? `/collection/trades/${tradeId}` : '/collection/trades'}
      >
        <ArrowLeft aria-hidden="true" size={18} />
        {editing ? 'Back to offer' : 'Back to trades'}
      </Link>

      {submitError ? (
        <section
          className="state-message state-message--error trade-action-error"
          role="alert"
        >
          <WarningCircle aria-hidden="true" className="state-icon" size={24} />
          <h2>{editorErrorTitle(submitError)}</h2>
          <p>{editorErrorCopy(submitError)}</p>
          {submitError.options.requestId ? (
            <small>Support reference: {submitError.options.requestId}</small>
          ) : null}
        </section>
      ) : null}

      {choosingPlayer ? (
        <section
          className="trade-recipient-entry"
          aria-labelledby="trade-entry-title"
        >
          <div className="trade-recipient-entry__content">
            <header className="trade-recipient-entry__header">
              <h1 id="trade-entry-title">Start a trade</h1>
              <p>Choose a player. Then build your offer.</p>
            </header>
            <form
              className="trade-recipient-entry__form"
              onSubmit={(event) => void checkRecipient(event)}
            >
              <label>
                Player Name
                <input
                  aria-describedby={
                    recipientError
                      ? 'trade-player-hint trade-player-error'
                      : 'trade-player-hint'
                  }
                  aria-invalid={Boolean(recipientError)}
                  autoComplete="off"
                  autoFocus
                  maxLength={20}
                  minLength={3}
                  onChange={(event) => {
                    recipientRequest.current?.abort();
                    recipientRequest.current = null;
                    setRecipientBusy(false);
                    setRecipientError(null);
                    setRecipientPlayerName(event.target.value);
                    setDirty(true);
                    setSubmitError(null);
                  }}
                  required
                  value={recipientPlayerName}
                />
              </label>
              <p id="trade-player-hint">Enter their exact Player Name.</p>
              {recipientError ? (
                <p
                  id="trade-player-error"
                  className="trade-recipient-entry__error"
                  role="alert"
                >
                  {recipientError}
                </p>
              ) : null}
              <button className="button" disabled={recipientBusy} type="submit">
                {recipientBusy ? 'Checking player…' : 'Choose cards'}
                <ArrowRight aria-hidden="true" size={19} />
              </button>
            </form>
            <p className="trade-recipient-entry__privacy">
              <LockSimple aria-hidden="true" size={18} />
              <span>Player collections stay private.</span>
            </p>
          </div>
          <TradeEntryArtwork cards={state.catalogue.slice(0, 2)} />
        </section>
      ) : (
        <TradeBuilder
          catalogue={state.catalogue}
          catalogueSearch={catalogueSearch}
          copies={state.preview.ownedCopies}
          copySearch={copySearch}
          maximum={maximum}
          mobileCatalogue={mobileCatalogue}
          normalizedRequests={normalizedRequests}
          offeredOwnedCardIds={offeredOwnedCardIds}
          onCatalogueSearch={setCatalogueSearch}
          onChangeMobileCatalogue={setMobileCatalogue}
          headingRef={builderHeading}
          version={state.originalTrade?.version}
          onChangePlayer={
            editing
              ? undefined
              : () => {
                  setChoosingPlayer(true);
                  setSubmitError(null);
                }
          }
          onCopySearch={setCopySearch}
          onRequestChange={updateRequest}
          onRetryPreview={() => setPreviewRetry((current) => current + 1)}
          onReview={() =>
            editing ? setConfirmRevision(true) : setConfirmNewTrade(true)
          }
          onToggleOffered={updateOffered}
          preview={state.preview}
          previewBusy={
            previewBusy || Boolean(state.refreshing || state.refreshError)
          }
          previewFailed={Boolean(
            submitError && previewOutdated && !previewBusy,
          )}
          previewOutdated={previewOutdated}
          publishButtonRef={publishButton}
          recipientPlayerName={recipientPlayerName}
          requestedCount={requestedCount}
          requestedDefinitions={requestedDefinitions}
          selectedCopies={selectedCopies}
          submitting={submitting}
        />
      )}

      {confirmNewTrade ? (
        <TradeConfirmationDialog
          busy={submitting}
          confirmLabel="Send offer"
          description={`Send ${offeredOwnedCardIds.length} card${offeredOwnedCardIds.length === 1 ? '' : 's'} to ${recipientPlayerName} and request ${requestedCount} card${requestedCount === 1 ? '' : 's'}? They can review the offer before accepting it.`}
          onCancel={() => setConfirmNewTrade(false)}
          onConfirm={() => void publish()}
          returnFocusRef={publishButton}
          title="Send this trade offer?"
        />
      ) : null}
      {confirmRevision && state.originalTrade ? (
        <TradeConfirmationDialog
          busy={submitting}
          confirmLabel="Publish new version"
          description={`Publish version ${state.originalTrade.version + 1}? Both players will need to accept again and review any rarity warning.`}
          onCancel={() => setConfirmRevision(false)}
          onConfirm={() => void publish()}
          returnFocusRef={publishButton}
          title="Update this offer?"
        >
          <div className="trade-revision-review">
            <TradeComparison
              catalogue={state.catalogue}
              counterpartyLabel={recipientPlayerName}
              counterpartyOffered={
                state.originalTrade.counterparty.offeredCopies
              }
              counterpartyPoints={state.originalTrade.counterparty.rarityPoints}
              selfOffered={selectedCopies}
              selfPoints={state.preview.offeredRarityPoints}
            />
            <div className="trade-request-grid">
              <RequestedCardList
                catalogue={state.catalogue}
                definitions={normalizedRequests}
                label="You request"
              />
              <RequestedCardList
                catalogue={state.catalogue}
                definitions={
                  state.originalTrade.counterparty.requestedDefinitions
                }
                label={`${recipientPlayerName} requested`}
              />
            </div>
          </div>
        </TradeConfirmationDialog>
      ) : null}
    </div>
  );
}

function TradeEntryArtwork({ cards }: { cards: TradingCatalogueCard[] }) {
  return (
    <div
      aria-hidden="true"
      className="trade-recipient-entry__artwork"
      data-card-count={cards.length}
    >
      {cards.map((card, index) => (
        <div
          className={`trade-entry-card trade-entry-card--${index === 0 ? 'first' : 'second'}`}
          key={card.cardDefinitionId}
        >
          <TradeEntryCard card={card} />
        </div>
      ))}
      <span className="trade-recipient-entry__exchange">
        <ArrowsLeftRight size={28} weight="regular" />
      </span>
    </div>
  );
}

function TradeEntryCard({ card }: { card: TradingCatalogueCard }) {
  const tilt = useCardTilt<HTMLDivElement>();
  return (
    <div {...tilt} className="trade-entry-card__surface">
      <CardArtwork
        card={card}
        loading="eager"
        nameplate={card.name}
        showRarity
      />
    </div>
  );
}

interface TradeBuilderProps {
  catalogue: TradingCatalogueCard[];
  catalogueSearch: string;
  copies: TradeSelectionCopy[];
  copySearch: string;
  maximum: number;
  mobileCatalogue: 'offer' | 'request';
  normalizedRequests: Array<TradingCatalogueCard & { quantity: number }>;
  offeredOwnedCardIds: string[];
  onCatalogueSearch: (value: string) => void;
  onChangeMobileCatalogue: (value: 'offer' | 'request') => void;
  onChangePlayer?: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  version?: number;
  onCopySearch: (value: string) => void;
  onRequestChange: (cardDefinitionId: string, delta: 1 | -1) => void;
  onRetryPreview: () => void;
  onReview: () => void;
  onToggleOffered: (ownedCardId: string) => void;
  preview: TradeSelectionPreview;
  previewBusy: boolean;
  previewFailed: boolean;
  previewOutdated: boolean;
  publishButtonRef: RefObject<HTMLButtonElement | null>;
  recipientPlayerName: string;
  requestedCount: number;
  requestedDefinitions: RequestedDefinitionInput[];
  selectedCopies: TradeSelectionCopy[];
  submitting: boolean;
}

function TradeBuilder({
  headingRef,
  version,
  catalogue,
  catalogueSearch,
  copies,
  copySearch,
  maximum,
  mobileCatalogue,
  normalizedRequests,
  offeredOwnedCardIds,
  onCatalogueSearch,
  onChangeMobileCatalogue,
  onChangePlayer,
  onCopySearch,
  onRequestChange,
  onRetryPreview,
  onReview,
  onToggleOffered,
  preview,
  previewBusy,
  previewFailed,
  previewOutdated,
  publishButtonRef,
  recipientPlayerName,
  requestedCount,
  requestedDefinitions,
  selectedCopies,
  submitting,
}: TradeBuilderProps) {
  const previewUpdating = previewBusy || previewOutdated;
  const canSend = preview.valid && !previewUpdating && !submitting;
  const catalogueById = new Map(
    catalogue.map((card) => [card.cardDefinitionId, card]),
  );
  const offeredReceiptItems = groupSelectedCopies(selectedCopies).map(
    ({ copy, quantity }) => ({
      card: catalogueById.get(copy.cardDefinitionId) ?? copy,
      quantity,
    }),
  );
  const requestedReceiptItems = normalizedRequests.map((definition) => ({
    card: definition,
    quantity: definition.quantity,
  }));

  return (
    <section
      aria-labelledby="trade-builder-title"
      className="trade-builder-page"
    >
      <header className="trade-builder-header">
        <div>
          <h1 id="trade-builder-title" ref={headingRef} tabIndex={-1}>
            Trade with {recipientPlayerName}
          </h1>
          {version !== undefined ? (
            <p className="trade-builder-header__version">
              Editing version {version}
            </p>
          ) : null}
        </div>
        {onChangePlayer ? (
          <button
            className="button button--quiet trade-builder-header__change"
            onClick={onChangePlayer}
            type="button"
          >
            Change player
          </button>
        ) : null}
      </header>

      <div className="trade-builder">
        <div
          aria-label="Choose a card catalogue"
          className="trade-builder__mobile-tabs"
          role="group"
        >
          <button
            aria-pressed={mobileCatalogue === 'offer'}
            onClick={() => onChangeMobileCatalogue('offer')}
            type="button"
          >
            You give
          </button>
          <button
            aria-pressed={mobileCatalogue === 'request'}
            onClick={() => onChangeMobileCatalogue('request')}
            type="button"
          >
            You request
          </button>
        </div>

        <section
          aria-labelledby="trade-self-catalogue-title"
          className="trade-builder__catalogue-panel trade-builder__catalogue-panel--self"
          data-mobile-active={mobileCatalogue === 'offer'}
        >
          <div className="trade-builder__player-heading">
            <h2 id="trade-self-catalogue-title">Your collection</h2>
          </div>
          <SearchField
            label="Search your cards"
            placeholder="Search your cards"
            hideLabel
            onChange={onCopySearch}
            value={copySearch}
          />
          <div className="trade-builder__catalogue-scroll">
            <GroupedOwnedCopyPicker
              catalogueById={catalogueById}
              copies={copies}
              maximumReached={offeredOwnedCardIds.length >= maximum}
              onToggle={onToggleOffered}
              search={copySearch}
              selected={new Set(offeredOwnedCardIds)}
            />
          </div>
        </section>

        <section
          aria-labelledby="trade-recipient-catalogue-title"
          className="trade-builder__catalogue-panel trade-builder__catalogue-panel--recipient"
          data-mobile-active={mobileCatalogue === 'request'}
        >
          <div className="trade-builder__player-heading">
            <h2 id="trade-recipient-catalogue-title">Card catalogue</h2>
          </div>
          <p className="trade-builder__catalogue-note">
            Cards you can request, not {recipientPlayerName}’s collection.
          </p>
          <SearchField
            label="Search cards to request"
            placeholder="Search cards to request"
            hideLabel
            onChange={onCatalogueSearch}
            value={catalogueSearch}
          />
          <div className="trade-builder__catalogue-scroll">
            <CataloguePicker
              definitions={catalogue}
              maximumReached={requestedCount >= maximum}
              onChange={onRequestChange}
              requests={requestedDefinitions}
              search={catalogueSearch}
            />
          </div>
        </section>
        <div className="trade-builder__center">
          <section
            aria-labelledby="trade-table-title"
            className="trade-builder__table"
          >
            <h2 className="sr-only" id="trade-table-title">
              Your offer
            </h2>
            <TradeReceiptLane
              count={offeredOwnedCardIds.length}
              empty="Add cards from your collection."
              id="trade-give-title"
              items={offeredReceiptItems}
              maximum={maximum}
              title="You give"
              tone="give"
            />
            <TradeReceiptLane
              count={requestedCount}
              empty="Add cards from the catalogue."
              id="trade-receive-title"
              items={requestedReceiptItems}
              maximum={maximum}
              title="You request"
              tone="receive"
            />

            {preview.imbalanceWarningRequired ? (
              <p className="trade-preview-warning">
                <WarningCircle aria-hidden="true" size={20} /> The rarity points
                differ enough to need a warning. Both players must confirm this
                before accepting.
              </p>
            ) : null}
            {previewFailed ? (
              <button
                className="trade-preview-retry"
                onClick={onRetryPreview}
                type="button"
              >
                Check again
              </button>
            ) : null}
          </section>

          <div className="trade-builder__review-bar">
            <span className="trade-builder__check" role="status">
              {previewUpdating
                ? 'Checking trade availability…'
                : preview.valid
                  ? 'Ready'
                  : 'Add cards to both sides'}
            </span>
            <button
              className="button trade-builder__send"
              disabled={!canSend}
              onClick={onReview}
              ref={publishButtonRef}
              type="button"
            >
              <PaperPlaneTilt aria-hidden="true" size={19} weight="bold" />
              {submitting
                ? version !== undefined
                  ? 'Publishing…'
                  : 'Sending…'
                : 'Review offer'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

interface TradeReceiptItem {
  card: TradeCardDetail;
  quantity: number;
}

function TradeReceiptLane({
  count,
  empty,
  id,
  items,
  maximum,
  title,
  tone,
}: {
  count: number;
  empty: string;
  id: string;
  items: TradeReceiptItem[];
  maximum: number;
  title: string;
  tone: 'give' | 'receive';
}) {
  return (
    <section
      aria-labelledby={id}
      className={`trade-builder-lane trade-builder-lane--${tone}`}
    >
      <div className="trade-builder-lane__heading">
        <div>
          <h3 id={id}>{title}</h3>
        </div>
        <strong aria-live="polite">
          {count} / {maximum}
        </strong>
      </div>
      {items.length > 0 ? (
        <>
          <p className="trade-builder-lane__summary">
            {items
              .map(
                ({ card, quantity }) =>
                  `${card.name}${quantity > 1 ? ` ×${quantity}` : ''}`,
              )
              .join(' · ')}
          </p>
          <ul
            aria-label={`${title} selected cards`}
            className="trade-builder-selection-strip"
            data-item-count={items.length}
          >
            {items.map(({ card, quantity }) => (
              <li key={card.cardDefinitionId}>
                <TradeCardThumbnail card={card} fullFrame />
                <span
                  className="trade-builder-selection-strip__name"
                  title={card.name}
                >
                  {card.name}
                </span>
                <strong>×{quantity}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="trade-builder-lane__empty">{empty}</p>
      )}
    </section>
  );
}

function groupSelectedCopies(copies: TradeSelectionCopy[]) {
  const groups = new Map<
    string,
    { copy: TradeSelectionCopy; quantity: number }
  >();
  for (const copy of copies) {
    const existing = groups.get(copy.cardDefinitionId);
    if (existing) {
      existing.quantity += 1;
    } else {
      groups.set(copy.cardDefinitionId, { copy, quantity: 1 });
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.copy.name.localeCompare(right.copy.name),
  );
}

function GroupedOwnedCopyPicker({
  catalogueById,
  copies,
  maximumReached,
  onToggle,
  search,
  selected,
}: {
  catalogueById: Map<string, TradingCatalogueCard>;
  copies: TradeSelectionCopy[];
  maximumReached: boolean;
  onToggle: (ownedCardId: string) => void;
  search: string;
  selected: Set<string>;
}) {
  const visibleGroups = groupOwnedCopies(copies, selected).filter((group) =>
    group.card.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (visibleGroups.length === 0) {
    return (
      <p className="trade-picker-empty">
        {search.trim()
          ? 'No cards match your search.'
          : 'Your collection has no cards.'}
      </p>
    );
  }
  return (
    <>
      {search.trim() ? (
        <p className="trade-picker-results" role="status">
          {visibleGroups.length} {visibleGroups.length === 1 ? 'card' : 'cards'}{' '}
          found
        </p>
      ) : null}
      <ul
        aria-label="Card types in your collection"
        className="trade-card-picker"
      >
        {visibleGroups.map((group) => {
          const selectedCopies = group.copies.filter((copy) =>
            selected.has(copy.ownedCardId),
          );
          const addCandidate = group.copies.find(
            (copy) =>
              !selected.has(copy.ownedCardId) &&
              copy.availability === 'available',
          );
          const removeCandidate = selectedCopies.at(-1);
          const tradableCount = group.copies.filter(
            (copy) =>
              copy.availability === 'available' ||
              copy.availability === 'selected_here',
          ).length;
          const lockedByReason = new Map<TradeSelectionAvailability, number>();
          for (const copy of group.copies) {
            if (
              copy.availability === 'available' ||
              copy.availability === 'selected_here'
            ) {
              continue;
            }
            lockedByReason.set(
              copy.availability,
              (lockedByReason.get(copy.availability) ?? 0) + 1,
            );
          }
          const unavailableCount = group.copies.length - tradableCount;
          return (
            <li
              className="trade-copy-group"
              data-selected={selectedCopies.length > 0 || undefined}
              key={group.card.cardDefinitionId}
            >
              <TradeCardThumbnail
                card={
                  catalogueById.get(group.card.cardDefinitionId) ?? group.card
                }
              />
              <div className="trade-picker-card__body">
                <strong>{group.card.name}</strong>
                <span>
                  {titleCase(group.card.category)} ·{' '}
                  {titleCase(group.card.rarity)}
                </span>
                <small>
                  {tradableCount === group.copies.length
                    ? `${tradableCount} available`
                    : `${group.copies.length} owned · ${tradableCount} available`}
                </small>
              </div>
              <div
                aria-label={`${group.card.name} offered quantity`}
                className="trade-quantity trade-quantity--owned"
              >
                <button
                  aria-label={`Offer one fewer ${group.card.name}`}
                  disabled={!removeCandidate}
                  onClick={() =>
                    removeCandidate && onToggle(removeCandidate.ownedCardId)
                  }
                  type="button"
                >
                  <Minus aria-hidden="true" size={17} />
                </button>
                <output aria-live="polite">{selectedCopies.length}</output>
                <button
                  aria-label={`Offer one more ${group.card.name}`}
                  disabled={!addCandidate || maximumReached}
                  onClick={() =>
                    addCandidate && onToggle(addCandidate.ownedCardId)
                  }
                  type="button"
                >
                  <Plus aria-hidden="true" size={17} />
                </button>
              </div>
              {unavailableCount > 0 ? (
                <details className="trade-copy-group__availability">
                  <summary>
                    <LockSimple aria-hidden="true" size={14} />{' '}
                    {unavailableCount} unavailable
                  </summary>
                  <ul>
                    {[...lockedByReason].map(([availability, count]) => (
                      <li key={availability}>
                        {count} × {availabilityCopy(availability)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function groupOwnedCopies(copies: TradeSelectionCopy[], selected: Set<string>) {
  const groups = new Map<
    string,
    { card: TradeSelectionCopy; copies: TradeSelectionCopy[] }
  >();
  for (const copy of copies) {
    const existing = groups.get(copy.cardDefinitionId);
    if (existing) {
      existing.copies.push(copy);
    } else {
      groups.set(copy.cardDefinitionId, { card: copy, copies: [copy] });
    }
  }
  return [...groups.values()].sort((left, right) => {
    const leftSelected = left.copies.some((copy) =>
      selected.has(copy.ownedCardId),
    );
    const rightSelected = right.copies.some((copy) =>
      selected.has(copy.ownedCardId),
    );
    if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
    return left.card.name.localeCompare(right.card.name);
  });
}

function CataloguePicker({
  definitions,
  maximumReached,
  onChange,
  requests,
  search,
}: {
  definitions: TradingCatalogueCard[];
  maximumReached: boolean;
  onChange: (cardDefinitionId: string, delta: 1 | -1) => void;
  requests: RequestedDefinitionInput[];
  search: string;
}) {
  const visible = definitions.filter((definition) =>
    definition.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (visible.length === 0) {
    return (
      <p className="trade-picker-empty">
        {search.trim()
          ? 'No cards match your search.'
          : 'No cards are available to request.'}
      </p>
    );
  }
  return (
    <>
      {search.trim() ? (
        <p className="trade-picker-results" role="status">
          {visible.length} {visible.length === 1 ? 'card' : 'cards'} found
        </p>
      ) : null}
      <ul
        aria-label="Active card definitions you can request"
        className="trade-catalogue-picker"
      >
        {visible.map((definition) => {
          const quantity =
            requests.find(
              (request) =>
                request.cardDefinitionId === definition.cardDefinitionId,
            )?.quantity ?? 0;
          return (
            <li
              data-selected={quantity > 0 || undefined}
              key={definition.cardDefinitionId}
            >
              <TradeCardThumbnail card={definition} />
              <div className="trade-catalogue-card__body">
                <strong>{definition.name}</strong>
                <span>
                  {titleCase(definition.category)} ·{' '}
                  {titleCase(definition.rarity)}
                </span>
              </div>
              {quantity === 0 ? (
                <button
                  aria-label={`Request one more ${definition.name}`}
                  className="trade-quantity__add"
                  disabled={maximumReached}
                  onClick={() => onChange(definition.cardDefinitionId, 1)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={17} /> Add
                </button>
              ) : (
                <div
                  className="trade-quantity"
                  aria-label={`${definition.name} requested quantity`}
                >
                  <button
                    aria-label={`Request one fewer ${definition.name}`}
                    onClick={() => onChange(definition.cardDefinitionId, -1)}
                    type="button"
                  >
                    <Minus aria-hidden="true" size={17} />
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button
                    aria-label={`Request one more ${definition.name}`}
                    disabled={maximumReached}
                    onClick={() => onChange(definition.cardDefinitionId, 1)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={17} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function availabilityCopy(availability: TradeSelectionAvailability) {
  return availability === 'saved_deck'
    ? 'Used by a saved deck'
    : availability === 'gameplay_commitment'
      ? 'Committed to a pending or active match'
      : availability === 'other_trade'
        ? 'Reserved by another open trade'
        : availability === 'inactive_definition'
          ? 'No longer active in the catalogue'
          : availability === 'collection_minimum'
            ? 'Needed to keep the minimum card collection'
            : 'Available';
}

function editorErrorTitle(error: TradeApiError) {
  return error.failure === 'player-unavailable'
    ? 'Player unavailable'
    : error.failure === 'stale'
      ? 'The offer changed'
      : error.failure === 'copy-conflict'
        ? 'A selected copy is unavailable'
        : 'The offer needs attention';
}

function editorErrorCopy(error: TradeApiError) {
  if (error.options.detail) return error.options.detail;
  if (error.failure === 'player-unavailable') {
    return 'That Player Name is unavailable. Check the exact name and try again.';
  }
  return 'The offer could not be published. Review the current selections and try again.';
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
