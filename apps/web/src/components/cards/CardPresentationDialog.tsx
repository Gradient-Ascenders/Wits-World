import { X } from '@phosphor-icons/react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import type { CardPresentation } from '../../api/cards';
import { useModalFocus } from '../useModalFocus';
import { CardArtwork, formatEffect, formatModifier } from './CollectibleCard';
import { useCardSheet } from './useCardSheet';
import './card-presentation-dialog.css';

export type CardDialogPresentation = Pick<
  CardPresentation,
  | 'affinity'
  | 'cardDefinitionId'
  | 'category'
  | 'imageAlt'
  | 'imageUrl'
  | 'name'
  | 'rarity'
> &
  Partial<
    Pick<
      CardPresentation,
      'description' | 'effects' | 'hp' | 'isActive' | 'moves' | 'power'
    >
  >;

export function CardPresentationDialog({
  card,
  onClose,
}: {
  card: CardDialogPresentation;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = `${titleId}-content`;
  const { dismiss } = useCardSheet(dialogRef, bodyRef, onClose);
  const trapFocus = useModalFocus({
    busy: false,
    dialogRef,
    initialFocusRef: closeRef,
  });
  const hasRules = Array.isArray(card.moves) && Array.isArray(card.effects);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    trapFocus(event);
  }

  return createPortal(
    <div
      className="trade-card-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`trade-card-detail trade-card-detail--${card.rarity}`}
        data-rarity={card.rarity}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="trade-card-detail__header" data-card-sheet-header>
          <button
            aria-controls={bodyId}
            aria-label="Close card sheet"
            className="trade-card-detail__handle"
            data-card-sheet-handle
            onClick={dismiss}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
          <div>
            <p className="trade-card-detail__eyebrow">Card details</p>
            <h2 id={titleId}>{card.name}</h2>
            <p className="trade-card-detail__subtitle">
              {titleCase(card.rarity)} {titleCase(card.category)}
              {card.affinity ? ` · ${titleCase(card.affinity)} affinity` : ''}
            </p>
          </div>
          <button
            aria-label={`Close ${card.name} details`}
            className="button button--quiet trade-card-detail__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={22} />
          </button>
        </header>

        <div
          className="trade-card-detail__body"
          id={bodyId}
          ref={bodyRef}
          tabIndex={0}
        >
          <div className="trade-card-detail__overview">
            <div className="trade-card-detail__artwork">
              <CardArtwork card={card} showRarity />
            </div>
            <div className="trade-card-detail__summary">
              {card.description ? <p>{card.description}</p> : null}
              {card.category === 'creature' &&
              (card.hp !== undefined || card.power !== undefined) ? (
                <>
                  <h3>Base stats</h3>
                  <dl className="trade-card-detail__stats">
                    <div>
                      <dt>HP</dt>
                      <dd>{card.hp ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Power</dt>
                      <dd>{card.power ?? '—'}</dd>
                    </div>
                  </dl>
                </>
              ) : null}
            </div>
          </div>

          {!hasRules ? (
            <p className="trade-card-detail__unavailable">
              Detailed rules are unavailable for this card.
            </p>
          ) : card.category === 'creature' ? (
            <section aria-labelledby={`${titleId}-moves`}>
              <h3 id={`${titleId}-moves`}>Moves</h3>
              {card.moves!.length > 0 ? (
                <ol className="trade-card-detail__rules">
                  {card.moves!.map((move) => (
                    <li key={move.id}>
                      <div>
                        <strong>{move.name}</strong>
                        <span>{move.powerCost} Power</span>
                      </div>
                      <p>
                        {move.rulesText ??
                          (move.modifierStat !== null
                            ? formatModifier(move)
                            : formatEffect(move.effectType, move.effectValue))}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="trade-card-detail__unavailable">
                  No moves are listed for this card.
                </p>
              )}
            </section>
          ) : (
            <section aria-labelledby={`${titleId}-effects`}>
              <h3 id={`${titleId}-effects`}>Effects</h3>
              {card.effects!.length > 0 ? (
                <ol className="trade-card-detail__rules">
                  {card.effects!.map((effect) => (
                    <li key={effect.id}>
                      <strong>Effect {effect.position}</strong>
                      <p>
                        {effect.rulesText ??
                          (effect.modifierStat !== null
                            ? formatModifier(effect)
                            : formatEffect(
                                effect.effectType,
                                effect.effectValue,
                              ))}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="trade-card-detail__unavailable">
                  No effects are listed for this card.
                </p>
              )}
            </section>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).replaceAll('_', ' ')}`;
}
