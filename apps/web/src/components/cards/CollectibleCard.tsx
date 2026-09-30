import { createAppDateTimeFormatter } from '../../date-time';
import { useState, type MouseEventHandler, type ReactNode } from 'react';

import type {
  CardEffect,
  CardMove,
  CardPresentation,
  OwnedCard,
} from '../../api/cards';

import { CardFrame } from './CardFrame';
import { collectionArtworkSrcSets } from './collection-artwork-assets';
import { useCardTilt } from './useCardTilt';

interface CollectibleCardProps {
  actions?: ReactNode;
  card: CardPresentation | OwnedCard;
  compact?: boolean;
  copyNumber?: number;
  copyTotal?: number;
  headingLevel?: 2 | 3 | 4;
  ownedCopies?: readonly OwnedCard[];
  showOwnership?: boolean;
  showDetails?: boolean;
}

interface CardThumbnailProps {
  accessibleLabel: string;
  badge?: string;
  card: OwnedCard;
  fetchPriority?: 'high';
  loading?: 'eager' | 'lazy';
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export function CardThumbnail({
  accessibleLabel,
  badge,
  card,
  fetchPriority,
  loading,
  onClick,
}: CardThumbnailProps) {
  const tilt = useCardTilt<HTMLButtonElement>();

  return (
    <button
      {...tilt}
      aria-label={accessibleLabel}
      className={`card-thumbnail card-thumbnail__button collectible-card--${card.rarity}${card.isActive ? '' : ' card-thumbnail--inactive'}`}
      onClick={onClick}
      type="button"
    >
      <CardArtwork
        badge={badge}
        card={card}
        fetchPriority={fetchPriority}
        loading={loading}
        nameplate={<span className="card-thumbnail__title">{card.name}</span>}
        thumbnail
      />
      {!card.isActive ? (
        <span className="card-thumbnail__status">Retired</span>
      ) : null}
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
  showOwnership = true,
  showDetails = true,
}: CollectibleCardProps) {
  const titleId = `card-${'ownedCardId' in card ? card.ownedCardId : card.cardDefinitionId}-title`;
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
              {titleCase(card.category)} ·{' '}
              {card.affinity ? titleCase(card.affinity) : 'Typeless'}
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

        {!compact && showDetails && card.description ? (
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

        {!compact && showDetails && card.moves.length > 0 ? (
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

        {!compact && showDetails && card.effects.length > 0 ? (
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

        {showOwnership && 'acquisitionKind' in card ? (
          <div className="collectible-card__ownership">
            <p>
              {ownedCopies
                ? `${displayedCopyTotal} ${displayedCopyTotal === 1 ? 'owned copy' : 'owned copies'}`
                : acquisitionLabel(card.acquisitionKind)}
            </p>
            {hasDuplicates && ownedCopies === undefined ? (
              <p>Individually owned copy</p>
            ) : null}
            {!card.isActive ? <p>Retired from the active catalogue</p> : null}
          </div>
        ) : null}

        {actions ? (
          <div className="collectible-card__actions">{actions}</div>
        ) : null}
        {ownedCopies ? (
          <OwnedCopyDetails cardName={card.name} copies={ownedCopies} />
        ) : null}
      </div>
    </article>
  );
}

export function CardArtwork({
  badge,
  nameplate,
  card,
  fetchPriority,
  loading,
  showRarity = true,
  thumbnail = false,
}: {
  badge?: string;
  nameplate?: ReactNode;
  card: Pick<CardPresentation, 'name' | 'rarity' | 'imageUrl' | 'imageAlt'>;
  fetchPriority?: 'high';
  loading?: 'eager' | 'lazy';
  showRarity?: boolean;
  thumbnail?: boolean;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [failedResponsiveUrl, setFailedResponsiveUrl] = useState<string | null>(
    null,
  );
  const showImage = card.imageUrl !== null && card.imageUrl !== failedImageUrl;
  const srcSet =
    thumbnail && card.imageUrl !== failedResponsiveUrl
      ? collectionArtworkSrcSets[card.imageUrl ?? '']
      : undefined;
  const knownArtwork =
    card.imageUrl !== null && card.imageUrl in collectionArtworkSrcSets;

  return (
    <CardFrame
      rarity={showRarity ? card.rarity : undefined}
      badge={badge}
      nameplate={nameplate}
    >
      <span className="collectible-card__artwork">
        {showImage ? (
          <img
            alt={card.imageAlt ?? `${card.name} card artwork`}
            fetchPriority={fetchPriority}
            height={knownArtwork ? 1024 : undefined}
            loading={loading}
            onError={(event) => {
              if (srcSet) {
                setFailedResponsiveUrl(card.imageUrl);
              } else {
                setFailedImageUrl(event.currentTarget.getAttribute('src'));
              }
            }}
            sizes={
              srcSet
                ? '(min-width: 64rem) 12rem, (min-width: 40rem) calc((100vw - 6rem) / 4), calc((100vw - 6rem) / 2)'
                : undefined
            }
            src={card.imageUrl ?? undefined}
            srcSet={srcSet}
            width={knownArtwork ? 1024 : undefined}
          />
        ) : (
          <span
            aria-label={`${card.name} artwork unavailable`}
            className="collectible-card__artwork-fallback"
            role="img"
          >
            <span aria-hidden="true">
              {card.name.slice(0, 1).toUpperCase()}
            </span>
          </span>
        )}
      </span>
    </CardFrame>
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
    <details
      aria-label={`${cardName} owned copies`}
      className="owned-copy-details"
    >
      <summary>Copy history</summary>
      <ol aria-label={`${cardName} owned copies`}>
        {copies.map((copy, index) => (
          <li key={copy.ownedCardId}>
            <strong>Copy {index + 1}</strong>
            <span>{acquisitionLabel(copy.acquisitionKind)}</span>
            <time dateTime={copy.acquiredAt}>
              Acquired {formatAcquiredDate(copy.acquiredAt)}
            </time>
            {!copy.isActive ? <span>Retired catalogue card</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function acquisitionLabel(kind: OwnedCard['acquisitionKind']) {
  if (kind === 'starter') return 'Starter card';
  if (kind === 'evolution') return 'Evolved card';
  if (kind === 'trade') return 'Received in a trade';
  return 'Event reward';
}

function formatAcquiredDate(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function MoveDetails({ move }: { move: CardMove }) {
  return (
    <div className="card-details__item">
      <div className="card-move__heading">
        <p className="card-details__name">{move.name}</p>
        <span
          className="card-move__cost"
          aria-label={`Power cost: ${move.powerCost}`}
        >
          {move.powerCost} Power
        </span>
      </div>
      {move.rulesText ? <p>{move.rulesText}</p> : null}
      <dl>
        <div>
          <dt>Move type</dt>
          <dd>{titleCase(move.moveType)}</dd>
        </div>
        <div>
          <dt>Effect</dt>
          <dd>{formatEffect(move.effectType, move.effectValue)}</dd>
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
      <p>
        {effect.rulesText ??
          formatEffect(effect.effectType, effect.effectValue)}
      </p>
      {effect.modifierStat !== null ? (
        <p className="card-details__modifier">
          Modifier: {formatModifier(effect)}
        </p>
      ) : null}
    </div>
  );
}

export function formatEffect(
  effectType: CardEffect['effectType'],
  effectValue: number | null,
) {
  return `${titleCase(effectType)}${effectValue === null ? '' : ` ${effectValue}`}`;
}

export function formatModifier(
  value: Pick<
    CardEffect,
    | 'effectType'
    | 'effectValue'
    | 'modifierDurationTurns'
    | 'modifierOperation'
    | 'modifierStat'
  >,
) {
  if (
    value.modifierStat === 'damage_multiplier' &&
    value.modifierOperation === 'multiply' &&
    value.effectValue !== null &&
    (value.effectType === 'buff' || value.effectType === 'debuff')
  ) {
    const subject = value.effectType === 'buff' ? 'This creature' : 'Opponent';
    const direction = value.effectType === 'buff' ? 'more' : 'less';
    const duration =
      value.modifierDurationTurns === null
        ? 'for the rest of the battle'
        : `for ${value.modifierDurationTurns} ${value.modifierDurationTurns === 1 ? 'turn' : 'turns'}`;

    return `${subject} deals ${value.effectValue}% ${direction} damage ${duration}`;
  }

  if (
    (value.modifierStat === 'hp' || value.modifierStat === 'power') &&
    value.modifierOperation === 'add' &&
    value.effectValue !== null
  ) {
    return value.effectType === 'buff'
      ? `Restore ${value.effectValue} ${value.modifierStat.toUpperCase()}`
      : `Opponent loses ${value.effectValue} ${value.modifierStat.toUpperCase()}`;
  }

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
