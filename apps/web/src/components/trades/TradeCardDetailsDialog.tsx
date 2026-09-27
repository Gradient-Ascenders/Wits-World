import type { CardPresentation } from '../../api/cards';
import type { TradeCardDefinition } from '../../api/trades';
import { CardPresentationDialog } from '../cards/CardPresentationDialog';

export type TradeCardDetail = TradeCardDefinition &
  Partial<
    Pick<
      CardPresentation,
      'description' | 'effects' | 'hp' | 'isActive' | 'moves' | 'power'
    >
  >;

export function TradeCardDetailsDialog({
  card,
  onClose,
}: {
  card: TradeCardDetail;
  onClose: () => void;
}) {
  return <CardPresentationDialog card={card} onClose={onClose} />;
}
