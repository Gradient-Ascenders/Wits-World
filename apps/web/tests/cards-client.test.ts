import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  evolveCards,
  listOwnedCards,
  listStarterOptions,
  previewCardEvolution,
  selectStarter,
} from '../src/api/cards';
import {
  buildCard,
  buildStarterCards,
  buildStarterOptions,
  buildUuid,
  jsonResponse,
} from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('card API client', () => {
  it('loads the three server-provided starter packages', async () => {
    const options = buildStarterOptions();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        options,
        requestId: 'starter-options-request',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listStarterOptions({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(options);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/cards/starter-options`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects duplicated server starter options', async () => {
    const [spark] = buildStarterOptions();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          options: [spark, spark, spark],
          requestId: 'starter-options-request',
        }),
      ),
    );

    await expect(
      listStarterOptions({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('loads every owned copy with the bearer token', async () => {
    const duplicate = buildCard(2, {
      cardDefinitionId: buildUuid(101),
      name: 'Long-form Campus Guardian',
      ownedCardId: buildUuid(202),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cards: [buildCard(1), duplicate],
        requestId: 'collection-request',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/cards/collection`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        method: 'GET',
      }),
    );
  });

  it('accepts cards acquired through evolution', async () => {
    const evolvedCard = buildCard(3, { acquisitionKind: 'evolution' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          cards: [evolvedCard],
          requestId: 'collection-request',
        }),
      ),
    );

    await expect(
      listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject([{ acquisitionKind: 'evolution' }]);
  });

  it('loads the server evolution recipe and exact copy eligibility', async () => {
    const preview = buildEvolutionPreview();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(preview));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      previewCardEvolution({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
        sourceCardDefinitionId: preview.source.cardDefinitionId,
      }),
    ).resolves.toEqual(preview);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/cards/evolutions/${preview.source.cardDefinitionId}/preview`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects inconsistent or leaked evolution eligibility fields', async () => {
    const preview = buildEvolutionPreview();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ...preview, eligibleCopyCount: 4, saleValue: 100 }),
        ),
    );

    await expect(
      previewCardEvolution({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
        sourceCardDefinitionId: preview.source.cardDefinitionId,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('submits only evolution intent and returns the authoritative result', async () => {
    const preview = buildEvolutionPreview();
    const submissionId = buildUuid(1250);
    const result = buildEvolutionResult(preview, submissionId);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result, 201));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      evolveCards({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
        sourceCardDefinitionId: preview.source.cardDefinitionId,
        submissionId,
      }),
    ).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/cards/evolutions`,
      expect.objectContaining({
        body: JSON.stringify({
          submissionId,
          sourceCardDefinitionId: preview.source.cardDefinitionId,
        }),
        method: 'POST',
      }),
    );
  });

  it('accepts canonical UUIDs produced by the deterministic card catalogue seed', async () => {
    const cardDefinitionId = '740b5400-8362-b728-3b76-9d232077732d';
    const moveId = 'eca9b943-9e05-834e-c85c-1175001d897c';
    const card = buildCard(1);
    const firstMove = card.moves[0];

    expect(firstMove).toBeDefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          cards: [
            {
              ...card,
              cardDefinitionId,
              moves: [{ ...firstMove!, id: moveId }],
            },
          ],
          requestId: 'collection-request',
        }),
      ),
    );

    await expect(
      listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject([
      {
        cardDefinitionId,
        moves: [{ id: moveId }],
      },
    ]);
  });

  it('submits only the selected affinity and returns the server grant', async () => {
    const cards = buildStarterCards('spark');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          affinity: 'spark',
          cards,
          grantedAt: '2026-08-15T08:00:00.000Z',
          requestId: 'starter-request',
          starterGrantId: buildUuid(400),
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const grant = await selectStarter({
      affinity: 'spark',
      apiBaseUrl,
      getAccessToken,
      signal: new AbortController().signal,
    });

    expect(grant.cards).toEqual(cards);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/cards/starter`,
      expect.objectContaining({
        body: JSON.stringify({ affinity: 'spark' }),
        method: 'POST',
      }),
    );
  });

  it('rejects a malformed starter with duplicate Rare Power cards of the wrong affinity', async () => {
    const malformedCards = buildStarterCards('wit').map((card) => ({
      ...card,
      affinity: 'mystic',
      cardDefinitionId: buildUuid(990),
      category: 'power',
      hp: null,
      moves: [],
      power: null,
      rarity: 'rare',
    }));

    await expectStarterResponseRejected(
      buildStarterPayload({ cards: malformedCards }),
    );
  });

  it('rejects a starter whose ownership identifiers are not distinct', async () => {
    const cards = buildStarterCards('wit');

    cards[1] = {
      ...cards[1]!,
      ownedCardId: cards[0]!.ownedCardId,
    };

    await expectStarterResponseRejected(buildStarterPayload({ cards }));
  });

  it.each([
    ['grant timestamp', { grantedAt: '2026-08-15' }],
    [
      'owned-card timestamp',
      {
        cards: buildStarterCards('wit').map((card, index) =>
          index === 0 ? { ...card, acquiredAt: '2026-08-15' } : card,
        ),
      },
    ],
  ])('rejects a date-only %s', async (_description, overrides) => {
    await expectStarterResponseRejected(buildStarterPayload(overrides));
  });

  it.each([
    ['backend UTC timestamp', '2026-08-15T08:00:00.000Z'],
    ['timestamp with an offset', '2026-08-15T10:00:00+02:00'],
    ['leap-year February 29', '2024-02-29T23:59:59Z'],
    ['Gregorian century leap year', '2000-02-29T08:00:00Z'],
  ])('accepts a valid %s', async (_description, grantedAt) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(buildStarterPayload({ grantedAt }), 201),
        ),
    );

    await expect(
      selectStarter({
        affinity: 'wit',
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ grantedAt });
  });

  it.each([
    ['non-leap-year February 29', '2025-02-29T08:00:00Z'],
    ['non-leap Gregorian century February 29', '1900-02-29T08:00:00Z'],
    ['February 30', '2026-02-30T08:00:00Z'],
    ['February 31', '2026-02-31T08:00:00Z'],
    ['day 31 in a 30-day month', '2026-04-31T08:00:00Z'],
    ['hour 24', '2026-08-15T24:00:00Z'],
    ['minute 60', '2026-08-15T08:60:00Z'],
    ['second 60', '2026-08-15T08:00:60Z'],
    ['timezone offset hour 24', '2026-08-15T08:00:00+24:00'],
    ['timezone offset minute 60', '2026-08-15T08:00:00+02:60'],
  ])(
    'rejects an invalid grantedAt with %s',
    async (_description, grantedAt) => {
      await expectStarterResponseRejected(buildStarterPayload({ grantedAt }));
    },
  );

  it('rejects an impossible nested acquiredAt', async () => {
    const cards = buildStarterCards('wit').map((card, index) =>
      index === 0 ? { ...card, acquiredAt: '2026-02-31T08:00:00Z' } : card,
    );

    await expectStarterResponseRejected(buildStarterPayload({ cards }));
  });

  it('rejects unexpected nested card data outside the API contract', async () => {
    const cards = buildStarterCards('wit');
    const firstMove = cards[0]?.moves[0];

    expect(firstMove).toBeDefined();

    const malformedCards = cards.map((card, index) =>
      index === 0
        ? {
            ...card,
            moves: [
              {
                ...firstMove!,
                privateRule: 'must not cross the API boundary',
              },
            ],
          }
        : card,
    );

    await expectStarterResponseRejected(
      buildStarterPayload({ cards: malformedCards }),
    );
  });

  it.each([
    [401, 'SESSION_EXPIRED', 'authorization'],
    [409, 'STARTER_ALREADY_CLAIMED', 'starter-already-claimed'],
    [409, 'STARTER_CATALOGUE_UNAVAILABLE', 'starter-unavailable'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ] as const)('maps a %s %s response to %s', async (status, code, failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code,
            detail: 'Safe detail',
            requestId: 'error-request',
            status,
            title: 'Request failed',
            type: 'about:blank',
          },
          status,
        ),
      ),
    );

    await expect(
      selectStarter({
        affinity: 'wit',
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure });
  });

  it.each([
    [404, 'EVOLUTION_NOT_AVAILABLE', 'evolution-not-available'],
    [409, 'EVOLUTION_COPIES_INSUFFICIENT', 'evolution-insufficient-copies'],
    [409, 'EVOLUTION_COPIES_DECK_LOCKED', 'evolution-deck-locked'],
    [409, 'EVOLUTION_REPLAY_CONFLICT', 'evolution-replay-conflict'],
    [403, 'ACCOUNT_UNAVAILABLE', 'account-unavailable'],
  ] as const)(
    'maps a %s %s evolution response to %s',
    async (status, code, failure) => {
      const preview = buildEvolutionPreview();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              code,
              detail: 'Safe evolution detail',
              requestId: 'evolution-error-request',
              status,
              title: 'Evolution failed',
              type: 'about:blank',
            },
            status,
          ),
        ),
      );

      await expect(
        previewCardEvolution({
          apiBaseUrl,
          getAccessToken,
          signal: new AbortController().signal,
          sourceCardDefinitionId: preview.source.cardDefinitionId,
        }),
      ).rejects.toMatchObject({ failure });
    },
  );

  it('rejects malformed collection data instead of inventing card fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          cards: [{ ...buildCard(1), rarity: 'mythic' }],
          requestId: 'malformed-request',
        }),
      ),
    );

    await expect(
      listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

function buildStarterPayload(overrides: Record<string, unknown> = {}) {
  return {
    affinity: 'wit',
    cards: buildStarterCards('wit'),
    grantedAt: '2026-08-15T08:00:00.000Z',
    requestId: 'starter-request',
    starterGrantId: buildUuid(400),
    ...overrides,
  };
}

async function expectStarterResponseRejected(payload: object) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload, 201)));

  await expect(
    selectStarter({
      affinity: 'wit',
      apiBaseUrl,
      getAccessToken,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ failure: 'unavailable' });
}

function buildEvolutionDefinition(
  cardDefinitionId: string,
  name: string,
  overrides: Record<string, unknown> = {},
) {
  const { acquiredAt, acquisitionKind, ownedCardId, ...card } = buildCard(1, {
    cardDefinitionId,
    name,
  });
  void acquiredAt;
  void acquisitionKind;
  void ownedCardId;

  return {
    ...card,
    deckPointCost: 2,
    imageAlt: `${name} illustrated card artwork`,
    ...overrides,
  };
}

function buildEvolutionPreview() {
  const source = buildEvolutionDefinition(buildUuid(1200), 'Quillip');
  const target = buildEvolutionDefinition(buildUuid(1201), 'Quillume', {
    deckPointCost: 3,
    rarity: 'epic',
  });
  const copies = [1, 2, 3, 4].map((index) => ({
    acquiredAt: `2026-09-0${index}T08:00:00.000Z`,
    acquisitionKind: index === 1 ? 'starter' : 'event_reward',
    eligible: index !== 4,
    lockReason: index === 4 ? 'saved_deck' : null,
    ownedCardId: buildUuid(1210 + index),
  }));

  return {
    canEvolve: true,
    copies,
    copiesRequired: 3,
    deckLockedCopyCount: 1,
    eligibleCopyCount: 3,
    ownedCopyCount: 4,
    requestId: 'evolution-preview-request',
    source,
    target,
    unavailableReason: null,
  };
}

function buildEvolutionResult(
  preview: ReturnType<typeof buildEvolutionPreview>,
  submissionId: string,
) {
  return {
    completedAt: '2026-09-07T12:00:00.000Z',
    consumedOwnedCardIds: preview.copies
      .filter((copy) => copy.eligible)
      .map((copy) => copy.ownedCardId),
    evolutionId: buildUuid(1260),
    newCard: buildCard(9, {
      acquisitionKind: 'evolution',
      cardDefinitionId: preview.target.cardDefinitionId,
      imageAlt: preview.target.imageAlt,
      name: preview.target.name,
      ownedCardId: buildUuid(1261),
      rarity: preview.target.rarity,
    }),
    replayed: false,
    requestId: 'evolution-result-request',
    sourceCardDefinitionId: preview.source.cardDefinitionId,
    submissionId,
    target: preview.target,
  };
}
