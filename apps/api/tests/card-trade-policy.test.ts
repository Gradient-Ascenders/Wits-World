import { describe, expect, it, vi } from 'vitest';

import { rarityTradePoints } from '../src/trading/card-trade-policy.js';
import {
  createCardTradeService,
  type CardTradeDatabase,
} from '../src/trading/card-trade-service.js';

const PLAYER_ONE = '10000000-0000-4000-8000-000000000001';
const PLAYER_TWO = '10000000-0000-4000-8000-000000000002';
const COPY_ONE = '20000000-0000-4000-8000-000000000001';
const DEFINITION_ONE = '30000000-0000-4000-8000-000000000001';

describe('card trade policy', () => {
  it('uses the approved rarity-point scale for imbalance warnings', () => {
    expect(rarityTradePoints('common')).toBe(1);
    expect(rarityTradePoints('rare')).toBe(2);
    expect(rarityTradePoints('epic')).toBe(3);
    expect(rarityTradePoints('legendary')).toBe(4);
  });

  it('rejects self-trading before opening a database transaction', async () => {
    const connect = vi.fn();
    const service = createCardTradeService({ connect } as CardTradeDatabase);

    await expect(
      service.createTrade({
        senderPlayerId: PLAYER_ONE,
        recipientPlayerId: PLAYER_ONE,
        offeredOwnedCardIds: [COPY_ONE],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ONE, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRADE_PLAYER_UNAVAILABLE' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects duplicate exact-copy identifiers before persistence', async () => {
    const connect = vi.fn();
    const service = createCardTradeService({ connect } as CardTradeDatabase);

    await expect(
      service.createTrade({
        senderPlayerId: PLAYER_ONE,
        recipientPlayerId: PLAYER_TWO,
        offeredOwnedCardIds: [COPY_ONE, COPY_ONE.toUpperCase()],
        requestedDefinitions: [
          { cardDefinitionId: DEFINITION_ONE, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRADE_COPY_CONFLICT' });
    expect(connect).not.toHaveBeenCalled();
  });
});
