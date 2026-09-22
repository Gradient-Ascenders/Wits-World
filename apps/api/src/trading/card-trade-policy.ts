import type { CardRarity } from '../cards/card-types.js';

import { getDeckRarityPoints } from '../cards/deck-rules.js';

export const CARD_TRADE_POLICY_VERSION = 'card-trade-v1' as const;

export interface CardTradePolicyLimits {
  policyVersion: typeof CARD_TRADE_POLICY_VERSION;
  minimumAccountAgeSeconds: number;
  maximumOpenOffers: number;
  maximumCopiesPerSide: number;
  maximumCompletedTrades24h: number;
  offerLifetimeSeconds: number;
  imbalanceWarningThreshold: number;
  minimumCreatureCopies: number;
  minimumPowerCopies: number;
}

export function rarityTradePoints(rarity: CardRarity): number {
  return getDeckRarityPoints(rarity);
}
