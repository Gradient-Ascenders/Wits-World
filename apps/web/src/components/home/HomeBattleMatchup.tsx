import { CardFrame } from '../cards/CardFrame';
import { useHomeCardTilt } from './useHomeCardTilt';

interface BattlePreviewCard {
  affinity: 'Spark' | 'Wit';
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
}

const battleCards: readonly BattlePreviewCard[] = [
  {
    affinity: 'Wit',
    hp: 98,
    imageAlt:
      'A small dark-blue owl with bright blue eyes perched beside an open book in a moonlit study.',
    imageUrl: '/cards/quillip.webp',
    moves: [
      { cost: 0, effect: '10 damage', name: 'Ink Peck' },
      { cost: 3, effect: '25 damage', name: 'Eureka' },
    ],
    name: 'Quillip',
    power: 11,
  },
  {
    affinity: 'Spark',
    hp: 92,
    imageAlt:
      'A bright golden rabbit-like Creature leaping from a tree as sparks trace its markings.',
    imageUrl: '/cards/cinderhop.webp',
    moves: [
      { cost: 0, effect: '12 damage', name: 'Mighty Maw' },
      { cost: 4, effect: '30 damage', name: 'Calculated Claw' },
    ],
    name: 'Cinderhop',
    power: 13,
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
  const tilt = useHomeCardTilt<HTMLElement>();

  return (
    <article
      aria-label={`${card.name} battle card`}
      className={`home-battle-card home-battle-card--${side}`}
      {...tilt}
    >
      <div className="home-battle-card__artwork">
        <CardFrame nameplate={<span>{card.name}</span>} rarity="common">
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
