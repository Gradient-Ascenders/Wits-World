import type { CardEffect, CardMove, OwnedCard } from '../../api/cards';

interface CollectibleCardProps {
  card: OwnedCard;
  copyNumber?: number;
  copyTotal?: number;
}

export function CollectibleCard({
  card,
  copyNumber = 1,
  copyTotal = 1,
}: CollectibleCardProps) {
  const titleId = `owned-card-${card.ownedCardId}-title`;
  const hasDuplicates = copyTotal > 1;

  return (
    <article
      aria-labelledby={titleId}
      className={`collectible-card collectible-card--${card.rarity}`}
    >
      <div className="collectible-card__artwork">
        {card.imageUrl ? (
          <img alt={`${card.name} card artwork`} src={card.imageUrl} />
        ) : (
          <div
            aria-hidden="true"
            className="collectible-card__artwork-fallback"
          >
            <span>{card.name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <span className="collectible-card__rarity">
          {titleCase(card.rarity)}
        </span>
      </div>

      <div className="collectible-card__body">
        <div className="collectible-card__heading">
          <div>
            <p className="collectible-card__kind">
              {titleCase(card.category)} · {titleCase(card.affinity)}
            </p>
            <h3 id={titleId}>{card.name}</h3>
          </div>
          {hasDuplicates ? (
            <p className="collectible-card__copy">
              Copy {copyNumber} of {copyTotal}
            </p>
          ) : null}
        </div>

        {card.description ? (
          <p className="collectible-card__description">{card.description}</p>
        ) : null}

        {card.category === 'creature' &&
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

        {card.moves.length > 0 ? (
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

        {card.effects.length > 0 ? (
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
            {card.acquisitionKind === 'starter'
              ? 'Starter card'
              : 'Event reward'}
          </p>
          {hasDuplicates ? <p>Individually owned copy</p> : null}
          {!card.isActive ? <p>Retired from the active catalogue</p> : null}
        </div>
      </div>
    </article>
  );
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
