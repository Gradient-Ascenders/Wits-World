import { useState } from 'react';
import { CardArtwork } from '../cards/CollectibleCard';
import { useCardTilt } from '../cards/useCardTilt';
import {
  TradeCardDetailsDialog,
  type TradeCardDetail,
} from './TradeCardDetailsDialog';

export function TradeCardThumbnail({
  card,
  fullFrame = false,
}: {
  card: TradeCardDetail;
  fullFrame?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tilt = useCardTilt<HTMLButtonElement>();

  return (
    <>
      <button
        {...tilt}
        aria-haspopup="dialog"
        aria-label={`View ${card.name} details`}
        className={`trade-card-thumbnail${fullFrame ? ' trade-card-thumbnail--full' : ''}`}
        onClick={() => setDetailsOpen(true)}
        type="button"
      >
        <CardArtwork card={card} showRarity />
      </button>
      {detailsOpen ? (
        <TradeCardDetailsDialog
          card={card}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </>
  );
}
