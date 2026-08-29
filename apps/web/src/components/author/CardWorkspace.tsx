import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  createAuthorCard,
  publishAuthorCard,
  retireAuthorCard,
  updateAuthorCard,
  type AuthorCard,
  type AuthorCardEffectInput,
  type AuthorCardInput,
  type AuthorCardMoveInput,
  type CardAffinity,
  type CardCategory,
  type CardEffectType,
  type CardModifierOperation,
  type CardModifierStat,
  type CardMoveType,
  type CardRarity,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import type { OwnedCard } from '../../api/cards';
import { describeStarterEffect } from '../../battle/effect-presentation';
import { CollectibleCard } from '../cards/CollectibleCard';
import '../cards/cards.css';
import { AuthorFeedback } from './AuthorFeedback';
import { AuthorConfirmationDialog } from './AuthorConfirmationDialog';
import { useUnsavedAuthorChanges } from './AuthorNavigationGuard';
import { authorPaths, type AuthorWorkspaceRoute } from './author-routing';
import {
  type AuthorMutationCoordinator,
  type AuthorMutationTicket,
  type AuthorRecordKey,
  useAuthorDraftSession,
} from './author-mutation-coordinator';

interface CardWorkspaceProps {
  apiBaseUrl: string;
  cards: readonly AuthorCard[];
  errorMessage: string;
  getAccessToken: ApiAccessTokenProvider;
  mutationCoordinator: AuthorMutationCoordinator;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  onCardsChange: Dispatch<SetStateAction<AuthorCard[]>>;
  onReload: () => void;
  route: Extract<AuthorWorkspaceRoute, { section: 'cards' }>;
  state: 'error' | 'loading' | 'ready';
}

export function CardWorkspace({
  apiBaseUrl,
  cards,
  errorMessage,
  getAccessToken,
  mutationCoordinator,
  navigate,
  onCardsChange,
  onReload,
  route,
  state,
}: CardWorkspaceProps) {
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [affinityFilter, setAffinityFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'updated'>('name');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const catalogueRef = useRef<HTMLElement>(null);
  const selectedRowRef = useRef<HTMLLIElement>(null);
  const recordViewRef = useRef<HTMLDivElement>(null);
  const focusRouteRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | 'new'>('new');
  const routeContextRef = useRef('');
  const interactionRef = useRef(0);
  const mountedRef = useRef(true);
  const selectedId = 'cardId' in route ? route.cardId : null;
  const routeContext = `${route.mode}:${selectedId ?? ''}`;
  if (routeContextRef.current !== routeContext) {
    routeContextRef.current = routeContext;
    interactionRef.current += 1;
    selectedIdRef.current =
      route.mode === 'new' ? 'new' : (selectedId ?? 'new');
  }

  useEffect(() => {
    if (state !== 'ready') return;
    if (focusRouteRef.current === null) {
      focusRouteRef.current = routeContext;
      return;
    }
    if (focusRouteRef.current === routeContext) return;
    focusRouteRef.current = routeContext;
    const timer = window.setTimeout(() => {
      (route.mode === 'list'
        ? catalogueRef.current
        : recordViewRef.current
      )?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [route.mode, routeContext, state]);

  const selected = cards.find((card) => card.id === selectedId);
  const visibleCards = useMemo(
    () =>
      [...cards]
        .filter((card) => {
          const query = searchQuery.trim().toLocaleLowerCase();
          return (
            (!query ||
              card.name.toLocaleLowerCase().includes(query) ||
              card.description?.toLocaleLowerCase().includes(query)) &&
            (lifecycleFilter === 'all' ||
              card.authoringStatus === lifecycleFilter) &&
            (categoryFilter === 'all' || card.category === categoryFilter) &&
            (affinityFilter === 'all' || card.affinity === affinityFilter) &&
            (rarityFilter === 'all' || card.rarity === rarityFilter)
          );
        })
        .sort((left, right) =>
          sortOrder === 'updated'
            ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
            : left.name.localeCompare(right.name),
        ),
    [
      affinityFilter,
      cards,
      categoryFilter,
      lifecycleFilter,
      rarityFilter,
      searchQuery,
      sortOrder,
    ],
  );

  useEffect(() => {
    if (state !== 'ready' || selectedId === null) return;

    const timer = window.setTimeout(() => {
      const list = catalogueRef.current?.querySelector<HTMLElement>(
        '.author-catalogue__list',
      );
      const row = selectedRowRef.current;
      if (!list || !row || list.clientHeight === 0) return;

      const listBounds = list.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      if (rowBounds.top < listBounds.top) {
        list.scrollTop -= listBounds.top - rowBounds.top;
      } else if (rowBounds.bottom > listBounds.bottom) {
        list.scrollTop += rowBounds.bottom - listBounds.bottom;
      }
    });

    return () => window.clearTimeout(timer);
  }, [selectedId, state, visibleCards]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setMessage('');
    if (selectedId && mutationCoordinator.isCollectionUncertain('cards'))
      onReload();
  }, [mutationCoordinator, onReload, route.mode, selectedId]);

  function updateCard(
    card: AuthorCard,
    ownerId: string | 'new',
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
  ) {
    const recordKey = `card:${card.id}` as const;
    if (!mutationCoordinator.acceptSuccess(ticket, recordKey, card)) return;
    const isCurrentInteraction =
      mountedRef.current &&
      interactionRef.current === interaction &&
      selectedIdRef.current === ownerId;
    const canApply = mutationCoordinator
      .getResults<AuthorCard>('cards')
      .some((result) => result.recordKey === recordKey);
    if (canApply) onCardsChange((current) => reconcileById(current, card));

    if (!isCurrentInteraction) return;
    selectedIdRef.current = card.id;
    const targetContext = `detail:${card.id}`;
    navigate(authorPaths.card(card.id));
    if (notice)
      announce(
        notice,
        setMessage,
        feedbackRef,
        () => mountedRef.current && routeContextRef.current === targetContext,
      );
  }

  return (
    <section
      aria-labelledby="cards-workspace-title"
      className="author-workspace"
    >
      <header className="author-workspace__heading">
        <div>
          <p className="eyebrow">Reward catalogue</p>
          <h2 id="cards-workspace-title">Card catalogue</h2>
        </div>
        {state === 'ready' ? (
          <Link className="button" href={authorPaths.newCard}>
            New card
          </Link>
        ) : (
          <button
            aria-describedby="card-create-unavailable"
            className="button"
            disabled
            type="button"
          >
            New card
          </button>
        )}
      </header>

      {state !== 'ready' ? (
        <p className="sr-only" id="card-create-unavailable">
          Load the card catalogue before creating a card.
        </p>
      ) : null}

      {state === 'loading' ? (
        <p className="author-state" role="status">
          Loading card definitions…
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="author-state author-state--error" role="alert">
          <strong>Cards are unavailable.</strong>
          <p>{errorMessage}</p>
          <button
            className="button button--quiet"
            onClick={onReload}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <div
          className={`author-management-view author-management-view--cards${route.mode === 'list' || route.mode === 'detail' ? ' author-management-view--card-catalogue' : ''}${route.mode === 'list' ? ' author-management-view--list' : ' author-management-view--record'}`}
        >
          <aside
            aria-label="Card definitions"
            className="author-catalogue author-catalogue--cards"
            ref={catalogueRef}
            tabIndex={-1}
          >
            <CardCatalogueControls
              affinity={affinityFilter}
              category={categoryFilter}
              lifecycle={lifecycleFilter}
              onAffinityChange={setAffinityFilter}
              onCategoryChange={setCategoryFilter}
              onLifecycleChange={setLifecycleFilter}
              onRarityChange={setRarityFilter}
              onSearchChange={setSearchQuery}
              onSortChange={setSortOrder}
              rarity={rarityFilter}
              search={searchQuery}
              sort={sortOrder}
            />
            <p aria-live="polite" className="author-catalogue__results">
              {visibleCards.length} of {cards.length}{' '}
              {cards.length === 1 ? 'card' : 'cards'}
            </p>
            {cards.length === 0 ? (
              <div className="author-empty author-empty--compact">
                <strong>No card definitions yet</strong>
                <p>Create a draft to begin the catalogue.</p>
              </div>
            ) : null}
            {cards.length > 0 && visibleCards.length === 0 ? (
              <div className="author-empty author-empty--compact">
                <strong>No cards match</strong>
                <p>Adjust the catalogue filters.</p>
              </div>
            ) : null}
            <ul className="author-catalogue__list">
              {visibleCards.map((card) => (
                <li
                  key={card.id}
                  ref={selectedId === card.id ? selectedRowRef : undefined}
                >
                  <Link
                    aria-current={selectedId === card.id ? 'true' : undefined}
                    className="author-record-summary author-record-summary--card"
                    href={authorPaths.card(card.id)}
                  >
                    <span className="author-record-summary__heading">
                      <strong>{card.name}</strong>
                      <StatusBadge status={card.authoringStatus} />
                    </span>
                    <span className="author-record-summary__meta">
                      {titleCase(card.category)} · {titleCase(card.affinity)} ·{' '}
                      {titleCase(card.rarity)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="author-record-summary__chevron"
                    >
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
          <div
            aria-label="Card workspace detail"
            className="author-record-view"
            ref={recordViewRef}
            role="region"
            tabIndex={-1}
          >
            {route.mode === 'list' ? (
              <CatalogueWelcome
                count={cards.length}
                noun="card"
                onCreatePath={authorPaths.newCard}
              />
            ) : route.mode === 'new' ? (
              <CardForm
                apiBaseUrl={apiBaseUrl}
                getAccessToken={getAccessToken}
                interaction={interactionRef.current}
                key="new-card"
                mutationCoordinator={mutationCoordinator}
                onCancel={() => navigate(authorPaths.cards)}
                onSaved={updateCard}
              />
            ) : selected ? (
              route.mode === 'edit' && selected.authoringStatus === 'draft' ? (
                <CardForm
                  apiBaseUrl={apiBaseUrl}
                  card={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  key={selected.id}
                  mutationCoordinator={mutationCoordinator}
                  onCancel={() => navigate(authorPaths.card(selected.id))}
                  onSaved={updateCard}
                />
              ) : (
                <CardDetail
                  apiBaseUrl={apiBaseUrl}
                  card={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  message={message}
                  messageRef={feedbackRef}
                  mutationCoordinator={mutationCoordinator}
                  onSaved={updateCard}
                />
              )
            ) : (
              <MissingRecord backPath={authorPaths.cards} kind="card" />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CardCatalogueControls({
  affinity,
  category,
  lifecycle,
  onAffinityChange,
  onCategoryChange,
  onLifecycleChange,
  onRarityChange,
  onSearchChange,
  onSortChange,
  rarity,
  search,
  sort,
}: {
  affinity: string;
  category: string;
  lifecycle: string;
  onAffinityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onLifecycleChange: (value: string) => void;
  onRarityChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: 'name' | 'updated') => void;
  rarity: string;
  search: string;
  sort: 'name' | 'updated';
}) {
  const secondaryFilterCount = [category, affinity, rarity].filter(
    (value) => value !== 'all',
  ).length;

  return (
    <div
      aria-label="Filter and sort cards"
      className="author-catalogue-toolbar"
      role="group"
    >
      <label className="author-catalogue-toolbar__search">
        <span className="sr-only">Search</span>
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search cards"
          type="search"
          value={search}
        />
      </label>
      <div className="author-catalogue-toolbar__controls">
        <label className="author-catalogue-toolbar__select">
          <span>Lifecycle</span>
          <select
            onChange={(event) => onLifecycleChange(event.target.value)}
            value={lifecycle}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <label className="author-catalogue-toolbar__select">
          <span>Sort</span>
          <select
            onChange={(event) =>
              onSortChange(event.target.value as 'name' | 'updated')
            }
            value={sort}
          >
            <option value="name">A–Z</option>
            <option value="updated">Updated</option>
          </select>
        </label>
        <details className="author-filter-menu">
          <summary>
            Filters
            {secondaryFilterCount > 0 ? (
              <span aria-label={`${secondaryFilterCount} active filters`}>
                {secondaryFilterCount}
              </span>
            ) : null}
          </summary>
          <div className="author-filter-menu__panel">
            <label className="author-filter">
              <span>Category</span>
              <select
                onChange={(event) => onCategoryChange(event.target.value)}
                value={category}
              >
                <option value="all">All</option>
                <option value="creature">Creature</option>
                <option value="power">Power</option>
              </select>
            </label>
            <label className="author-filter">
              <span>Affinity</span>
              <select
                onChange={(event) => onAffinityChange(event.target.value)}
                value={affinity}
              >
                <option value="all">All</option>
                {['wit', 'grit', 'spark', 'spirit', 'mystic'].map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="author-filter">
              <span>Rarity</span>
              <select
                onChange={(event) => onRarityChange(event.target.value)}
                value={rarity}
              >
                <option value="all">All</option>
                {['common', 'rare', 'epic', 'legendary'].map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}

function CatalogueWelcome({
  count,
  noun,
  onCreatePath,
}: {
  count: number;
  noun: string;
  onCreatePath: string;
}) {
  return (
    <section className="author-welcome">
      <p className="eyebrow">Catalogue</p>
      <h3>{count > 0 ? `Select a ${noun}` : `Create the first ${noun}`}</h3>
      <p>
        {count > 0
          ? `Choose a ${noun} to review its authoritative lifecycle and content.`
          : `New ${noun}s begin as editable drafts.`}
      </p>
      <Link className="button" href={onCreatePath}>
        New {noun}
      </Link>
    </section>
  );
}

function MissingRecord({ backPath, kind }: { backPath: string; kind: string }) {
  return (
    <section className="author-state author-state--error" role="alert">
      <strong>This {kind} is not in the loaded catalogue.</strong>
      <p>It may have been removed or the address may be incorrect.</p>
      <Link className="button button--quiet" href={backPath}>
        Back to {kind}s
      </Link>
    </section>
  );
}

function StatusBadge({ status }: { status: AuthorCard['authoringStatus'] }) {
  return (
    <span className={`status-badge status-badge--author-${status}`}>
      {titleCase(status)}
    </span>
  );
}

function CardDetail({
  apiBaseUrl,
  card,
  getAccessToken,
  interaction,
  message,
  messageRef,
  mutationCoordinator,
  onSaved,
}: {
  apiBaseUrl: string;
  card: AuthorCard;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  message: string;
  messageRef: RefObject<HTMLDivElement | null>;
  mutationCoordinator: AuthorMutationCoordinator;
  onSaved: CardFormProps['onSaved'];
}) {
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const retireButtonRef = useRef<HTMLButtonElement>(null);
  const operationRef = useRef<AbortController | null>(null);

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => {
    setApiError(null);
    setConfirmRetire(false);
  }, [card.id, card.authoringStatus]);

  async function lifecycle(action: 'publish' | 'retire') {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
    const ticket = mutationCoordinator.beginMutation(
      `card:${card.id}`,
      'cards',
    );

    try {
      const next =
        action === 'publish'
          ? await publishAuthorCard({
              apiBaseUrl,
              cardId: card.id,
              expectedVersion: card.version,
              getAccessToken,
              signal: controller.signal,
            })
          : await retireAuthorCard({
              apiBaseUrl,
              cardId: card.id,
              expectedVersion: card.version,
              getAccessToken,
              signal: controller.signal,
            });
      if (operationRef.current !== controller) return;
      onSaved(
        next,
        card.id,
        interaction,
        ticket,
        action === 'publish'
          ? 'Card published and active.'
          : 'Card retired. Existing owned copies remain intact.',
      );
      setConfirmRetire(false);
    } catch (error) {
      if (operationRef.current !== controller) return;
      if (mutationCoordinator.acceptFailure(ticket, isUncertainError(error))) {
        setApiError(toAuthorError(error));
        window.setTimeout(() => feedbackRef.current?.focus());
      }
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <article aria-labelledby="card-detail-title" className="author-detail">
      <Link className="author-back-link" href={authorPaths.cards}>
        <span aria-hidden="true">←</span> Card catalogue
      </Link>
      <header className="author-card-detail__header">
        <div className="author-card-detail__identity">
          <p className="eyebrow">Card definition</p>
          <h3 id="card-detail-title">{card.name}</h3>
          <p className="author-card-detail__definition">
            {titleCase(card.category)} · {titleCase(card.affinity)} ·{' '}
            {titleCase(card.rarity)}
          </p>
        </div>
        <div className="author-card-detail__lifecycle">
          <StatusBadge status={card.authoringStatus} />
          <div className="author-actions author-actions--detail">
            {card.authoringStatus === 'draft' ? (
              <>
                <Link className="button" href={authorPaths.editCard(card.id)}>
                  Edit card
                </Link>
                <button
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => void lifecycle('publish')}
                  type="button"
                >
                  {busy ? 'Publishing…' : 'Publish card'}
                </button>
              </>
            ) : null}
            {card.authoringStatus !== 'retired' ? (
              <button
                className="button button--danger"
                disabled={busy}
                onClick={() => setConfirmRetire(true)}
                ref={retireButtonRef}
                type="button"
              >
                Retire card
              </button>
            ) : null}
          </div>
          <AuthorFeedback error={apiError} refObject={feedbackRef} />
          <AuthorFeedback message={message} refObject={messageRef} />
        </div>
      </header>

      <div className="author-card-detail__layout">
        <section
          aria-label={`${card.name} authoring preview`}
          className="author-card-detail__preview"
        >
          <p className="eyebrow">Player card preview</p>
          <CollectibleCard
            card={toCollectibleCard(card)}
            compact
            headingLevel={4}
            showOwnership={false}
          />
        </section>
        <div className="author-card-detail__content">
          <dl className="author-metadata">
            <div>
              <dt>Description</dt>
              <dd>{card.description ?? 'No description provided'}</dd>
            </div>
            <div>
              <dt>Reward catalogue</dt>
              <dd>{card.isActive ? 'Active' : 'Not active'}</dd>
            </div>
            {card.category === 'creature' ? (
              <div>
                <dt>Attributes</dt>
                <dd>
                  {card.hp ?? '—'} HP · {card.power ?? '—'} Power
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Last updated</dt>
              <dd>
                <time dateTime={card.updatedAt}>
                  {formatDateTime(card.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>
          <CardMechanicsSummary card={card} />
        </div>
      </div>

      {confirmRetire ? (
        <AuthorConfirmationDialog
          busy={busy}
          cancelLabel="Keep card"
          confirmLabel={busy ? 'Retiring…' : 'Retire card'}
          description={
            <p>
              This definition will leave future reward selection and cannot be
              republished. Existing owned copies remain intact.
            </p>
          }
          onCancel={() => setConfirmRetire(false)}
          onConfirm={() => void lifecycle('retire')}
          returnFocusRef={retireButtonRef}
          title={`Retire ${card.name}?`}
        />
      ) : null}
    </article>
  );
}

function CardMechanicsSummary({ card }: { card: AuthorCard }) {
  const items = card.category === 'creature' ? card.moves : card.effects;

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby={`card-mechanics-${card.id}`}
      className="author-card-mechanics"
    >
      <div className="author-card-mechanics__heading">
        <h4 id={`card-mechanics-${card.id}`}>
          {card.category === 'creature' ? 'Moves' : 'Effects'}
        </h4>
        <span>{items.length}</span>
      </div>
      <ol className="author-card-mechanics__list">
        {card.category === 'creature'
          ? card.moves.map((move) => (
              <li key={move.id}>
                <div>
                  <strong>{move.name}</strong>
                  <span>{titleCase(move.moveType)}</span>
                </div>
                <p>
                  {describeStarterEffect(move)} · {move.powerCost} power
                </p>
              </li>
            ))
          : card.effects.map((effect) => (
              <li key={effect.id}>
                <div>
                  <strong>Effect {effect.position}</strong>
                  <span>{titleCase(effect.effectType)}</span>
                </div>
                <p>{describeStarterEffect(effect)}</p>
              </li>
            ))}
      </ol>
    </section>
  );
}

function toCollectibleCard(card: AuthorCard): OwnedCard {
  return {
    acquiredAt: card.createdAt,
    acquisitionKind: 'event_reward',
    affinity: card.affinity,
    cardDefinitionId: card.id,
    category: card.category,
    description: card.description,
    effects: card.effects,
    hp: card.hp,
    imageUrl: card.imageUrl,
    isActive: card.isActive,
    moves: card.moves,
    name: card.name,
    ownedCardId: `author-${card.id}`,
    power: card.power,
    rarity: card.rarity,
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface CardFormProps {
  apiBaseUrl: string;
  card?: AuthorCard;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mutationCoordinator: AuthorMutationCoordinator;
  onCancel: () => void;
  onSaved: (
    card: AuthorCard,
    ownerId: string | 'new',
    interaction: number,
    ticket: AuthorMutationTicket,
    notice?: string,
  ) => void;
}

interface EffectDraft {
  effectType: CardEffectType;
  effectValue: string;
  modifierDurationTurns: string;
  modifierOperation: '' | CardModifierOperation;
  modifierStat: '' | CardModifierStat;
}

interface MoveDraft extends EffectDraft {
  moveType: CardMoveType;
  name: string;
  powerCost: string;
}

interface CardDraft {
  affinity: CardAffinity;
  category: CardCategory;
  description: string;
  effects: EffectDraft[];
  hp: string;
  imageUrl: string;
  moves: MoveDraft[];
  name: string;
  power: string;
  rarity: CardRarity;
}

function CardForm({
  apiBaseUrl,
  card,
  getAccessToken,
  interaction,
  mutationCoordinator,
  onCancel,
  onSaved,
}: CardFormProps) {
  const [draft, setDraft] = useState<CardDraft>(() => cardDraft(card));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);

  useEffect(() => {
    setDraft(cardDraft(card));
    setErrors({});
    setApiError(null);
  }, [card]);

  useEffect(() => {
    interactionActiveRef.current = true;
    return () => {
      interactionActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!busy && errors.name && apiError?.code === 'CARD_NAME_CONFLICT') {
      formRef.current?.querySelector<HTMLElement>('#card-name')?.focus();
    }
  }, [apiError?.code, busy, errors.name]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(cardDraft(card));
  const recordKey = `card:${card?.id ?? 'new'}` as AuthorRecordKey;
  useAuthorDraftSession(mutationCoordinator, recordKey, dirty);
  const clearNavigationGuard = useUnsavedAuthorChanges(dirty, 'card draft');

  async function save(submission: FormEvent) {
    submission.preventDefault();
    const result = validateCardDraft(draft);

    if (!result.input) {
      setErrors(result.errors);
      window.setTimeout(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }

    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = card?.id ?? 'new';
    const ticket = card
      ? mutationCoordinator.beginMutation(`card:${card.id}`, 'cards')
      : mutationCoordinator.beginCreate('card', 'cards');

    try {
      const saved = card
        ? await updateAuthorCard({
            apiBaseUrl,
            cardId: card.id,
            expectedVersion: card.version,
            getAccessToken,
            input: result.input,
            signal: controller.signal,
          })
        : await createAuthorCard({
            apiBaseUrl,
            getAccessToken,
            input: result.input,
            signal: controller.signal,
          });
      if (operationRef.current !== controller) return;
      clearNavigationGuard();
      onSaved(
        saved,
        ownerId,
        interaction,
        ticket,
        card ? 'Card changes saved.' : 'Draft card created.',
      );
    } catch (error) {
      if (operationRef.current !== controller) return;
      const accepted = mutationCoordinator.acceptFailure(
        ticket,
        isUncertainError(error),
      );
      if (!accepted || !interactionActiveRef.current) return;
      handleCardError(error, setApiError, setErrors, formRef, feedbackRef);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        if (interactionActiveRef.current) setBusy(false);
      }
    }
  }

  function changeCategory(category: CardCategory) {
    setDraft((current) => ({
      ...current,
      category,
      effects:
        category === 'power'
          ? current.effects.length > 0
            ? current.effects
            : [emptyEffect()]
          : [],
      hp: category === 'creature' ? current.hp || '1' : '',
      moves:
        category === 'creature'
          ? current.moves.length > 0
            ? current.moves
            : [emptyMove()]
          : [],
      power: category === 'creature' ? current.power || '0' : '',
    }));
  }

  return (
    <section
      aria-labelledby="card-editor-title"
      className="author-panel author-panel--editor"
    >
      <Link
        className="author-back-link"
        href={card ? authorPaths.card(card.id) : authorPaths.cards}
      >
        <span aria-hidden="true">←</span>{' '}
        {card ? 'Card detail' : 'Card catalogue'}
      </Link>
      <header className="author-panel__heading">
        <div>
          <p className="eyebrow">Card definition</p>
          <h3 id="card-editor-title">{card ? card.name : 'New card'}</h3>
        </div>
        {card ? <StatusBadge status={card.authoringStatus} /> : null}
      </header>
      <AuthorFeedback error={apiError} refObject={feedbackRef} />

      <form className="author-form" noValidate onSubmit={save} ref={formRef}>
        <div className="author-form__grid">
          <Field error={errors.name} label="Card name" name="card-name">
            <input
              aria-describedby={errors.name ? 'card-name-error' : undefined}
              aria-invalid={Boolean(errors.name)}
              disabled={busy}
              id="card-name"
              onChange={(change) => {
                setDraft((current) => ({
                  ...current,
                  name: change.target.value,
                }));
                setErrors((current) => {
                  const remaining = { ...current };
                  delete remaining.name;
                  return remaining;
                });
                if (apiError?.code === 'CARD_NAME_CONFLICT') {
                  setApiError(null);
                }
              }}
              required
              value={draft.name}
            />
          </Field>
          <Field label="Category" name="card-category">
            <select
              disabled={busy}
              id="card-category"
              onChange={(change) =>
                changeCategory(change.target.value as CardCategory)
              }
              value={draft.category}
            >
              <option value="creature">Creature</option>
              <option value="power">Power</option>
            </select>
          </Field>
          <Field label="Affinity" name="card-affinity">
            <select
              disabled={busy}
              id="card-affinity"
              onChange={(change) =>
                setDraft((current) => ({
                  ...current,
                  affinity: change.target.value as CardAffinity,
                }))
              }
              value={draft.affinity}
            >
              {['wit', 'grit', 'spark', 'spirit', 'mystic'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rarity" name="card-rarity">
            <select
              disabled={busy}
              id="card-rarity"
              onChange={(change) =>
                setDraft((current) => ({
                  ...current,
                  rarity: change.target.value as CardRarity,
                }))
              }
              value={draft.rarity}
            >
              {['common', 'rare', 'epic', 'legendary'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </Field>
          {draft.category === 'creature' ? (
            <>
              <Field error={errors.hp} label="Hit points (HP)" name="card-hp">
                <input
                  aria-describedby={errors.hp ? 'card-hp-error' : undefined}
                  aria-invalid={Boolean(errors.hp)}
                  disabled={busy}
                  id="card-hp"
                  inputMode="numeric"
                  min="1"
                  onChange={(change) =>
                    setDraft((current) => ({
                      ...current,
                      hp: change.target.value,
                    }))
                  }
                  required
                  step="1"
                  type="number"
                  value={draft.hp}
                />
              </Field>
              <Field
                error={errors.power}
                label="Starting Power"
                name="card-power"
              >
                <input
                  aria-describedby={
                    errors.power ? 'card-power-error' : undefined
                  }
                  aria-invalid={Boolean(errors.power)}
                  disabled={busy}
                  id="card-power"
                  inputMode="numeric"
                  min="0"
                  onChange={(change) =>
                    setDraft((current) => ({
                      ...current,
                      power: change.target.value,
                    }))
                  }
                  required
                  step="1"
                  type="number"
                  value={draft.power}
                />
              </Field>
            </>
          ) : null}
        </div>

        <Field
          error={errors.description}
          label="Display description (optional)"
          name="card-description"
        >
          <textarea
            aria-describedby={
              errors.description ? 'card-description-error' : undefined
            }
            aria-invalid={Boolean(errors.description)}
            disabled={busy}
            id="card-description"
            onChange={(change) =>
              setDraft((current) => ({
                ...current,
                description: change.target.value,
              }))
            }
            rows={3}
            value={draft.description}
          />
        </Field>
        <Field
          error={errors.imageUrl}
          label="Artwork URL (optional)"
          name="card-image-url"
        >
          <input
            aria-describedby={`${errors.imageUrl ? 'card-image-url-error ' : ''}card-image-help`.trim()}
            aria-invalid={Boolean(errors.imageUrl)}
            disabled={busy}
            id="card-image-url"
            onChange={(change) =>
              setDraft((current) => ({
                ...current,
                imageUrl: change.target.value,
              }))
            }
            type="url"
            value={draft.imageUrl}
          />
          <span className="field-help" id="card-image-help">
            Use only artwork with recorded rights and attribution.
          </span>
        </Field>

        {draft.category === 'creature' ? (
          <fieldset
            aria-describedby={errors.moves ? 'card-moves-error' : undefined}
            aria-invalid={Boolean(errors.moves)}
            className="author-fieldset"
            disabled={busy}
            tabIndex={errors.moves ? -1 : undefined}
          >
            <legend>Creature moves</legend>
            {errors.moves ? (
              <p className="field-error" id="card-moves-error">
                {errors.moves}
              </p>
            ) : null}
            {draft.moves.map((move, index) => (
              <MoveEditor
                errors={errors}
                index={index}
                key={index}
                move={move}
                onChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    moves: current.moves.map((item, itemIndex) =>
                      itemIndex === index ? next : item,
                    ),
                  }))
                }
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    moves: current.moves.filter(
                      (_item, itemIndex) => itemIndex !== index,
                    ),
                  }))
                }
              />
            ))}
            <button
              aria-describedby="card-move-limit"
              className="button button--quiet"
              disabled={draft.moves.length >= 4}
              onClick={() =>
                setDraft((current) =>
                  current.moves.length >= 4
                    ? current
                    : {
                        ...current,
                        moves: [...current.moves, emptyMove()],
                      },
                )
              }
              type="button"
            >
              Add move
            </button>
            <span className="field-help" id="card-move-limit">
              Creature drafts may contain up to four moves. Publication requires
              exactly four.
            </span>
          </fieldset>
        ) : (
          <fieldset
            aria-describedby={errors.effects ? 'card-effects-error' : undefined}
            aria-invalid={Boolean(errors.effects)}
            className="author-fieldset"
            disabled={busy}
            tabIndex={errors.effects ? -1 : undefined}
          >
            <legend>Power-card effects</legend>
            {errors.effects ? (
              <p className="field-error" id="card-effects-error">
                {errors.effects}
              </p>
            ) : null}
            {draft.effects.map((effect, index) => (
              <EffectEditor
                effect={effect}
                errors={errors}
                index={index}
                key={index}
                prefix="effect"
                onChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    effects: current.effects.map((item, itemIndex) =>
                      itemIndex === index ? next : item,
                    ),
                  }))
                }
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    effects: current.effects.filter(
                      (_item, itemIndex) => itemIndex !== index,
                    ),
                  }))
                }
              />
            ))}
            <button
              className="button button--quiet"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  effects: [...current.effects, emptyEffect()],
                }))
              }
              type="button"
            >
              Add effect
            </button>
          </fieldset>
        )}

        <div className="card-preview" aria-label="Card metadata preview">
          <p className="eyebrow">Preview</p>
          <strong>{draft.name.trim() || 'Untitled card'}</strong>
          <p>
            {titleCase(draft.rarity)} {titleCase(draft.affinity)}{' '}
            {titleCase(draft.category)}
          </p>
          {draft.description.trim() ? <p>{draft.description}</p> : null}
        </div>

        <div className="author-actions">
          <button className="button" disabled={busy} type="submit">
            {busy ? 'Saving…' : card ? 'Save card' : 'Create draft card'}
          </button>
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
        {dirty ? (
          <p className="author-dirty-state" role="status">
            Unsaved changes
          </p>
        ) : null}
      </form>
    </section>
  );
}

function MoveEditor({
  errors,
  index,
  move,
  onChange,
  onRemove,
}: {
  errors: Record<string, string>;
  index: number;
  move: MoveDraft;
  onChange: (move: MoveDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="nested-editor">
      <div className="nested-editor__heading">
        <strong>Move {index + 1}</strong>
        <button
          className="button button--quiet"
          onClick={onRemove}
          type="button"
        >
          Remove move
        </button>
      </div>
      <div className="author-form__grid">
        <Field
          error={errors[`move${index}Name`]}
          label="Move name"
          name={`move-${index}-name`}
        >
          <input
            aria-describedby={
              errors[`move${index}Name`]
                ? `move-${index}-name-error`
                : undefined
            }
            aria-invalid={Boolean(errors[`move${index}Name`])}
            id={`move-${index}-name`}
            onChange={(change) =>
              onChange({ ...move, name: change.target.value })
            }
            value={move.name}
          />
        </Field>
        <Field label="Move type" name={`move-${index}-type`}>
          <select
            id={`move-${index}-type`}
            onChange={(change) =>
              onChange({
                ...move,
                moveType: change.target.value as CardMoveType,
              })
            }
            value={move.moveType}
          >
            {['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'].map(
              (value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field
          error={errors[`move${index}PowerCost`]}
          label="Power cost"
          name={`move-${index}-cost`}
        >
          <input
            aria-describedby={
              errors[`move${index}PowerCost`]
                ? `move-${index}-cost-error`
                : undefined
            }
            aria-invalid={Boolean(errors[`move${index}PowerCost`])}
            id={`move-${index}-cost`}
            min="0"
            onChange={(change) =>
              onChange({ ...move, powerCost: change.target.value })
            }
            step="1"
            type="number"
            value={move.powerCost}
          />
        </Field>
      </div>
      <EffectEditor
        effect={move}
        errors={errors}
        index={index}
        onChange={(effect) => onChange({ ...move, ...effect })}
        prefix="move"
      />
    </div>
  );
}

function EffectEditor({
  effect,
  errors,
  index,
  onChange,
  onRemove,
  prefix,
}: {
  effect: EffectDraft;
  errors: Record<string, string>;
  index: number;
  onChange: (effect: EffectDraft) => void;
  onRemove?: () => void;
  prefix: 'effect' | 'move';
}) {
  const modifier =
    effect.effectType === 'buff' || effect.effectType === 'debuff';
  function changeType(effectType: CardEffectType) {
    onChange({
      ...effect,
      effectType,
      modifierDurationTurns: modifierFor(effectType)
        ? effect.modifierDurationTurns
        : '',
      modifierOperation: modifierFor(effectType)
        ? effect.modifierOperation
        : '',
      modifierStat: modifierFor(effectType) ? effect.modifierStat : '',
    });
  }
  function changeStat(modifierStat: '' | CardModifierStat) {
    onChange({
      ...effect,
      modifierDurationTurns:
        modifierStat === 'damage_multiplier'
          ? effect.modifierDurationTurns
          : '',
      modifierOperation:
        modifierStat === 'damage_multiplier'
          ? 'multiply'
          : modifierStat
            ? 'add'
            : '',
      modifierStat,
    });
  }
  return (
    <div className={prefix === 'effect' ? 'nested-editor' : 'effect-editor'}>
      {prefix === 'effect' ? (
        <div className="nested-editor__heading">
          <strong>Effect {index + 1}</strong>
          {onRemove ? (
            <button
              className="button button--quiet"
              onClick={onRemove}
              type="button"
            >
              Remove effect
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="author-form__grid">
        <Field label="Effect type" name={`${prefix}-${index}-effect-type`}>
          <select
            id={`${prefix}-${index}-effect-type`}
            onChange={(change) =>
              changeType(change.target.value as CardEffectType)
            }
            value={effect.effectType}
          >
            {['damage', 'debuff', 'heal', 'buff'].map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={errors[`${prefix}${index}EffectValue`]}
          label="Effect value (optional)"
          name={`${prefix}-${index}-effect-value`}
        >
          <input
            aria-describedby={
              errors[`${prefix}${index}EffectValue`]
                ? `${prefix}-${index}-effect-value-error`
                : undefined
            }
            aria-invalid={Boolean(errors[`${prefix}${index}EffectValue`])}
            id={`${prefix}-${index}-effect-value`}
            min="0"
            onChange={(change) =>
              onChange({ ...effect, effectValue: change.target.value })
            }
            step="1"
            type="number"
            value={effect.effectValue}
          />
        </Field>
        {modifier ? (
          <>
            <Field
              error={errors[`${prefix}${index}Modifier`]}
              label="Modifier stat"
              name={`${prefix}-${index}-modifier-stat`}
            >
              <select
                aria-describedby={
                  errors[`${prefix}${index}Modifier`]
                    ? `${prefix}-${index}-modifier-stat-error`
                    : undefined
                }
                aria-invalid={Boolean(errors[`${prefix}${index}Modifier`])}
                id={`${prefix}-${index}-modifier-stat`}
                onChange={(change) =>
                  changeStat(change.target.value as '' | CardModifierStat)
                }
                value={effect.modifierStat}
              >
                <option value="">Choose stat</option>
                <option value="hp">HP</option>
                <option value="power">Power</option>
                <option value="damage_multiplier">Damage multiplier</option>
              </select>
            </Field>
            <Field
              label="Modifier operation"
              name={`${prefix}-${index}-modifier-operation`}
            >
              <input
                disabled
                id={`${prefix}-${index}-modifier-operation`}
                value={effect.modifierOperation || 'Choose a stat'}
              />
            </Field>
            {effect.modifierStat === 'damage_multiplier' ? (
              <Field
                error={errors[`${prefix}${index}Duration`]}
                label="Duration in turns (optional)"
                name={`${prefix}-${index}-duration`}
              >
                <input
                  aria-describedby={
                    errors[`${prefix}${index}Duration`]
                      ? `${prefix}-${index}-duration-error`
                      : undefined
                  }
                  aria-invalid={Boolean(errors[`${prefix}${index}Duration`])}
                  id={`${prefix}-${index}-duration`}
                  min="1"
                  onChange={(change) =>
                    onChange({
                      ...effect,
                      modifierDurationTurns: change.target.value,
                    })
                  }
                  step="1"
                  type="number"
                  value={effect.modifierDurationTurns}
                />
              </Field>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  children,
  error,
  label,
  name,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
  name: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error ? (
        <span className="field-error" id={`${name}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function cardDraft(card?: AuthorCard): CardDraft {
  if (!card)
    return {
      affinity: 'wit',
      category: 'creature',
      description: '',
      effects: [],
      hp: '1',
      imageUrl: '',
      moves: [emptyMove()],
      name: '',
      power: '0',
      rarity: 'common',
    };
  return {
    affinity: card.affinity,
    category: card.category,
    description: card.description ?? '',
    effects: card.effects.map(toEffectDraft),
    hp: card.hp === null ? '' : String(card.hp),
    imageUrl: card.imageUrl ?? '',
    moves: card.moves.map((move) => ({
      ...toEffectDraft(move),
      moveType: move.moveType,
      name: move.name,
      powerCost: String(move.powerCost),
    })),
    name: card.name,
    power: card.power === null ? '' : String(card.power),
    rarity: card.rarity,
  };
}

function toEffectDraft(effect: {
  effectType: CardEffectType;
  effectValue?: number | null;
  modifierDurationTurns?: number | null;
  modifierOperation?: CardModifierOperation | null;
  modifierStat?: CardModifierStat | null;
}): EffectDraft {
  return {
    effectType: effect.effectType,
    effectValue:
      effect.effectValue === null || effect.effectValue === undefined
        ? ''
        : String(effect.effectValue),
    modifierDurationTurns:
      effect.modifierDurationTurns === null ||
      effect.modifierDurationTurns === undefined
        ? ''
        : String(effect.modifierDurationTurns),
    modifierOperation: effect.modifierOperation ?? '',
    modifierStat: effect.modifierStat ?? '',
  };
}
function emptyEffect(): EffectDraft {
  return {
    effectType: 'damage',
    effectValue: '0',
    modifierDurationTurns: '',
    modifierOperation: '',
    modifierStat: '',
  };
}
function emptyMove(): MoveDraft {
  return { ...emptyEffect(), moveType: 'basic', name: '', powerCost: '0' };
}

function validateCardDraft(draft: CardDraft): {
  errors: Record<string, string>;
  input?: AuthorCardInput;
} {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = 'Enter a card name.';
  if (draft.description.length > 0 && !draft.description.trim())
    errors.description =
      'Remove the blank description or enter meaningful text.';
  if (draft.imageUrl.length > 0 && !draft.imageUrl.trim())
    errors.imageUrl = 'Remove the blank URL or enter a URL.';
  const hp = Number(draft.hp);
  const power = Number(draft.power);
  if (
    draft.category === 'creature' &&
    (!draft.hp || !Number.isInteger(hp) || hp <= 0)
  )
    errors.hp = 'Creature HP must be a positive whole number.';
  if (
    draft.category === 'creature' &&
    (!draft.power || !Number.isInteger(power) || power < 0)
  )
    errors.power = 'Creature Power must be a non-negative whole number.';
  if (draft.category === 'creature' && draft.moves.length > 4)
    errors.moves = 'Creature cards can define at most four moves.';
  if (draft.category === 'power' && draft.effects.length === 0)
    errors.effects = 'Add at least one effect.';
  draft.moves.forEach((move, index) => {
    if (!move.name.trim()) errors[`move${index}Name`] = 'Enter a move name.';
    validateEffect(move, `move${index}`, errors);
    if (!isWhole(move.powerCost, false))
      errors[`move${index}PowerCost`] = 'Enter a non-negative whole number.';
  });
  draft.effects.forEach((effect, index) =>
    validateEffect(effect, `effect${index}`, errors),
  );
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      affinity: draft.affinity,
      category: draft.category,
      description: draft.description.trim() || null,
      effects:
        draft.category === 'power'
          ? draft.effects.map((effect, index) => effectInput(effect, index + 1))
          : [],
      hp: draft.category === 'creature' ? hp : null,
      imageUrl: draft.imageUrl.trim() || null,
      moves:
        draft.category === 'creature'
          ? draft.moves.map((move, index) => moveInput(move, index + 1))
          : [],
      name: draft.name.trim(),
      power: draft.category === 'creature' ? power : null,
      rarity: draft.rarity,
    },
  };
}

function validateEffect(
  effect: EffectDraft,
  prefix: string,
  errors: Record<string, string>,
) {
  if (effect.effectValue && !isWhole(effect.effectValue, false))
    errors[`${prefix}EffectValue`] = 'Enter a non-negative whole number.';
  if (
    modifierFor(effect.effectType) &&
    (!effect.modifierStat || !effect.modifierOperation)
  )
    errors[`${prefix}Modifier`] =
      'Buff and debuff effects require modifier metadata.';
  if (
    effect.modifierDurationTurns &&
    !isWhole(effect.modifierDurationTurns, true)
  )
    errors[`${prefix}Duration`] = 'Enter a positive whole number.';
}
function isWhole(value: string, positive: boolean) {
  const number = Number(value);
  return (
    value !== '' &&
    Number.isInteger(number) &&
    (positive ? number > 0 : number >= 0)
  );
}
function modifierFor(type: CardEffectType) {
  return type === 'buff' || type === 'debuff';
}
function nullableNumber(value: string) {
  return value === '' ? null : Number(value);
}
function effectInput(
  effect: EffectDraft,
  position: number,
): AuthorCardEffectInput {
  return {
    effectType: effect.effectType,
    effectValue: nullableNumber(effect.effectValue),
    modifierDurationTurns: nullableNumber(effect.modifierDurationTurns),
    modifierOperation: effect.modifierOperation || null,
    modifierStat: effect.modifierStat || null,
    position,
  };
}
function moveInput(move: MoveDraft, position: number): AuthorCardMoveInput {
  return {
    ...effectInput(move, position),
    moveType: move.moveType,
    name: move.name.trim(),
    powerCost: Number(move.powerCost),
  };
}
function titleCase(value: string) {
  return value
    .replace('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function toAuthorError(error: unknown): AuthorApiError {
  return error instanceof AuthorApiError
    ? error
    : new AuthorApiError(
        'unavailable',
        'The API is unavailable. No content change was confirmed.',
      );
}

function handleCardError(
  error: unknown,
  setApiError: (error: AuthorApiError) => void,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  formRef: React.RefObject<HTMLFormElement | null>,
  feedbackRef: React.RefObject<HTMLDivElement | null>,
) {
  const authorError = toAuthorError(error);
  setApiError(authorError);
  if (authorError.code === 'CARD_NAME_CONFLICT') {
    setErrors((current) => ({
      ...current,
      name: 'This card name is already in use.',
    }));
    return;
  }
  if (authorError.validation.length === 0) {
    window.setTimeout(() => feedbackRef.current?.focus());
    return;
  }

  setErrors((current) => ({
    ...current,
    ...Object.fromEntries(
      authorError.validation.map((failure) => [
        cardApiFieldName(failure.field),
        failure.message,
      ]),
    ),
  }));
  window.setTimeout(() =>
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus(),
  );
}

function cardApiFieldName(field: string): string {
  const normalized = field.replace(/^\/body\//, '').replace(/^\//, '');
  const parts = normalized.split('/');
  if ((parts[0] === 'moves' || parts[0] === 'effects') && parts.length >= 3) {
    const prefix = parts[0] === 'moves' ? 'move' : 'effect';
    const index = parts[1] ?? '0';
    const property = parts[2] ?? '';
    const suffix: Record<string, string> = {
      effectValue: 'EffectValue',
      modifierDurationTurns: 'Duration',
      modifierOperation: 'Modifier',
      modifierStat: 'Modifier',
      name: 'Name',
      powerCost: 'PowerCost',
    };
    return `${prefix}${index}${suffix[property] ?? ''}`;
  }
  return normalized;
}

function announce(
  message: string,
  setMessage: (message: string) => void,
  feedbackRef: React.RefObject<HTMLDivElement | null>,
  isCurrent: () => boolean = () => true,
) {
  window.setTimeout(() => {
    if (!isCurrent()) return;
    setMessage(message);
    window.setTimeout(() => {
      if (isCurrent()) feedbackRef.current?.focus();
    });
  });
}

function reconcileById(
  cards: readonly AuthorCard[],
  authoritative: AuthorCard,
): AuthorCard[] {
  return cards.some((card) => card.id === authoritative.id)
    ? cards.map((card) => (card.id === authoritative.id ? authoritative : card))
    : [authoritative, ...cards];
}

function isUncertainError(error: unknown): boolean {
  return !(error instanceof AuthorApiError) || error.failure === 'unavailable';
}
