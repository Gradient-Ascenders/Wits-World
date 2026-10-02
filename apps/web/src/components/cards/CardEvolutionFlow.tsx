import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, LockKey, Stack } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';

import {
  CardApiError,
  evolveCards,
  previewCardEvolution,
  type CardEvolutionPreview,
  type CardEvolutionResult,
  type CardPresentation,
  type OwnedCard,
} from '../../api/cards';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { useAccessibilityPreferences } from '../../accessibility/preferences';
import { LoadingState } from '../LoadingState';
import { CardArtwork, CollectibleCard } from './CollectibleCard';
import { CardPresentationDialog } from './CardPresentationDialog';
import { useCardTilt } from './useCardTilt';
import { StateIcon, StatusMessage } from '../StatusMessage';

type PreviewState =
  | { status: 'loading' }
  | { status: 'not-available' }
  | { error: CardApiError; status: 'error' }
  | { preview: CardEvolutionPreview; status: 'ready' };

interface CardEvolutionFlowProps {
  actionContainer: HTMLDivElement | null;
  apiBaseUrl: string;
  card: OwnedCard;
  copies: readonly OwnedCard[];
  getAccessToken: ApiAccessTokenProvider;
  onApplyResult: (result: CardEvolutionResult) => void;
  onBusyChange: (busy: boolean) => void;
  onRefreshCollection: () => Promise<void>;
  initialPreview: CardEvolutionPreview;
  collectionCards: OwnedCard[];
  onClose: () => void;
}

export function CardEvolutionFlow({
  actionContainer,
  apiBaseUrl,
  card,
  getAccessToken,
  onApplyResult,
  onBusyChange,
  onRefreshCollection,
  initialPreview,
  collectionCards,
  onClose,
}: CardEvolutionFlowProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: 'ready',
    preview: initialPreview,
  });
  const [stage, setStage] = useState<'details' | 'confirm' | 'success'>(
    'details',
  );
  const [mutationError, setMutationError] = useState<CardApiError | null>(null);
  const [result, setResult] = useState<CardEvolutionResult | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const previewRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const submissionId = useRef(crypto.randomUUID());
  const confirmationHeading = useRef<HTMLHeadingElement | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const errorNotice = useRef<HTMLDivElement | null>(null);
  const submissionLocked = useRef(false);

  async function refreshResultCollection() {
    setIsRefreshing(true);
    setRefreshFailed(false);
    try {
      await onRefreshCollection();
    } catch {
      setRefreshFailed(true);
    } finally {
      setIsRefreshing(false);
    }
  }

  const loadPreview = useCallback(async () => {
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewState({ status: 'loading' });

    try {
      const preview = await previewCardEvolution({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
        sourceCardDefinitionId: card.cardDefinitionId,
      });

      if (!controller.signal.aborted) {
        setPreviewState({ preview, status: 'ready' });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const cardError = toCardApiError(error);
      setPreviewState(
        cardError.failure === 'evolution-not-available'
          ? { status: 'not-available' }
          : { error: cardError, status: 'error' },
      );
    } finally {
      if (previewRequest.current === controller) {
        previewRequest.current = null;
      }
    }
  }, [apiBaseUrl, card.cardDefinitionId, getAccessToken]);

  useEffect(() => {
    return () => {
      previewRequest.current?.abort();
      mutationRequest.current?.abort();
    };
  }, [loadPreview]);

  useEffect(() => {
    onBusyChange(isSubmitting || stage === 'confirm');
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange, stage]);

  useEffect(() => {
    if (stage === 'confirm') confirmationHeading.current?.focus();
    if (stage === 'success') resultHeading.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (mutationError) errorNotice.current?.focus();
  }, [mutationError, previewState.status, stage]);

  async function confirmEvolution() {
    if (
      submissionLocked.current ||
      previewState.status !== 'ready' ||
      !previewState.preview.canEvolve
    )
      return;

    submissionLocked.current = true;
    setMutationError(null);
    setIsSubmitting(true);
    const controller = new AbortController();
    mutationRequest.current = controller;

    try {
      const evolutionResult = await evolveCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
        sourceCardDefinitionId: card.cardDefinitionId,
        submissionId: submissionId.current,
      });

      if (controller.signal.aborted) return;

      onApplyResult(evolutionResult);
      setResult(evolutionResult);
      setStage('success');
      setIsSubmitting(false);
      await refreshResultCollection();
    } catch (error) {
      if (controller.signal.aborted) return;
      const cardError = toCardApiError(error);
      setMutationError(cardError);

      if (isStaleEvolutionError(cardError)) {
        await Promise.allSettled([loadPreview(), refreshResultCollection()]);
        if (!controller.signal.aborted) {
          setStage('details');
        }
      }
    } finally {
      if (mutationRequest.current === controller) {
        mutationRequest.current = null;
        submissionLocked.current = false;
        if (!controller.signal.aborted) setIsSubmitting(false);
      }
    }
  }

  if (stage === 'success' && result) {
    return (
      <section
        aria-labelledby="evolution-result-title"
        className="evolution-result"
      >
        <h2 id="evolution-result-title" ref={resultHeading} tabIndex={-1}>
          Evolution complete
        </h2>
        <EvolutionReveal source={initialPreview.source} result={result} />
        <p className="evolution-result__quantity">
          {
            collectionCards.filter(
              (copy) =>
                copy.cardDefinitionId === result.newCard.cardDefinitionId,
            ).length
          }{' '}
          <span className="sr-only">{result.newCard.name} copies </span>
          in collection
        </p>
        <div className="evolution-result__receipt">
          <dl aria-label="Evolution exchange">
            <div>
              <dt>Used</dt>
              <dd>
                {result.consumedOwnedCardIds.length} × {card.name}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>1 × {result.newCard.name}</dd>
            </div>
          </dl>
          <ArrowRight size={20} aria-hidden="true" />
        </div>
        <StatusMessage
          tone={isRefreshing ? 'info' : refreshFailed ? 'error' : 'success'}
        >
          <p>
            {isRefreshing
              ? 'Updating collection…'
              : refreshFailed
                ? 'Card evolved. Could not refresh your collection. Try again.'
                : 'Collection updated'}
          </p>
          {refreshFailed ? (
            <button
              className="button button--quiet"
              type="button"
              onClick={() => void refreshResultCollection()}
            >
              Refresh collection
            </button>
          ) : null}
        </StatusMessage>
        {actionContainer
          ? createPortal(
              <div className="evolution-action-bar">
                <button className="button" type="button" onClick={onClose}>
                  Back to evolutions
                </button>
              </div>,
              actionContainer,
            )
          : null}
      </section>
    );
  }

  function cancelConfirmation() {
    if (submissionLocked.current) return;
    setMutationError(null);
    setStage('details');
    window.requestAnimationFrame(() => reviewButton.current?.focus());
  }

  let confirmation: ReactElement | null = null;
  if (stage === 'confirm' && previewState.status === 'ready') {
    const { preview } = previewState;
    const remainingCopies = preview.ownedCopyCount - preview.copiesRequired;
    const retryBlocked = mutationError
      ? isNonRetryableEvolutionError(mutationError)
      : false;

    confirmation = (
      <div
        className="evolution-confirmation-backdrop"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelConfirmation();
          }
        }}
      >
        <section
          role="alertdialog"
          aria-modal="true"
          aria-describedby="evolution-confirmation-description"
          aria-busy={isSubmitting}
          aria-labelledby="evolution-confirmation-title"
          className="evolution-confirmation"
        >
          <h2
            id="evolution-confirmation-title"
            ref={confirmationHeading}
            tabIndex={-1}
          >
            Are you sure you want to evolve {preview.source.name}?
          </h2>
          <p
            id="evolution-confirmation-description"
            className="evolution-confirmation__summary"
          >
            This will use {preview.copiesRequired} copies of{' '}
            {preview.source.name} to create 1 {preview.target.name}.
          </p>
          <p>
            {remainingCopies} {preview.source.name}{' '}
            {remainingCopies === 1 ? 'copy' : 'copies'} will remain.
          </p>
          <p>This cannot be undone.</p>

          {mutationError ? (
            <EvolutionError error={mutationError} noticeRef={errorNotice} />
          ) : null}

          <div className="evolution-action-bar">
            {isSubmitting ? <p role="status">Evolving your card…</p> : null}
            <div className="evolution-confirmation__actions">
              <button
                className="button button--quiet"
                disabled={isSubmitting}
                onClick={cancelConfirmation}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button"
                disabled={isSubmitting || retryBlocked}
                onClick={() => void confirmEvolution()}
                type="button"
              >
                {isSubmitting ? 'Evolving…' : 'Evolve'}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <div
        className="evolution-preview"
        inert={stage === 'confirm'}
        aria-hidden={stage === 'confirm' ? true : undefined}
      >
        {previewState.status === 'loading' ? (
          <LoadingState label="Checking evolution availability…" />
        ) : previewState.status === 'error' ? (
          <StatusMessage tone="error" className="evolution-availability__error">
            {mutationError ? (
              <p>{evolutionErrorMessage(mutationError)}</p>
            ) : null}
            <p>Evolution availability could not be loaded.</p>
            <button
              className="button button--quiet"
              onClick={() => void loadPreview()}
              type="button"
            >
              Try again
            </button>
          </StatusMessage>
        ) : previewState.status === 'ready' ? (
          <>
            <h2 className="evolution-title">
              Evolve {previewState.preview.source.name}
            </h2>
            <EvolutionComposition preview={previewState.preview} />
            <EvolutionAvailability
              confirming={stage === 'confirm'}
              actionContainer={actionContainer}
              mutationError={stage === 'confirm' ? null : mutationError}
              noticeRef={errorNotice}
              onReview={() => {
                setMutationError(null);
                setStage('confirm');
              }}
              onRefresh={() =>
                void Promise.allSettled([loadPreview(), onRefreshCollection()])
              }
              preview={previewState.preview}
              reviewButton={reviewButton}
            />
          </>
        ) : mutationError ? (
          <EvolutionError error={mutationError} noticeRef={errorNotice} />
        ) : (
          <p>This evolution is no longer available.</p>
        )}
        {refreshFailed ? (
          <StatusMessage tone="error">
            <p>Your collection could not be refreshed.</p>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => void refreshResultCollection()}
            >
              Refresh collection
            </button>
          </StatusMessage>
        ) : null}
      </div>
      {confirmation}
    </>
  );
}

function EvolutionComposition({ preview }: { preview: CardEvolutionPreview }) {
  return (
    <div
      className="evolution-preview__composition"
      aria-label="Evolution preview"
    >
      <div className="evolution-preview__target">
        <CollectibleCard
          card={preview.target}
          artwork={<EvolutionCardInspection card={preview.target} />}
          showStats={false}
          showOwnership={false}
          showDetails={false}
          headingLevel={3}
        />
      </div>
      <EvolutionConvergence />
      <div className="evolution-preview__sources">
        <SourceCopies preview={preview} />
        <h3>{preview.source.name}</h3>
      </div>
    </div>
  );
}

function EvolutionCardInspection({ card }: { card: CardPresentation }) {
  const tilt = useCardTilt<HTMLButtonElement>();
  const [detailsOpen, setDetailsOpen] = useState(false);

  function inspect() {
    tilt.ref.current?.focus();
    setDetailsOpen(true);
  }

  return (
    <>
      <div className="collectible-card__art-perspective">
        <button
          {...tilt}
          aria-label={`View ${card.name} details`}
          aria-haspopup="dialog"
          className="collectible-card__tilting-art evolution-card-inspection__button"
          onClick={inspect}
          type="button"
        >
          <CardArtwork card={card} showRarity />
        </button>
      </div>
      {detailsOpen ? (
        <CardPresentationDialog
          card={card}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </>
  );
}

function EvolutionConvergence() {
  return (
    <div className="evolution-convergence" aria-hidden="true">
      <svg viewBox="0 0 256 128" preserveAspectRatio="none" fill="none">
        <path
          d="M32 124C32 78 128 80 128 4M128 124V4M224 124C224 78 128 80 128 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="evolution-convergence__head" />
      <span className="evolution-convergence__endpoint evolution-convergence__endpoint--left" />
      <span className="evolution-convergence__endpoint evolution-convergence__endpoint--centre" />
      <span className="evolution-convergence__endpoint evolution-convergence__endpoint--right" />
    </div>
  );
}

function SourceCopies({ preview }: { preview: CardEvolutionPreview }) {
  return (
    <div
      className="evolution-source-copies"
      aria-label={`${preview.copiesRequired} source copies required`}
    >
      {Array.from({ length: preview.copiesRequired }, (_, index) => (
        <div
          key={index}
          className={`evolution-source-copy${index >= preview.eligibleCopyCount ? ' evolution-source-copy--missing' : ''}`}
        >
          <CardArtwork
            card={preview.source}
            showRarity
            nameplate={<span>{index + 1}</span>}
          />
          {index >= preview.eligibleCopyCount ? <span>Needed</span> : null}
        </div>
      ))}
    </div>
  );
}

function EvolutionReveal({
  source,
  result,
}: {
  source: CardEvolutionPreview['source'];
  result: CardEvolutionResult;
}) {
  const systemReducedMotion = useReducedMotion();
  const { motion: motionPreference } = useAccessibilityPreferences();
  const reducedMotion =
    motionPreference === 'reduce' ||
    (motionPreference === 'system' && Boolean(systemReducedMotion));
  return (
    <div
      className="evolution-reveal"
      data-testid="evolution-reveal"
      data-reduced-motion={Boolean(reducedMotion)}
    >
      {!reducedMotion ? (
        <div className="evolution-reveal__merge" aria-hidden="true">
          {result.consumedOwnedCardIds.map((id, index) => (
            <motion.div
              key={id}
              className="evolution-reveal__source"
              initial={{
                x: (index - 1) * 76,
                y: 180,
                rotate: (index - 1) * 9,
                opacity: 1,
              }}
              animate={{
                x: [(index - 1) * 76, (index - 1) * 76, 0, 0],
                y: [180, 180, 0, -24],
                rotate: [(index - 1) * 9, 0, 0, 0],
                scale: [1, 1, 0.8, 0.65],
                opacity: [1, 1, 1, 0],
              }}
              transition={{
                duration: 0.85,
                times: [0, 0.2, 0.75, 1],
                ease: 'easeInOut',
              }}
            >
              <CardArtwork card={source} nameplate={<span>{index + 1}</span>} />
            </motion.div>
          ))}
          <motion.div
            className="evolution-reveal__light"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.45, 0], scale: [0.5, 1.1, 1.25] }}
            transition={{ duration: 0.8, delay: 0.35 }}
          />
        </div>
      ) : null}
      <motion.div
        className="evolution-reveal__card"
        initial={
          reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: 16 }
        }
        animate={
          reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
        }
        transition={{
          duration: reducedMotion ? 0.18 : 0.65,
          delay: reducedMotion ? 0 : 0.8,
          ease: 'easeOut',
        }}
      >
        <CollectibleCard
          card={result.newCard}
          artwork={<EvolutionCardInspection card={result.newCard} />}
          headingLevel={3}
          showStats={false}
          showOwnership={false}
          showDetails={false}
        />
      </motion.div>
    </div>
  );
}

function EvolutionAvailability({
  actionContainer,
  confirming,
  mutationError,
  noticeRef,
  onReview,
  onRefresh,
  preview,
  reviewButton,
}: {
  actionContainer: HTMLDivElement | null;
  confirming: boolean;
  mutationError: CardApiError | null;
  noticeRef: React.RefObject<HTMLDivElement | null>;
  onReview: () => void;
  onRefresh: () => void;
  preview: CardEvolutionPreview;
  reviewButton: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section
      aria-labelledby="evolution-availability-title"
      className="evolution-availability"
    >
      <h3 id="evolution-availability-title" className="sr-only">
        Copy availability
      </h3>

      {preview.deckLockedCopyCount > 0 ? (
        <p className="evolution-lock-note">
          <LockKey size={20} aria-hidden="true" />
          Deck copies stay protected. Remove them from all saved decks to use
          them.
        </p>
      ) : null}
      {preview.tradeReservedCopyCount > 0 ? (
        <p className="evolution-lock-note">
          Trade copies stay reserved. End the offer to use them.
        </p>
      ) : null}

      {mutationError ? (
        <>
          <EvolutionError error={mutationError} noticeRef={noticeRef} />
          <button
            className="button button--quiet"
            type="button"
            onClick={onRefresh}
          >
            Refresh availability
          </button>
        </>
      ) : null}

      {actionContainer
        ? createPortal(
            <div
              className="evolution-action-bar"
              inert={confirming}
              aria-hidden={confirming ? true : undefined}
            >
              {preview.ownedCopyCount !== preview.eligibleCopyCount ||
              !preview.canEvolve ? (
                <dl className="evolution-quantity-summary">
                  <div>
                    <dt>
                      <Stack size={16} aria-hidden="true" /> Owned
                    </dt>
                    <dd>{preview.ownedCopyCount}</dd>
                  </div>
                  <div>
                    <dt>Available</dt>
                    <dd>{preview.eligibleCopyCount}</dd>
                  </div>
                  {preview.deckLockedCopyCount > 0 ? (
                    <div>
                      <dt>
                        <LockKey size={16} aria-hidden="true" /> In decks
                      </dt>
                      <dd>{preview.deckLockedCopyCount}</dd>
                    </div>
                  ) : null}
                  {preview.tradeReservedCopyCount > 0 ? (
                    <div>
                      <dt>Reserved for trade</dt>
                      <dd>{preview.tradeReservedCopyCount}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <p className="evolution-availability__guidance">
                {preview.canEvolve
                  ? `Uses ${preview.copiesRequired} copies · ${preview.ownedCopyCount - preview.copiesRequired} remain`
                  : evolutionAvailabilityMessage(preview)}
              </p>
              <button
                className="button"
                disabled={!preview.canEvolve}
                onClick={onReview}
                ref={reviewButton}
                type="button"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M4 21v-4c0-4 8-4 8-9M12 21V3M20 21v-4c0-4-8-4-8-9M8 7l4-4 4 4" />
                </svg>
                Evolve
              </button>
            </div>,
            actionContainer,
          )
        : null}
    </section>
  );
}

function EvolutionError({
  error,
  noticeRef,
}: {
  error: CardApiError;
  noticeRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="evolution-error state-message state-message--error"
      ref={noticeRef}
      role="alert"
      tabIndex={-1}
    >
      <StateIcon tone="error" />
      <strong>
        {isStaleEvolutionError(error)
          ? 'Your collection changed'
          : 'Evolution needs attention'}
      </strong>
      <p>{evolutionErrorMessage(error)}</p>
      {error.requestId ? (
        <details className="evolution-error__support">
          <summary>Support details</summary>
          <small>Support reference: {error.requestId}</small>
        </details>
      ) : null}
    </div>
  );
}

function evolutionAvailabilityMessage(preview: CardEvolutionPreview) {
  if (preview.canEvolve) {
    const remaining = preview.ownedCopyCount - preview.copiesRequired;
    return `${remaining} ${preview.source.name} ${remaining === 1 ? 'copy will' : 'copies will'} remain.`;
  }
  const needed = preview.copiesRequired - preview.eligibleCopyCount;
  if (
    preview.unavailableReason === 'saved_deck_lock' ||
    preview.unavailableReason === 'trade_reservation'
  ) {
    return `You need ${needed} more available ${needed === 1 ? 'copy' : 'copies'}.`;
  }
  return `Collect ${needed} more to evolve.`;
}

function evolutionErrorMessage(error: CardApiError) {
  switch (error.failure) {
    case 'evolution-deck-locked':
      return 'Your saved decks changed, so this preview is no longer valid. No evolution was completed. Review availability and try again.';
    case 'evolution-trade-reserved':
      return 'A copy is now reserved for trade, so this preview is no longer valid. No evolution was completed. Review availability and try again.';
    case 'evolution-insufficient-copies':
      return 'Your collection changed before confirmation, so this preview is no longer valid. No evolution was completed. Review availability and try again.';
    case 'evolution-not-available':
      return 'This evolution is no longer available.';
    case 'evolution-replay-conflict':
      return 'This confirmation could not be safely reused. Close the card and start a new evolution.';
    case 'authorization':
      return 'Your session expired before evolution could finish. Sign in again and check your collection.';
    case 'account-unavailable':
      return 'This account cannot evolve cards.';
    default:
      return 'Evolution could not be completed. Check your connection and try this confirmation again.';
  }
}

function isStaleEvolutionError(error: CardApiError) {
  return (
    error.failure === 'evolution-deck-locked' ||
    error.failure === 'evolution-trade-reserved' ||
    error.failure === 'evolution-insufficient-copies' ||
    error.failure === 'evolution-not-available'
  );
}

function isNonRetryableEvolutionError(error: CardApiError) {
  return (
    error.failure === 'account-unavailable' ||
    error.failure === 'authorization' ||
    error.failure === 'evolution-replay-conflict'
  );
}

function toCardApiError(error: unknown) {
  return error instanceof CardApiError
    ? error
    : new CardApiError('unavailable');
}
