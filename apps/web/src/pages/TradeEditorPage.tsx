import {
  ArrowLeft,
  Check,
  LockSimple,
  MagnifyingGlass,
  Minus,
  Plus,
  WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  type TradeSelectionAvailability,
  type TradeSelectionCopy,
  type TradeSelectionPreview,
} from '../api/trades';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { useUnsavedAuthorChanges } from '../components/author/AuthorNavigationGuard';
import { CardArtwork } from '../components/cards/CollectibleCard';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import { PageLoadingState } from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import {
  RequestedCardList,
  TradeComparison,
} from '../components/trades/TradeComparison';
import { TradeConfirmationDialog } from '../components/trades/TradeConfirmationDialog';
import './trades.css';

type EditorState =
  | { status: 'loading' }
  | {
      catalogue: TradeCardDefinition[];
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
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
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
          {!state.preview.valid ? (
            <PreviewIssues preview={state.preview} />
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

function PreviewIssues({ preview }: { preview: TradeSelectionPreview }) {
  return (
    <div className="trade-preview-issues" role="status">
      <strong>Resolve these before publishing:</strong>
      <ul>
        {preview.issues.map((issue) => (
          <li key={issue}>{issueCopy(issue)}</li>
        ))}
      </ul>
    </div>
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

function issueCopy(issue: TradeSelectionPreview['issues'][number]) {
  return issue === 'offer_required'
    ? 'Select at least one owned copy to give.'
    : issue === 'request_required'
      ? 'Request at least one card definition.'
      : issue === 'copy_limit'
        ? 'Reduce the number of owned copies selected.'
        : issue === 'request_limit'
          ? 'Reduce the total requested quantity.'
          : issue === 'unavailable_copy'
            ? 'Remove any copy that is no longer available.'
            : issue === 'definition_unavailable'
              ? 'Remove any card definition that is no longer active.'
              : 'Adjust the exchange so your resulting collection keeps the required Creature and Power minimums.';
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
