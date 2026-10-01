import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LockKey } from '@phosphor-icons/react';
import {
  CardApiError,
  previewCardEvolution,
  type CardEvolutionPreview,
  type CardEvolutionResult,
  type OwnedCard,
} from '../../api/cards';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { PageLoadingState } from '../LoadingState';
import { CardDetailModal } from './CardDetailModal';
import { CardPresentationDialog } from './CardPresentationDialog';
import { CardThumbnail } from './CollectibleCard';
import { StatusMessage } from '../StatusMessage';

type Candidate = {
  card: OwnedCard;
  preview?: CardEvolutionPreview;
  unavailable?: boolean;
  failed?: boolean;
};

export function CollectionEvolutions({
  apiBaseUrl,
  cards,
  getAccessToken,
  onApplyResult,
  onRefreshCollection,
}: {
  apiBaseUrl: string;
  cards: OwnedCard[];
  getAccessToken: ApiAccessTokenProvider;
  onApplyResult: (result: CardEvolutionResult) => void;
  onRefreshCollection: () => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [detailsCard, setDetailsCard] = useState<OwnedCard | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const loadedSnapshot = useRef<{
    cards: OwnedCard[];
    revision: number;
  } | null>(null);
  const definitions = useMemo(
    () => [
      ...new Map(cards.map((card) => [card.cardDefinitionId, card])).values(),
    ],
    [cards],
  );

  useEffect(() => {
    // Keep the focused transaction mounted while its authoritative collection changes.
    if (selected) return;
    if (
      loadedSnapshot.current?.cards === cards &&
      loadedSnapshot.current.revision === revision
    )
      return;
    const controller = new AbortController();
    setLoading(true);
    const pending = [...definitions];
    const loaded: Candidate[] = [];
    async function worker() {
      while (pending.length && !controller.signal.aborted) {
        const card = pending.shift()!;
        try {
          const preview = await previewCardEvolution({
            apiBaseUrl,
            getAccessToken,
            signal: controller.signal,
            sourceCardDefinitionId: card.cardDefinitionId,
          });
          loaded.push({ card, preview });
        } catch (error) {
          if (
            error instanceof CardApiError &&
            error.failure === 'evolution-not-available'
          ) {
            if (
              cards.some(
                (copy) =>
                  copy.cardDefinitionId === card.cardDefinitionId &&
                  copy.acquisitionKind === 'evolution',
              )
            )
              loaded.push({ card, unavailable: true });
          } else loaded.push({ card, failed: true });
        }
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, worker),
    ).then(() => {
      if (controller.signal.aborted) return;
      loaded.sort(
        (a, b) =>
          Number(Boolean(b.preview?.canEvolve)) -
            Number(Boolean(a.preview?.canEvolve)) ||
          a.card.name.localeCompare(b.card.name),
      );
      setCandidates(loaded);
      loadedSnapshot.current = { cards, revision };
      setLoading(false);
    });
    return () => controller.abort();
  }, [apiBaseUrl, cards, definitions, getAccessToken, revision, selected]);

  function close() {
    setSelected(null);
    window.requestAnimationFrame(() =>
      (trigger.current?.isConnected
        ? trigger.current
        : heading.current
      )?.focus(),
    );
  }

  const isChecking = loading || loadedSnapshot.current?.cards !== cards;

  return (
    <>
      {!isChecking ? (
        <header className="collection-page__header">
          <h1>Evolutions</h1>
          <p className="lead">
            Combine three available copies into one evolved card.
          </p>
        </header>
      ) : null}
      <section
        className="collection-evolutions"
        aria-labelledby="collection-evolutions-title"
      >
        <h2
          className="sr-only"
          id="collection-evolutions-title"
          ref={heading}
          tabIndex={-1}
        >
          Evolution candidates
        </h2>
        {isChecking ? (
          <PageLoadingState
            announce={!selected}
            title="Loading your evolutions"
            description="Checking evolution paths…"
          />
        ) : (
          <>
            {candidates.length === 0 ? (
              <StatusMessage tone="empty">
                <p>No evolutions are available for your current cards.</p>
              </StatusMessage>
            ) : null}
            <ul
              className="evolution-candidates"
              aria-label="Evolution candidates"
            >
              {candidates.map(({ card, preview, unavailable, failed }) => (
                <li key={card.cardDefinitionId} className="evolution-candidate">
                  <div className="evolution-candidate__art">
                    <CardThumbnail
                      accessibleLabel={`View ${card.name} details`}
                      card={card}
                      onClick={() => setDetailsCard(card)}
                    />
                  </div>
                  <div className="evolution-candidate__info">
                    <p
                      className={`evolution-candidate__state${preview?.canEvolve ? ' evolution-candidate__state--ready' : ''}`}
                    >
                      {preview
                        ? preview.canEvolve
                          ? 'Ready to evolve'
                          : preview.unavailableReason === 'trade_reservation'
                            ? 'Copies reserved for trade'
                            : preview.unavailableReason === 'saved_deck_lock'
                              ? 'Copies locked in decks'
                              : 'Not enough copies'
                        : unavailable
                          ? 'No evolution available'
                          : 'Availability unknown'}
                    </p>
                    <h3>{card.name}</h3>
                    {preview ? (
                      <>
                        <p className="evolution-candidate__target">
                          <ArrowRight size={18} aria-hidden="true" />{' '}
                          {preview.target.name}{' '}
                          <span>· {preview.target.rarity}</span>
                        </p>
                        <p>
                          <strong>
                            {preview.eligibleCopyCount} /{' '}
                            {preview.copiesRequired}
                          </strong>{' '}
                          copies available
                        </p>
                        {preview.deckLockedCopyCount > 0 ? (
                          <p className="evolution-candidate__counts">
                            <LockKey size={16} aria-hidden="true" />{' '}
                            {preview.deckLockedCopyCount} used in a deck
                          </p>
                        ) : null}
                        {preview.tradeReservedCopyCount > 0 ? (
                          <p className="evolution-candidate__counts">
                            {preview.tradeReservedCopyCount} reserved for trade
                          </p>
                        ) : null}
                        <button
                          className="button button--quiet"
                          type="button"
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setSelected({ card, preview });
                          }}
                          aria-label={`Preview ${card.name} evolution`}
                        >
                          Preview evolution
                        </button>
                      </>
                    ) : failed ? (
                      <p>Could not check this card. Try again.</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {candidates.some((candidate) => candidate.failed) ? (
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Retry availability
              </button>
            ) : null}
          </>
        )}
        {selected?.preview ? (
          <CardDetailModal
            apiBaseUrl={apiBaseUrl}
            getAccessToken={getAccessToken}
            group={{
              card: selected.card,
              copies: cards.filter(
                (card) =>
                  card.cardDefinitionId === selected.card.cardDefinitionId,
              ),
            }}
            evolutionPreview={selected.preview}
            collectionCards={cards}
            onApplyEvolutionResult={onApplyResult}
            onRefreshCollection={onRefreshCollection}
            onClose={close}
          />
        ) : null}
        {detailsCard ? (
          <CardPresentationDialog
            card={detailsCard}
            onClose={() => setDetailsCard(null)}
          />
        ) : null}
      </section>
    </>
  );
}
