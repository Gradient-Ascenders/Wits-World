import {
  ArrowLeft,
  ArrowsDownUp,
  Check,
  LockSimple,
  MagnifyingGlass,
  Minus,
  PaperPlaneTilt,
  Plus,
  UserCircle,
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
  getTrade,
  listTradingCatalogue,
  previewTradeSelection,
  reviseTrade,
  TradeApiError,
  type CardTrade,
  type RequestedDefinitionInput,
  type TradeCardDefinition,
  type TradingCatalogueCard,
  type TradeSelectionAvailability,
  type TradeSelectionCopy,
  type TradeSelectionPreview,
} from '../api/trades';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';
import { useUnsavedAuthorChanges } from '../components/author/AuthorNavigationGuard';
import { CardArtwork } from '../components/cards/CollectibleCard';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import { useCardTilt } from '../components/cards/useCardTilt';
import { PageLoadingState } from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import {
  RequestedCardList,
  TradeComparison,
} from '../components/trades/TradeComparison';
import { TradeConfirmationDialog } from '../components/trades/TradeConfirmationDialog';
import {
  TradeCardDetailsDialog,
  type TradeCardDetail,
} from '../components/trades/TradeCardDetailsDialog';
import './trades.css';

type EditorState =
  | { status: 'loading' }
  | {
      catalogue: TradingCatalogueCard[];
      originalTrade: CardTrade | null;
      preview: TradeSelectionPreview;
      status: 'ready';
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
  const currentPlayer = useCurrentPlayer();
  const [, navigate] = useLocation();
  const [state, setState] = useState<EditorState>({ status: 'loading' });
  const [step, setStep] = useState(editing ? 2 : 1);
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
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const clearNavigationGuard = useUnsavedAuthorChanges(dirty, 'card trade');

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });
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
        const initialOffered =
          originalTrade?.self.offeredCopies.map((copy) => copy.ownedCardId) ??
          [];
        const initialRequested =
          originalTrade?.self.requestedDefinitions.map((definition) => ({
            cardDefinitionId: definition.cardDefinitionId,
            quantity: definition.quantity,
          })) ?? [];
        const preview = await previewTradeSelection({
          apiBaseUrl,
          expectedVersion: originalTrade?.version,
          getAccessToken,
          offeredOwnedCardIds: initialOffered,
          requestedDefinitions: initialRequested,
          signal: controller.signal,
          tradeId,
        });
        if (controller.signal.aborted) return;
        setRecipientPlayerName(originalTrade?.counterpartyPlayerName ?? '');
        setOfferedOwnedCardIds(initialOffered);
        setRequestedDefinitions(initialRequested);
        setState({ catalogue, originalTrade, preview, status: 'ready' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            error:
              error instanceof TradeApiError
                ? error
                : new TradeApiError('unavailable'),
            status: 'error',
          });
        }
      });
    return () => {
      controller.abort();
      previewRequest.current?.abort();
    };
  }, [apiBaseUrl, getAccessToken, tradeId]);

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
    stepHeading.current?.focus();
  }, [step]);

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        description="Loading your collection and the active card catalogue."
        title={editing ? 'Loading trade editor' : 'Preparing a new trade'}
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
  const selfPlayerName =
    currentPlayer.state.status === 'ready' &&
    currentPlayer.state.player.playerName
      ? currentPlayer.state.player.playerName
      : 'You';

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

  function nextStep(event?: FormEvent) {
    event?.preventDefault();
    setSubmitError(null);
    if (step === 1 && recipientPlayerName.trim().length < 3) {
      setSubmitError(
        new TradeApiError('validation', {
          detail: 'Enter the exact Player Name, using at least 3 characters.',
        }),
      );
      return;
    }
    if (step === 2 && offeredOwnedCardIds.length === 0) {
      setSubmitError(
        new TradeApiError('validation', {
          detail: 'Select at least one available owned copy to offer.',
        }),
      );
      return;
    }
    if (step === 3 && requestedCount === 0) {
      setSubmitError(
        new TradeApiError('validation', {
          detail: 'Request at least one card definition before reviewing.',
        }),
      );
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  async function publish() {
    if (
      !readyState.preview.valid ||
      previewBusy ||
      previewOutdated ||
      submitting
    ) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
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

  if (!editing) {
    return (
      <div className="trades-page trade-editor-page trade-editor-page--new">
        <CollectionSectionNavigation />
        <Link className="trade-back-link" href="/collection/trades">
          <ArrowLeft aria-hidden="true" size={18} />
          Back to trades
        </Link>

        {submitError ? (
          <section
            className="state-message state-message--error trade-action-error"
            role="alert"
          >
            <WarningCircle
              aria-hidden="true"
              className="state-icon"
              size={24}
            />
            <h2>{editorErrorTitle(submitError)}</h2>
            <p>{editorErrorCopy(submitError)}</p>
            {submitError.options.requestId ? (
              <small>Support reference: {submitError.options.requestId}</small>
            ) : null}
          </section>
        ) : null}

        {step === 1 ? (
          <div className="trade-recipient-entry">
            <header className="trade-recipient-entry__header">
              <span aria-hidden="true" className="trade-recipient-entry__icon">
                <UserCircle size={32} weight="duotone" />
              </span>
              <div>
                <h1>Who do you want to trade with?</h1>
                <p>Enter their exact Player Name to start building an offer.</p>
              </div>
            </header>
            <form className="trade-recipient-entry__form" onSubmit={nextStep}>
              <label>
                Player Name
                <input
                  autoComplete="off"
                  autoFocus
                  maxLength={20}
                  minLength={3}
                  onChange={(event) => {
                    setRecipientPlayerName(event.target.value);
                    setDirty(true);
                    setSubmitError(null);
                  }}
                  placeholder="Enter an exact Player Name"
                  required
                  value={recipientPlayerName}
                />
              </label>
              <button className="button" type="submit">
                Build trade
              </button>
            </form>
            <p className="trade-recipient-entry__privacy">
              Wits World keeps player directories and collections private. You
              can request any active card without seeing what another player
              owns.
            </p>
          </div>
        ) : (
          <NewTradeBuilder
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
            onChangePlayer={() => {
              setStep(1);
              setSubmitError(null);
            }}
            onCopySearch={setCopySearch}
            onRequestChange={updateRequest}
            onRetryPreview={() => setPreviewRetry((current) => current + 1)}
            onReview={() => setConfirmNewTrade(true)}
            onToggleOffered={updateOffered}
            preview={state.preview}
            previewBusy={previewBusy}
            previewFailed={Boolean(
              submitError && previewOutdated && !previewBusy,
            )}
            previewOutdated={previewOutdated}
            publishButtonRef={publishButton}
            recipientPlayerName={recipientPlayerName}
            requestedCount={requestedCount}
            requestedDefinitions={requestedDefinitions}
            selectedCopies={selectedCopies}
            selfPlayerName={selfPlayerName}
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
      </div>
    );
  }

  return (
    <div className="trades-page trade-editor-page">
      <CollectionSectionNavigation />
      <Link
        className="trade-back-link"
        href={tradeId ? `/collection/trades/${tradeId}` : '/collection/trades'}
      >
        <ArrowLeft aria-hidden="true" size={18} />
        {tradeId ? 'Back to offer' : 'Back to trades'}
      </Link>

      <header className="trade-editor-header">
        <h1>{editing ? 'Edit your side' : 'Start a card trade'}</h1>
        <p>
          {editing
            ? `Publishing changes creates a new version for ${recipientPlayerName} to review.`
            : 'Choose one exact player, the copies you will give, and the card definitions you want.'}
        </p>
      </header>

      <ol aria-label="Trade setup progress" className="trade-stepper">
        {['Player', 'You give', 'You request', 'Review'].map((label, index) => {
          const value = index + 1;
          return (
            <li
              aria-current={step === value ? 'step' : undefined}
              data-complete={step > value || undefined}
              key={label}
            >
              <span>
                {step > value ? <Check aria-hidden="true" size={15} /> : value}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

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

      {step === 1 ? (
        <form
          className="trade-editor-section trade-player-step"
          onSubmit={nextStep}
        >
          <h2 ref={stepHeading} tabIndex={-1}>
            Who are you trading with?
          </h2>
          <p>
            Enter the exact Player Name. Wits World does not expose a player
            directory or another player’s collection.
          </p>
          <label>
            Player Name
            <input
              autoComplete="off"
              maxLength={20}
              minLength={3}
              onChange={(event) => {
                setRecipientPlayerName(event.target.value);
                setDirty(true);
                setSubmitError(null);
              }}
              required
              value={recipientPlayerName}
            />
          </label>
          <button className="button" type="submit">
            Choose your cards
          </button>
        </form>
      ) : null}

      {step === 2 ? (
        <section className="trade-editor-section">
          <div className="trade-editor-section__heading">
            <div>
              <h2 ref={stepHeading} tabIndex={-1}>
                Choose exact copies to give
              </h2>
              <p>
                Select 1 to {maximum} copies. Unavailable copies remain visible
                with their current server-provided reason.
              </p>
            </div>
            <strong>
              {offeredOwnedCardIds.length} / {maximum}
            </strong>
          </div>
          <SearchField
            label="Search your cards"
            onChange={setCopySearch}
            value={copySearch}
          />
          <OwnedCopyPicker
            copies={state.preview.ownedCopies}
            maximumReached={offeredOwnedCardIds.length >= maximum}
            onToggle={updateOffered}
            search={copySearch}
            selected={new Set(offeredOwnedCardIds)}
          />
          <StepActions
            back={() => setStep(editing ? 2 : 1)}
            disableBack={editing}
            next={() => nextStep()}
            nextLabel="Choose requested cards"
          />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="trade-editor-section">
          <div className="trade-editor-section__heading">
            <div>
              <h2 ref={stepHeading} tabIndex={-1}>
                Choose what you request
              </h2>
              <p>
                Request public card definitions and quantities—not copies from{' '}
                {recipientPlayerName}’s private collection.
              </p>
            </div>
            <strong>
              {requestedCount} / {maximum}
            </strong>
          </div>
          <SearchField
            label="Search active cards"
            onChange={setCatalogueSearch}
            value={catalogueSearch}
          />
          <CataloguePicker
            definitions={state.catalogue}
            maximumReached={requestedCount >= maximum}
            onChange={updateRequest}
            requests={requestedDefinitions}
            search={catalogueSearch}
          />
          <StepActions
            back={() => setStep(2)}
            next={() => nextStep()}
            nextLabel="Review offer"
          />
        </section>
      ) : null}

      {step === 4 ? (
        <section className="trade-editor-section trade-review">
          <div className="trade-editor-section__heading">
            <div>
              <h2 ref={stepHeading} tabIndex={-1}>
                Review this offer
              </h2>
              <p>
                Creating or revising this offer does not accept it. Both players
                must later accept the same complete version.
              </p>
            </div>
            {previewBusy ? (
              <span role="status">Checking…</span>
            ) : previewOutdated ? (
              <button
                className="trade-preview-retry"
                onClick={() => setPreviewRetry((current) => current + 1)}
                type="button"
              >
                Retry server check
              </button>
            ) : state.preview.valid ? (
              <span className="trade-preview-valid">
                <Check aria-hidden="true" size={17} /> Server preview ready
              </span>
            ) : null}
          </div>

          <div className="trade-review__recipient">
            <span>Trading with</span>
            <strong>{recipientPlayerName}</strong>
          </div>
          {state.originalTrade ? (
            <>
              <TradeComparison
                counterpartyLabel={recipientPlayerName}
                counterpartyOffered={
                  state.originalTrade.counterparty.offeredCopies
                }
                counterpartyPoints={
                  state.originalTrade.counterparty.rarityPoints
                }
                selfOffered={selectedCopies}
                selfPoints={state.preview.offeredRarityPoints}
              />
              <div className="trade-request-grid">
                <RequestedCardList
                  definitions={normalizedRequests}
                  label="You request"
                />
                <RequestedCardList
                  definitions={
                    state.originalTrade.counterparty.requestedDefinitions
                  }
                  label={`${recipientPlayerName} requested`}
                />
              </div>
            </>
          ) : (
            <>
              <ReviewCopyList copies={selectedCopies} />
              <RequestedCardList
                definitions={normalizedRequests}
                label="You request"
              />
            </>
          )}

          <div className="trade-review__points">
            <div>
              <span>You give</span>
              <strong>{state.preview.offeredRarityPoints}</strong>
              <small>rarity points</small>
            </div>
            <div>
              <span>You request</span>
              <strong>{state.preview.requestedRarityPoints}</strong>
              <small>rarity points</small>
            </div>
          </div>
          <p className="trade-review__points-note">
            Rarity points are server-calculated warnings, not prices or
            guarantees of equal value.
          </p>
          {state.preview.imbalanceWarningRequired ? (
            <p className="trade-preview-warning">
              <WarningCircle aria-hidden="true" size={20} /> This draft crosses
              the configured warning threshold. Each player must acknowledge the
              final version before accepting.
            </p>
          ) : null}
          <div className="trade-editor-actions">
            <button
              className="button button--quiet"
              disabled={submitting}
              onClick={() => setStep(3)}
              type="button"
            >
              Back to requests
            </button>
            <button
              className="button"
              disabled={
                !state.preview.valid ||
                previewBusy ||
                previewOutdated ||
                submitting
              }
              onClick={() =>
                editing ? setConfirmRevision(true) : void publish()
              }
              ref={publishButton}
              type="button"
            >
              {submitting
                ? 'Publishing…'
                : editing
                  ? 'Review version change'
                  : 'Send offer'}
            </button>
          </div>
        </section>
      ) : null}

      {confirmRevision ? (
        <TradeConfirmationDialog
          busy={submitting}
          confirmLabel="Publish new version"
          description={`Publish these changes as version ${(state.originalTrade?.version ?? 0) + 1}? Both players’ existing acceptances and rarity-warning acknowledgements will be cleared.`}
          onCancel={() => setConfirmRevision(false)}
          onConfirm={() => void publish()}
          returnFocusRef={publishButton}
          title="Publish a new offer version?"
        />
      ) : null}
    </div>
  );
}

interface NewTradeBuilderProps {
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
  onChangePlayer: () => void;
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
  selfPlayerName: string;
  submitting: boolean;
}

function NewTradeBuilder({
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
  selfPlayerName,
  submitting,
}: NewTradeBuilderProps) {
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
          <h1 id="trade-builder-title">Build your offer</h1>
          <p>
            Choose copies from your collection to offer, then request active
            card types. {recipientPlayerName}’s collection stays private.
          </p>
        </div>
        <button
          className="button button--quiet trade-builder-header__change"
          onClick={onChangePlayer}
          type="button"
        >
          Change player
        </button>
      </header>

      <div className="trade-builder">
        <div className="trade-builder__center">
          <section
            aria-labelledby="trade-table-title"
            className="trade-builder__table"
          >
            <div className="trade-builder__table-heading">
              <div>
                <h2 id="trade-table-title">Your trade</h2>
                <p>
                  You <ArrowsDownUp aria-hidden="true" size={15} />{' '}
                  {recipientPlayerName}
                </p>
              </div>
              <span
                className={`trade-builder__server-state${
                  previewUpdating
                    ? ' trade-builder__server-state--checking'
                    : preview.valid
                      ? ' trade-builder__server-state--ready'
                      : ''
                }`}
                role="status"
              >
                {previewUpdating ? (
                  'Checking…'
                ) : preview.valid ? (
                  <>
                    <Check aria-hidden="true" size={15} /> Ready
                  </>
                ) : (
                  'Incomplete'
                )}
              </span>
            </div>

            <TradeReceiptLane
              caption={`Requested from ${recipientPlayerName}`}
              count={requestedCount}
              empty="Choose active card types to request."
              id="trade-receive-title"
              items={requestedReceiptItems}
              maximum={maximum}
              title="You receive"
              tone="receive"
            />

            <span aria-hidden="true" className="trade-builder__exchange-mark">
              <ArrowsDownUp size={20} weight="bold" />
            </span>

            <TradeReceiptLane
              caption={`Offered to ${recipientPlayerName}`}
              count={offeredOwnedCardIds.length}
              empty="Choose copies from your collection to offer."
              id="trade-give-title"
              items={offeredReceiptItems}
              maximum={maximum}
              title="You give"
              tone="give"
            />

            {preview.imbalanceWarningRequired ? (
              <p className="trade-preview-warning">
                <WarningCircle aria-hidden="true" size={20} /> This offer
                crosses the configured warning threshold. Both players must
                acknowledge the final version before accepting.
              </p>
            ) : null}
            {previewFailed ? (
              <button
                className="trade-preview-retry"
                onClick={onRetryPreview}
                type="button"
              >
                Retry server check
              </button>
            ) : null}
          </section>

          <div className="trade-builder__review-bar">
            <span>
              <strong>{offeredOwnedCardIds.length}</strong> give
              <span aria-hidden="true"> · </span>
              <strong>{requestedCount}</strong> receive
            </span>
            <button
              className="button trade-builder__send"
              disabled={!canSend}
              onClick={onReview}
              ref={publishButtonRef}
              type="button"
            >
              <PaperPlaneTilt aria-hidden="true" size={19} weight="bold" />
              {submitting ? 'Sending…' : 'Review offer'}
            </button>
          </div>
        </div>

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
            Your collection
            <span>{offeredOwnedCardIds.length}</span>
          </button>
          <button
            aria-pressed={mobileCatalogue === 'request'}
            onClick={() => onChangeMobileCatalogue('request')}
            type="button"
          >
            Active cards
            <span>{requestedCount}</span>
          </button>
        </div>

        <section
          aria-labelledby="trade-self-catalogue-title"
          className="trade-builder__catalogue-panel trade-builder__catalogue-panel--self"
          data-mobile-active={mobileCatalogue === 'offer'}
        >
          <div className="trade-builder__player-heading">
            <span aria-hidden="true" className="trade-builder__player-mark">
              <UserCircle size={25} weight="duotone" />
            </span>
            <div>
              <h2 id="trade-self-catalogue-title">{selfPlayerName}</h2>
              <p>Your collection</p>
            </div>
          </div>
          <SearchField
            label="Search your cards"
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
            <span aria-hidden="true" className="trade-builder__player-mark">
              <UserCircle size={25} weight="duotone" />
            </span>
            <div>
              <h2 id="trade-recipient-catalogue-title">
                {recipientPlayerName}
              </h2>
              <p>Active cards to request</p>
            </div>
          </div>
          <p className="trade-builder__catalogue-note">
            Choose any active card type. {recipientPlayerName}’s collection
            stays private.
          </p>
          <SearchField
            label="Search cards to request"
            onChange={onCatalogueSearch}
            value={catalogueSearch}
          />
          <div className="trade-builder__catalogue-scroll">
            <NewTradeCataloguePicker
              definitions={catalogue}
              maximumReached={requestedCount >= maximum}
              onChange={onRequestChange}
              requests={requestedDefinitions}
              search={catalogueSearch}
            />
          </div>
        </section>
      </div>
    </section>
  );
}

interface TradeReceiptItem {
  card: TradeCardDetail;
  quantity: number;
}

function TradeReceiptLane({
  caption,
  count,
  empty,
  id,
  items,
  maximum,
  title,
  tone,
}: {
  caption: string;
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
          <span>{caption}</span>
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

function TradeCardThumbnail({
  card,
  fullFrame = false,
}: {
  card: TradeCardDetail;
  fullFrame?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tilt = useCardTilt<HTMLButtonElement>();

  return (
    <>
      <button
        {...tilt}
        aria-haspopup="dialog"
        aria-label={`View ${card.name} details`}
        className={`trade-card-thumbnail${fullFrame ? ' trade-card-thumbnail--full' : ''}`}
        onClick={() => setDetailsOpen(true)}
        type="button"
      >
        <CardArtwork card={card} showRarity />
      </button>
      {detailsOpen ? (
        <TradeCardDetailsDialog
          card={card}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </>
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

function SearchField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="trade-search">
      <span className="sr-only">{label}</span>
      <MagnifyingGlass aria-hidden="true" size={20} />
      <input
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        type="search"
        value={value}
      />
    </label>
  );
}

function OwnedCopyPicker({
  copies,
  maximumReached,
  onToggle,
  search,
  selected,
}: {
  copies: TradeSelectionCopy[];
  maximumReached: boolean;
  onToggle: (ownedCardId: string) => void;
  search: string;
  selected: Set<string>;
}) {
  const visible = copies.filter((copy) =>
    copy.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (visible.length === 0) {
    return (
      <p className="trade-picker-empty">No owned copies match this search.</p>
    );
  }
  return (
    <ul
      aria-label="Owned copies available for trade"
      className="trade-card-picker"
    >
      {visible.map((copy) => {
        const checked = selected.has(copy.ownedCardId);
        const available =
          copy.availability === 'available' ||
          copy.availability === 'selected_here';
        const disabled = !checked && (!available || maximumReached);
        return (
          <li key={copy.ownedCardId}>
            <button
              aria-pressed={checked}
              className="trade-picker-card"
              disabled={disabled}
              onClick={() => onToggle(copy.ownedCardId)}
              type="button"
            >
              <CardArtwork card={copy} showRarity />
              <span className="trade-picker-card__body">
                <strong>{copy.name}</strong>
                <span>
                  {titleCase(copy.category)} · {titleCase(copy.rarity)}
                </span>
                {!available ? (
                  <small>
                    <LockSimple aria-hidden="true" size={15} />{' '}
                    {availabilityCopy(copy.availability)}
                  </small>
                ) : checked ? (
                  <small>
                    <Check aria-hidden="true" size={15} /> Selected exact copy
                  </small>
                ) : (
                  <small>Available to select</small>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
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
      <p className="trade-picker-empty">No card types match this search.</p>
    );
  }
  const visibleCopyCount = visibleGroups.reduce(
    (total, group) => total + group.copies.length,
    0,
  );
  return (
    <>
      <p className="trade-picker-results" role="status">
        {visibleGroups.length}{' '}
        {visibleGroups.length === 1 ? 'card type' : 'card types'} ·{' '}
        {visibleCopyCount} {visibleCopyCount === 1 ? 'copy' : 'copies'}
      </p>
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
                  {group.copies.length} owned · {tradableCount} tradable
                  {selectedCopies.length > 0
                    ? ` · ${selectedCopies.length} selected`
                    : ''}
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
  definitions: TradeCardDefinition[];
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
        No active card definitions match this search.
      </p>
    );
  }
  return (
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
          <li key={definition.cardDefinitionId}>
            <CardArtwork card={definition} showRarity />
            <div className="trade-catalogue-card__body">
              <strong>{definition.name}</strong>
              <span>
                {titleCase(definition.category)} ·{' '}
                {titleCase(definition.rarity)}
              </span>
            </div>
            <div
              className="trade-quantity"
              aria-label={`${definition.name} requested quantity`}
            >
              <button
                aria-label={`Request one fewer ${definition.name}`}
                disabled={quantity === 0}
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
          </li>
        );
      })}
    </ul>
  );
}

function NewTradeCataloguePicker({
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
        No active card definitions match this search.
      </p>
    );
  }
  return (
    <>
      <p className="trade-picker-results" role="status">
        {visible.length} active{' '}
        {visible.length === 1 ? 'card type' : 'card types'}
      </p>
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

function StepActions({
  back,
  disableBack = false,
  next,
  nextLabel,
}: {
  back: () => void;
  disableBack?: boolean;
  next: () => void;
  nextLabel: string;
}) {
  return (
    <div className="trade-editor-actions">
      <button
        className="button button--quiet"
        disabled={disableBack}
        onClick={back}
        type="button"
      >
        Back
      </button>
      <button className="button" onClick={next} type="button">
        {nextLabel}
      </button>
    </div>
  );
}

function ReviewCopyList({ copies }: { copies: TradeSelectionCopy[] }) {
  return (
    <section className="trade-request-list">
      <h3>You give</h3>
      <ul>
        {copies.map((copy) => (
          <li key={copy.ownedCardId}>
            <CardArtwork card={copy} showRarity />
            <div>
              <strong>{copy.name}</strong>
              <span>{titleCase(copy.rarity)} exact copy</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
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
