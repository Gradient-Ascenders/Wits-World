import { SelectField } from '../fields/SelectField';
import { SearchField } from '../fields/SearchField';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  LockKey,
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
import { LoadingState } from '../LoadingState';
import { CardDetailModal } from './CardDetailModal';
import { CardPresentationDialog } from './CardPresentationDialog';
import { CardThumbnail } from './CollectibleCard';
import { StatusMessage } from '../StatusMessage';

type Candidate = {
  card: OwnedCard;
  preview?: CardEvolutionPreview;
  unavailable?: boolean;
  failed?: boolean;
  checking?: boolean;
};

type AvailabilityFilter =
  'all' | 'ready' | 'not-ready' | 'unavailable' | 'failed';
const PAGE_SIZE = 6;

function sortCandidates(a: Candidate, b: Candidate) {
  return (
    Number(Boolean(b.preview?.canEvolve)) -
      Number(Boolean(a.preview?.canEvolve)) ||
    a.card.name.localeCompare(b.card.name)
  );
}

export function CollectionEvolutions({
  apiBaseUrl,
  cards,
  getAccessToken,
  onApplyResult,
  onRefreshCollection,
  collectionUpdating = false,
}: {
  apiBaseUrl: string;
  cards: OwnedCard[];
  collectionUpdating?: boolean;
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
  const loadingKey = useMemo(() => ({ cards, revision }), [cards, revision]);

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
    setCandidates((current) =>
      current
        .filter((candidate) =>
          definitions.some(
            (card) => card.cardDefinitionId === candidate.card.cardDefinitionId,
          ),
        )
        .map((candidate) => ({ ...candidate, checking: true })),
    );
    const pending = [...definitions];
    const loaded: Candidate[] = [];
    async function worker() {
      while (pending.length && !controller.signal.aborted) {
        const card = pending.shift()!;
        let candidate: Candidate | undefined;
        try {
          const preview = await previewCardEvolution({
            apiBaseUrl,
            getAccessToken,
            signal: controller.signal,
            sourceCardDefinitionId: card.cardDefinitionId,
          });
          candidate = { card, preview };
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
              candidate = { card, unavailable: true };
          } else candidate = { card, failed: true };
        }
        if (controller.signal.aborted) return;
        if (candidate) loaded.push(candidate);
        // One slow preview must not hold independently confirmed cards hostage.
        setCandidates((current) =>
          [
            ...current.filter(
              (item) => item.card.cardDefinitionId !== card.cardDefinitionId,
            ),
            ...(candidate ? [candidate] : []),
          ].sort(sortCandidates),
        );
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, worker),
    ).then(() => {
      if (controller.signal.aborted) return;
      setCandidates(loaded.sort(sortCandidates));
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
      <header className="collection-page__header">
        <h1>Evolutions</h1>
        <p className="lead">
          Combine three available copies into one evolved card.
        </p>
      </header>
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
          <LoadingState
            announce={!selected}
            label="Checking evolution paths…"
            onRetry={() => setRevision((value) => value + 1)}
            resetKey={loadingKey}
          />
        ) : null}
        <>
          {candidates.length > 0 ? (
            <>
              <div
                className="evolution-browse-controls"
                role="search"
                aria-label="Find an evolution"
              >
                <SearchField
                  label="Search evolutions"
                  hideLabel
                  className="collection-control evolution-browse-controls__search"
                  inputRef={searchInput}
                  placeholder="Search card names"
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                />
                <SelectField
                  label="Availability"
                  className="collection-control"
                  value={availability}
                  onChange={(value) => {
                    setAvailability(value as AvailabilityFilter);
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All cards' },
                    { value: 'ready', label: 'Ready' },
                    { value: 'not-ready', label: 'Not ready' },
                    { value: 'unavailable', label: 'No evolution' },
                    { value: 'failed', label: 'Check failed' },
                  ]}
                />
                <SelectField
                  label="Rarity"
                  className="collection-control"
                  value={rarity}
                  onChange={(value) => {
                    setRarity(value as CardRarity | 'all');
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All rarities' },
                    { value: 'common', label: 'Common' },
                    { value: 'rare', label: 'Rare' },
                    { value: 'epic', label: 'Epic' },
                    { value: 'legendary', label: 'Legendary' },
                  ]}
                />
              </div>
              <div className="evolution-browse-navigation">
                <p
                  aria-live={isChecking ? undefined : 'polite'}
                  ref={resultsHeading}
                  tabIndex={-1}
                >
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
          {!isChecking && candidates.length === 0 ? (
            <StatusMessage tone="empty">
              <p>No evolutions are available for your current cards.</p>
            </StatusMessage>
          ) : null}
          {!isChecking &&
          candidates.length > 0 &&
          filteredCandidates.length === 0 ? (
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
            {pageCandidates.map(
              ({ card, preview, unavailable, failed, checking }) => (
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
                      {checking
                        ? 'Checking availability…'
                        : preview
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
                          disabled={checking || collectionUpdating}
                        >
                          Preview evolution
                        </button>
                      </>
                    ) : failed ? (
                      <p>Could not check this card. Try again.</p>
                    ) : null}
                  </div>
                </li>
              ),
            )}
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
          {!isChecking && candidates.some((candidate) => candidate.failed) ? (
            <button
              className="button button--quiet"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry availability
            </button>
          ) : null}
        </>
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
