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
import { CardDetailModal } from './CardDetailModal';
import { CardArtwork } from './CollectibleCard';
import { StatusMessage } from '../StatusMessage';
import { QuestMarker } from '../branding/QuestMarker';

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

  return (
    <section
      className="collection-evolutions"
      aria-labelledby="collection-evolutions-title"
    >
      <header className="collection-evolutions__intro">
        <h2
          className="sr-only"
          id="collection-evolutions-title"
          ref={heading}
          tabIndex={-1}
        >
          Evolution candidates
        </h2>
        <p>Copies used in saved decks stay protected.</p>
      </header>
      {loading || loadedSnapshot.current?.cards !== cards ? (
        <p role={selected ? undefined : 'status'}>
          <QuestMarker />
          Checking your evolutions…
        </p>
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
                  <CardArtwork
                    card={card}
                    nameplate={<span>{card.name}</span>}
                  />
                </div>
                <div className="evolution-candidate__info">
                  <p
                    className={`evolution-candidate__state${preview?.canEvolve ? ' evolution-candidate__state--ready' : ''}`}
                  >
                    {preview
                      ? preview.canEvolve
                        ? 'Ready to evolve'
                        : preview.unavailableReason === 'saved_deck_lock'
                          ? 'Copies locked in decks'
                          : 'Not enough copies'
                      : unavailable
                        ? 'Evolved card'
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
                          {preview.eligibleCopyCount} / {preview.copiesRequired}
                        </strong>{' '}
                        eligible copies
                      </p>
                      <p className="evolution-candidate__counts">
                        {preview.ownedCopyCount} owned ·{' '}
                        {preview.eligibleCopyCount} available
                      </p>
                      {preview.deckLockedCopyCount > 0 ? (
                        <p className="evolution-candidate__counts">
                          <LockKey size={16} aria-hidden="true" />{' '}
                          {preview.deckLockedCopyCount} used in a deck
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
                  ) : (
                    <p>
                      {unavailable
                        ? 'No further evolution is currently available.'
                        : failed
                          ? 'We could not check this card. Try again to see its evolution availability.'
                          : ''}
                    </p>
                  )}
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
    </section>
  );
}
