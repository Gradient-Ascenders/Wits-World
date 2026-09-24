import type { CardRarity } from '../../api/cards';
import { CardFrame } from '../cards/CardFrame';
import { useHomeCardTilt } from './useHomeCardTilt';

interface ShowcaseCard {
  imageAlt: string;
  imageUrl: string;
  name: string;
  rarity: CardRarity;
}

const showcaseCards: readonly ShowcaseCard[] = [
  {
    imageAlt:
      'A small dark-blue owl with bright blue eyes perched beside an open book in a moonlit study.',
    imageUrl: '/cards/quillip.webp',
    name: 'Quillip',
    rarity: 'common',
  },
  {
    imageAlt:
      'A swift black-and-white long-tailed Creature surveying snowy mountain ruins.',
    imageUrl: '/cards/axiomar.webp',
    name: 'Axiomar',
    rarity: 'rare',
  },
  {
    imageAlt:
      'A large scholarly owl with sweeping cream-and-brown wings overlooking a university city.',
    imageUrl: '/cards/quillume.webp',
    name: 'Quillume',
    rarity: 'epic',
  },
  {
    imageAlt:
      'A commanding black-and-white long-tailed Creature running through luminous geometric ruins.',
    imageUrl: '/cards/axiomarch.webp',
    name: 'Axiomarch',
    rarity: 'legendary',
  },
];

export function HomeCollectShowcase() {
  return (
    <div className="home-card-showcase">
      <ol
        aria-label="Card rarity showcase"
        className="home-card-showcase__list"
      >
        {showcaseCards.map((card) => (
          <li key={card.rarity}>
            <TiltCard card={card} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function TiltCard({ card }: { card: ShowcaseCard }) {
  const tilt = useHomeCardTilt<HTMLDivElement>();

  return (
    <article
      aria-label={`${titleCase(card.rarity)} card: ${card.name}`}
      className="home-showcase-card"
    >
      <div className="home-showcase-card__tilt" {...tilt}>
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
    </article>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
