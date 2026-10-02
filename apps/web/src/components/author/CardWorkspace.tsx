import {
  AuthorRecordBackLink,
  ReviewSubmissionMeta,
  useReviewEntry,
} from './AuthorReviewNavigation';
import { SelectField } from '../fields/SelectField';
import { SearchField } from '../fields/SearchField';
import { createAppDateTimeFormatter } from '../../date-time';
import { StateIcon } from '../StatusMessage';
import { LoadingState } from '../LoadingState';
import { ArrowLeftIcon, CaretDownIcon, ImageIcon } from '@phosphor-icons/react';
import { AuthorSaveBar } from './AuthorSaveBar';
import {
  useEffect,
  useLayoutEffect,
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
  isAuthorContentConflict,
  transitionAuthorContent,
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
  type AuthorTransitionAction,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import type { CardPresentation } from '../../api/cards';
import { describeStarterEffect } from '../../battle/effect-presentation';
import { CollectibleCard } from '../cards/CollectibleCard';
import { CardFrame } from '../cards/CardFrame';
import '../cards/cards.css';
import { AuthorFeedback } from './AuthorFeedback';
import { AuthorHistoryPanel } from './AuthorHistoryPanel';
import { AuthorLifecycleControls } from './AuthorLifecycleControls';
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
  onReload: () => Promise<void> | void;
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
  const reviewEntry = useReviewEntry();
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [affinityFilter, setAffinityFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'updated'>('name');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const catalogueRef = useRef<HTMLElement>(null);
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
    if (focusRouteRef.current === null && !reviewEntry) {
      focusRouteRef.current = routeContext;
      return;
    }
    if (focusRouteRef.current === routeContext) return;
    const timer = window.setTimeout(() => {
      focusRouteRef.current = routeContext;
      (route.mode === 'list'
        ? catalogueRef.current
        : recordViewRef.current
      )?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [route.mode, routeContext, state, reviewEntry]);

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
      className={`author-workspace author-workspace--cards${route.mode === 'new' || route.mode === 'edit' ? ' author-workspace--card-editor' : ''}`}
    >
      <header
        className="author-workspace__heading"
        hidden={route.mode !== 'list'}
      >
        <div>
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
        <p className="author-create-guidance" id="card-create-unavailable">
          Load the card catalogue before creating a card.
        </p>
      ) : null}

      {state === 'loading' ? (
        <LoadingState label="Loading card definitions…" />
      ) : null}
      {state === 'error' ? (
        <div
          className="author-state author-state--error state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
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
          className={`author-management-view author-management-view--cards${route.mode === 'list' || route.mode === 'detail' ? ' author-management-view--card-catalogue' : ' author-management-view--card-editor'}${route.mode === 'list' ? ' author-management-view--list' : ' author-management-view--record'}`}
        >
          <aside
            aria-label="Card definitions"
            hidden={route.mode !== 'list'}
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
              <div className="author-empty author-empty--compact state-message state-message--empty">
                <StateIcon tone="empty" />
                <strong>No card definitions yet</strong>
                <p>Create a draft to begin the catalogue.</p>
              </div>
            ) : null}
            {cards.length > 0 && visibleCards.length === 0 ? (
              <div className="author-empty author-empty--compact state-message state-message--empty">
                <StateIcon tone="empty" />
                <strong>No cards match</strong>
                <p>Adjust the catalogue filters.</p>
              </div>
            ) : null}
            {visibleCards.length > 0 ? (
              <div className="card-table-wrap">
                <table className="card-table">
                  <caption className="sr-only">Card definitions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Card</th>
                      <th scope="col">Category</th>
                      <th scope="col">Affinity</th>
                      <th scope="col">Rarity</th>
                      <th scope="col">Lifecycle</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCards.map((card) => (
                      <tr className="author-linked-row" key={card.id}>
                        <th scope="row">
                          <Link
                            className="author-row-link"
                            href={authorPaths.card(card.id)}
                          >
                            <span className="card-table__identity">
                              <CatalogueArtwork
                                key={card.imageUrl}
                                card={card}
                              />
                              <span>{card.name}</span>
                            </span>
                          </Link>
                        </th>
                        <td>{titleCase(card.category)}</td>
                        <td>
                          {card.affinity
                            ? titleCase(card.affinity)
                            : 'Typeless'}
                        </td>
                        <td>{titleCase(card.rarity)}</td>
                        <td>
                          <StatusBadge status={card.authoringStatus} />
                        </td>
                        <td>
                          <time dateTime={card.updatedAt}>
                            {formatCardDate(card.updatedAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </aside>
          <div
            aria-label="Card workspace detail"
            hidden={route.mode === 'list'}
            className="author-record-view"
            ref={recordViewRef}
            role="region"
            tabIndex={-1}
          >
            {route.mode === 'list' ? null : route.mode === 'new' ? (
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
                  key={`card-form:${selected.id}:${selected.version}`}
                  mutationCoordinator={mutationCoordinator}
                  onCancel={() => navigate(authorPaths.card(selected.id))}
                  onSaved={updateCard}
                />
              ) : (
                <CardDetail
                  tab={'tab' in route ? route.tab : undefined}
                  apiBaseUrl={apiBaseUrl}
                  card={selected}
                  getAccessToken={getAccessToken}
                  interaction={interactionRef.current}
                  message={message}
                  messageRef={feedbackRef}
                  mutationCoordinator={mutationCoordinator}
                  onConflict={async () => {
                    await onReload();
                    if (mountedRef.current)
                      setMessage(
                        'The card changed on the server. Its authoritative state was reloaded.',
                      );
                  }}
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
      <SearchField
        label="Search"
        hideLabel
        className="author-catalogue-toolbar__search"
        onChange={(value) => onSearchChange(value)}
        placeholder="Search cards"
        value={search}
      />
      <div className="author-catalogue-toolbar__controls">
        <SelectField
          label="Lifecycle"
          className="author-catalogue-toolbar__select"
          onChange={(value) => onLifecycleChange(value)}
          value={lifecycle}
          options={[
            { value: 'all', label: 'All' },
            { value: 'draft', label: 'Draft' },
            { value: 'in_review', label: 'In review' },
            { value: 'approved', label: 'Approved' },
            { value: 'published', label: 'Published' },
            { value: 'retired', label: 'Retired' },
          ]}
        />
        <SelectField
          label="Sort"
          className="author-catalogue-toolbar__select"
          onChange={(value) => onSortChange(value as 'name' | 'updated')}
          value={sort}
          options={[
            { value: 'name', label: 'A–Z' },
            { value: 'updated', label: 'Updated' },
          ]}
        />
        <details className="author-filter-menu">
          <summary>
            <CaretDownIcon size={16} aria-hidden="true" />
            Filters
            {secondaryFilterCount > 0 ? (
              <span aria-label={`${secondaryFilterCount} active filters`}>
                {secondaryFilterCount}
              </span>
            ) : null}
          </summary>
          <div className="author-filter-menu__panel">
            <SelectField
              label="Category"
              className="author-filter"
              onChange={(value) => onCategoryChange(value)}
              value={category}
              options={[
                { value: 'all', label: 'All' },
                { value: 'creature', label: 'Creature' },
                { value: 'power', label: 'Power' },
              ]}
            />
            <SelectField
              label="Affinity"
              className="author-filter"
              onChange={(value) => onAffinityChange(value)}
              value={affinity}
              options={[
                { value: 'all', label: 'All' },
                ...['wit', 'grit', 'spark', 'spirit', 'mystic'].map(
                  (value) => ({ value, label: titleCase(value) }),
                ),
              ]}
            />
            <SelectField
              label="Rarity"
              className="author-filter"
              onChange={(value) => onRarityChange(value)}
              value={rarity}
              options={[
                { value: 'all', label: 'All' },
                ...['common', 'rare', 'epic', 'legendary'].map((value) => ({
                  value,
                  label: titleCase(value),
                })),
              ]}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function MissingRecord({ backPath, kind }: { backPath: string; kind: string }) {
  return (
    <section
      className="author-state author-state--error state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
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

function cardLifecycleNotice(card: AuthorCard) {
  return {
    approved: 'Card approved.',
    draft: 'Card returned to draft.',
    in_review: 'Card submitted for independent review.',
    published: 'Card published and active.',
    retired: 'Card retired. Existing owned copies remain intact.',
  }[card.authoringStatus];
}

function CardDetail({
  apiBaseUrl,
  card,
  getAccessToken,
  interaction,
  message,
  messageRef,
  mutationCoordinator,
  onConflict,
  onSaved,
  tab = 'details',
}: {
  tab?: 'details' | 'review';
  apiBaseUrl: string;
  card: AuthorCard;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  message: string;
  messageRef: RefObject<HTMLDivElement | null>;
  mutationCoordinator: AuthorMutationCoordinator;
  onConflict: () => Promise<void>;
  onSaved: CardFormProps['onSaved'];
}) {
  const reviewEntry = useReviewEntry();
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => {
    setApiError(null);
  }, [card.id, card.authoringStatus]);

  async function lifecycle(action: AuthorTransitionAction, reason?: string) {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
    const ticket = mutationCoordinator.beginMutation(
      `card:${card.id}`,
      'cards',
    );

    try {
      const next = await transitionAuthorContent({
        action,
        apiBaseUrl,
        entityId: card.id,
        entityType: 'card',
        expectedVersion: card.version,
        getAccessToken,
        reason,
        signal: controller.signal,
      });
      if (operationRef.current !== controller) return;
      onSaved(next, card.id, interaction, ticket, cardLifecycleNotice(next));
    } catch (error) {
      if (operationRef.current !== controller) return;
      if (mutationCoordinator.acceptFailure(ticket, isUncertainError(error))) {
        const nextError = toAuthorError(error);
        setApiError(nextError);
        if (isAuthorContentConflict(nextError)) await onConflict();
        else window.setTimeout(() => feedbackRef.current?.focus());
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
      <AuthorRecordBackLink href={authorPaths.cards}>
        Card catalogue
      </AuthorRecordBackLink>
      <header className="author-card-detail__header">
        <div className="author-card-detail__identity">
          <h3 id="card-detail-title">{card.name}</h3>
          <p className="author-card-detail__definition">
            {titleCase(card.category)} ·{' '}
            {card.affinity ? titleCase(card.affinity) : 'Typeless'} ·{' '}
            {titleCase(card.rarity)}
          </p>
        </div>
        <div className="author-card-detail__lifecycle">
          <StatusBadge status={card.authoringStatus} />
        </div>
      </header>

      <ReviewSubmissionMeta
        entityId={card.id}
        submittedAt={card.submittedAt}
        submittedBy={card.submittedBy}
      />
      <nav className="card-tabs" aria-label="Card workspace">
        <Link
          href={authorPaths.card(card.id)}
          aria-current={tab === 'details' ? 'page' : undefined}
        >
          Details
        </Link>
        <Link
          href={`${authorPaths.card(card.id)}/review`}
          aria-current={tab === 'review' ? 'page' : undefined}
        >
          Review
        </Link>
      </nav>
      <div className="author-card-detail__layout">
        <section
          aria-label={`${card.name} authoring preview`}
          className="author-card-detail__preview"
        >
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
      <div className="author-card-detail__decisions">
        <AuthorLifecycleControls
          busy={busy}
          editControl={
            <Link className="button" href={authorPaths.editCard(card.id)}>
              Edit card
            </Link>
          }
          noun="card"
          onAction={(action, reason) => void lifecycle(action, reason)}
          retirementDescription={
            <p>
              This definition will leave future reward selection and cannot be
              republished. Existing owned copies remain intact.
            </p>
          }
          retirementTitle={`Retire ${card.name}?`}
          status={card.authoringStatus}
          submittedBy={card.submittedBy}
        />
        <AuthorFeedback
          compact={tab === 'review' || Boolean(reviewEntry)}
          error={apiError}
          refObject={feedbackRef}
        />
        <AuthorFeedback
          compact={tab === 'review' || Boolean(reviewEntry)}
          message={message}
          refObject={messageRef}
        />
      </div>
      {tab === 'review' ? (
        <section aria-label="Card review" className="card-review">
          <AuthorHistoryPanel
            apiBaseUrl={apiBaseUrl}
            entityId={card.id}
            entityType="card"
            getAccessToken={getAccessToken}
            revision={card.version}
          />
        </section>
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

function toCollectibleCard(card: AuthorCard): CardPresentation {
  return {
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
    power: card.power,
    rarity: card.rarity,
  };
}

function formatCardDate(value: string) {
  return createAppDateTimeFormatter(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function formatDateTime(value: string) {
  return createAppDateTimeFormatter(undefined, {
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
  affinity: CardAffinity | null;
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
  const [activeMove, setActiveMove] = useState<number | null>(0);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);

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

  useLayoutEffect(() => {
    const invalidMove = Object.keys(errors).find((field) =>
      /^move\d/.test(field),
    );
    if (invalidMove)
      setActiveMove(Number(invalidMove.match(/^move(\d+)/)?.[1]));
  }, [errors]);

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
      affinity:
        category === 'power' ? null : (current.affinity ?? ('wit' as const)),
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
        <ArrowLeftIcon size={16} aria-hidden="true" />{' '}
        {card ? 'Card detail' : 'Card catalogue'}
      </Link>
      <header className="author-panel__heading">
        <div>
          <h3 id="card-editor-title">{card ? card.name : 'New card'}</h3>
        </div>
        {card ? <StatusBadge status={card.authoringStatus} /> : null}
      </header>
      <AuthorFeedback error={apiError} refObject={feedbackRef} />

      <form className="author-form" noValidate onSubmit={save} ref={formRef}>
        <div className="author-card-editor__layout">
          <div className="author-card-editor__fields">
            <fieldset
              className="author-fieldset card-editor-section"
              disabled={busy}
            >
              <legend>Identity</legend>
              <div className="author-form__grid">
                <Field error={errors.name} label="Card name" name="card-name">
                  <input
                    aria-describedby={
                      errors.name ? 'card-name-error' : undefined
                    }
                    aria-invalid={Boolean(errors.name)}
                    disabled={busy}
                    id="card-name"
                    onChange={(change) => {
                      const name = change.currentTarget.value;
                      setDraft((current) => ({
                        ...current,
                        name,
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
                <SelectField
                  className="form-field"
                  label="Category"
                  disabled={busy || draft.category === 'power'}
                  id="card-category"
                  onChange={(value) => changeCategory(value as CardCategory)}
                  value={draft.category}
                  options={[
                    { value: 'creature', label: 'Creature' },
                    { value: 'power', label: 'Power' },
                  ]}
                />
                <SelectField
                  className="form-field"
                  label="Affinity"
                  disabled={busy}
                  id="card-affinity"
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      affinity: value as CardAffinity,
                    }))
                  }
                  value={draft.affinity ?? ''}
                  options={[
                    ...(draft.category === 'power'
                      ? [{ value: '', label: 'Typeless' }]
                      : []),
                    ...['wit', 'grit', 'spark', 'spirit', 'mystic'].map(
                      (value) => ({
                        value,
                        label: titleCase(value),
                      }),
                    ),
                  ]}
                />
                <SelectField
                  className="form-field"
                  label="Rarity"
                  disabled={busy}
                  id="card-rarity"
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      rarity: value as CardRarity,
                    }))
                  }
                  value={draft.rarity}
                  options={['common', 'rare', 'epic', 'legendary'].map(
                    (value) => ({
                      value,
                      label: titleCase(value),
                    }),
                  )}
                />
                {draft.category === 'creature' ? (
                  <>
                    <Field
                      error={errors.hp}
                      label="Hit points (HP)"
                      name="card-hp"
                    >
                      <input
                        aria-describedby={
                          errors.hp ? 'card-hp-error' : undefined
                        }
                        aria-invalid={Boolean(errors.hp)}
                        disabled={busy}
                        id="card-hp"
                        inputMode="numeric"
                        min="1"
                        onChange={(change) => {
                          const value = change.currentTarget.value;
                          setDraft((current) => ({ ...current, hp: value }));
                        }}
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
                        onChange={(change) => {
                          const value = change.currentTarget.value;
                          setDraft((current) => ({ ...current, power: value }));
                        }}
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
                  onChange={(change) => {
                    const value = change.currentTarget.value;
                    setDraft((current) => ({ ...current, description: value }));
                  }}
                  rows={3}
                  value={draft.description}
                />
              </Field>
            </fieldset>
            <fieldset
              className="author-fieldset card-editor-section"
              disabled={busy}
            >
              <legend>Artwork</legend>
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
                  inputMode="url"
                  onChange={(change) => {
                    const value = change.currentTarget.value;
                    setDraft((current) => ({ ...current, imageUrl: value }));
                    setErrors((current) => {
                      if (!current.imageUrl) return current;
                      const next = { ...current };
                      delete next.imageUrl;
                      return next;
                    });
                  }}
                  spellCheck={false}
                  type="text"
                  value={draft.imageUrl}
                />
                <span className="field-help" id="card-image-help">
                  Use only artwork with recorded rights and attribution. Enter a
                  direct http(s) link or /cards/ path.
                </span>
              </Field>
            </fieldset>
            {draft.category === 'creature' ? (
              <fieldset
                aria-describedby={errors.moves ? 'card-moves-error' : undefined}
                aria-invalid={Boolean(errors.moves)}
                className="author-fieldset card-editor-section"
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
                    busy={busy}
                    errors={errors}
                    expanded={activeMove === index}
                    onToggle={() =>
                      setActiveMove(activeMove === index ? null : index)
                    }
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
                    onRemove={() => {
                      setActiveMove((current) =>
                        current === null
                          ? null
                          : Math.max(0, current - (index <= current ? 1 : 0)),
                      );
                      setDraft((current) => ({
                        ...current,
                        moves: current.moves.filter(
                          (_item, itemIndex) => itemIndex !== index,
                        ),
                      }));
                    }}
                  />
                ))}
                <button
                  aria-describedby="card-move-limit"
                  className="button button--quiet"
                  disabled={draft.moves.length >= 4}
                  onClick={() => {
                    setActiveMove(draft.moves.length);
                    setDraft((current) =>
                      current.moves.length >= 4
                        ? current
                        : {
                            ...current,
                            moves: [...current.moves, emptyMove()],
                          },
                    );
                  }}
                  type="button"
                >
                  Add move
                </button>
                <span className="field-help" id="card-move-limit">
                  Creature drafts may contain up to four moves. Publication
                  requires exactly four.
                </span>
              </fieldset>
            ) : (
              <fieldset
                aria-describedby={
                  errors.effects ? 'card-effects-error' : undefined
                }
                aria-invalid={Boolean(errors.effects)}
                className="author-fieldset card-editor-section"
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
                    busy={busy}
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
          </div>
          <aside
            className="author-card-editor__preview"
            aria-label="Live card preview"
          >
            <h4>Card preview</h4>
            <p className="field-help">Unsaved preview</p>
            <div
              className={`collectible-card collectible-card--${draft.rarity}`}
            >
              <CardFrame rarity={draft.rarity}>
                <ArtworkPreview
                  imageUrl={draft.imageUrl}
                  key={draft.imageUrl.trim()}
                  name={draft.name}
                />
              </CardFrame>
              <div className="collectible-card__body">
                <p className="collectible-card__kind">
                  {titleCase(draft.category)} ·{' '}
                  {draft.affinity ? titleCase(draft.affinity) : 'Typeless'}
                </p>
                <h4>{draft.name.trim() || 'Untitled card'}</h4>
                {draft.description.trim() ? (
                  <p className="collectible-card__description">
                    {draft.description}
                  </p>
                ) : null}
                {draft.category === 'creature' ? (
                  <dl
                    aria-label="Preview creature attributes"
                    className="collectible-card__stats"
                  >
                    <div>
                      <dt>HP</dt>
                      <dd>{draft.hp || '—'}</dd>
                    </div>
                    <div>
                      <dt>Power</dt>
                      <dd>{draft.power || '—'}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        <AuthorSaveBar
          busy={busy}
          dirty={dirty}
          failed={Boolean(apiError) || Object.values(errors).some(Boolean)}
          isNew={!card}
        >
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
        </AuthorSaveBar>
      </form>
    </section>
  );
}

function CatalogueArtwork({ card }: { card: AuthorCard }) {
  const [failed, setFailed] = useState(false);
  const url = cardArtworkUrl(card.imageUrl ?? '');

  return (
    <span
      aria-hidden="true"
      className="card-table__artwork"
      title={!url || failed ? 'Artwork unavailable' : undefined}
    >
      {url && !failed ? (
        <img
          alt=""
          decoding="async"
          height={36}
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={url}
          width={36}
        />
      ) : (
        <ImageIcon size={20} />
      )}
    </span>
  );
}

function ArtworkPreview({
  imageUrl,
  name,
}: {
  imageUrl: string;
  name: string;
}) {
  const [status, setStatus] = useState<
    'waiting' | 'loading' | 'ready' | 'error'
  >('waiting');
  const url = cardArtworkUrl(imageUrl);

  useEffect(() => {
    if (!url) return;
    const timer = window.setTimeout(() => setStatus('loading'), 350);
    return () => window.clearTimeout(timer);
  }, [url]);

  return (
    <div className="author-artwork-preview">
      {url && (status === 'loading' || status === 'ready') ? (
        <img
          alt={`${name.trim() || 'Card'} artwork preview`}
          hidden={status !== 'ready'}
          onError={() => setStatus('error')}
          onLoad={() => setStatus('ready')}
          referrerPolicy="no-referrer"
          src={url}
        />
      ) : null}
      {status !== 'ready' ? (
        <p role="status">
          {!url
            ? 'Enter an http(s) URL or /cards/ path to preview it.'
            : status === 'error'
              ? 'Image could not load. Check the URL.'
              : 'Loading artwork preview…'}
        </p>
      ) : null}
    </div>
  );
}

function cardArtworkUrl(value: string): string | null {
  const url = value.trim();
  if (/^\/cards\/[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$/.test(url)) {
    return url;
  }
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.href : null;
  } catch {
    return null;
  }
}

function MoveEditor({
  busy,
  errors,
  expanded,
  onToggle,
  index,
  move,
  onChange,
  onRemove,
}: {
  busy: boolean;
  errors: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
  index: number;
  move: MoveDraft;
  onChange: (move: MoveDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card-move-editor">
      <div className="card-move-editor__header">
        <button
          className="card-move-editor__toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={`card-move-panel-${index}`}
          onClick={onToggle}
        >
          <span>
            <strong>{move.name.trim() || `Move ${index + 1}`}</strong>{' '}
            <span>
              {titleCase(move.moveType)} · {move.powerCost || '—'} Power
            </span>
          </span>
          <CaretDownIcon size={16} aria-hidden="true" />
        </button>
        {expanded ? (
          <button
            className="button button--quiet"
            onClick={onRemove}
            type="button"
          >
            Remove move
          </button>
        ) : null}
      </div>
      <div
        id={`card-move-panel-${index}`}
        className="card-move-editor__body"
        hidden={!expanded}
      >
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
          <SelectField
            className="form-field"
            label="Move type"
            id={`move-${index}-type`}
            disabled={busy}
            onChange={(value) =>
              onChange({ ...move, moveType: value as CardMoveType })
            }
            value={move.moveType}
            options={['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'].map(
              (value) => ({
                value,
                label: titleCase(value),
              }),
            )}
          />
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
          busy={busy}
          effect={move}
          errors={errors}
          index={index}
          onChange={(effect) => onChange({ ...move, ...effect })}
          prefix="move"
        />
      </div>
    </div>
  );
}

function EffectEditor({
  busy,
  effect,
  errors,
  index,
  onChange,
  onRemove,
  prefix,
}: {
  busy: boolean;
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
        <SelectField
          className="form-field"
          label="Effect type"
          id={`${prefix}-${index}-effect-type`}
          disabled={busy}
          onChange={(value) => changeType(value as CardEffectType)}
          value={effect.effectType}
          options={['damage', 'debuff', 'heal', 'buff'].map((value) => ({
            value,
            label: titleCase(value),
          }))}
        />
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
            <SelectField
              className="form-field"
              error={errors[`${prefix}${index}Modifier`]}
              label="Modifier stat"
              id={`${prefix}-${index}-modifier-stat`}
              disabled={busy}
              onChange={(value) => changeStat(value as '' | CardModifierStat)}
              value={effect.modifierStat}
              options={[
                { value: '', label: 'Choose stat' },
                { value: 'hp', label: 'HP' },
                { value: 'power', label: 'Power' },
                { value: 'damage_multiplier', label: 'Damage multiplier' },
              ]}
            />
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
  if (draft.imageUrl.length > 0) {
    if (!draft.imageUrl.trim()) {
      errors.imageUrl = 'Remove the blank URL or enter an artwork URL.';
    } else if (!cardArtworkUrl(draft.imageUrl)) {
      errors.imageUrl = 'Use an http(s) URL or a /cards/ artwork path.';
    }
  }
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
