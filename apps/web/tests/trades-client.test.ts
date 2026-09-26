import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acceptTrade,
  createTrade,
  getTrade,
  listTrades,
  listTradingCatalogue,
  previewTradeSelection,
} from '../src/api/trades';
import { buildUuid, jsonResponse } from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('card trade API client', () => {
  it('loads only strict player-safe catalogue definitions', async () => {
    const definition = buildDefinition();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          definitions: [definition],
          requestId: 'catalogue-request',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listTradingCatalogue(baseOptions())).resolves.toEqual([
      definition,
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/cards/trading-catalogue`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        method: 'GET',
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          definitions: [{ ...definition, ownedCardId: buildUuid(99) }],
          requestId: 'leaked-catalogue-request',
        }),
      ),
    );
    await expect(listTradingCatalogue(baseOptions())).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it('loads paginated summaries using server filters', async () => {
    const summary = buildSummary();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        hasMore: false,
        items: [summary],
        page: 2,
        pageSize: 20,
        requestId: 'list-request',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listTrades({
        ...baseOptions(),
        direction: 'received',
        page: 2,
        pageSize: 20,
        status: 'open',
      }),
    ).resolves.toMatchObject({ items: [summary], page: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/trades?direction=received&status=open&page=2&pageSize=20`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('previews exact-copy availability without sending player authority', async () => {
    const preview = buildPreview();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ...preview, requestId: 'preview-request' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      previewTradeSelection({
        ...baseOptions(),
        offeredOwnedCardIds: [buildUuid(20)],
        requestedDefinitions: [
          { cardDefinitionId: buildUuid(10), quantity: 1 },
        ],
      }),
    ).resolves.toEqual(preview);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      offeredOwnedCardIds: [buildUuid(20)],
      requestedDefinitions: [{ cardDefinitionId: buildUuid(10), quantity: 1 }],
    });
  });

  it('creates an offer with intent only and parses the authoritative trade', async () => {
    const trade = buildTrade();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ requestId: 'create-request', trade }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createTrade({
        ...baseOptions(),
        offeredOwnedCardIds: [buildUuid(20)],
        recipientPlayerName: 'other_player',
        requestedDefinitions: [
          { cardDefinitionId: buildUuid(10), quantity: 1 },
        ],
        submissionId: buildUuid(30),
      }),
    ).resolves.toEqual(trade);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      offeredOwnedCardIds: [buildUuid(20)],
      recipientPlayerName: 'other_player',
      requestedDefinitions: [{ cardDefinitionId: buildUuid(10), quantity: 1 }],
      submissionId: buildUuid(30),
    });
  });

  it('maps stale responses and sends recent proof only to acceptance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'TRADE_VERSION_STALE',
            detail: 'Review the latest version.',
            requestId: 'stale-request',
          },
          409,
        ),
      ),
    );
    await expect(
      getTrade({ ...baseOptions(), tradeId: buildUuid(1) }),
    ).rejects.toMatchObject({
      failure: 'stale',
      options: { requestId: 'stale-request' },
    });

    const trade = buildTrade();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ requestId: 'accept-request', trade }));
    vi.stubGlobal('fetch', fetchMock);
    await acceptTrade({
      ...baseOptions(),
      expectedVersion: 3,
      reauthenticationToken: 'fresh-id-token',
      submissionId: buildUuid(31),
      tradeId: trade.tradeId,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      expectedVersion: 3,
      reauthenticationToken: 'fresh-id-token',
      submissionId: buildUuid(31),
    });
  });
});

function baseOptions() {
  return {
    apiBaseUrl,
    getAccessToken,
    signal: new AbortController().signal,
  };
}

function buildDefinition() {
  return {
    affinity: 'wit' as const,
    cardDefinitionId: buildUuid(10),
    category: 'creature' as const,
    imageAlt: 'A courier ibis carrying a sealed offer.',
    imageUrl: '/cards/courier.webp',
    name: 'Courier Ibis',
    rarity: 'rare' as const,
  };
}

function buildOfferedCopy() {
  return { ...buildDefinition(), ownedCardId: buildUuid(20) };
}

function buildSummary() {
  return {
    counterpartyPlayerName: 'other_player',
    createdAt: '2026-09-26T08:00:00.000Z',
    direction: 'received' as const,
    expiresAt: '2026-09-27T08:00:00.000Z',
    status: 'open' as const,
    terminalAt: null,
    tradeId: buildUuid(1),
    version: 3,
  };
}

function buildParty() {
  return {
    accepted: false,
    imbalanceAcknowledged: false,
    offeredCopies: [buildOfferedCopy()],
    rarityPoints: 2,
    requestedDefinitions: [{ ...buildDefinition(), quantity: 1 }],
  };
}

function buildTrade() {
  return {
    complete: true,
    counterparty: buildParty(),
    counterpartyPlayerName: 'other_player',
    createdAt: '2026-09-26T08:00:00.000Z',
    expiresAt: '2026-09-27T08:00:00.000Z',
    imbalanceWarningRequired: false,
    role: 'sender' as const,
    self: buildParty(),
    settlement: null,
    status: 'open' as const,
    terminalAt: null,
    tradeId: buildUuid(1),
    version: 3,
  };
}

function buildPreview() {
  return {
    imbalanceWarningRequired: false,
    issues: [],
    limits: {
      maximumCopiesPerSide: 5,
      minimumCreatureCopies: 3,
      minimumPowerCopies: 2,
    },
    offeredRarityPoints: 2,
    ownedCopies: [
      { ...buildOfferedCopy(), availability: 'selected_here' as const },
    ],
    requestedDefinitions: [{ ...buildDefinition(), quantity: 1 }],
    requestedRarityPoints: 2,
    valid: true,
  };
}
