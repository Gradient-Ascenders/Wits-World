import {
  useEffect,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from 'react';

import type { CardEffect, CardMove, OwnedCard } from '../../api/cards';

interface CollectibleCardProps {
  actions?: ReactNode;
  card: OwnedCard;
  compact?: boolean;
  copyNumber?: number;
  copyTotal?: number;
  headingLevel?: 2 | 3 | 4;
  ownedCopies?: readonly OwnedCard[];
}

interface CardThumbnailProps {
  accessibleLabel: string;
  badge?: string;
  card: OwnedCard;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export function CardThumbnail({
  accessibleLabel,
  badge,
  card,
  onClick,
}: CardThumbnailProps) {
  return (
    <button
      aria-label={accessibleLabel}
      className={`card-thumbnail card-thumbnail__button collectible-card--${card.rarity}${card.isActive ? '' : ' card-thumbnail--inactive'}`}
      onClick={onClick}
      type="button"
    >
      <CardArtwork badge={badge} card={card} />
      <span className="card-thumbnail__caption">
        <span className="card-thumbnail__title">{card.name}</span>
      </span>
    </button>
  );
}

export function CollectibleCard({
  actions,
  card,
  compact = false,
  copyNumber = 1,
  copyTotal = 1,
  headingLevel = 3,
  ownedCopies,
}: CollectibleCardProps) {
  const titleId = `owned-card-${card.ownedCardId}-title`;
  const Heading: 'h2' | 'h3' | 'h4' =
    headingLevel === 2 ? 'h2' : headingLevel === 4 ? 'h4' : 'h3';
  const displayedCopyTotal = ownedCopies?.length ?? copyTotal;
  const hasDuplicates = displayedCopyTotal > 1;

  return (
    <article
      aria-labelledby={titleId}
      className={`collectible-card collectible-card--${card.rarity}${compact ? ' collectible-card--compact' : ''}`}
    >
      <CardArtwork card={card} showRarity />

      <div className="collectible-card__body">
        <div className="collectible-card__heading">
          <div>
            <p className="collectible-card__kind">
              {titleCase(card.category)} · {titleCase(card.affinity)}
            </p>
            <Heading id={titleId}>{card.name}</Heading>
          </div>
          {hasDuplicates ? (
            <p className="collectible-card__copy">
              {ownedCopies
                ? `×${displayedCopyTotal} owned`
                : `Copy ${copyNumber} of ${displayedCopyTotal}`}
            </p>
          ) : null}
        </div>

        {!compact && card.description ? (
          <p className="collectible-card__description">{card.description}</p>
        ) : null}

        {!compact &&
        card.category === 'creature' &&
        (card.hp !== null || card.power !== null) ? (
          <dl
            aria-label="Creature attributes"
            className="collectible-card__stats"
          >
            {card.hp !== null ? (
              <div>
                <dt>HP</dt>
                <dd>{card.hp}</dd>
              </div>
            ) : null}
            {card.power !== null ? (
              <div>
                <dt>Power</dt>
                <dd>{card.power}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {!compact && card.moves.length > 0 ? (
          <section aria-label={`${card.name} moves`} className="card-details">
            <h4>Moves</h4>
            <ol className="card-details__list">
              {card.moves.map((move) => (
                <li key={move.id}>
                  <MoveDetails move={move} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {!compact && card.effects.length > 0 ? (
          <section aria-label={`${card.name} effects`} className="card-details">
            <h4>Effects</h4>
            <ol className="card-details__list">
              {card.effects.map((effect) => (
                <li key={effect.id}>
                  <EffectDetails effect={effect} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="collectible-card__ownership">
          <p>
            {ownedCopies
              ? `${displayedCopyTotal} ${displayedCopyTotal === 1 ? 'owned copy' : 'owned copies'}`
              : card.acquisitionKind === 'starter'
                ? 'Starter card'
                : 'Event reward'}
          </p>
          {hasDuplicates && ownedCopies === undefined ? (
            <p>Individually owned copy</p>
          ) : null}
          {!card.isActive ? <p>Retired from the active catalogue</p> : null}
        </div>

        {ownedCopies ? (
          <OwnedCopyDetails cardName={card.name} copies={ownedCopies} />
        ) : null}

        {actions ? (
          <div className="collectible-card__actions">{actions}</div>
        ) : null}
      </div>
    </article>
  );
}

export function CardArtwork({
  badge,
  card,
  showRarity = false,
}: {
  badge?: string;
  card: OwnedCard;
  showRarity?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [card.imageUrl]);

  const showImage = card.imageUrl !== null && !imageFailed;

  return (
    <span className="collectible-card__artwork">
      {showImage ? (
        <img
          alt={`${card.name} card artwork`}
          onError={() => setImageFailed(true)}
          src={card.imageUrl ?? undefined}
        />
      ) : (
        <span
          aria-label={`${card.name} artwork unavailable`}
          className="collectible-card__artwork-fallback"
          role="img"
        >
          <span aria-hidden="true">{card.name.slice(0, 1).toUpperCase()}</span>
        </span>
      )}
      {showRarity ? (
        <span className="collectible-card__rarity">
          {titleCase(card.rarity)}
        </span>
      ) : null}
      {badge ? (
        <span className="card-thumbnail__duplicate">{badge}</span>
      ) : null}
    </span>
  );
}

function OwnedCopyDetails({
  cardName,
  copies,
}: {
  cardName: string;
  copies: readonly OwnedCard[];
}) {
  return (
    <section
      aria-label={`${cardName} owned copies`}
      className="owned-copy-details"
    >
      <h4>Owned copies</h4>
      <ol aria-label={`${cardName} owned copies`}>
        {copies.map((copy, index) => (
          <li key={copy.ownedCardId}>
            <strong>Copy {index + 1}</strong>
            <span>
              {copy.acquisitionKind === 'starter'
                ? 'Starter card'
                : 'Event reward'}
            </span>
            <time dateTime={copy.acquiredAt}>
              Acquired {formatAcquiredDate(copy.acquiredAt)}
            </time>
            {!copy.isActive ? <span>Retired catalogue card</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatAcquiredDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function MoveDetails({ move }: { move: CardMove }) {
  return (
    <div className="card-details__item">
      <p className="card-details__name">{move.name}</p>
      <dl>
        <div>
          <dt>Move type</dt>
          <dd>{titleCase(move.moveType)}</dd>
        </div>
        <div>
          <dt>Effect</dt>
          <dd>{formatEffect(move.effectType, move.effectValue)}</dd>
        </div>
        <div>
          <dt>Power cost</dt>
          <dd>{move.powerCost}</dd>
        </div>
        {move.modifierStat !== null ? (
          <div>
            <dt>Modifier</dt>
            <dd>{formatModifier(move)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function EffectDetails({ effect }: { effect: CardEffect }) {
  return (
    <div className="card-details__item">
      <p>{formatEffect(effect.effectType, effect.effectValue)}</p>
      {effect.modifierStat !== null ? (
        <p className="card-details__modifier">
          Modifier: {formatModifier(effect)}
        </p>
      ) : null}
    </div>
  );
}

function formatEffect(
  effectType: CardEffect['effectType'],
  effectValue: number | null,
) {
  return `${titleCase(effectType)}${effectValue === null ? '' : ` ${effectValue}`}`;
}

function formatModifier(
  value: Pick<
    CardEffect,
    | 'effectValue'
    | 'modifierDurationTurns'
    | 'modifierOperation'
    | 'modifierStat'
  >,
) {
  const parts = [
    value.modifierStat?.replace('_', ' '),
    value.modifierOperation,
    value.effectValue === null ? null : String(value.effectValue),
    value.modifierDurationTurns === null
      ? null
      : `${value.modifierDurationTurns} ${value.modifierDurationTurns === 1 ? 'turn' : 'turns'}`,
  ];

  return parts
    .filter((part): part is string => typeof part === 'string')
    .join(', ');
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).replace('_', ' ')}`;
}
