import { describe, expect, it } from 'vitest';

import {
  LIVE_PVP_MAX_MESSAGE_BYTES,
  LIVE_PVP_PROTOCOL_VERSION,
  parseLivePvpClientMessage,
} from '../src/matches/live-pvp-gateway.js';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const CARD_ID = '33333333-3333-4333-8333-333333333333';

describe('live PvP realtime protocol', () => {
  it('accepts only participant intent messages', () => {
    expect(
      parseLivePvpClientMessage(
        JSON.stringify({
          protocolVersion: LIVE_PVP_PROTOCOL_VERSION,
          type: 'action.submit',
          matchId: MATCH_ID,
          messageId: MESSAGE_ID,
          expectedVersion: 7,
          action: { type: 'use_move', moveId: CARD_ID },
        }),
      ),
    ).toEqual({
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: CARD_ID },
    });

    expect(
      parseLivePvpClientMessage(
        JSON.stringify({
          protocolVersion: 1,
          type: 'resign.submit',
          matchId: MATCH_ID,
          messageId: MESSAGE_ID,
          expectedVersion: 7,
        }),
      ),
    ).toMatchObject({ type: 'resign.submit', expectedVersion: 7 });
  });

  it.each([
    {
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'timeout' },
    },
    {
      protocolVersion: 1,
      type: 'action.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      action: { type: 'use_move', moveId: CARD_ID, winner: 'playerOne' },
    },
    {
      protocolVersion: 1,
      type: 'resign.submit',
      matchId: MATCH_ID,
      messageId: MESSAGE_ID,
      expectedVersion: 7,
      winner: 'self',
    },
  ])('rejects browser-owned outcomes and unsupported intents', (message) => {
    expect(() => parseLivePvpClientMessage(JSON.stringify(message))).toThrow();
  });

  it('rejects unsupported protocol versions, malformed identifiers, and negative versions', () => {
    expect(() =>
      parseLivePvpClientMessage(
        JSON.stringify({
          protocolVersion: 2,
          type: 'resign.submit',
          matchId: MATCH_ID,
          messageId: MESSAGE_ID,
          expectedVersion: 0,
        }),
      ),
    ).toThrow('Unsupported live PvP protocol version');

    expect(() =>
      parseLivePvpClientMessage(
        JSON.stringify({
          protocolVersion: 1,
          type: 'resign.submit',
          matchId: 'not-a-match',
          messageId: MESSAGE_ID,
          expectedVersion: 0,
        }),
      ),
    ).toThrow('matchId must be a UUID');

    expect(() =>
      parseLivePvpClientMessage(
        JSON.stringify({
          protocolVersion: 1,
          type: 'resign.submit',
          matchId: MATCH_ID,
          messageId: MESSAGE_ID,
          expectedVersion: -1,
        }),
      ),
    ).toThrow('expectedVersion must be a non-negative integer');
  });

  it('keeps the documented message-size bound small enough for intent payloads', () => {
    expect(LIVE_PVP_MAX_MESSAGE_BYTES).toBe(16_384);
  });
});
