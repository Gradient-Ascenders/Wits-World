import { useEffect, useState } from 'react';
import { listOwnedCards, type OwnedCard } from '../../api/cards';
import type { CompletedChallengeCard } from '../../api/challenges';
import { useApiAccessToken } from '../../auth/useApiAccessToken';
import { CardArtwork } from '../cards/CollectibleCard';
import '../cards/cards.css';

export function ChallengeRewards({
  cards,
  apiBaseUrl,
}: {
  cards: readonly CompletedChallengeCard[];
  apiBaseUrl: string;
}) {
  const getAccessToken = useApiAccessToken();
  const [artwork, setArtwork] = useState<OwnedCard[]>([]);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setArtwork([]);
    setFailed(false);
    if (cards.length > 0) {
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
  }, [apiBaseUrl, cards, getAccessToken, revision]);

  return (
    <section
      aria-labelledby="challenge-reward-title"
      className="challenge-result__rewards"
    >
      <div className="challenge-result__section-heading">
        <div>
          <p className="eyebrow">Your collection</p>
          <h2 id="challenge-reward-title">
            {cards.length ? 'Cards earned' : 'Challenge rewards'}
          </h2>
        </div>
        {cards.length > 0 && (
          <span className="challenge-result__saved">Added to collection</span>
        )}
      </div>
      {cards.length === 0 ? (
        <p>No new cards were awarded for this result.</p>
      ) : (
        <ul aria-label="Earned cards" className="challenge-result__cards">
          {cards.map((card) => {
            const detail = artwork.find(
              (owned) =>
                owned.ownedCardId === card.ownedCardId &&
                owned.cardDefinitionId === card.cardDefinitionId,
            );
            return (
              <li key={card.ownedCardId} className="challenge-reward-card">
                <CardArtwork
                  card={{
                    ...card,
                    imageUrl: detail?.imageUrl ?? null,
                    imageAlt: detail?.imageAlt,
                  }}
                />
                <h3>{card.name}</h3>
                <p>
                  {card.category} · {card.affinity}
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
