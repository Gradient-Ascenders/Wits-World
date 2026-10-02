import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  LockKey,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import {
  CardApiError,
  previewCardEvolution,
  type CardEvolutionPreview,
  type CardEvolutionResult,
  type CardRarity,
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

type AvailabilityFilter =
  'all' | 'ready' | 'not-ready' | 'unavailable' | 'failed';
const PAGE_SIZE = 6;

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
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('ready');
  const [rarity, setRarity] = useState<CardRarity | 'all'>('all');
  const [page, setPage] = useState(1);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const resultsHeading = useRef<HTMLParagraphElement | null>(null);
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
  const query = search.trim().toLocaleLowerCase();
  const filteredCandidates = candidates.filter((candidate) => {
    const matchesName =
      candidate.card.name.toLocaleLowerCase().includes(query) ||
      candidate.preview?.target.name.toLocaleLowerCase().includes(query);
    const matchesAvailability =
      availability === 'all' ||
      (availability === 'ready' && candidate.preview?.canEvolve === true) ||
      (availability === 'not-ready' &&
        candidate.preview?.canEvolve === false) ||
      (availability === 'unavailable' && candidate.unavailable) ||
      (availability === 'failed' && candidate.failed);
    return (
      matchesName &&
      matchesAvailability &&
      (rarity === 'all' || candidate.card.rarity === rarity)
    );
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCandidates.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageCandidates = filteredCandidates.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  );
  const hasFilters =
    search !== '' ||
    rarity !== 'all' ||
    (availability !== 'all' && availability !== 'ready');
  const onlyReadyFilter =
    query === '' && availability === 'ready' && rarity === 'all';

  function clearFilters() {
    setSearch('');
    setAvailability('all');
    setRarity('all');
    setPage(1);
    queueMicrotask(() => searchInput.current?.focus());
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    queueMicrotask(() => resultsHeading.current?.focus());
  }

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
            {candidates.length > 0 ? (
              <>
                <div
                  className="evolution-browse-controls"
                  role="search"
                  aria-label="Find an evolution"
                >
                  <label className="collection-control evolution-browse-controls__search">
                    <span className="sr-only">Search evolutions</span>
                    <span className="collection-search-field">
                      <MagnifyingGlass size={20} aria-hidden="true" />
                      <input
                        ref={searchInput}
                        type="search"
                        placeholder="Search card names"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPage(1);
                        }}
                      />
                    </span>
                  </label>
                  <label className="collection-control">
                    <span>Availability</span>
                    <select
                      value={availability}
                      onChange={(event) => {
                        setAvailability(
                          event.target.value as AvailabilityFilter,
                        );
                        setPage(1);
                      }}
                    >
                      <option value="all">All cards</option>
                      <option value="ready">Ready</option>
                      <option value="not-ready">Not ready</option>
                      <option value="unavailable">No evolution</option>
                      <option value="failed">Check failed</option>
                    </select>
                  </label>
                  <label className="collection-control">
                    <span>Rarity</span>
                    <select
                      value={rarity}
                      onChange={(event) => {
                        setRarity(event.target.value as CardRarity | 'all');
                        setPage(1);
                      }}
                    >
                      <option value="all">All rarities</option>
                      <option value="common">Common</option>
                      <option value="rare">Rare</option>
                      <option value="epic">Epic</option>
                      <option value="legendary">Legendary</option>
                    </select>
                  </label>
                </div>
                <div className="evolution-browse-navigation">
                  <p aria-live="polite" ref={resultsHeading} tabIndex={-1}>
                    {filteredCandidates.length > 0
                      ? `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredCandidates.length)} of ${filteredCandidates.length} cards`
                      : '0 matching cards'}
                  </p>
                  {hasFilters && filteredCandidates.length > 0 ? (
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  ) : null}
                  {totalPages > 1 ? (
                    <EvolutionPages
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onChange={changePage}
                      label="Evolution pages"
                    />
                  ) : null}
                </div>
              </>
            ) : null}
            {candidates.length === 0 ? (
              <StatusMessage tone="empty">
                <p>No evolutions are available for your current cards.</p>
              </StatusMessage>
            ) : null}
            {candidates.length > 0 && filteredCandidates.length === 0 ? (
              <StatusMessage tone="empty">
                <h3>
                  {onlyReadyFilter
                    ? 'No cards ready to evolve'
                    : 'No matching cards'}
                </h3>
                <p>
                  {onlyReadyFilter
                    ? 'Show all cards to check availability and copy requirements.'
                    : 'Try another name or clear your filters.'}
                </p>
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={clearFilters}
                >
                  {onlyReadyFilter ? 'Show all cards' : 'Clear filters'}
                </button>
              </StatusMessage>
            ) : null}
            <ul
              className="evolution-candidates"
              aria-label="Evolution candidates"
            >
              {pageCandidates.map(({ card, preview, unavailable, failed }) => (
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
            {totalPages > 1 ? (
              <div className="evolution-browse-navigation evolution-browse-navigation--bottom">
                <EvolutionPages
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onChange={changePage}
                  label="Evolution pages below cards"
                />
              </div>
            ) : null}
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

function EvolutionPages({
  currentPage,
  totalPages,
  onChange,
  label,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  return (
    <nav className="evolution-pages" aria-label={label}>
      <button
        className="button button--quiet"
        type="button"
        aria-label="Previous page"
        disabled={currentPage === 1}
        onClick={() => onChange(currentPage - 1)}
      >
        <CaretLeft size={20} aria-hidden="true" />
      </button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <button
        className="button button--quiet"
        type="button"
        aria-label="Next page"
        disabled={currentPage === totalPages}
        onClick={() => onChange(currentPage + 1)}
      >
        <CaretRight size={20} aria-hidden="true" />
      </button>
    </nav>
  );
}
