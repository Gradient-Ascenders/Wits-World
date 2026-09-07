import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowsMerge, LockKey, Stack } from '@phosphor-icons/react';

import {
  CardApiError,
  evolveCards,
  previewCardEvolution,
  type CardEvolutionPreview,
  type CardEvolutionResult,
  type OwnedCard,
} from '../../api/cards';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { CollectibleCard } from './CollectibleCard';
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
}

export function CardEvolutionFlow({
  actionContainer,
  apiBaseUrl,
  card,
  copies,
  getAccessToken,
  onApplyResult,
  onBusyChange,
  onRefreshCollection,
}: CardEvolutionFlowProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: 'loading',
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
    void loadPreview();
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
    if (isSubmitting || previewState.status !== 'ready') return;

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
      await refreshResultCollection();
    } catch (error) {
      if (controller.signal.aborted) return;
      const cardError = toCardApiError(error);
      setMutationError(cardError);

      if (isStaleEvolutionError(cardError)) {
        await Promise.allSettled([loadPreview(), onRefreshCollection()]);
        if (!controller.signal.aborted) {
          setStage('details');
        }
      }
    } finally {
      if (mutationRequest.current === controller) {
        mutationRequest.current = null;
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
        <p className="eyebrow">Evolution complete</p>
        <h2 id="evolution-result-title" ref={resultHeading} tabIndex={-1}>
          {result.newCard.name} joined your collection
        </h2>
        <p>
          {result.consumedOwnedCardIds.length} {card.name} copies were consumed
          to create 1 {result.newCard.name}. The consumed copies are no longer
          in your collection.
        </p>
        <CollectibleCard card={result.newCard} headingLevel={3} />
        <StatusMessage tone={refreshFailed ? 'error' : 'success'}>
          <p>
            {isRefreshing
              ? 'Evolution complete. Refreshing your collection…'
              : refreshFailed
                ? 'Evolution is complete, but your collection could not be refreshed. Your confirmed result is shown above.'
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
        <p className="eyebrow">Confirm evolution</p>
        <h2
          id="evolution-confirmation-title"
          ref={confirmationHeading}
          tabIndex={-1}
        >
          Evolve {card.name}?
        </h2>
        <p>
          Exchange {preview.copiesRequired} available copies for 1 evolved card.
          This cannot be undone.
        </p>

        <div className="evolution-recipe" aria-label="Evolution recipe">
          <div className="evolution-recipe__source">
            <span className="evolution-recipe__quantity">
              ×{preview.copiesRequired}
            </span>
            <strong>{preview.source.name}</strong>
            <span>Consumed</span>
          </div>
          <span aria-hidden="true" className="evolution-recipe__arrow">
            <ArrowRight size={24} />
          </span>
          <div className="evolution-recipe__target">
            <span className="evolution-recipe__quantity">×1</span>
            <strong>{preview.target.name}</strong>
            <span>You receive</span>
          </div>
        </div>

        <dl className="evolution-quantity-summary">
          <div>
            <dt>Consumed</dt>
            <dd>{preview.copiesRequired} available copies</dd>
          </div>
          <div>
            <dt>{preview.source.name} remaining</dt>
            <dd>
              {remainingCopies} {remainingCopies === 1 ? 'copy' : 'copies'}
            </dd>
          </div>
          {preview.deckLockedCopyCount > 0 ? (
            <div>
              <dt>Protected in decks</dt>
              <dd>{preview.deckLockedCopyCount}</dd>
            </div>
          ) : null}
        </dl>
        <p className="evolution-lock-note">
          <LockKey size={20} aria-hidden="true" />
          {preview.eligibleCopyCount} available · {preview.deckLockedCopyCount}{' '}
          in saved decks. Copies in decks will not be consumed.
        </p>

        <section
          aria-labelledby="evolution-target-title"
          className="evolution-target"
        >
          <div className="evolution-target__heading">
            <p className="eyebrow">You receive</p>
            <p>{preview.target.deckPointCost} deck points</p>
          </div>
          <h3 className="sr-only" id="evolution-target-title">
            Evolved card preview
          </h3>
          <CollectibleCard
            card={preview.target}
            headingLevel={3}
            showOwnership={false}
          />
        </section>

        {mutationError ? (
          <EvolutionError error={mutationError} noticeRef={errorNotice} />
        ) : null}

        {actionContainer
          ? createPortal(
              <div className="evolution-action-bar">
                <p>
                  Uses {preview.copiesRequired} copies · creates 1 evolved card
                </p>
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
                    className="button evolution-confirmation__confirm"
                    disabled={isSubmitting || retryBlocked}
                    onClick={() => void confirmEvolution()}
                    type="button"
                  >
                    {isSubmitting ? 'Evolving…' : 'Confirm evolution'}
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
      <CollectibleCard
        actions={
          previewState.status === 'loading' ? (
            <p aria-live="polite" role="status">
              Checking evolution availability…
            </p>
          ) : previewState.status === 'error' ? (
            <StatusMessage
              tone="error"
              className="evolution-availability__error"
            >
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
            <EvolutionAvailability
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
          ) : mutationError ? (
            <EvolutionError error={mutationError} noticeRef={errorNotice} />
          ) : undefined
        }
        card={card}
        headingLevel={2}
        ownedCopies={copies}
      />
    </>
  );
}

function EvolutionAvailability({
  mutationError,
  noticeRef,
  onReview,
  onRefresh,
  preview,
  reviewButton,
}: {
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
      <div className="evolution-availability__heading">
        <div>
          <p className="eyebrow">Duplicate evolution</p>
          <h3 id="evolution-availability-title">
            Evolve into {preview.target.name}
          </h3>
        </div>
        <span className="evolution-availability__rarity">
          {titleCase(preview.target.rarity)}
        </span>
      </div>

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
        <div>
          <dt>
            <LockKey size={16} aria-hidden="true" /> In decks
          </dt>
          <dd>{preview.deckLockedCopyCount}</dd>
        </div>
      </dl>

      {preview.deckLockedCopyCount > 0 ? (
        <p className="evolution-lock-note">
          <LockKey size={20} aria-hidden="true" />
          Copies in saved decks are protected. Remove them from every saved deck
          to make them available.
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

      <p className="evolution-availability__guidance">
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
          ? 'Preview no longer valid'
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
    return `Use ${preview.copiesRequired} available copies to evolve. ${preview.ownedCopyCount - preview.copiesRequired} ${preview.source.name} ${preview.ownedCopyCount - preview.copiesRequired === 1 ? 'copy stays' : 'copies stay'} in your collection.`;
  }
  if (preview.unavailableReason === 'saved_deck_lock') {
    return `${preview.copiesRequired} available copies are required. You need ${preview.copiesRequired - preview.eligibleCopyCount} more available ${preview.copiesRequired - preview.eligibleCopyCount === 1 ? 'copy' : 'copies'}. Remove ${preview.deckLockedCopyCount === 1 ? 'the locked copy' : 'locked copies'} from saved decks first.`;
  }
  return `${preview.copiesRequired} available copies are required. You currently have ${preview.eligibleCopyCount}. Collect ${preview.copiesRequired - preview.eligibleCopyCount} more to evolve.`;
}

function evolutionErrorMessage(error: CardApiError) {
  switch (error.failure) {
    case 'evolution-deck-locked':
      return 'Your saved decks changed, so this preview is no longer valid. No evolution was completed. Review availability and try again.';
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

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
