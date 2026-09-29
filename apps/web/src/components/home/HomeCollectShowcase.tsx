import type { CardRarity } from '../../api/cards';
import { CardFrame } from '../cards/CardFrame';
import { useCardTilt } from '../cards/useCardTilt';

interface ShowcaseCard {
  imageAlt: string;
  imageUrl: string;
  imageSrcSet?: string;
  name: string;
  rarity: CardRarity;
}

const showcaseCards: readonly ShowcaseCard[] = [
  {
    imageAlt:
      'A small dark-blue owl with bright blue eyes perched beside an open book in a moonlit study.',
    imageUrl: '/cards/quillip.webp',
    imageSrcSet:
      '/cards/home/quillip-384.webp 384w, /cards/home/quillip-768.webp 768w, /cards/quillip.webp 1024w',
    name: 'Quillip',
    rarity: 'common',
  },
  {
    imageAlt:
      'A swift black-and-white long-tailed Creature surveying snowy mountain ruins.',
    imageUrl: '/cards/axiomar.webp',
    imageSrcSet:
      '/cards/home/axiomar-384.webp 384w, /cards/home/axiomar-768.webp 768w, /cards/axiomar.webp 1024w',
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
  const tilt = useCardTilt<HTMLDivElement>();

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
              sizes={
                card.imageSrcSet
                  ? '(min-width: 64rem) 21vw, (min-width: 48rem) 23rem, (min-width: 23rem) calc((100vw - 5rem) / 2), 16rem'
                  : undefined
              }
              src={card.imageUrl}
              srcSet={card.imageSrcSet}
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
