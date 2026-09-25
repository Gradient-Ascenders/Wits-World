import { useEffect, useState } from 'react';
import { listOwnedCards, type OwnedCard } from '../../api/cards';
import type {
  CompletedChallengeCard,
  CompletedChallengeOwnerBonus,
} from '../../api/challenges';
import { useApiAccessToken } from '../../auth/useApiAccessToken';
import { CardArtwork } from '../cards/CollectibleCard';
import '../cards/cards.css';

const revealedAwards = new Set<string>();

export function ChallengeRewards({
  cards,
  apiBaseUrl,
  attemptId,
  ownerBonus,
}: {
  cards: readonly CompletedChallengeCard[];
  apiBaseUrl: string;
  attemptId?: string;
  ownerBonus?: CompletedChallengeOwnerBonus;
}) {
  const territoryBonusCard =
    ownerBonus?.outcome === 'awarded' ? ownerBonus.card : null;
  const awardedCards = [
    ...cards.map((card) => ({ card, territoryBonus: false })),
    ...(territoryBonusCard
      ? [{ card: territoryBonusCard, territoryBonus: true }]
      : []),
  ];
  const awardKey = `${attemptId ?? 'standalone'}:${cards
    .map((card) => card.ownedCardId)
    .concat(territoryBonusCard?.ownedCardId ?? [])
    .sort()
    .join(',')}`;
  const [reveal] = useState(
    () => awardedCards.length > 0 && !revealedAwards.has(awardKey),
  );
  const getAccessToken = useApiAccessToken();
  const [artwork, setArtwork] = useState<OwnedCard[]>([]);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (awardedCards.length > 0) revealedAwards.add(awardKey);
  }, [awardKey, awardedCards.length]);
  useEffect(() => {
    const controller = new AbortController();
    setArtwork([]);
    setFailed(false);
    if (awardedCards.length > 0) {
      void listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      })
        .then((owned) => {
          if (!controller.signal.aborted) setArtwork(owned);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    }
    return () => controller.abort();
  }, [apiBaseUrl, awardKey, awardedCards.length, getAccessToken, revision]);

  return (
    <section
      aria-labelledby="challenge-reward-title"
      className="challenge-result__rewards"
    >
      <div className="challenge-result__section-heading">
        <div>
          <p className="eyebrow">Your collection</p>
          <h2 id="challenge-reward-title">
            {awardedCards.length ? 'Cards earned' : 'Challenge rewards'}
          </h2>
        </div>
        {awardedCards.length > 0 && (
          <span className="challenge-result__saved">Added to collection</span>
        )}
      </div>
      {awardedCards.length === 0 ? (
        <p>No new cards were awarded for this result.</p>
      ) : (
        <ul aria-label="Earned cards" className="challenge-result__cards">
          {awardedCards.map(({ card, territoryBonus }) => {
            const detail = artwork.find(
              (owned) =>
                owned.ownedCardId === card.ownedCardId &&
                owned.cardDefinitionId === card.cardDefinitionId,
            );
            return (
              <li
                key={card.ownedCardId}
                className={`challenge-reward-card${reveal ? ' challenge-reward-card--reveal' : ''}`}
              >
                <div className="challenge-reward-card__frame">
                  <CardArtwork
                    badge={territoryBonus ? 'Territory owner bonus' : undefined}
                    card={{
                      ...card,
                      imageUrl: detail?.imageUrl ?? null,
                      imageAlt: detail?.imageAlt,
                    }}
                  />
                </div>
                <h3>{card.name}</h3>
                <p>
                  {card.category}
                  {card.affinity ? ` · ${card.affinity}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {failed && (
        <p className="challenge-result__artwork-notice">
          Your cards are saved. Artwork couldn’t load.{' '}
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry artwork
          </button>
        </p>
      )}
    </section>
  );
}
