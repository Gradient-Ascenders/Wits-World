import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsMerge, LockKey, Stack } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';

import {
  CardApiError,
  evolveCards,
  previewCardEvolution,
  type CardEvolutionPreview,
  type CardEvolutionResult,
  type OwnedCard,
} from '../../api/cards';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { useAccessibilityPreferences } from '../../accessibility/preferences';
import { LoadingState } from '../LoadingState';
import { CardArtwork, CollectibleCard } from './CollectibleCard';
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
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

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
        <p className="evolution-result__receipt">
          {result.consumedOwnedCardIds.length} × {card.name} consumed. 1 ×{' '}
          {result.newCard.name} created.
        </p>
        <p className="evolution-result__quantity">
          {
            collectionCards.filter(
              (copy) =>
                copy.cardDefinitionId === result.newCard.cardDefinitionId,
            ).length
          }{' '}
          × {result.newCard.name} now in your collection
        </p>
        <StatusMessage tone={refreshFailed ? 'error' : 'success'}>
          <p>
            {isRefreshing
              ? 'Refreshing your collection…'
              : refreshFailed
                ? 'Card evolved. Could not refresh your collection. Try again.'
                : 'Your collection is up to date.'}
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

  if (stage === 'confirm' && previewState.status === 'ready') {
    const { preview } = previewState;
    const remainingCopies = preview.ownedCopyCount - preview.copiesRequired;
    const retryBlocked = mutationError
      ? isNonRetryableEvolutionError(mutationError)
      : false;

    return (
      <section
        aria-busy={isSubmitting}
        aria-labelledby="evolution-confirmation-title"
        className="evolution-confirmation"
      >
        <h2
          id="evolution-confirmation-title"
          ref={confirmationHeading}
          tabIndex={-1}
        >
          Combine {preview.copiesRequired} copies of {preview.source.name} into{' '}
          {preview.target.name}?
        </h2>
        <p>This cannot be undone.</p>

        <EvolutionComposition preview={preview} confirming />

        {mutationError ? (
          <EvolutionError error={mutationError} noticeRef={errorNotice} />
        ) : null}

        {actionContainer
          ? createPortal(
              <div className="evolution-action-bar">
                <dl className="evolution-quantity-summary">
                  <div>
                    <dt>{preview.source.name} remaining</dt>
                    <dd>
                      {remainingCopies}{' '}
                      {remainingCopies === 1 ? 'copy' : 'copies'}
                    </dd>
                  </div>
                  {preview.deckLockedCopyCount > 0 ? (
                    <div>
                      <dt>Protected in decks</dt>
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
                {isSubmitting ? <p role="status">Evolving your card…</p> : null}
                <div className="evolution-confirmation__actions">
                  <button
                    className="button button--quiet"
                    disabled={isSubmitting}
                    onClick={() => {
                      setMutationError(null);
                      setStage('details');
                      window.requestAnimationFrame(() =>
                        reviewButton.current?.focus(),
                      );
                    }}
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
                    {isSubmitting ? 'Evolving…' : 'Evolve card'}
                  </button>
                </div>
              </div>,
              actionContainer,
            )
          : null}
      </section>
    );
  }

  return (
    <>
      <div className="evolution-preview">
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
            <h2 className="evolution-title">Three become one</h2>
            <EvolutionComposition preview={previewState.preview} />
            <EvolutionAvailability
              actionContainer={actionContainer}
              mutationError={mutationError}
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
    </>
  );
}

function EvolutionComposition({
  preview,
  confirming = false,
}: {
  preview: CardEvolutionPreview;
  confirming?: boolean;
}) {
  return (
    <div
      className={`evolution-preview__composition${confirming ? ' evolution-preview__composition--confirm' : ''}`}
      aria-label={confirming ? 'Evolution recipe' : 'Evolution preview'}
    >
      <div className="evolution-preview__target">
        <p className="evolution-preview__label">
          <span>{confirming ? 'You receive 1 copy' : 'Preview'}</span>
          {' · '}
          <span className="evolution-preview__rarity">
            {preview.target.rarity}
          </span>
        </p>
        <CollectibleCard
          card={preview.target}
          showOwnership={false}
          showDetails={false}
          headingLevel={3}
        />
        {confirming ? (
          <p className="evolution-preview__deck-cost">
            {preview.target.deckPointCost} deck points
          </p>
        ) : null}
      </div>
      <EvolutionConvergence />
      <div className="evolution-preview__sources">
        <SourceCopies preview={preview} />
        <h3>{preview.source.name}</h3>
        {confirming ? (
          <p>Consumes {preview.copiesRequired} available copies</p>
        ) : null}
      </div>
    </div>
  );
}

function EvolutionConvergence() {
  return (
    <svg
      className="evolution-convergence"
      aria-hidden="true"
      width="256"
      height="32"
      viewBox="0 0 256 32"
      fill="none"
    >
      <path d="M32 28C32 16 128 24 128 4M128 28V4M224 28C224 16 128 24 128 4M123 9L128 4L133 9" />
      <circle cx="32" cy="28" r="1.5" />
      <circle cx="128" cy="28" r="1.5" />
      <circle cx="224" cy="28" r="1.5" />
    </svg>
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
        <p className="evolution-preview__label">
          Added to your collection ·{' '}
          <span className="evolution-preview__rarity">
            {result.newCard.rarity}
          </span>
        </p>
        <CollectibleCard
          card={result.newCard}
          headingLevel={3}
          showOwnership={false}
          showDetails={false}
        />
      </motion.div>
    </div>
  );
}

function EvolutionAvailability({
  actionContainer,
  mutationError,
  noticeRef,
  onReview,
  onRefresh,
  preview,
  reviewButton,
}: {
  actionContainer: HTMLDivElement | null;
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
            <div className="evolution-action-bar">
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
              <p className="evolution-availability__guidance">
                {preview.canEvolve ? (
                  <span>Uses {preview.copiesRequired} copies. </span>
                ) : null}
                {evolutionAvailabilityMessage(preview)}
              </p>
              <button
                className="button"
                disabled={!preview.canEvolve}
                onClick={onReview}
                ref={reviewButton}
                type="button"
              >
                <ArrowsMerge size={20} aria-hidden="true" />
                Review evolution
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
