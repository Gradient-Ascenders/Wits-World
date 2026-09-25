import { CardFrame } from '../cards/CardFrame';
import { useCardTilt } from '../cards/useCardTilt';

interface BattlePreviewCard {
  affinity: 'Spark' | 'Spirit';
  hp: number;
  imageAlt: string;
  imageUrl: string;
  moves: readonly {
    cost: number;
    effect: string;
    name: string;
  }[];
  name: string;
  power: number;
  rarity: 'epic' | 'legendary';
}

const battleCards: readonly BattlePreviewCard[] = [
  {
    affinity: 'Spark',
    hp: 100,
    imageAlt:
      'A legendary golden lightning tiger roaring above a storm-lit city.',
    imageUrl: '/cards/arcalyron.webp',
    moves: [
      { cost: 0, effect: '22 damage', name: 'Ion Claw' },
      {
        cost: 10,
        effect: 'Lose 20 HP · 80 damage',
        name: 'Static Demolition',
      },
    ],
    name: 'Arcalyron',
    power: 25,
    rarity: 'legendary',
  },
  {
    affinity: 'Spirit',
    hp: 125,
    imageAlt:
      'A luminous white spirit stag with flowing antlers in an overgrown courtyard.',
    imageUrl: '/cards/nimbrael.webp',
    moves: [
      { cost: 0, effect: '15 damage', name: 'Spectral Charge' },
      {
        cost: 5,
        effect: '35 damage · Heal 10 HP',
        name: 'Undying Spirit',
      },
    ],
    name: 'Nimbrael',
    power: 15,
    rarity: 'epic',
  },
];

export function HomeBattleMatchup() {
  return (
    <div
      aria-label="Example battle matchup"
      className="home-battle-matchup"
      role="group"
    >
      <div className="home-battle-matchup__arena">
        <BattleCard card={battleCards[0]!} side="player" />
        <span aria-hidden="true" className="home-battle-matchup__versus">
          VS
        </span>
        <BattleCard card={battleCards[1]!} side="opponent" />
      </div>
    </div>
  );
}

function BattleCard({
  card,
  side,
}: {
  card: BattlePreviewCard;
  side: 'opponent' | 'player';
}) {
  const tilt = useCardTilt<HTMLElement>();

  return (
    <article
      aria-label={`${card.name} battle card`}
      className={`home-battle-card home-battle-card--${side}`}
      {...tilt}
    >
      <div className="home-battle-card__artwork">
        <CardFrame nameplate={<span>{card.name}</span>} rarity={card.rarity}>
          <span className="collectible-card__artwork">
            <img
              alt={card.imageAlt}
              decoding="async"
              loading="lazy"
              src={card.imageUrl}
            />
          </span>
        </CardFrame>
      </div>

      <div className="home-battle-card__readout">
        <p>{card.affinity} Creature</p>
        <dl aria-label={`${card.name} attributes`}>
          <div>
            <dt>HP</dt>
            <dd>{card.hp}</dd>
          </div>
          <div>
            <dt>Power</dt>
            <dd>{card.power}</dd>
          </div>
        </dl>
        <section>
          <h4>Featured moves</h4>
          <ol aria-label={`${card.name} featured moves`}>
            {card.moves.map((move) => (
              <li key={move.name}>
                <strong>{move.name}</strong>
                <span>
                  {move.cost} Power · {move.effect}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
