import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

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
import { AuthorFeedback } from './AuthorFeedback';
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
  onCardsChange: Dispatch<SetStateAction<AuthorCard[]>>;
  onReload: () => void;
  state: 'error' | 'loading' | 'ready';
}

export function CardWorkspace({
  apiBaseUrl,
  cards,
  errorMessage,
  getAccessToken,
  mutationCoordinator,
  onCardsChange,
  onReload,
  state,
}: CardWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | 'new'>('new');
  const [message, setMessage] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | 'new'>('new');
  const interactionRef = useRef(0);
  const mountedRef = useRef(true);
  const selected = cards.find((card) => card.id === selectedId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedId !== 'new' && !cards.some((card) => card.id === selectedId)) {
      interactionRef.current += 1;
      setSelectedId('new');
      selectedIdRef.current = 'new';
    }
  }, [cards, selectedId]);

  function selectCard(cardId: string | 'new') {
    interactionRef.current += 1;
    selectedIdRef.current = cardId;
    setSelectedId(cardId);
    setMessage('');
    if (cardId !== 'new' && mutationCoordinator.isCollectionUncertain('cards'))
      onReload();
  }

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
    setSelectedId(card.id);
    if (notice)
      announce(
        notice,
        setMessage,
        feedbackRef,
        () =>
          mountedRef.current &&
          interactionRef.current === interaction &&
          selectedIdRef.current === card.id,
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
          <h2 id="cards-workspace-title">Cards</h2>
        </div>
        <button
          className="button"
          onClick={() => selectCard('new')}
          type="button"
        >
          Create card
        </button>
      </header>

      <AuthorFeedback message={message} refObject={feedbackRef} />

      <p className="author-workspace__intro">
        Published definitions become active for server-selected starter and
        event rewards. Authors do not assign reward outcomes to an event.
      </p>

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
        <div className="author-split-view">
          <aside aria-label="Card definitions" className="author-record-list">
            <p className="author-record-list__label">Catalogue</p>
            {cards.length === 0 ? <p>No cards yet.</p> : null}
            <ul>
              {cards.map((card) => (
                <li key={card.id}>
                  <button
                    aria-current={selectedId === card.id ? 'true' : undefined}
                    className="author-record-list__item"
                    onClick={() => selectCard(card.id)}
                    type="button"
                  >
                    <span>{card.name}</span>
                    <span
                      className={`status-badge status-badge--author-${card.authoringStatus}`}
                    >
                      {card.authoringStatus}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="author-editor">
            <CardForm
              apiBaseUrl={apiBaseUrl}
              card={selected}
              getAccessToken={getAccessToken}
              interaction={interactionRef.current}
              mutationCoordinator={mutationCoordinator}
              key={selected ? selected.id : 'new-card'}
              onSaved={updateCard}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface CardFormProps {
  apiBaseUrl: string;
  card?: AuthorCard;
  getAccessToken: ApiAccessTokenProvider;
  interaction: number;
  mutationCoordinator: AuthorMutationCoordinator;
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
  onSaved,
}: CardFormProps) {
  const [draft, setDraft] = useState<CardDraft>(() => cardDraft(card));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<AbortController | null>(null);
  const interactionActiveRef = useRef(true);

  useEffect(() => {
    setDraft(cardDraft(card));
    setErrors({});
    setApiError(null);
    setConfirmRetire(false);
  }, [card]);

  useEffect(() => {
    interactionActiveRef.current = true;
    return () => {
      interactionActiveRef.current = false;
    };
  }, []);

  const editable = !card || card.authoringStatus === 'draft';
  const dirty = Boolean(
    card && JSON.stringify(draft) !== JSON.stringify(cardDraft(card)),
  );
  const recordKey = `card:${card?.id ?? 'new'}` as AuthorRecordKey;
  useAuthorDraftSession(mutationCoordinator, recordKey, dirty);

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

  async function lifecycle(action: 'publish' | 'retire') {
    if (!card || (action === 'publish' && dirty)) return;
    setBusy(true);
    setApiError(null);
    const controller = new AbortController();
    operationRef.current = controller;
    const ownerId = card.id;
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
              getAccessToken,
              signal: controller.signal,
            })
          : await retireAuthorCard({
              apiBaseUrl,
              cardId: card.id,
              getAccessToken,
              signal: controller.signal,
            });
      if (operationRef.current !== controller) return;
      onSaved(
        next,
        ownerId,
        interaction,
        ticket,
        action === 'publish'
          ? 'Card published and active.'
          : 'Card retired. Existing owned copies remain intact.',
      );
      if (interactionActiveRef.current) setConfirmRetire(false);
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
    <section aria-labelledby="card-editor-title" className="author-panel">
      <header className="author-panel__heading">
        <div>
          <p className="eyebrow">Card definition</p>
          <h3 id="card-editor-title">{card ? card.name : 'New card'}</h3>
        </div>
        {card ? (
          <span
            className={`status-badge status-badge--author-${card.authoringStatus}`}
          >
            {card.authoringStatus}
          </span>
        ) : null}
      </header>

      {!editable ? (
        <p className="author-notice">
          Published and retired card definitions are immutable. Create a
          replacement definition to change gameplay metadata.
        </p>
      ) : null}
      <AuthorFeedback error={apiError} refObject={feedbackRef} />

      <form className="author-form" noValidate onSubmit={save} ref={formRef}>
        <div className="author-form__grid">
          <Field error={errors.name} label="Card name" name="card-name">
            <input
              aria-describedby={errors.name ? 'card-name-error' : undefined}
              aria-invalid={Boolean(errors.name)}
              disabled={!editable || busy}
              id="card-name"
              onChange={(change) =>
                setDraft((current) => ({
                  ...current,
                  name: change.target.value,
                }))
              }
              required
              value={draft.name}
            />
          </Field>
          <Field label="Category" name="card-category">
            <select
              disabled={!editable || busy}
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
              disabled={!editable || busy}
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
              disabled={!editable || busy}
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
                  disabled={!editable || busy}
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
                  disabled={!editable || busy}
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
            disabled={!editable || busy}
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
            disabled={!editable || busy}
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
            disabled={!editable || busy}
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
              className="button button--quiet"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  moves: [...current.moves, emptyMove()],
                }))
              }
              type="button"
            >
              Add move
            </button>
          </fieldset>
        ) : (
          <fieldset
            aria-describedby={errors.effects ? 'card-effects-error' : undefined}
            aria-invalid={Boolean(errors.effects)}
            className="author-fieldset"
            disabled={!editable || busy}
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
          {editable ? (
            <button className="button" disabled={busy} type="submit">
              {busy ? 'Saving…' : card ? 'Save card' : 'Create draft card'}
            </button>
          ) : null}
          {card?.authoringStatus === 'draft' ? (
            <button
              className="button button--quiet"
              aria-describedby={dirty ? 'card-publish-dirty' : undefined}
              disabled={busy || dirty}
              onClick={() => void lifecycle('publish')}
              type="button"
            >
              Publish card
            </button>
          ) : null}
          {card && card.authoringStatus !== 'retired' ? (
            <button
              className="button button--danger"
              disabled={busy}
              onClick={() => setConfirmRetire(true)}
              type="button"
            >
              Retire card
            </button>
          ) : null}
        </div>
        {dirty ? (
          <p className="author-notice" id="card-publish-dirty" role="status">
            Unsaved card changes. Save before publishing.
          </p>
        ) : null}
        {confirmRetire ? (
          <div className="author-confirmation" role="alert">
            <strong>Retire this card definition?</strong>
            <p>
              It will leave future reward selection. Existing owned copies
              remain.
            </p>
            <div className="author-actions">
              <button
                className="button button--danger"
                disabled={busy}
                onClick={() => void lifecycle('retire')}
                type="button"
              >
                Confirm retirement
              </button>
              <button
                className="button button--quiet"
                onClick={() => setConfirmRetire(false)}
                type="button"
              >
                Keep card
              </button>
            </div>
          </div>
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
  if (draft.category === 'creature' && draft.moves.length === 0)
    errors.moves = 'Add at least one move.';
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
